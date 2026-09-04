import type { AuditActionType } from '@crackai/shared';

/**
 * Port ที่ชั้น domain ต้องการจากภายนอก
 *
 * ทั้งหมดเป็น interface เพื่อให้ domain ทดสอบได้โดยไม่ต้องมีฐานข้อมูล/นาฬิกาจริง
 * และเพื่อไม่ให้ domain ผูกกับ MySQL/MariaDB หรือ protocol ใดตาม
 * `docs/02-design/02-technical/architecture.md`
 */

/** นาฬิกา — แยกออกมาเพื่อให้ทดสอบเรื่องหมดอายุ (NFR-09) ได้โดยไม่ต้องรอเวลาจริง */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** ตัวสร้าง "ตัวระบุเฉพาะ" ตาม db-spec §0 — รูปแบบที่ใช้จริงยังไม่ตัดสินใจ (db-spec §11) */
export interface IdGenerator {
  next(): string;
}

/**
 * การเก็บ/ตรวจสอบความลับ (รหัสผ่านและ PIN)
 *
 * db-spec §2.1 ระบุว่า `credential_secret` ต้องเก็บในรูปแบบเข้ารหัส และ §11 ระบุว่า
 * **วิธีเข้ารหัสยังไม่ตัดสินใจ** — จึงกันไว้เป็น port ให้เปลี่ยนได้โดยไม่กระทบ domain
 */
export interface SecretHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hashed: string): Promise<boolean>;
}

/**
 * ตัวบันทึกประวัติการแก้ไข (NFR-05)
 *
 * api-spec 2.2/2.3/2.4 กำหนดว่าต้องสร้าง `AuditTrailEntry` เป็นผลข้างเคียง
 * Phase 1 จึงต้องมี port นี้แม้ NFR-05 เต็มรูปแบบจะอยู่ใน Phase 2 ตาม
 * `docs/01-requirements/02-plan/release-plan.md`
 */
export interface AuditTrailRecorder {
  record(entry: AuditTrailDraft): Promise<void>;
}

/** ข้อมูลที่ domain ส่งให้ผู้บันทึกประวัติ — ตรงกับ db-spec §7.2 AuditTrailEntry */
export interface AuditTrailDraft {
  related_entity_name: string;
  related_entity_id: string;
  /**
   * อาคารต้นทางของเหตุการณ์ — db-spec §10 ข้อ 9 บังคับให้ resolve ค่านี้ตั้งแต่ตอนสร้างระเบียน
   * ไม่ใช่ไป join ทีหลัง จึงประกาศเป็นฟิลด์บังคับ (ค่า null ได้ แต่ต้องระบุเสมอ) เพื่อให้ทุกจุด
   * ที่สร้างประวัติต้องตัดสินใจตามกฎข้อนั้นอย่างชัดแจ้ง — `null` ใช้เมื่อเหตุการณ์ไม่ผูกกับ
   * อาคารใด (เช่น `related_entity_name = User`)
   */
  related_surveyedbuilding_id: string | null;
  action_type: AuditActionType;
  /** db-spec §7.2: ไม่บังคับเมื่อผู้กระทำคือระบบเอง แต่การกระทำของมนุษย์ต้องระบุเสมอ */
  performed_by_user_id: string | null;
  value_before: string | null;
  value_after: string | null;
  performed_at: Date;
  note: string | null;
}
