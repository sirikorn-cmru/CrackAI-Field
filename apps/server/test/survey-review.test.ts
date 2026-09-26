import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { UserRole } from '@crackai/shared';
import { SurveyTeamService } from '../src/domain/survey/survey-team.service.ts';
import { ReviewService } from '../src/domain/survey/review.service.ts';
import { DashboardService } from '../src/domain/survey/dashboard.service.ts';
import type { SurveyedBuildingReviewState } from '../src/domain/survey/survey.repository.ts';
import {
  InMemoryAuditTrailRecorder,
  InMemoryCertificationRepository,
  InMemoryDashboardRepository,
  InMemorySurveyParticipantRepository,
  InMemorySurveyedBuildingRepository,
} from '../src/infra/memory/in-memory.repositories.ts';
import {
  ForbiddenError,
  SurveyNotFoundError,
  SurveyRuleViolationError,
} from '../src/domain/shared/errors.ts';
import type { Clock, IdGenerator } from '../src/domain/shared/ports.ts';

const FIELD: UserRole = 'ผู้สำรวจภาคสนาม';
const LEAD: UserRole = 'หัวหน้าผู้สำรวจ';
const CENTRAL: UserRole = 'หน่วยงานส่วนกลาง-ผู้บริหาร';

const surveyor = { user_id: 'u-field', role: FIELD };
const lead = { user_id: 'u-lead', role: LEAD };
const otherLead = { user_id: 'u-lead-other', role: LEAD };
const central = { user_id: 'u-central', role: CENTRAL };

const CG = 'cg-อาคาร-1';
const BUILDING_ID = 'b-1';

