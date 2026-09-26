import type {
  CertificationRecord,
  ReviewStatus,
  SeverityLevel,
  SurveyParticipant,
  SyncStatus,
  TeamRole,
} from '@crackai/shared';

/**
 * ส่วนของ `SurveyedBuilding` ที่กระบวนการตรวจทาน/รับรอง/สรุปผลใช้ — db-spec §4.1
 *
 * **ยังไม่ครบทุก attribute ของ entity โดยเจตนา** — ฟิลด์เนื้อหาความเสียหาย (หมวด 3–5 ของ
 * แบบฟอร์ม) ยังไม่ถูกนำมาเขียนเป็นโค้ด เพราะค่าที่เลือกได้จริงของหมวดเหล่านั้นยังไม่ตรงกัน
 * ระหว่าง `db-spec.md` กับแบบฟอร์มต้นฉบับใน `docs/01-requirements/00-source/`
 * (ดูบันทึกใน log วันที่ 2026-09-26)
 */
export interface SurveyedBuildingReviewState {
  id: string;
  client_generated_id: string;
  building_name: string;
  province: string;
  district: string;
  survey_start_at: Date | null;
  survey_completed_at: Date | null;
  overall_severity_level: SeverityLevel | null;
  severity_recommendation_note: string | null;
  review_status: ReviewStatus;
  sync_status: SyncStatus;
}

export interface UpdateTimingInput {
  survey_start_at: Date | null;
  survey_completed_at: Date | null;
}

export interface SurveyedBuildingRepository {
  findById(id: string): Promise<SurveyedBuildingReviewState | null>;
  findByClientGeneratedId(
    clientGeneratedId: string,
  ): Promise<SurveyedBuildingReviewState | null>;
  updateTiming(id: string, input: UpdateTimingInput): Promise<SurveyedBuildingReviewState>;
  setReviewStatus(id: string, status: ReviewStatus): Promise<SurveyedBuildingReviewState>;
}

export interface CreateParticipantInput {
  id: string;
  client_generated_id: string;
  surveyedbuilding_id: string;
  user_id: string;
  role_in_team: TeamRole;
  sequence_order: number;
}

export interface SurveyParticipantRepository {
  listByBuilding(surveyedBuildingId: string): Promise<readonly SurveyParticipant[]>;
  /** แทนที่รายชื่อทีมทั้งชุดในธุรกรรมเดียว — api-spec 9.1 รับรายการมาทั้งชุด ไม่ใช่ทีละคน */
  replaceForBuilding(
    surveyedBuildingId: string,
    participants: readonly CreateParticipantInput[],
  ): Promise<readonly SurveyParticipant[]>;
}

export interface CreateCertificationInput {
  id: string;
  surveyedbuilding_id: string;
  reviewed_by_user_id: string;
  review_result: CertificationRecord['review_result'];
  review_comment: string | null;
  digital_signature_file: string | null;
  reviewed_at: Date;
}

export interface CertificationRepository {
  insert(input: CreateCertificationInput): Promise<CertificationRecord>;
  listByBuilding(surveyedBuildingId: string): Promise<readonly CertificationRecord[]>;
}

/** ตัวกรองของ dashboard — api-spec 11.1 Input (ทุกตัวไม่บังคับ) */
export interface DashboardFilter {
  province?: string;
  completed_from?: Date;
  completed_to?: Date;
}

export interface SeverityTally {
  province: string;
  district: string;
  เขียว: number;
  เหลือง: number;
  แดง: number;
  /** อาคารที่ซิงค์สำเร็จแล้วแต่ยังไม่มีผลสรุประดับสี */
  ยังไม่สรุป: number;
}

export interface DashboardRepository {
  /**
   * นับอาคารแยกตามพื้นที่และระดับสี
   *
   * **ผู้ที่ใช้ port นี้ต้องกรอง `sync_status` ให้เหลือเฉพาะ "ซิงค์สำเร็จ" เสมอ** — db-spec
   * §10 ข้อ 4 (NFR-10) ห้ามระเบียนที่ยังขัดแย้งค้างอยู่ไหลเข้า dashboard/รายงาน/ค้นหา
   */
  tallyBySeverity(filter: DashboardFilter): Promise<readonly SeverityTally[]>;
}
