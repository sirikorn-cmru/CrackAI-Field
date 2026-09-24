import {
  OFFLINE_CAPABLE_ROLE,
  OFFLINE_SESSION_TTL_DAYS,
  type Session,
  type User,
} from '@crackai/shared';
import {
  AccountDisabledError,
  IncorrectPinError,
  InvalidCredentialError,
  OfflineSessionExpiredError,
  PinLockoutError,
  PinRequiredError,
  SessionNotUsableError,
} from '../shared/errors.ts';
import type { Clock, IdGenerator, SecretHasher } from '../shared/ports.ts';
import type { UserRepository } from '../user/user.repository.ts';
import type { SessionRepository } from './session.repository.ts';

export interface LoginCommand {
  username: string;
  credential_secret: string;
  device_id: string;
  /** จำเป็นเมื่อผู้ใช้มี role = ผู้สำรวจภาคสนาม (api-spec 1.1) */
  cached_pin_secret?: string;
}

export interface LoginResult {
  session: Session;
  /** api-spec 1.1 ระบุให้ส่ง role กลับไปให้ client กำหนดเมนู/หน้าจอที่อนุญาต (FR-26) */
  role: User['role'];
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * ยืนยันตัวตนและเข้าสู่ระบบ — T-1-02, T-1-04, T-1-05 (FR-25, FR-27, NFR-09, NFR-11)
 * ครอบคลุม api-spec operation 1.1, 1.2, 1.3, 1.4
 */
export class AuthService {
  /**
   * @param maxFailedPinAttempts จำนวนครั้งสูงสุดที่ยอมให้กรอก PIN ผิดติดต่อกัน (NFR-11)
   *   **ไม่มีค่าเริ่มต้นโดยเจตนา** แม้ตัวเลขจะถูกยืนยันแล้วเมื่อ 2026-09-04 เป็น 5 ครั้ง
   *   (ดู `MAX_FAILED_PIN_ATTEMPTS` ใน `@crackai/shared`) เพราะ architecture §7 ข้อสมมติ 7
   *   ยังคงข้อกำหนดว่าค่านี้ต้องตั้งค่าได้ — การปิดตัวเลขไม่ได้ปิดข้อกำหนดนั้นไปด้วย
   */
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;
  private readonly hasher: SecretHasher;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;
  private readonly maxFailedPinAttempts: number;

  constructor(
    users: UserRepository,
    sessions: SessionRepository,
    hasher: SecretHasher,
    ids: IdGenerator,
    clock: Clock,
    maxFailedPinAttempts: number,
  ) {
    this.users = users;
    this.sessions = sessions;
    this.hasher = hasher;
    this.ids = ids;
    this.clock = clock;
    this.maxFailedPinAttempts = maxFailedPinAttempts;
    if (!Number.isInteger(maxFailedPinAttempts) || maxFailedPinAttempts < 1) {
      throw new Error('maxFailedPinAttempts ต้องเป็นจำนวนเต็มบวก (NFR-11)');
    }
  }

  /** api-spec 1.1 เข้าสู่ระบบ (ออนไลน์ ด้วยชื่อผู้ใช้/รหัสผ่าน) */
  async login(command: LoginCommand): Promise<LoginResult> {
    const user = await this.users.findByUsername(command.username);
    if (!user) throw new InvalidCredentialError();

    const passwordOk = await this.hasher.verify(command.credential_secret, user.credential_secret);
    if (!passwordOk) throw new InvalidCredentialError();

    if (user.account_status !== 'ใช้งานได้') throw new AccountDisabledError();

    // api-spec 1.1: ผู้สำรวจภาคสนามต้องตั้ง/ยืนยัน PIN ใหม่ทุกครั้งที่เข้าสู่ระบบสำเร็จขณะมีสัญญาณ
    if (user.role === OFFLINE_CAPABLE_ROLE && !command.cached_pin_secret) {
      throw new PinRequiredError();
    }

    const now = this.clock.now();
    const session = await this.sessions.insert({
      id: this.ids.next(),
      user_id: user.id,
      device_id: command.device_id,
      issued_at: now,
      expires_at: new Date(now.getTime() + OFFLINE_SESSION_TTL_DAYS * MILLISECONDS_PER_DAY),
      is_offline_cached: false,
      // เก็บ PIN แยกจาก credential_secret เสมอ ไม่ปะปนกัน (architecture §6.8)
      cached_pin_secret: command.cached_pin_secret
        ? await this.hasher.hash(command.cached_pin_secret)
        : null,
      // api-spec 1.1: การเข้าสู่ระบบสำเร็จรีเซ็ตตัวนับเป็น 0 เสมอ (NFR-11)
      failed_pin_attempt_count: command.cached_pin_secret ? 0 : null,
      last_verified_online_at: now,
      status: 'ใช้งานอยู่',
    });

    return { session, role: user.role };
  }

