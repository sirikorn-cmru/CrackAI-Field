import { DomainError } from '../../domain/shared/errors.ts';

/**
 * แปลง error ของชั้น domain เป็นสถานะ HTTP — ชั้นเดียวของระบบที่รู้จัก HTTP
 *
 * ชั้น domain ตั้งใจไม่รู้จัก protocol ใดเลย (`api-spec.md` เขียนเป็น operation contract
 * ไม่ใช่ endpoint) การแมปจึงอยู่ที่นี่จุดเดียว ถ้าวันหนึ่งเปลี่ยน protocol ก็แก้ที่ไฟล์นี้
 */
const STATUS_BY_CODE: Record<string, number> = {
  // 400 — คำขอไม่ถูกต้องตามสัญญาของ operation
  INVALID_ROLE: 400,
  UPLOAD_CHUNK_REJECTED: 400,
  PIN_REQUIRED: 400,

  // 401 — ยังไม่ได้ยืนยันตัวตน หรือ credential ใช้ไม่ได้แล้ว
  INVALID_CREDENTIAL: 401,
  INCORRECT_PIN: 401,
  PIN_LOCKOUT: 401,
  OFFLINE_SESSION_EXPIRED: 401,
  SESSION_NOT_USABLE: 401,

  // 403 — ยืนยันตัวตนแล้วแต่ไม่มีสิทธิ์ (NFR-08) รวมถึงบัญชีถูกปิด
  FORBIDDEN: 403,
  ACCOUNT_DISABLED: 403,

  // 404 / 409 — ทรัพยากรและสถานะ
  USER_NOT_FOUND: 404,
  USERNAME_ALREADY_EXISTS: 409,
  ACCOUNT_STATUS_UNCHANGED: 409,
};

export interface ErrorBody {
  code: string;
  message: string;
  /** มีเฉพาะ INCORRECT_PIN — จำนวนครั้งที่เหลือก่อนถูกล็อก (NFR-11) */
  remaining_attempts?: number;
}

export function toHttpError(error: unknown): { status: number; body: ErrorBody } {
  if (error instanceof DomainError) {
    const status = STATUS_BY_CODE[error.code];
    if (status === undefined) {
      // error ของ domain ที่ยังไม่ได้แมปคือความผิดพลาดของโปรแกรมเมอร์ ไม่ใช่ของผู้ใช้
      // ตอบ 500 และไม่ส่งข้อความออกไป ดีกว่าเดาสถานะแล้ว client ตีความผิด
      return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' } };
    }
    const body: ErrorBody = { code: error.code, message: error.message };
    if (error.code === 'INCORRECT_PIN' && 'remainingAttempts' in error) {
      body.remaining_attempts = (error as { remainingAttempts: number }).remainingAttempts;
    }
    return { status, body };
  }

  // ไม่ส่งรายละเอียดของ error ที่ไม่รู้จักออกไป เพราะอาจมีข้อมูลภายในระบบปน (NFR-08)
  return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดภายในระบบ' } };
}
