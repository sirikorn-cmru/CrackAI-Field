import type { CertificationRecord } from '@crackai/shared';
import { authorize, type Caller } from '../authorization/authorization.service.ts';
import {
  ForbiddenError,
  SurveyNotFoundError,
  SurveyRuleViolationError,
} from '../shared/errors.ts';
import type { AuditTrailRecorder, Clock, IdGenerator } from '../shared/ports.ts';
import type {
  CertificationRepository,
  SurveyParticipantRepository,
  SurveyedBuildingRepository,
  SurveyedBuildingReviewState,
} from './survey.repository.ts';

/**
 * ตรวจทานและรับรองผลสำรวจ — T-2-16, T-2-17, T-2-18 (FR-18, FR-19, NFR-05)
 * ครอบคลุม api-spec operation 10.1, 10.2, 10.3
 *
 * **การตรวจว่าผู้เรียกเป็นหัวหน้าผู้สำรวจ "ของอาคารนั้น" อยู่ที่นี่ ไม่ใช่ในตารางนโยบายสิทธิ์**
 * เพราะ api-spec เขียนเงื่อนไขนี้ไว้ในกฎทางธุรกิจของ 10.3 ไม่ใช่ในบรรทัด "ผู้เรียกได้" —
 * ตารางนโยบายคัดลอกเฉพาะบรรทัดนั้นตามกติกาของมัน (ดู operation-policy.ts)
 */
export class ReviewService {
  private readonly buildings: SurveyedBuildingRepository;
  private readonly participants: SurveyParticipantRepository;
  private readonly certifications: CertificationRepository;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;
  private readonly audit: AuditTrailRecorder;

  constructor(
    buildings: SurveyedBuildingRepository,
    participants: SurveyParticipantRepository,
    certifications: CertificationRepository,
    ids: IdGenerator,
    clock: Clock,
    audit: AuditTrailRecorder,
  ) {
    this.buildings = buildings;
    this.participants = participants;
    this.certifications = certifications;
    this.ids = ids;
    this.clock = clock;
    this.audit = audit;
  }

  /** api-spec 10.1 ส่งแบบสำรวจเข้าสู่คิวตรวจทาน */
  async submitForReview(caller: Caller, buildingId: string): Promise<SurveyedBuildingReviewState> {
    authorize(caller, '10.1');
    const building = await this.requireBuilding(buildingId);

    if (building.review_status !== 'ฉบับร่าง' && building.review_status !== 'ส่งกลับแก้ไข') {
      throw new SurveyRuleViolationError(
        `ส่งตรวจทานได้เฉพาะแบบสำรวจที่เป็น "ฉบับร่าง" หรือ "ส่งกลับแก้ไข" — ขณะนี้เป็น "${building.review_status}"`,
      );
    }
    if (building.overall_severity_level === null) {
      throw new SurveyRuleViolationError('ต้องบันทึกผลสรุประดับสีก่อนส่งตรวจทาน (FR-10)');
    }
    await this.requireTeamLead(buildingId);

    return this.buildings.setReviewStatus(buildingId, 'รอตรวจทาน');
  }

