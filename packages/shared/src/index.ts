/**
 * ชนิดข้อมูลร่วมระหว่างฝั่งเซิร์ฟเวอร์และแอปภาคสนาม
 *
 * ค่าทุกตัวในไฟล์นี้คัดลอกตรงตัวจาก `docs/02-design/02-technical/db-spec.md`
 * ห้ามเพิ่ม/แก้ค่าใดโดยไม่แก้เอกสารต้นทางก่อน — เอกสารคือแหล่งความจริง ไม่ใช่โค้ดนี้
 */

/** บทบาทผู้ใช้ — db-spec §2.1 User.role */
export const USER_ROLES = [
  'ผู้สำรวจภาคสนาม',
  'หัวหน้าผู้สำรวจ',
  'ผู้ดูแลระบบ',
  'หน่วยงานส่วนกลาง-ผู้บริหาร',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** สถานะบัญชี — db-spec §2.1 User.account_status */
export const ACCOUNT_STATUSES = ['ใช้งานได้', 'ปิดใช้งาน'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** สถานะ session — db-spec §2.2 Session.status */
export const SESSION_STATUSES = ['ใช้งานอยู่', 'หมดอายุ', 'ถูกเพิกถอน'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

/**
 * บทบาทเดียวที่ใช้งานแอปภาคสนามแบบออฟไลน์ได้ (FR-27)
 * บทบาทอื่นใช้ผ่านเว็บแบบออนไลน์เท่านั้นตาม architecture §2
 */
export const OFFLINE_CAPABLE_ROLE: UserRole = 'ผู้สำรวจภาคสนาม';

/** อายุ session ที่แคชไว้ใช้ขณะออฟไลน์ — NFR-09 กำหนดไว้ 7 วัน */
export const OFFLINE_SESSION_TTL_DAYS = 7;

/**
 * จำนวนครั้งสูงสุดที่ยอมให้กรอก PIN ผิดติดต่อกันก่อนล้าง credential/PIN — NFR-11
 *
 * ผู้ใช้ยืนยันค่านี้เมื่อ 2026-09-04 ปิดข้อสมมติหมวด 6 ข้อ 11 ของ spec (เดิมเสนอเป็นช่วง 5-10 ครั้ง)
 *
 * **นี่คือค่าตั้งต้นที่จุดประกอบระบบส่งให้ `AuthService` ไม่ใช่ค่าที่ฝังอยู่ในตัว service**
 * เพราะ architecture §7 ข้อสมมติ 7 ยังคงข้อกำหนดไว้ว่าค่านี้ต้องตั้งค่าได้ (configurable)
 * การปิดตัวเลขไม่ได้ปิดข้อกำหนดนั้นไปด้วย
 */
export const MAX_FAILED_PIN_ATTEMPTS = 5;

/** User ตาม db-spec §2.1 — `credential_secret` ไม่อยู่ในชนิดนี้โดยเจตนา ดู UserCredential */
export interface User {
  id: string;
  username: string;
  full_name: string;
  phone_number: string | null;
  agency_name: string | null;
  position: string | null;
  role: UserRole;
  account_status: AccountStatus;
  created_by_user_id: string | null;
  created_at: Date;
}

/** Session ตาม db-spec §2.2 */
export interface Session {
  id: string;
  user_id: string;
  device_id: string;
  issued_at: Date;
  expires_at: Date;
  is_offline_cached: boolean;
  /** จำเป็นเมื่อ is_offline_cached = true (db-spec §2.2) */
  cached_pin_secret: string | null;
  /** จำเป็นเมื่อ is_offline_cached = true (db-spec §2.2, NFR-11) */
  failed_pin_attempt_count: number | null;
  last_verified_online_at: Date | null;
  status: SessionStatus;
}

/** สถานะการซิงค์ของแบบสำรวจ — db-spec §4.1 SurveyedBuilding.sync_status */
export const SYNC_STATUSES = [
  'ยังไม่ซิงค์',
  'กำลังซิงค์',
  'ซิงค์สำเร็จ',
  'มีความขัดแย้งรอแก้ไข',
] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** สถานะการตรวจทาน — db-spec §4.1 SurveyedBuilding.review_status */
export const REVIEW_STATUSES = ['ฉบับร่าง', 'รอตรวจทาน', 'ส่งกลับแก้ไข', 'รับรองแล้ว'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** สถานะความขัดแย้ง — db-spec §8.1 SyncConflict.status */
export const SYNC_CONFLICT_STATUSES = ['รอแก้ไขด้วยมือ', 'แก้ไขแล้ว'] as const;
export type SyncConflictStatus = (typeof SYNC_CONFLICT_STATUSES)[number];

/** ประเภทการกระทำใน audit trail — db-spec §7.2 AuditTrailEntry.action_type */
export const AUDIT_ACTION_TYPES = [
  'แก้ไขผลประเมินความเสียหาย',
  'รับรองผล',
  'ส่งกลับแก้ไข',
  'สร้างบัญชีผู้ใช้',
  'แก้ไขบัญชีผู้ใช้',
  'ปิดการใช้งานบัญชีผู้ใช้',
  'เปิดใช้งานบัญชีผู้ใช้คืน',
  'ซิงค์ข้อมูลสำเร็จ',
  'ตรวจพบความขัดแย้งของข้อมูล',
  'แก้ไขความขัดแย้งของข้อมูล',
  'อื่นๆ',
] as const;
export type AuditActionType = (typeof AUDIT_ACTION_TYPES)[number];

/**
 * ส่วนของ `SurveyedBuilding` ที่ควบคุมการซิงค์และการตรวจจับความขัดแย้ง (db-spec §4.1)
 *
 * **เป็นส่วนย่อยของ entity ไม่ใช่ทั้ง entity โดยเจตนา** — ฟิลด์เนื้อหาแบบสำรวจ (ที่อยู่,
 * ประเภทอาคาร, ระดับความเสียหาย ฯลฯ) อยู่ใน Phase 2 ส่วนฟิลด์ด้านล่างนี้คือสิ่งที่ NFR-01/
 * NFR-02/NFR-03 ใน Phase 1 ต้องใช้ และเป็นชุดเดียวที่กลไกซิงค์อ่าน/เขียนจริง
 * (db-spec §10 ข้อ 3: การตรวจจับความขัดแย้งอยู่ที่ระดับ aggregate เท่านั้น)
 */
export interface SurveyedBuildingSyncState {
  /** รหัสฝั่งเซิร์ฟเวอร์ — ยังไม่มีค่าก่อนซิงค์สำเร็จครั้งแรก */
  id: string | null;
  /** natural key ที่สร้างบนอุปกรณ์ ใช้เป็น idempotency key (db-spec §10 ข้อ 2) */
  client_generated_id: string;
  device_id: string;
  data_version: number;
  last_modified_at: Date;
  last_modified_by_device_id: string;
  sync_status: SyncStatus;
  synced_at: Date | null;
  created_on_device_at: Date;
}

/**
 * ขนาดชิ้นข้อมูลที่แบ่งส่งต่อครั้งของการอัปโหลดไฟล์แบบทำต่อได้ — NFR-02
 *
 * ผู้ใช้ยืนยันเมื่อ 2026-09-04 (db-spec §11, api-spec §16) เลือกค่าเล็กเพราะความทนต่อ
 * สัญญาณขาดสำคัญกว่าประสิทธิภาพสูงสุด — ทั้งโปรเจกต์สร้างบนสมมติว่าสัญญาณไม่นิ่ง (NFR-01)
 * สัญญาณหลุดกลางคันจึงเสียข้อมูลน้อย ส่วนภาระคำขอที่เยอะขึ้นมีคิวรับคำขอซิงค์รองรับ (NFR-07)
 */
export const UPLOAD_CHUNK_SIZE_BYTES = 256 * 1024;

/**
 * เกณฑ์เวลาที่ถือว่ารอบอัปโหลดค้างนานเกินควรจนต้องเริ่มรอบใหม่ — NFR-02 (db-spec §10 ข้อ 8)
 *
 * ผู้ใช้ยืนยันเมื่อ 2026-09-04 — เลือก 3 วันเพราะผู้สำรวจอาจอยู่นอกพื้นที่สัญญาณหลายวัน
 * และเพราะสั้นกว่าอายุ session 7 วัน (NFR-09) รอบอัปโหลดจึงไม่มีทางอยู่นานกว่า session
 * ที่เป็นเจ้าของมัน
 */
export const UPLOAD_STALE_THRESHOLD_HOURS = 72;
