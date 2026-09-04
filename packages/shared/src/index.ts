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
