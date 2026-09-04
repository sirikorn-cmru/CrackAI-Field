import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { UserRole } from '@crackai/shared';
import {
  SyncIntakeService,
  type IncomingBuilding,
} from '../src/domain/sync/sync-intake.service.ts';
import {
  manualOnlyMergeStrategy,
  type MergeStrategy,
} from '../src/domain/sync/merge-strategy.ts';
import {
  InMemoryAuditTrailRecorder,
  InMemorySurveyedBuildingSyncRepository,
  InMemorySyncConflictRepository,
} from '../src/infra/memory/in-memory.repositories.ts';
import { ForbiddenError } from '../src/domain/shared/errors.ts';
import type { Clock, IdGenerator } from '../src/domain/shared/ports.ts';

const FIELD: UserRole = 'ผู้สำรวจภาคสนาม';
const surveyor = { user_id: 'u-field', role: FIELD };

class SequentialIds implements IdGenerator {
  private counter = 0;
  next(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

class FixedClock implements Clock {
  private current: Date;
  constructor(current: Date) {
    this.current = current;
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}

const AT = (minutes: number) => new Date(Date.UTC(2026, 8, 4, 8, minutes, 0));

function incoming(overrides: Partial<IncomingBuilding> = {}): IncomingBuilding {
  return {
    client_generated_id: 'cg-อาคาร-1',
    device_id: 'device-A',
    data_version: 1,
    last_modified_at: AT(10),
    created_on_device_at: AT(0),
    submitted_by_user_id: 'u-field',
    snapshot_content: '{"building_name":"อาคาร ก"}',
    ...overrides,
  };
}

let buildings: InMemorySurveyedBuildingSyncRepository;
let conflicts: InMemorySyncConflictRepository;
let audit: InMemoryAuditTrailRecorder;
let clock: FixedClock;

function serviceWith(strategy: MergeStrategy): SyncIntakeService {
  return new SyncIntakeService(buildings, conflicts, new SequentialIds(), clock, audit, strategy);
}

beforeEach(() => {
  buildings = new InMemorySurveyedBuildingSyncRepository();
  conflicts = new InMemorySyncConflictRepository();
  audit = new InMemoryAuditTrailRecorder();
  clock = new FixedClock(AT(30));
});

describe('T-1-06/T-1-07 รับข้อมูลที่ค้างซิงค์จากอุปกรณ์ (api-spec 14.1)', () => {
  it('ระเบียนใหม่ถูกรับไว้ พร้อมประวัติ "ซิงค์ข้อมูลสำเร็จ" ที่ระบุอุปกรณ์ต้นทาง (NFR-05)', async () => {
    const service = serviceWith(manualOnlyMergeStrategy);
    const outcome = await service.syncBuilding(surveyor, incoming());

    assert.equal(outcome.result, 'ซิงค์สำเร็จ');
    assert.equal(audit.entries.length, 1);
    const entry = audit.entries[0]!;
    assert.equal(entry.action_type, 'ซิงค์ข้อมูลสำเร็จ');
    // db-spec §7.2: ผู้กระทำคือระบบเอง จึงไม่มี performed_by_user_id แต่ต้องระบุ device ใน note
    assert.equal(entry.performed_by_user_id, null);
    assert.match(entry.note ?? '', /device-A/);
    // db-spec §10 ข้อ 9: related_entity_name = SurveyedBuilding → ใช้ค่าเดียวกับ related_entity_id
    assert.equal(entry.related_surveyedbuilding_id, entry.related_entity_id);
  });

  it('ส่งซ้ำจากอุปกรณ์เดิมโดยไม่มีการแก้ไข ต้อง idempotent และไม่สร้างประวัติซ้ำ', async () => {
    const service = serviceWith(manualOnlyMergeStrategy);
    const first = await service.syncBuilding(surveyor, incoming());
    const second = await service.syncBuilding(surveyor, incoming());

    assert.equal(first.result, 'ซิงค์สำเร็จ');
    assert.equal(second.result, 'ซิงค์สำเร็จ');
    assert.ok(first.result === 'ซิงค์สำเร็จ' && second.result === 'ซิงค์สำเร็จ');
    // รหัสฝั่งเซิร์ฟเวอร์ต้องเป็นตัวเดิม ไม่ใช่สร้างอาคารซ้ำอีกหลัง
    assert.equal(second.id, first.id);
    assert.equal(second.already_applied, true);
    assert.equal(audit.entries.length, 1, 'การส่งซ้ำต้องไม่เพิ่มประวัติ');
  });

  it('อุปกรณ์เดิมส่งงานค้างตามลำดับของตัวเอง ไม่นับเป็นความขัดแย้ง', async () => {
    const service = serviceWith(manualOnlyMergeStrategy);
    await service.syncBuilding(surveyor, incoming({ data_version: 1 }));
    const outcome = await service.syncBuilding(
      surveyor,
      incoming({ data_version: 2, last_modified_at: AT(20) }),
    );

    assert.equal(outcome.result, 'ซิงค์สำเร็จ');
    assert.equal(outcome.result === 'ซิงค์สำเร็จ' && outcome.data_version, 2);
  });

  it('บทบาทอื่นเรียก operation ซิงค์ไม่ได้ (api-spec 14.1, NFR-08)', async () => {
    const service = serviceWith(manualOnlyMergeStrategy);
    await assert.rejects(
      () => service.syncBuilding({ user_id: 'u-lead', role: 'หัวหน้าผู้สำรวจ' }, incoming()),
      ForbiddenError,
    );
  });
});

describe('T-1-08 ตรวจจับความขัดแย้งระดับ aggregate (NFR-03, api-spec 14.2)', () => {
  it('สองอุปกรณ์แก้จากฐานเดียวกัน → สร้าง SyncConflict และกันออกจากรายงาน (NFR-10)', async () => {
    const service = serviceWith(manualOnlyMergeStrategy);
    await service.syncBuilding(surveyor, incoming({ device_id: 'device-A', data_version: 1 }));

    clock.advance(5);
    const outcome = await service.syncBuilding(
      surveyor,
      incoming({
        device_id: 'device-B',
        data_version: 1,
        last_modified_at: AT(12),
        snapshot_content: '{"building_name":"อาคาร ก (แก้จากเครื่อง B)"}',
      }),
    );

    assert.equal(outcome.result, 'มีความขัดแย้งรอแก้ไข');
    const building = await buildings.findByClientGeneratedId('cg-อาคาร-1');
    assert.equal(building?.sync_status, 'มีความขัดแย้งรอแก้ไข');

    const conflictId = outcome.result === 'มีความขัดแย้งรอแก้ไข' ? outcome.syncconflict_id : '';
    const versions = await conflicts.listVersions(conflictId);
    // db-spec §8.2: ต้องเก็บทุกเวอร์ชัน — ทั้งค่าที่เซิร์ฟเวอร์ถืออยู่และค่าที่เพิ่งส่งเข้ามา
    assert.equal(versions.length, 2);
    assert.deepEqual(
      versions.map((version) => version.submitted_by_device_id).sort(),
      ['device-A', 'device-B'],
    );
    assert.ok(versions.every((version) => version.is_selected_as_final === false));

    const detected = audit.entries.at(-1)!;
    assert.equal(detected.action_type, 'ตรวจพบความขัดแย้งของข้อมูล');
    assert.equal(detected.performed_by_user_id, null);
  });

  it('อุปกรณ์ที่สามส่งเข้ามาระหว่างรอแก้ไข ต้องเก็บเป็นอีกเวอร์ชัน ไม่ทับค่าที่รอตัดสิน', async () => {
    const service = serviceWith(manualOnlyMergeStrategy);
    await service.syncBuilding(surveyor, incoming({ device_id: 'device-A' }));
    const conflicted = await service.syncBuilding(
      surveyor,
      incoming({ device_id: 'device-B', last_modified_at: AT(12) }),
    );
    const again = await service.syncBuilding(
      surveyor,
      incoming({
        device_id: 'device-C',
        data_version: 1,
        last_modified_at: AT(14),
        snapshot_content: '{"building_name":"อาคาร ก (เครื่อง C)"}',
      }),
    );

    assert.deepEqual(again, conflicted, 'ต้องเป็นความขัดแย้งรายการเดิม ไม่ใช่รายการใหม่');
    const conflictId = again.result === 'มีความขัดแย้งรอแก้ไข' ? again.syncconflict_id : '';
    assert.equal((await conflicts.listVersions(conflictId)).length, 3);
    // อาคารยังต้องอยู่ในสถานะขัดแย้ง ไม่ถูกค่าใหม่ทับให้กลายเป็น "ซิงค์สำเร็จ"
    const building = await buildings.findByClientGeneratedId('cg-อาคาร-1');
    assert.equal(building?.sync_status, 'มีความขัดแย้งรอแก้ไข');
  });

  it('อุปกรณ์เดิมส่งซ้ำระหว่างรอแก้ไข ไม่เพิ่มเวอร์ชันซ้ำ', async () => {
    const service = serviceWith(manualOnlyMergeStrategy);
    await service.syncBuilding(surveyor, incoming({ device_id: 'device-A' }));
    const conflicted = await service.syncBuilding(
      surveyor,
      incoming({ device_id: 'device-B', last_modified_at: AT(12) }),
    );
    await service.syncBuilding(surveyor, incoming({ device_id: 'device-B', last_modified_at: AT(12) }));

    const conflictId = conflicted.result === 'มีความขัดแย้งรอแก้ไข' ? conflicted.syncconflict_id : '';
    assert.equal((await conflicts.listVersions(conflictId)).length, 2);
  });

  it('เมื่อกลยุทธ์ merge อัตโนมัติสำเร็จ ต้องบันทึกชื่อกลยุทธ์ไว้ในประวัติให้ตรวจย้อนหลังได้', async () => {
    const mergeEverything: MergeStrategy = {
      name: 'ทดสอบ: รวมทุกกรณี',
      tryMerge: async (candidate) => `${candidate.currentSnapshot}+${candidate.incomingSnapshot}`,
    };
    const service = serviceWith(mergeEverything);
    await service.syncBuilding(surveyor, incoming({ device_id: 'device-A', data_version: 1 }));
    const outcome = await service.syncBuilding(
      surveyor,
      incoming({ device_id: 'device-B', data_version: 1, last_modified_at: AT(12) }),
    );

    assert.equal(outcome.result, 'ซิงค์สำเร็จ');
    // ค่าที่ merge แล้วไม่ตรงกับเวอร์ชันของฝ่ายใด จึงต้องเดินเวอร์ชันต่อจากค่าสูงสุด
    assert.equal(outcome.result === 'ซิงค์สำเร็จ' && outcome.data_version, 2);
    assert.equal((await conflicts.listVersions('id-2')).length, 0, 'ไม่ควรมี SyncConflict เกิดขึ้น');
    assert.match(audit.entries.at(-1)?.note ?? '', /ทดสอบ: รวมทุกกรณี/);
  });

  it('กลยุทธ์ manual-only เป็นเพียงหนึ่งในตัวเลือก ไม่ใช่ค่าเริ่มต้นที่ระบบเลือกให้', () => {
    // db-spec §11 ระบุว่ากลยุทธ์ auto-merge ยังไม่ตัดสินใจ — service จึงต้องไม่มีค่าเริ่มต้น
    // ถ้าวันหนึ่งมีคนใส่ default ให้ เทสต์นี้จะยังผ่าน แต่ TypeScript จะปล่อยให้เรียกโดยไม่ส่ง
    // อาร์กิวเมนต์ได้ ซึ่งเป็นสัญญาณว่ามีการตัดสินใจแทนผู้ใช้เกิดขึ้น
    assert.equal(SyncIntakeService.length, 6);
    assert.equal(manualOnlyMergeStrategy.name, 'ส่งให้มนุษย์ตัดสินใจทุกครั้ง');
  });
});
