import type { SurveyedBuildingSyncState } from '@crackai/shared';
import { authorize, type Caller } from '../authorization/authorization.service.ts';
import type { AuditTrailRecorder, Clock, IdGenerator } from '../shared/ports.ts';
import type { MergeStrategy } from './merge-strategy.ts';
import type {
  SurveyedBuildingSyncRepository,
  SyncConflictRepository,
} from './sync.repository.ts';

/** ระเบียนอาคารหนึ่งชุดที่อุปกรณ์ส่งเข้ามา — api-spec 14.1 Input */
export interface IncomingBuilding {
  client_generated_id: string;
  device_id: string;
  /** `data_version` ที่อุปกรณ์อ้างอิงตอนแก้ไข ใช้เทียบตรวจจับความขัดแย้ง (db-spec §10 ข้อ 3) */
  data_version: number;
  last_modified_at: Date;
  created_on_device_at: Date;
  submitted_by_user_id: string | null;
  /** ค่าของอาคารและระเบียนย่อยในรูปแบบข้อความเชิงโครงสร้าง (db-spec §8.2) */
  snapshot_content: string;
}

export type SyncOutcome =
  | {
      result: 'ซิงค์สำเร็จ';
      id: string;
      data_version: number;
      /** true เมื่อระเบียนนี้เคยถูกรับไว้แล้ว รอบนี้ไม่ได้เปลี่ยนอะไร (idempotent replay) */
      already_applied: boolean;
    }
  | { result: 'มีความขัดแย้งรอแก้ไข'; syncconflict_id: string };

/**
 * รับข้อมูลแบบสำรวจที่ค้างซิงค์จากอุปกรณ์ และตัดสินผลการซิงค์ — T-1-06, T-1-07, T-1-08
 * ครอบคลุม api-spec operation 14.1 และ 14.2 (NFR-01, NFR-02, NFR-03, NFR-05, NFR-07)
 *
 * ขอบเขตการตรวจจับความขัดแย้งอยู่ที่ระดับ `SurveyedBuilding` (aggregate) เท่านั้น ไม่ใช่รายแถว
 * ของ entity ย่อย — db-spec §10 ข้อ 3 ระบุไว้ตรงตัว
 */
export class SyncIntakeService {
  private readonly buildings: SurveyedBuildingSyncRepository;
  private readonly conflicts: SyncConflictRepository;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;
  private readonly audit: AuditTrailRecorder;
  private readonly mergeStrategy: MergeStrategy;

  /**
   * @param mergeStrategy **ไม่มีค่าเริ่มต้นโดยเจตนา** — db-spec §11/api-spec §16 ระบุว่ากลยุทธ์
   *   auto-merge ยังไม่ตัดสินใจ การใส่ค่าเริ่มต้นจึงเท่ากับตัดสินใจแทนผู้ใช้อย่างเงียบๆ
   */
  constructor(
    buildings: SurveyedBuildingSyncRepository,
    conflicts: SyncConflictRepository,
    ids: IdGenerator,
    clock: Clock,
    audit: AuditTrailRecorder,
    mergeStrategy: MergeStrategy,
  ) {
    this.buildings = buildings;
    this.conflicts = conflicts;
    this.ids = ids;
    this.clock = clock;
    this.audit = audit;
    this.mergeStrategy = mergeStrategy;
    if (!mergeStrategy) throw new Error('ต้องระบุกลยุทธ์ merge อัตโนมัติเสมอ (NFR-03)');
  }

