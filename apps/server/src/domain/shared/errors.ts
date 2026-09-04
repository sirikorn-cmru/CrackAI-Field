/**
 * กรณี error ของ operation ต่างๆ ตาม `docs/02-design/02-technical/api-spec.md`
 *
 * แต่ละคลาสตรงกับ "กรณี error" ที่ระบุไว้ในสัญญาของ operation หนึ่งข้อขึ้นไป
 * `code` ใช้สำหรับให้ชั้นขนส่ง (transport) แปลงเป็นรูปแบบของ protocol ที่เลือกภายหลัง
 * โดยที่ชั้น domain ไม่ต้องรู้จัก protocol ใดเลย
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** api-spec 2.1 — `username` ซ้ำ */
export class UsernameAlreadyExistsError extends DomainError {
  readonly code = 'USERNAME_ALREADY_EXISTS';
  constructor(username: string) {
    super(`มีบัญชีที่ใช้ชื่อ "${username}" อยู่แล้ว`);
  }
}

/** api-spec 2.1 — `role` ไม่ถูกต้อง */
export class InvalidRoleError extends DomainError {
  readonly code = 'INVALID_ROLE';
  constructor(role: string) {
    super(`บทบาท "${role}" ไม่ใช่ค่าที่ระบบรองรับ`);
  }
}

/** api-spec 2.2/2.3/2.4 — ไม่พบผู้ใช้ */
export class UserNotFoundError extends DomainError {
  readonly code = 'USER_NOT_FOUND';
  constructor(userId: string) {
    super(`ไม่พบบัญชีผู้ใช้รหัส ${userId}`);
  }
}

/** api-spec 2.3 — บัญชีถูกปิดใช้งานอยู่แล้ว / 2.4 — บัญชีใช้งานได้อยู่แล้ว */
export class AccountStatusUnchangedError extends DomainError {
  readonly code = 'ACCOUNT_STATUS_UNCHANGED';
  constructor(message: string) {
    super(message);
  }
}

/** api-spec 1.1 — ชื่อบัญชี/รหัสผ่านไม่ถูกต้อง */
export class InvalidCredentialError extends DomainError {
  readonly code = 'INVALID_CREDENTIAL';
  constructor() {
    // ข้อความเดียวกันทั้งกรณีไม่พบบัญชีและรหัสผ่านผิด เพื่อไม่ให้ผู้เรียกแยกแยะได้ว่า
    // ชื่อบัญชีใดมีอยู่จริง (NFR-08)
    super('ชื่อบัญชีหรือรหัสผ่านไม่ถูกต้อง');
  }
}

/** api-spec 1.1/1.4 — บัญชีถูกปิดใช้งาน */
export class AccountDisabledError extends DomainError {
  readonly code = 'ACCOUNT_DISABLED';
  constructor() {
    super('บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  }
}

/** api-spec 1.1 — บทบาทผู้สำรวจภาคสนามต้องตั้ง PIN ตอนเข้าสู่ระบบ */
export class PinRequiredError extends DomainError {
  readonly code = 'PIN_REQUIRED';
  constructor() {
    super('บทบาทผู้สำรวจภาคสนามต้องตั้งรหัส PIN สำหรับปลดล็อกขณะออฟไลน์');
  }
}

/** api-spec 1.2/1.3/1.4 — ไม่พบ session หรือถูกเพิกถอนไปแล้ว */
export class SessionNotUsableError extends DomainError {
  readonly code = 'SESSION_NOT_USABLE';
  constructor(message: string) {
    super(message);
  }
}

/** api-spec 1.3 — credential ที่แคชไว้หมดอายุแล้ว (NFR-09) */
export class OfflineSessionExpiredError extends DomainError {
  readonly code = 'OFFLINE_SESSION_EXPIRED';
  constructor() {
    super('credential ที่แคชไว้หมดอายุแล้ว ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อเข้าสู่ระบบใหม่');
  }
}

/** api-spec 1.3 — PIN ไม่ถูกต้องแต่ยังไม่ครบจำนวนครั้งสูงสุด (NFR-11) */
export class IncorrectPinError extends DomainError {
  readonly code = 'INCORRECT_PIN';
  readonly remainingAttempts: number;
  constructor(remainingAttempts: number) {
    super(`รหัส PIN ไม่ถูกต้อง เหลือโอกาสอีก ${remainingAttempts} ครั้ง`);
    this.remainingAttempts = remainingAttempts;
  }
}

/** api-spec 1.3 — PIN ผิดครบจำนวนครั้งสูงสุด credential ถูกล้าง (NFR-11) */
export class PinLockoutError extends DomainError {
  readonly code = 'PIN_LOCKOUT';
  constructor() {
    super(
      'กรอกรหัส PIN ผิดครบจำนวนครั้งที่กำหนด ระบบล้างข้อมูลเข้าสู่ระบบที่เก็บไว้ในเครื่องแล้ว ' +
        'ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อเข้าสู่ระบบใหม่ด้วยรหัสผ่าน — ' +
        'ข้อมูลแบบสำรวจที่ยังไม่ซิงค์ยังอยู่ครบ ไม่ถูกลบ',
    );
  }
}

/** NFR-08 — ผู้เรียกไม่มีสิทธิ์ตามบทบาท */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  constructor(action: string) {
    super(`บทบาทของผู้ใช้ไม่มีสิทธิ์${action}`);
  }
}
