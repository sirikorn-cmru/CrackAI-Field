import type { UserRole } from '@crackai/shared';
import { ForbiddenError } from '../shared/errors.ts';
import {
  OPERATION_POLICIES,
  policyOf,
  type DataScope,
  type OperationId,
} from './operation-policy.ts';

/** ผู้เรียก operation — ชั้นขนส่งเป็นผู้ประกอบค่านี้จาก session ที่ยืนยันแล้ว */
export interface Caller {
  user_id: string;
  role: UserRole;
}

/**
 * ผลของการตรวจสิทธิ์ระดับบทบาท (ชั้นที่ 1 ของ NFR-08)
 *
 * `scope` ที่คืนกลับมาไม่ใช่คำตอบสุดท้าย แต่เป็น**ข้อผูกพันที่ผู้เรียกต้องบังคับใช้ต่อ**
 * ด้วยการกรองข้อมูลตาม `assertWithinScope()` ก่อนคืนผลลัพธ์ (ชั้นที่ 2)
 */
export interface AuthorizationResult {
  operationId: OperationId;
  /** ไม่มีค่า = api-spec ไม่ได้ระบุขอบเขตเพิ่มจากบทบาทสำหรับบทบาทนี้ */
  scope?: DataScope;
}

/**
 * ตรวจสิทธิ์เรียก operation ตามบทบาท — T-1-03, T-1-11 (FR-26, NFR-08)
 *
 * ต้องเรียก**ก่อน**อ่านหรือแก้ข้อมูลใดๆ เสมอ ไม่ใช่กรองทีหลัง — api-spec 15.5.1 ระบุไว้ตรงตัวว่า
 * "ต้องตรวจสอบขอบเขตนี้ทุกครั้งก่อนส่งคืนผลลัพธ์ ไม่ใช่กรองหลังส่งข้อมูลออกไปแล้ว"
 */
export function authorize(caller: Caller, operationId: OperationId): AuthorizationResult {
  const policy = policyOf(operationId);
  const access = policy.callers.find((entry) => entry.role === caller.role);
  if (!access) throw new ForbiddenError(policy.title);
  return access.scope === undefined
    ? { operationId }
    : { operationId, scope: access.scope };
}

/**
 * บังคับใช้ขอบเขตข้อมูล (ชั้นที่ 2 ของ NFR-08) — เรียกเมื่อ `authorize()` คืน `scope` มา
 *
 * ตัวตัดสินว่าระเบียนหนึ่งอยู่ในขอบเขตหรือไม่เป็นของผู้เรียก เพราะขึ้นกับ entity ของแต่ละ
 * operation (เช่น `AssignmentMember` สำหรับ 3.2 หรือ `SurveyParticipant` สำหรับ 13.1/15.5.1)
 * ฟังก์ชันนี้จึงรับผลการตรวจเข้ามา หน้าที่ของมันคือทำให้ "ลืมตรวจ" เกิดขึ้นได้ยาก:
 * ทุกจุดที่มี scope ต้องเดินผ่านฟังก์ชันนี้และได้ `ForbiddenError` แบบเดียวกันเสมอ
 */
export function assertWithinScope(
  result: AuthorizationResult,
  isWithinScope: boolean,
): void {
  if (result.scope !== undefined && !isWithinScope) {
    throw new ForbiddenError(policyOf(result.operationId).title);
  }
}

export function isOperationAllowed(role: UserRole, operationId: OperationId): boolean {
  return policyOf(operationId).callers.some((entry) => entry.role === role);
}

/**
 * รายการ operation ทั้งหมดที่บทบาทหนึ่งเรียกได้ — FR-26
 *
 * ฝั่ง client ใช้ค่านี้ประกอบเมนู/หน้าจอ เพื่อไม่ให้ "จุดเข้าถึงที่กดแล้วถูกปฏิเสธ" โผล่ขึ้นมา
 * (detailed-design `audit-trail-building.md`/`audit-trail-search.md` ระบุว่าผู้สำรวจภาคสนาม
 * ต้อง "ไม่แสดงจุดเข้าถึง (เมนู/ปุ่ม) ไปยังความสามารถนี้เลย" ไม่ใช่แค่กดแล้วขึ้น error)
 */
export function allowedOperationsFor(role: UserRole): readonly OperationId[] {
  return OPERATION_POLICIES.filter((policy) =>
    policy.callers.some((entry) => entry.role === role),
  ).map((policy) => policy.id);
}