  /** api-spec 14.1 ซิงค์ข้อมูลแบบสำรวจที่ค้างจากอุปกรณ์ */
  async syncBuilding(caller: Caller, incoming: IncomingBuilding): Promise<SyncOutcome> {
    authorize(caller, '14.1');

    const existing = await this.buildings.findByClientGeneratedId(incoming.client_generated_id);
    if (!existing) return this.acceptNew(incoming);

    // db-spec §8.1: อาคารที่ยังมีความขัดแย้งค้างอยู่ ห้ามรับค่าใหม่ทับ ต้องเก็บเป็นอีกเวอร์ชัน
    // ไว้เปรียบเทียบจนกว่ามนุษย์จะตัดสิน (api-spec 15.2) มิฉะนั้นค่าที่ส่งมาทีหลังจะกลบ
    // เวอร์ชันที่กำลังรอการตัดสินอยู่
    if (existing.sync_status === 'มีความขัดแย้งรอแก้ไข') {
      return this.appendToOpenConflict(existing, incoming);
    }

    if (isReplayOfAppliedRecord(existing, incoming)) {
      // idempotent: อุปกรณ์ส่งซ้ำเพราะไม่ได้รับผลตอบกลับรอบก่อน — ไม่สร้างประวัติซ้ำ
      return {
        result: 'ซิงค์สำเร็จ',
        id: requireId(existing),
        data_version: existing.data_version,
        already_applied: true,
      };
    }

    if (isConflicting(existing, incoming)) return this.resolveConflict(existing, incoming);

    return this.fastForward(existing, incoming);
  }

  private async acceptNew(incoming: IncomingBuilding): Promise<SyncOutcome> {
    const now = this.clock.now();
    const id = this.ids.next();
    const created = await this.buildings.insert({
      id,
      client_generated_id: incoming.client_generated_id,
      device_id: incoming.device_id,
      data_version: incoming.data_version,
      last_modified_at: incoming.last_modified_at,
      last_modified_by_device_id: incoming.device_id,
      sync_status: 'ซิงค์สำเร็จ',
      synced_at: now,
      created_on_device_at: incoming.created_on_device_at,
      snapshot_content: incoming.snapshot_content,
    });
    await this.recordSyncSucceeded(id, incoming.device_id, now, null);
    return {
      result: 'ซิงค์สำเร็จ',
      id,
      data_version: created.data_version,
      already_applied: false,
    };
  }

  private async fastForward(
    existing: SurveyedBuildingSyncState,
    incoming: IncomingBuilding,
  ): Promise<SyncOutcome> {
    const now = this.clock.now();
    const id = requireId(existing);
    const applied = await this.buildings.apply(id, {
      data_version: incoming.data_version,
      last_modified_at: incoming.last_modified_at,
      last_modified_by_device_id: incoming.device_id,
      device_id: incoming.device_id,
      sync_status: 'ซิงค์สำเร็จ',
      synced_at: now,
      snapshot_content: incoming.snapshot_content,
    });
    await this.recordSyncSucceeded(id, incoming.device_id, now, null);
    return {
      result: 'ซิงค์สำเร็จ',
      id,
      data_version: applied.data_version,
      already_applied: false,
    };
  }