class SequentialIds implements IdGenerator {
  private counter = 0;
  next(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

const FIXED_NOW = new Date(Date.UTC(2026, 8, 26, 3, 0, 0));
const fixedClock: Clock = { now: () => new Date(FIXED_NOW) };

function building(overrides: Partial<SurveyedBuildingReviewState> = {}): SurveyedBuildingReviewState {
  return {
    id: BUILDING_ID,
    client_generated_id: CG,
    building_name: 'อาคารเรียน 3 ชั้น',
    province: 'เชียงราย',
    district: 'เมืองเชียงราย',
    survey_start_at: null,
    survey_completed_at: null,
    overall_severity_level: 'เหลือง',
    severity_recommendation_note: null,
    review_status: 'ฉบับร่าง',
    sync_status: 'ซิงค์สำเร็จ',
    ...overrides,
  };
}

let buildings: InMemorySurveyedBuildingRepository;
let participants: InMemorySurveyParticipantRepository;
let certifications: InMemoryCertificationRepository;
let audit: InMemoryAuditTrailRecorder;
let team: SurveyTeamService;
let review: ReviewService;

beforeEach(() => {
  buildings = new InMemorySurveyedBuildingRepository();
  participants = new InMemorySurveyParticipantRepository();
  certifications = new InMemoryCertificationRepository();
  audit = new InMemoryAuditTrailRecorder();
  buildings.seed(building());
  team = new SurveyTeamService(buildings, participants, new SequentialIds());
  review = new ReviewService(
    buildings,
    participants,
    certifications,
    new SequentialIds(),
    fixedClock,
    audit,
  );
});

const member = (userId: string, role: 'หัวหน้าผู้สำรวจ' | 'ผู้สำรวจร่วม', order: number) => ({
  client_generated_id: `cg-${userId}`,
  user_id: userId,
  role_in_team: role,
  sequence_order: order,
});

async function seedTeamWithLead() {
  await team.setTeam(surveyor, CG, [member('u-lead', 'หัวหน้าผู้สำรวจ', 1)]);
}

describe('T-2-14 บันทึกทีมสำรวจ (FR-16, api-spec 9.1)', () => {
  it('บันทึกทีมที่มีหัวหน้าได้ และเรียกซ้ำเป็นการแทนที่ทั้งชุด ไม่ใช่เพิ่มทับ', async () => {
    await team.setTeam(surveyor, CG, [
      member('u-lead', 'หัวหน้าผู้สำรวจ', 1),
      member('u-a', 'ผู้สำรวจร่วม', 2),
    ]);
    const second = await team.setTeam(surveyor, CG, [member('u-lead', 'หัวหน้าผู้สำรวจ', 1)]);

    assert.equal(second.length, 1);
    assert.equal((await participants.listByBuilding(BUILDING_ID)).length, 1);
  });

  it('เกิน 3 คนไม่ได้ ตามจำนวนช่องในแบบฟอร์มต้นฉบับ (FR-16)', async () => {
    await assert.rejects(
      () =>
        team.setTeam(surveyor, CG, [
          member('u-lead', 'หัวหน้าผู้สำรวจ', 1),
          member('u-a', 'ผู้สำรวจร่วม', 2),
          member('u-b', 'ผู้สำรวจร่วม', 3),
          member('u-c', 'ผู้สำรวจร่วม', 4),
        ]),
      SurveyRuleViolationError,
    );
  });

  it('ทีมที่ไม่มีหัวหน้าผู้สำรวจถูกปฏิเสธ (FR-16)', async () => {
    await assert.rejects(
      () => team.setTeam(surveyor, CG, [member('u-a', 'ผู้สำรวจร่วม', 1)]),
      SurveyRuleViolationError,
    );
  });

  it('คนซ้ำหรือลำดับซ้ำถูกปฏิเสธ', async () => {
    await assert.rejects(
      () =>
        team.setTeam(surveyor, CG, [
          member('u-lead', 'หัวหน้าผู้สำรวจ', 1),
          member('u-lead', 'ผู้สำรวจร่วม', 2),
        ]),
      /ผู้สำรวจซ้ำ/,
    );
    await assert.rejects(
      () =>
        team.setTeam(surveyor, CG, [
          member('u-lead', 'หัวหน้าผู้สำรวจ', 1),
          member('u-a', 'ผู้สำรวจร่วม', 1),
        ]),
      /ลำดับผู้สำรวจซ้ำ/,
    );
  });

  it('ไม่พบแบบสำรวจ ต้องได้ error ที่แยกออกจากกฎทางธุรกิจ', async () => {
    await assert.rejects(
      () => team.setTeam(surveyor, 'ไม่มีรหัสนี้', [member('u-lead', 'หัวหน้าผู้สำรวจ', 1)]),
      SurveyNotFoundError,
    );
  });
});

describe('T-2-15 เวลาเริ่ม/เสร็จการสำรวจ (FR-17, api-spec 9.2)', () => {
  const start = new Date(Date.UTC(2026, 8, 26, 1, 0, 0));

  it('บันทึกช่วงเวลาที่ถูกต้องได้', async () => {
    const done = new Date(Date.UTC(2026, 8, 26, 2, 30, 0));
    const result = await team.setTiming(surveyor, CG, start, done);
    assert.deepEqual(result, { survey_start_at: start, survey_completed_at: done });
  });

  it('เวลาเสร็จก่อนเวลาเริ่มถูกปฏิเสธ', async () => {
    const earlier = new Date(Date.UTC(2026, 8, 26, 0, 30, 0));
    await assert.rejects(() => team.setTiming(surveyor, CG, start, earlier), SurveyRuleViolationError);
  });

  it('มีเวลาเสร็จแต่ไม่มีเวลาเริ่มถูกปฏิเสธ เพราะตรวจลำดับไม่ได้', async () => {
    await assert.rejects(() => team.setTiming(surveyor, CG, null, start), SurveyRuleViolationError);
  });
});

describe('T-2-16/T-2-17 ตรวจทานและรับรองผล (FR-18, FR-19, api-spec 10.1–10.3)', () => {
  it('ส่งตรวจทานได้จากฉบับร่าง และจากส่งกลับแก้ไข แต่ไม่ได้จากรอตรวจทาน', async () => {
    await seedTeamWithLead();
    assert.equal((await review.submitForReview(surveyor, BUILDING_ID)).review_status, 'รอตรวจทาน');
    await assert.rejects(
      () => review.submitForReview(surveyor, BUILDING_ID),
      SurveyRuleViolationError,
    );

    await buildings.setReviewStatus(BUILDING_ID, 'ส่งกลับแก้ไข');
    assert.equal((await review.submitForReview(surveyor, BUILDING_ID)).review_status, 'รอตรวจทาน');
  });

  it('ยังไม่มีผลสรุประดับสี ส่งตรวจทานไม่ได้ (FR-10)', async () => {
    buildings.seed(building({ overall_severity_level: null }));
    await seedTeamWithLead();
    await assert.rejects(
      () => review.submitForReview(surveyor, BUILDING_ID),
      /ผลสรุประดับสี/,
    );
  });

  it('ไม่มีหัวหน้าผู้สำรวจในทีม ส่งตรวจทานไม่ได้ (FR-16)', async () => {
    await assert.rejects(
      () => review.submitForReview(surveyor, BUILDING_ID),
      /หัวหน้าผู้สำรวจ/,
    );
  });

  it('ส่งกลับแก้ไขต้องมีความเห็น และบันทึกประวัติพร้อมความเห็นนั้น (FR-19, NFR-05)', async () => {
    await seedTeamWithLead();
    await assert.rejects(() => review.sendBack(lead, BUILDING_ID, '   '), /ความเห็น/);

    const record = await review.sendBack(lead, BUILDING_ID, 'ภาพประกอบหมวดโครงสร้างยังไม่ครบ');
    assert.equal(record.review_result, 'ส่งกลับแก้ไข');
    assert.equal(record.digital_signature_file, null);
    assert.equal((await buildings.findById(BUILDING_ID))?.review_status, 'ส่งกลับแก้ไข');

    const entry = audit.entries.at(-1)!;
    assert.equal(entry.action_type, 'ส่งกลับแก้ไข');
    assert.equal(entry.performed_by_user_id, lead.user_id);
    assert.equal(entry.note, 'ภาพประกอบหมวดโครงสร้างยังไม่ครบ');
    assert.equal(entry.related_surveyedbuilding_id, BUILDING_ID);
  });

  it('ตรวจทานระเบียนที่ยังไม่ซิงค์ขึ้นระบบไม่ได้', async () => {
    buildings.seed(building({ sync_status: 'ยังไม่ซิงค์' }));
    await seedTeamWithLead();
    await assert.rejects(() => review.sendBack(lead, BUILDING_ID, 'แก้ตรงนี้'), /ซิงค์/);
  });

  it('รับรองผลต้องมีลายมือชื่อเสมอ และตั้งสถานะหลังบันทึกระเบียนรับรอง (db-spec §10 ข้อ 5)', async () => {
    await seedTeamWithLead();
    await assert.rejects(() => review.certify(lead, BUILDING_ID, '  '), /ลายมือชื่อ/);
    assert.equal(
      (await buildings.findById(BUILDING_ID))?.review_status,
      'ฉบับร่าง',
      'รับรองไม่สำเร็จต้องไม่เปลี่ยนสถานะ',
    );

    const record = await review.certify(lead, BUILDING_ID, 'signature-lead.png');
    assert.equal(record.review_result, 'รับรอง');
    assert.equal(record.digital_signature_file, 'signature-lead.png');
    assert.equal((await buildings.findById(BUILDING_ID))?.review_status, 'รับรองแล้ว');
    assert.equal(audit.entries.at(-1)?.action_type, 'รับรองผล');
  });

  it('หัวหน้าผู้สำรวจของทีมอื่นรับรองแทนไม่ได้ แม้บทบาทจะถูกต้อง (api-spec 10.3)', async () => {
    await seedTeamWithLead();
    await assert.rejects(
      () => review.certify(otherLead, BUILDING_ID, 'signature.png'),
      ForbiddenError,
    );
    assert.equal((await buildings.findById(BUILDING_ID))?.review_status, 'ฉบับร่าง');
    assert.equal(certifications.rows.length, 0, 'ต้องไม่มีระเบียนรับรองค้างไว้');
  });

  it('ผู้สำรวจภาคสนามรับรองผลไม่ได้ (FR-26)', async () => {
    await seedTeamWithLead();
    await assert.rejects(() => review.certify(surveyor, BUILDING_ID, 'x.png'), ForbiddenError);
  });
});

describe('T-2-19 Dashboard ภาพรวม (FR-22, NFR-10, api-spec 11.1)', () => {
  let dashboard: DashboardService;

  beforeEach(() => {
    buildings.seed(building({ id: 'b-2', client_generated_id: 'cg-2', overall_severity_level: 'แดง' }));
    buildings.seed(
      building({
        id: 'b-3',
        client_generated_id: 'cg-3',
        district: 'แม่สาย',
        overall_severity_level: 'เขียว',
      }),
    );
    buildings.seed(
      building({
        id: 'b-4',
        client_generated_id: 'cg-4',
        overall_severity_level: 'แดง',
        sync_status: 'มีความขัดแย้งรอแก้ไข',
      }),
    );
    dashboard = new DashboardService(new InMemoryDashboardRepository(buildings));
  });

  it('นับเฉพาะอาคารที่ซิงค์สำเร็จ — ระเบียนที่ขัดแย้งค้างต้องไม่ไหลเข้าภาพรวม (NFR-10)', async () => {
    const view = await dashboard.overview(central);
    assert.equal(view.total, 3, 'อาคารที่ยังขัดแย้งต้องไม่ถูกนับ');
    assert.deepEqual(view.by_severity, { เขียว: 1, เหลือง: 1, แดง: 1, ยังไม่สรุป: 0 });
  });

  it('แยกตามพื้นที่ และกรองตามจังหวัดได้', async () => {
    const view = await dashboard.overview(central);
    assert.equal(view.by_area.length, 2);
    const empty = await dashboard.overview(central, { province: 'ไม่มีจังหวัดนี้' });
    assert.equal(empty.total, 0);
    assert.deepEqual(empty.by_area, []);
  });

  it('ช่วงวันที่กลับหัวถูกปฏิเสธ แทนที่จะคืนค่าว่างให้เข้าใจผิดว่าไม่มีข้อมูล', async () => {
    await assert.rejects(
      () =>
        dashboard.overview(central, {
          completed_from: new Date(Date.UTC(2026, 8, 20)),
          completed_to: new Date(Date.UTC(2026, 8, 10)),
        }),
      RangeError,
    );
  });

  it('บทบาทอื่นเปิด dashboard ไม่ได้ (FR-26)', async () => {
    await assert.rejects(() => dashboard.overview(lead), ForbiddenError);
    await assert.rejects(() => dashboard.overview(surveyor), ForbiddenError);
  });
});
