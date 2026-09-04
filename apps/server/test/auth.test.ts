import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { MAX_FAILED_PIN_ATTEMPTS } from '@crackai/shared';
import { AuthService } from '../src/domain/auth/auth.service.ts';
import { UserService, type Caller } from '../src/domain/user/user.service.ts';
import {
  InMemoryAuditTrailRecorder,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from '../src/infra/memory/in-memory.repositories.ts';
import { ScryptSecretHasher } from '../src/infra/crypto/scrypt-hasher.ts';
import type { Clock, IdGenerator } from '../src/domain/shared/ports.ts';

/**
 * ทดสอบ Phase 1 — T-1-01, T-1-02, T-1-04, T-1-05, T-1-11
 * อ้างอิง test case ใน `docs/03-testing/01-test-plan/test-cases/authentication-login.md`
 * และ `user-management.md`
 *
 * จำนวนครั้งสูงสุดที่ใช้ทดสอบ (3) ตั้งขึ้นเฉพาะการทดสอบ **โดยเจตนาให้ต่างจากค่าจริง (5 ครั้ง)**
 * เพื่อพิสูจน์ว่า `AuthService` อ่านค่าจากพารามิเตอร์จริง ไม่ได้ฝังเลข 5 ไว้ในตัวเอง —
 * architecture §7 ข้อสมมติ 7 กำหนดว่าค่านี้ต้องตั้งค่าได้ แม้ตัวเลขจะถูกยืนยันแล้วก็ตาม
 * ส่วนค่าจริงที่ระบบใช้ถูกตรวจแยกไว้ในเทสต์ของ MAX_FAILED_PIN_ATTEMPTS
 */
const MAX_PIN_ATTEMPTS_FOR_TEST = 3;

class FixedClock implements Clock {
  private current: Date;
  constructor(current: Date) {
    this.current = current;
  }
  now(): Date {
    return this.current;
  }
  advanceDays(days: number): void {
    this.current = new Date(this.current.getTime() + days * 24 * 60 * 60 * 1000);
  }
}

class SequentialIds implements IdGenerator {
  private n = 0;
  next(): string {
    this.n += 1;
    return `id-${this.n}`;
  }
}

const ADMIN: Caller = { user_id: 'admin-1', role: 'ผู้ดูแลระบบ' };
const NOT_ADMIN: Caller = { user_id: 'lead-1', role: 'หัวหน้าผู้สำรวจ' };

function buildContext() {
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const audit = new InMemoryAuditTrailRecorder();
  const hasher = new ScryptSecretHasher();
  const ids = new SequentialIds();
  const clock = new FixedClock(new Date('2026-09-03T08:00:00.000Z'));

  const userService = new UserService(users, sessions, hasher, ids, clock, audit);
  const authService = new AuthService(
    users,
    sessions,
    hasher,
    ids,
    clock,
    MAX_PIN_ATTEMPTS_FOR_TEST,
  );
  return { users, sessions, audit, clock, userService, authService };
}

async function createSurveyor(ctx: ReturnType<typeof buildContext>) {
  return ctx.userService.createUser(ADMIN, {
    username: 'surveyor01',
    full_name: 'สมชาย ใจดี',
    credential_secret: 'รหัสผ่านที่ถูกต้อง',
    role: 'ผู้สำรวจภาคสนาม',
  });
}

describe('T-1-01 จัดการบัญชีผู้ใช้ (FR-21, NFR-08)', () => {
  let ctx: ReturnType<typeof buildContext>;
  beforeEach(() => {
    ctx = buildContext();
  });

  it('ผู้ดูแลระบบสร้างบัญชีได้ และไม่คืน credential_secret ออกไป', async () => {
    const user = await createSurveyor(ctx);
    assert.equal(user.username, 'surveyor01');
    assert.equal(user.account_status, 'ใช้งานได้');
    assert.equal(user.created_by_user_id, ADMIN.user_id);
    assert.ok(!('credential_secret' in user), 'ห้ามคืน credential_secret ออกนอกชั้น domain');
  });

  it('บทบาทที่ไม่ใช่ผู้ดูแลระบบสร้างบัญชีไม่ได้ (NFR-08)', async () => {
    await assert.rejects(
      () =>
        ctx.userService.createUser(NOT_ADMIN, {
          username: 'x',
          full_name: 'x',
          credential_secret: 'x',
          role: 'ผู้สำรวจภาคสนาม',
        }),
      /ไม่มีสิทธิ์/,
    );
  });

  it('ชื่อบัญชีซ้ำไม่ได้ และบทบาทต้องเป็นค่าที่กำหนดเท่านั้น', async () => {
    await createSurveyor(ctx);
    await assert.rejects(() => createSurveyor(ctx), /มีบัญชีที่ใช้ชื่อ/);
    await assert.rejects(
      () =>
        ctx.userService.createUser(ADMIN, {
          username: 'other',
          full_name: 'x',
          credential_secret: 'x',
          role: 'บทบาทที่ไม่มีจริง',
        }),
      /ไม่ใช่ค่าที่ระบบรองรับ/,
    );
  });

  it('ปิดบัญชีแล้วเพิกถอน session ที่ใช้งานอยู่ทั้งหมด และบันทึกประวัติ', async () => {
    const user = await createSurveyor(ctx);
    const { session } = await ctx.authService.login({
      username: 'surveyor01',
      credential_secret: 'รหัสผ่านที่ถูกต้อง',
      device_id: 'tablet-01',
      cached_pin_secret: '246810',
    });

    await ctx.userService.disableUser(ADMIN, user.id);

    const after = await ctx.sessions.findById(session.id);
    assert.equal(after?.status, 'ถูกเพิกถอน');

    const entry = ctx.audit.entries.at(-1);
    assert.equal(entry?.action_type, 'ปิดการใช้งานบัญชีผู้ใช้');
    assert.equal(entry?.performed_by_user_id, ADMIN.user_id);
    assert.equal(entry?.value_before, 'ใช้งานได้');
    assert.equal(entry?.value_after, 'ปิดใช้งาน');
  });

  it('เปิดบัญชีคืนไม่กระทบ session (api-spec 2.4) และปิด/เปิดซ้ำสถานะเดิมไม่ได้', async () => {
    const user = await createSurveyor(ctx);
    await assert.rejects(() => ctx.userService.enableUser(ADMIN, user.id), /ใช้งานได้อยู่แล้ว/);

    await ctx.userService.disableUser(ADMIN, user.id);
    const { session } = await ctx.authService.login({
      username: 'surveyor01',
      credential_secret: 'รหัสผ่านที่ถูกต้อง',
      device_id: 'tablet-01',
      cached_pin_secret: '246810',
    }).catch(() => ({ session: null }) as never);
    assert.equal(session, null, 'บัญชีที่ถูกปิดต้องเข้าสู่ระบบไม่ได้');

    await ctx.userService.enableUser(ADMIN, user.id);
    await assert.rejects(() => ctx.userService.disableUser(NOT_ADMIN, user.id), /ไม่มีสิทธิ์/);
  });
});

describe('T-1-02 เข้าสู่ระบบ (FR-25, FR-26)', () => {
  let ctx: ReturnType<typeof buildContext>;
  beforeEach(async () => {
    ctx = buildContext();
    await createSurveyor(ctx);
  });

  it('เข้าสู่ระบบสำเร็จ คืน role ให้ client และตั้งตัวนับ PIN เป็น 0', async () => {
    const result = await ctx.authService.login({
      username: 'surveyor01',
      credential_secret: 'รหัสผ่านที่ถูกต้อง',
      device_id: 'tablet-01',
      cached_pin_secret: '246810',
    });
    assert.equal(result.role, 'ผู้สำรวจภาคสนาม');
    assert.equal(result.session.status, 'ใช้งานอยู่');
    assert.equal(result.session.is_offline_cached, false);
    assert.equal(result.session.failed_pin_attempt_count, 0);
    assert.notEqual(result.session.cached_pin_secret, '246810', 'PIN ต้องไม่ถูกเก็บเป็นข้อความธรรมดา');
  });

  it('ผู้สำรวจภาคสนามไม่ส่ง PIN มาด้วย ต้องเข้าสู่ระบบไม่ได้ (FR-25)', async () => {
    await assert.rejects(
      () =>
        ctx.authService.login({
          username: 'surveyor01',
          credential_secret: 'รหัสผ่านที่ถูกต้อง',
          device_id: 'tablet-01',
        }),
      /ต้องตั้งรหัส PIN/,
    );
  });

  it('รหัสผ่านผิดและชื่อบัญชีไม่มีจริง ต้องได้ข้อความเดียวกัน (NFR-08)', async () => {
    const wrongPassword = await ctx.authService
      .login({
        username: 'surveyor01',
        credential_secret: 'ผิด',
        device_id: 'tablet-01',
        cached_pin_secret: '246810',
      })
      .catch((error: Error) => error.message);
    const noSuchUser = await ctx.authService
      .login({
        username: 'ไม่มีบัญชีนี้',
        credential_secret: 'อะไรก็ได้',
        device_id: 'tablet-01',
      })
      .catch((error: Error) => error.message);
    assert.equal(wrongPassword, noSuchUser);
  });
});

describe('T-1-04/T-1-05/NFR-11 ปลดล็อกออฟไลน์ด้วย PIN', () => {
  let ctx: ReturnType<typeof buildContext>;
  let sessionId: string;

  beforeEach(async () => {
    ctx = buildContext();
    await createSurveyor(ctx);
    const { session } = await ctx.authService.login({
      username: 'surveyor01',
      credential_secret: 'รหัสผ่านที่ถูกต้อง',
      device_id: 'tablet-01',
      cached_pin_secret: '246810',
    });
    sessionId = session.id;
  });

  it('PIN ถูกต้อง ปลดล็อกได้และรีเซ็ตตัวนับ', async () => {
    await ctx.authService.unlockOffline(sessionId, 'ผิด').catch(() => undefined);
    const session = await ctx.authService.unlockOffline(sessionId, '246810');
    assert.equal(session.is_offline_cached, true);
    assert.equal(session.failed_pin_attempt_count, 0);
  });

  it('PIN ผิดแต่ยังไม่ครบ นับเพิ่มทีละครั้งและบอกจำนวนครั้งที่เหลือ', async () => {
    await assert.rejects(() => ctx.authService.unlockOffline(sessionId, 'ผิด'), /เหลือโอกาสอีก 2 ครั้ง/);
    const session = await ctx.sessions.findById(sessionId);
    assert.equal(session?.failed_pin_attempt_count, 1);
    assert.equal(session?.status, 'ใช้งานอยู่', 'ผิดยังไม่ครบต้องไม่เปลี่ยนสถานะ session');
  });

  it('PIN ผิดครบจำนวน ล้าง PIN และเพิกถอน session (NFR-11)', async () => {
    for (let i = 0; i < MAX_PIN_ATTEMPTS_FOR_TEST - 1; i += 1) {
      await ctx.authService.unlockOffline(sessionId, 'ผิด').catch(() => undefined);
    }
    await assert.rejects(() => ctx.authService.unlockOffline(sessionId, 'ผิด'), /ล้างข้อมูลเข้าสู่ระบบ/);

    const session = await ctx.sessions.findById(sessionId);
    assert.equal(session?.cached_pin_secret, null);
    assert.equal(session?.failed_pin_attempt_count, null);
    assert.equal(session?.status, 'ถูกเพิกถอน');
  });

  it('หลัง lockout ปลดล็อกด้วย PIN ที่ถูกต้องอีกไม่ได้ ต้องเข้าสู่ระบบใหม่เท่านั้น', async () => {
    for (let i = 0; i < MAX_PIN_ATTEMPTS_FOR_TEST; i += 1) {
      await ctx.authService.unlockOffline(sessionId, 'ผิด').catch(() => undefined);
    }
    await assert.rejects(
      () => ctx.authService.unlockOffline(sessionId, '246810'),
      /ไม่มี credential ที่แคชไว้/,
    );
  });

  it('credential ที่แคชไว้หมดอายุเมื่อครบ 7 วัน (NFR-09)', async () => {
    ctx.clock.advanceDays(7);
    await assert.rejects(() => ctx.authService.unlockOffline(sessionId, '246810'), /หมดอายุแล้ว/);
  });

  it('ยังไม่ครบ 7 วัน ต้องยังปลดล็อกได้ (boundary ของ NFR-09)', async () => {
    ctx.clock.advanceDays(6);
    const session = await ctx.authService.unlockOffline(sessionId, '246810');
    assert.equal(session.status, 'ใช้งานอยู่');
  });

  it('ต่ออายุเมื่อกลับมามีสัญญาณ แต่ถ้าบัญชีถูกปิดระหว่างออฟไลน์ต้องถูกเพิกถอน (api-spec 1.4)', async () => {
    ctx.clock.advanceDays(1);
    const renewed = await ctx.authService.reverifyOnline(sessionId, 'tablet-01');
    assert.ok(renewed.expires_at > renewed.issued_at);

    const user = await ctx.users.findByUsername('surveyor01');
    await ctx.userService.disableUser(ADMIN, user!.id);
    await assert.rejects(
      () => ctx.authService.reverifyOnline(sessionId, 'tablet-01'),
      /ถูกเพิกถอนหรือหมดอายุ|ปิดการใช้งาน/,
    );
  });
});

describe('NFR-11 การตั้งค่าจำนวนครั้งสูงสุด', () => {
  it('สร้าง AuthService โดยไม่ระบุจำนวนครั้งที่ถูกต้องไม่ได้ — กันการเดาตัวเลข', () => {
    const ctx = buildContext();
    for (const invalid of [0, -1, 2.5, Number.NaN]) {
      assert.throws(
        () =>
          new AuthService(
            ctx.users,
            ctx.sessions,
            new ScryptSecretHasher(),
            new SequentialIds(),
            ctx.clock,
            invalid,
          ),
        /จำนวนเต็มบวก/,
      );
    }
  });

  it('ค่าจริงที่ระบบใช้คือ 5 ครั้ง ตรงกับที่ผู้ใช้ยืนยันใน spec (NFR-11)', () => {
    // ปิดข้อสมมติหมวด 6 ข้อ 11 เมื่อ 2026-09-04 — ถ้ามีใครเปลี่ยนค่านี้โดยไม่แก้ spec ก่อน
    // เทสต์ข้อนี้จะพัง ซึ่งเป็นผลที่ต้องการ เพราะเอกสารคือแหล่งความจริง ไม่ใช่โค้ด
    assert.equal(MAX_FAILED_PIN_ATTEMPTS, 5);
  });

  it('AuthService ใช้ค่าที่ส่งเข้ามาจริง ไม่ได้ฝังเลข 5 ไว้ในตัวเอง (architecture §7 ข้อ 7)', async () => {
    const ctx = buildContext();
    const service = new AuthService(
      ctx.users,
      ctx.sessions,
      new ScryptSecretHasher(),
      new SequentialIds(),
      ctx.clock,
      // ค่านี้ต่างจากทั้ง 5 (ค่าจริง) และ 3 (ค่าที่เทสต์อื่นใช้) เพื่อพิสูจน์ว่าอ่านจากพารามิเตอร์
      1,
    );
    await createSurveyor(ctx);
    const { session } = await service.login({
      username: 'surveyor01',
      credential_secret: 'รหัสผ่านที่ถูกต้อง',
      device_id: 'tablet-01',
      cached_pin_secret: '246810',
    });
    // ตั้งไว้ 1 ครั้ง แปลว่ากรอกผิดครั้งแรกต้องล็อกทันที
    await assert.rejects(() => service.unlockOffline(session.id, 'ผิด'), /ล้างข้อมูลเข้าสู่ระบบ/);
  });
});