  /** api-spec 14.2 — ลองรวมอัตโนมัติก่อน ถ้าไม่ได้จึงส่งต่อให้มนุษย์ */
  private async resolveConflict(
    existing: SurveyedBuildingSyncState,
    incoming: IncomingBuilding,
  ): Promise<SyncOutcome> {
    const id = requireId(existing);
    const currentSnapshot = await this.buildings.snapshotOf(id);
    const merged = await this.mergeStrategy.tryMerge({
      current: existing,
      currentSnapshot,
      incomingSnapshot: incoming.snapshot_content,
      incomingDeviceId: incoming.device_id,
      incomingDataVersion: incoming.data_version,
      incomingLastModifiedAt: incoming.last_modified_at,
    });

    if (merged !== null) {
      const now = this.clock.now();
      const applied = await this.buildings.apply(id, {
        // merge สร้างค่าใหม่ที่ไม่ตรงกับเวอร์ชันของฝ่ายใดฝ่ายหนึ่ง จึงต้องเดินเวอร์ชันต่อจาก
        // ค่าที่มากที่สุดที่เคยเห็น (db-spec §4.1: เพิ่มค่าทุกครั้งที่มีการแก้ไข)
        data_version: Math.max(existing.data_version, incoming.data_version) + 1,
        last_modified_at: incoming.last_modified_at,
        last_modified_by_device_id: incoming.device_id,
        device_id: incoming.device_id,
        sync_status: 'ซิงค์สำเร็จ',
        synced_at: now,
        snapshot_content: merged,
      });
      await this.recordSyncSucceeded(
        id,
        incoming.device_id,
        now,
        `รวมข้อมูลอัตโนมัติด้วยกลยุทธ์: ${this.mergeStrategy.name}`,
      );
      return {
        result: 'ซิงค์สำเร็จ',
        id,
        data_version: applied.data_version,
        already_applied: false,
      };
    }

    const detectedAt = this.clock.now();
    const conflict = await this.conflicts.insert({
      id: this.ids.next(),
      surveyedbuilding_id: id,
      detected_at: detectedAt,
    });

    // db-spec §8.2: ต้องเก็บ **ทุกเวอร์ชัน** ที่ส่งเข้ามา ไม่ใช่เฉพาะเวอร์ชันที่มาทีหลัง
    // เวอร์ชันแรกคือค่าที่เซิร์ฟเวอร์ถืออยู่ ซึ่งจะหายไปถ้าไม่บันทึกไว้ก่อนตั้งสถานะขัดแย้ง
    await this.conflicts.addVersion({
      id: this.ids.next(),
      syncconflict_id: conflict.id,
      submitted_by_device_id: existing.last_modified_by_device_id,
      submitted_by_user_id: null,
      submitted_at: existing.last_modified_at,
      data_version: existing.data_version,
      snapshot_content: currentSnapshot,
    });
    await this.conflicts.addVersion({
      id: this.ids.next(),
      syncconflict_id: conflict.id,
      submitted_by_device_id: incoming.device_id,
      submitted_by_user_id: incoming.submitted_by_user_id,
      submitted_at: incoming.last_modified_at,
      data_version: incoming.data_version,
      snapshot_content: incoming.snapshot_content,
    });

    // NFR-10: ตั้งสถานะนี้แล้วอาคารจะถูกกันออกจาก dashboard/รายงาน/ค้นหา (db-spec §10 ข้อ 4)
    await this.buildings.setSyncStatus(id, 'มีความขัดแย้งรอแก้ไข');
    await this.audit.record({
      related_entity_name: 'SurveyedBuilding',
      related_entity_id: id,
      // db-spec §10 ข้อ 9: related_entity_name = SurveyedBuilding → ใช้ค่าเดียวกับ related_entity_id
      related_surveyedbuilding_id: id,
      action_type: 'ตรวจพบความขัดแย้งของข้อมูล',
      // db-spec §7.2: ผู้กระทำคือระบบเอง ไม่ใช่ผู้ใช้คนใด
      performed_by_user_id: null,
      value_before: null,
      value_after: null,
      performed_at: detectedAt,
      note: `อุปกรณ์ต้นทาง: ${incoming.device_id}`,
    });

    return { result: 'มีความขัดแย้งรอแก้ไข', syncconflict_id: conflict.id };
  }