  /** api-spec 10.2 ตรวจทานผลสำรวจ (ส่งกลับแก้ไข) */
  async sendBack(
    caller: Caller,
    buildingId: string,
    reviewComment: string,
  ): Promise<CertificationRecord> {
    authorize(caller, '10.2');
    const building = await this.requireBuilding(buildingId);

    if (building.sync_status !== 'ซิงค์สำเร็จ') {
      // ตรวจทานระเบียนที่ยังไม่ขึ้นเซิร์ฟเวอร์คือการตรวจข้อมูลที่หัวหน้ายังมองไม่เห็นครบ
      throw new SurveyRuleViolationError('ตรวจทานได้เฉพาะแบบสำรวจที่ซิงค์ขึ้นระบบสำเร็จแล้ว');
    }
    if (reviewComment.trim().length === 0) {
      throw new SurveyRuleViolationError('ต้องระบุความเห็นเพื่อให้ทีมทราบสิ่งที่ต้องแก้ไข (FR-19)');
    }

    const at = this.clock.now();
    const record = await this.certifications.insert({
      id: this.ids.next(),
      surveyedbuilding_id: buildingId,
      reviewed_by_user_id: caller.user_id,
      review_result: 'ส่งกลับแก้ไข',
      review_comment: reviewComment,
      digital_signature_file: null,
      reviewed_at: at,
    });
    await this.buildings.setReviewStatus(buildingId, 'ส่งกลับแก้ไข');
    await this.audit.record({
      related_entity_name: 'SurveyedBuilding',
      related_entity_id: buildingId,
      related_surveyedbuilding_id: buildingId,
      action_type: 'ส่งกลับแก้ไข',
      performed_by_user_id: caller.user_id,
      value_before: building.review_status,
      value_after: 'ส่งกลับแก้ไข',
      performed_at: at,
      note: reviewComment,
    });
    return record;
  }

  /** api-spec 10.3 ลงลายมือชื่อดิจิทัลรับรองผล */
  async certify(
    caller: Caller,
    buildingId: string,
    digitalSignatureFile: string,
  ): Promise<CertificationRecord> {
    authorize(caller, '10.3');
    const building = await this.requireBuilding(buildingId);

    if (building.overall_severity_level === null) {
      throw new SurveyRuleViolationError('ต้องมีผลสรุประดับสีก่อนรับรองผล (FR-10)');
    }
    // db-spec §10 ข้อ 5: review_result = รับรอง ต้องมี digital_signature_file เสมอ
    if (digitalSignatureFile.trim().length === 0) {
      throw new SurveyRuleViolationError('การรับรองผลต้องมีลายมือชื่อดิจิทัลเสมอ (FR-18)');
    }

    // api-spec 10.3: ผู้ลงนามต้องเป็นหัวหน้าผู้สำรวจ "ของอาคารนั้น"
    const leads = await this.requireTeamLead(buildingId);
    if (!leads.some((lead) => lead.user_id === caller.user_id)) {
      throw new ForbiddenError('รับรองผลสำรวจของอาคารที่ตนไม่ได้เป็นหัวหน้าผู้สำรวจ');
    }

    const at = this.clock.now();
    const record = await this.certifications.insert({
      id: this.ids.next(),
      surveyedbuilding_id: buildingId,
      reviewed_by_user_id: caller.user_id,
      review_result: 'รับรอง',
      review_comment: null,
      digital_signature_file: digitalSignatureFile,
      reviewed_at: at,
    });
    // db-spec §10 ข้อ 5: review_status = รับรองแล้ว ได้ก็ต่อเมื่อมี CertificationRecord
    // ที่ผลเป็น "รับรอง" แล้วเท่านั้น จึงตั้งสถานะหลังบันทึกระเบียน ไม่ใช่ก่อน
    await this.buildings.setReviewStatus(buildingId, 'รับรองแล้ว');
    await this.audit.record({
      related_entity_name: 'SurveyedBuilding',
      related_entity_id: buildingId,
      related_surveyedbuilding_id: buildingId,
      action_type: 'รับรองผล',
      performed_by_user_id: caller.user_id,
      value_before: building.review_status,
      value_after: 'รับรองแล้ว',
      performed_at: at,
      note: null,
    });
    return record;
  }

  private async requireBuilding(buildingId: string): Promise<SurveyedBuildingReviewState> {
    const building = await this.buildings.findById(buildingId);
    if (!building) throw new SurveyNotFoundError(buildingId);
    return building;
  }

  private async requireTeamLead(buildingId: string) {
    const team = await this.participants.listByBuilding(buildingId);
    const leads = team.filter((member) => member.role_in_team === 'หัวหน้าผู้สำรวจ');
    if (leads.length === 0) {
      throw new SurveyRuleViolationError('แบบสำรวจนี้ยังไม่มีหัวหน้าผู้สำรวจในทีม (FR-16)');
    }
    return leads;
  }
}