  /** api-spec 1.2 ออกจากระบบ */
  async logout(sessionId: string): Promise<Session> {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new SessionNotUsableError('ไม่พบ session ที่ระบุ');
    if (session.status !== 'ใช้งานอยู่') {
      throw new SessionNotUsableError('session นี้ถูกเพิกถอนหรือหมดอายุไปแล้ว');
    }
    // api-spec 1.2 ระบุผลลัพธ์เป็น status = หมดอายุ (ไม่ใช่ ถูกเพิกถอน)
    return this.sessions.update(sessionId, { status: 'หมดอายุ' });
  }

  /**
   * api-spec 1.3 เข้าสู่ระบบด้วย credential ที่แคชไว้ขณะออฟไลน์
   *
   * ทำงานบนอุปกรณ์เท่านั้น ไม่ติดต่อเซิร์ฟเวอร์ — `sessions` ที่ฉีดเข้ามาในบริบทนี้
   * คือที่เก็บข้อมูลบนเครื่อง ไม่ใช่ฐานข้อมูลกลาง
   */
  async unlockOffline(sessionId: string, pin: string): Promise<Session> {
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      throw new SessionNotUsableError('ไม่เคยเข้าสู่ระบบสำเร็จบนอุปกรณ์นี้มาก่อน');
    }
    if (session.status !== 'ใช้งานอยู่' || session.cached_pin_secret === null) {
      throw new SessionNotUsableError('ไม่มี credential ที่แคชไว้ให้ใช้ปลดล็อกบนอุปกรณ์นี้');
    }
    // NFR-09 — อายุนับจากครั้งล่าสุดที่เชื่อมต่อเซิร์ฟเวอร์สำเร็จ
    if (this.clock.now() >= session.expires_at) {
      throw new OfflineSessionExpiredError();
    }

    if (await this.hasher.verify(pin, session.cached_pin_secret)) {
      return this.sessions.update(sessionId, {
        is_offline_cached: true,
        failed_pin_attempt_count: 0,
      });
    }

    const attempts = (session.failed_pin_attempt_count ?? 0) + 1;

    if (attempts >= this.maxFailedPinAttempts) {
      // NFR-11: ล้าง PIN และตัวนับในธุรกรรมเดียว แล้วเพิกถอน session
      // ไม่แตะข้อมูลแบบสำรวจหรือคิวรอซิงค์บนอุปกรณ์เลย (NFR-01) — โค้ดนี้เข้าถึงเฉพาะ
      // ที่เก็บ session เท่านั้น จึงไม่มีทางลบข้อมูลสำรวจได้แม้โดยอุบัติเหตุ
      await this.sessions.update(sessionId, {
        cached_pin_secret: null,
        failed_pin_attempt_count: null,
        status: 'ถูกเพิกถอน',
      });
      throw new PinLockoutError();
    }

    await this.sessions.update(sessionId, { failed_pin_attempt_count: attempts });
    throw new IncorrectPinError(this.maxFailedPinAttempts - attempts);
  }

  /** api-spec 1.4 ต่ออายุ/ยืนยันตัวตนใหม่เมื่อกลับมามีสัญญาณ */
  async reverifyOnline(sessionId: string, deviceId: string): Promise<Session> {
    const session = await this.sessions.findById(sessionId);
    if (!session) throw new SessionNotUsableError('ไม่พบ session ที่ระบุ');
    if (session.device_id !== deviceId) {
      throw new SessionNotUsableError('session นี้ไม่ได้ออกให้อุปกรณ์เครื่องนี้');
    }
    if (session.status !== 'ใช้งานอยู่') {
      throw new SessionNotUsableError('session นี้ถูกเพิกถอนหรือหมดอายุไปแล้ว');
    }

    const user = await this.users.findById(session.user_id);
    if (!user) throw new SessionNotUsableError('ไม่พบบัญชีเจ้าของ session');

    // api-spec 1.4: บัญชีถูกปิดใช้งานระหว่างออฟไลน์ ต้องปฏิเสธและบังคับออกจากระบบ
    if (user.account_status !== 'ใช้งานได้') {
      await this.sessions.update(sessionId, { status: 'ถูกเพิกถอน' });
      throw new AccountDisabledError();
    }

    const now = this.clock.now();
    return this.sessions.update(sessionId, {
      last_verified_online_at: now,
      expires_at: new Date(now.getTime() + OFFLINE_SESSION_TTL_DAYS * MILLISECONDS_PER_DAY),
      is_offline_cached: false,
    });
  }
}