  private async appendToOpenConflict(
    existing: SurveyedBuildingSyncState,
    incoming: IncomingBuilding,
  ): Promise<SyncOutcome> {
    const id = requireId(existing);
    const conflict = await this.conflicts.findOpenByBuilding(id);
    if (!conflict) {
      // สถานะอาคารบอกว่าขัดแย้งแต่ไม่มีระเบียนความขัดแย้งค้างอยู่ = ข้อมูลไม่สอดคล้องกัน
      // ยอมให้ผ่านไปเงียบๆ ไม่ได้ เพราะจะกลายเป็นอาคารที่หายไปจากทุกหน้าจอตลอดกาล (NFR-10)
      throw new Error(`อาคาร ${id} มีสถานะขัดแย้งแต่ไม่พบระเบียน SyncConflict ที่รอแก้ไข`);
    }

    const versions = await this.conflicts.listVersions(conflict.id);
    const alreadySubmitted = versions.some(
      (version) =>
        version.submitted_by_device_id === incoming.device_id &&
        version.data_version === incoming.data_version,
    );
    if (!alreadySubmitted) {
      await this.conflicts.addVersion({
        id: this.ids.next(),
        syncconflict_id: conflict.id,
        submitted_by_device_id: incoming.device_id,
        submitted_by_user_id: incoming.submitted_by_user_id,
        submitted_at: incoming.last_modified_at,
        data_version: incoming.data_version,
        snapshot_content: incoming.snapshot_content,
      });
    }
    return { result: 'มีความขัดแย้งรอแก้ไข', syncconflict_id: conflict.id };
  }

  private async recordSyncSucceeded(
    buildingId: string,
    deviceId: string,
    at: Date,
    note: string | null,
  ): Promise<void> {
    await this.audit.record({
      related_entity_name: 'SurveyedBuilding',
      related_entity_id: buildingId,
      related_surveyedbuilding_id: buildingId,
      action_type: 'ซิงค์ข้อมูลสำเร็จ',
      performed_by_user_id: null,
      value_before: null,
      value_after: null,
      performed_at: at,
      note: note === null ? `อุปกรณ์ต้นทาง: ${deviceId}` : `อุปกรณ์ต้นทาง: ${deviceId} — ${note}`,
    });
  }
}

/**
 * ระเบียนเดิมที่ถูกส่งซ้ำโดยไม่มีการแก้ไขเพิ่ม (idempotency ตาม db-spec §10 ข้อ 2)
 *
 * เงื่อนไข "อุปกรณ์เดียวกัน" สำคัญ: ถ้าอุปกรณ์อื่นส่งเวอร์ชันเดียวกันเข้ามา นั่นคือการแก้ไข
 * คู่ขนานที่อ้างอิงฐานเดียวกัน ซึ่งเป็นความขัดแย้ง ไม่ใช่การส่งซ้ำ
 */
function isReplayOfAppliedRecord(
  existing: SurveyedBuildingSyncState,
  incoming: IncomingBuilding,
): boolean {
  return (
    existing.last_modified_by_device_id === incoming.device_id &&
    incoming.data_version <= existing.data_version &&
    incoming.last_modified_at.getTime() <= existing.last_modified_at.getTime()
  );
}

/**
 * ตรวจจับความขัดแย้งตาม db-spec §10 ข้อ 3 — เทียบ `data_version`/`last_modified_at`/
 * `last_modified_by_device_id` ของอาคารแม่
 *
 * ขัดแย้งเมื่ออุปกรณ์นี้แก้ไขจากฐานที่เก่ากว่าค่าที่เซิร์ฟเวอร์ถืออยู่ **และ** ค่าที่เซิร์ฟเวอร์
 * ถืออยู่มาจากอุปกรณ์อื่น — ถ้ามาจากอุปกรณ์เดียวกันคือการส่งงานค้างตามลำดับของตัวเอง
 * ซึ่งไม่ใช่การแก้ไขคู่ขนาน
 */
function isConflicting(
  existing: SurveyedBuildingSyncState,
  incoming: IncomingBuilding,
): boolean {
  if (existing.last_modified_by_device_id === incoming.device_id) return false;
  return incoming.data_version <= existing.data_version;
}

function requireId(building: SurveyedBuildingSyncState): string {
  if (building.id === null) {
    throw new Error(
      `อาคาร ${building.client_generated_id} อยู่ในที่เก็บฝั่งเซิร์ฟเวอร์แต่ไม่มี id — ข้อมูลไม่สอดคล้อง`,
    );
  }
  return building.id;
}
