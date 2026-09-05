import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { MAX_FAILED_PIN_ATTEMPTS, type UserRole } from '@crackai/shared';
import { AuthService } from '../src/domain/auth/auth.service.ts';
import { UserService } from '../src/domain/user/user.service.ts';
import { SyncIntakeService } from '../src/domain/sync/sync-intake.service.ts';
import { ResumableUploadService } from '../src/domain/sync/upload.service.ts';
import { manualOnlyMergeStrategy } from '../src/domain/sync/merge-strategy.ts';
import {
  InMemoryAuditTrailRecorder,
  InMemoryMediaBlobStore,
  InMemoryMediaUploadRepository,
  InMemorySessionRepository,
  InMemorySurveyedBuildingSyncRepository,
  InMemorySyncConflictRepository,
  InMemoryUserRepository,
} from '../src/infra/memory/in-memory.repositories.ts';
import { ScryptSecretHasher, UuidGenerator } from '../src/infra/crypto/scrypt-hasher.ts';
import { buildServer, readAllowedOrigins } from '../src/infra/http/server.ts';
import { hashSessionToken } from '../src/infra/http/auth.plugin.ts';
import { systemClock } from '../src/domain/shared/ports.ts';

const ADMIN: UserRole = 'ผู้ดูแลระบบ';
const FIELD: UserRole = 'ผู้สำรวจภาคสนาม';

function buildContext() {
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const audit = new InMemoryAuditTrailRecorder();
  const hasher = new ScryptSecretHasher();
  const ids = new UuidGenerator();
  const tokens = new Map<string, string>();

  const app = buildServer({
    users,
    sessions,
    clock: systemClock,
    resolveSessionIdByToken: async (hash) => tokens.get(hash) ?? null,
    bindSessionToken: async (hash, sessionId) => void tokens.set(hash, sessionId),
    authService: new AuthService(users, sessions, hasher, ids, systemClock, MAX_FAILED_PIN_ATTEMPTS),
    userService: new UserService(users, sessions, hasher, ids, systemClock, audit),
    syncService: new SyncIntakeService(
      new InMemorySurveyedBuildingSyncRepository(),
      new InMemorySyncConflictRepository(),
      ids,
      systemClock,
      audit,
      manualOnlyMergeStrategy,
    ),
    uploadService: new ResumableUploadService(
      new InMemoryMediaUploadRepository(),
      new InMemoryMediaBlobStore(),
      ids,
      systemClock,
    ),
    allowedOrigins: ['https://crackai.example.go.th'],
  });
  return { app, users, sessions, hasher, ids, tokens };
}

let ctx: ReturnType<typeof buildContext>;

async function seedUser(role: UserRole, username: string) {
  await ctx.users.insert({
    id: ctx.ids.next(),
    username,
    full_name: 'ผู้ใช้ทดสอบ',
    credential_secret: await ctx.hasher.hash('รหัสผ่านที่ถูกต้อง'),
    phone_number: null,
    agency_name: null,
    position: null,
    role,
    account_status: 'ใช้งานได้',
    created_by_user_id: null,
    created_at: new Date(),
  });
}

async function login(username: string, pin?: string) {
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      username,
      credential_secret: 'รหัสผ่านที่ถูกต้อง',
      device_id: 'tablet-01',
      ...(pin ? { cached_pin_secret: pin } : {}),
    },
  });
  return response;
}

beforeEach(() => {
  ctx = buildContext();
});

describe('ชั้นขนส่ง REST + Fastify (technology-stack 2026-09-04)', () => {
  it('เข้าสู่ระบบสำเร็จได้ token และรายการ operation ที่บทบาทนั้นเรียกได้ (FR-26)', async () => {
    await seedUser(ADMIN, 'admin01');
    const response = await login('admin01');

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.ok(typeof body.access_token === 'string' && body.access_token.length > 20);
    assert.equal(body.role, ADMIN);
    // client ใช้รายการนี้สร้างเมนู ไม่ต้องมีตารางสิทธิ์ของตัวเอง
    assert.deepEqual(body.allowed_operations, [
      '1.1', '1.2', '2.1', '2.2', '2.3', '2.4', '15.1', '15.2', '15.5.1', '15.5.2',
    ]);
  });

  it('token ไม่ถูกเก็บเป็นตัวจริงในฝั่งเซิร์ฟเวอร์ เก็บแค่ค่าแฮช', async () => {
    await seedUser(ADMIN, 'admin01');
    const token = (await login('admin01')).json().access_token as string;

    assert.equal(ctx.tokens.has(token), false, 'ห้ามเก็บ token ตัวจริงเป็นคีย์');
    assert.equal(ctx.tokens.has(hashSessionToken(token)), true);
  });

  it('เรียกโดยไม่มี token หรือ token ผิด ต้องได้ 401 ทั้งคู่ (NFR-08)', async () => {
    for (const headers of [{}, { authorization: 'Bearer ปลอม' }, { authorization: 'ไม่ใช่ bearer' }]) {
      const response = await ctx.app.inject({ method: 'POST', url: '/users', headers, payload: {} });
      assert.equal(response.statusCode, 401);
    }
  });

  it('บทบาทที่ไม่ใช่ผู้ดูแลระบบสร้างบัญชีไม่ได้ — ได้ 403 ไม่ใช่ 401 (NFR-08)', async () => {
    await seedUser(FIELD, 'surveyor01');
    const token = (await login('surveyor01', '246810')).json().access_token as string;

    const response = await ctx.app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: `Bearer ${token}` },
      payload: { username: 'x', full_name: 'x', credential_secret: 'y', role: FIELD },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, 'FORBIDDEN');
  });

  it('ผู้สำรวจภาคสนามไม่ส่ง PIN มาด้วย ต้องได้ 400 ไม่ใช่ 500 (FR-25)', async () => {
    await seedUser(FIELD, 'surveyor01');
    const response = await login('surveyor01');
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, 'PIN_REQUIRED');
  });

  it('รหัสผ่านผิดกับไม่มีบัญชีนี้ ต้องได้สถานะและข้อความเดียวกันทุกตัวอักษร (NFR-08)', async () => {
    await seedUser(ADMIN, 'admin01');
    const wrongPassword = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'admin01', credential_secret: 'ผิด', device_id: 'tablet-01' },
    });
    const noSuchUser = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'ไม่มีบัญชีนี้', credential_secret: 'อะไรก็ได้', device_id: 'tablet-01' },
    });
    assert.equal(wrongPassword.statusCode, 401);
    assert.equal(noSuchUser.statusCode, 401);
    assert.deepEqual(wrongPassword.json(), noSuchUser.json());
  });

  it('ปิดบัญชีแล้ว token เดิมใช้ต่อไม่ได้ทันที (api-spec 2.3) — เหตุผลที่ไม่ใช้ JWT stateless', async () => {
    await seedUser(ADMIN, 'admin01');
    await seedUser(FIELD, 'surveyor01');
    const adminToken = (await login('admin01')).json().access_token as string;
    const victimToken = (await login('surveyor01', '246810')).json().access_token as string;

    // ยืนยันก่อนว่า token ของเหยื่อใช้ได้อยู่
    const before = await ctx.app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${victimToken}` },
    });
    assert.equal(before.statusCode, 200);

    const victim = (await ctx.users.findByUsername('surveyor01'))!;
    const secondToken = (await login('surveyor01', '246810')).json().access_token as string;
    const disabled = await ctx.app.inject({
      method: 'POST',
      url: `/users/${victim.id}/disable`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(disabled.statusCode, 200);

    const after = await ctx.app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${secondToken}` },
    });
    assert.equal(after.statusCode, 401, 'session ต้องใช้ไม่ได้ทันทีหลังปิดบัญชี');
  });

  it('error ที่ไม่รู้จักไม่รั่วรายละเอียดภายในออกไป (NFR-08)', async () => {
    await seedUser(ADMIN, 'admin01');
    const token = (await login('admin01')).json().access_token as string;
    const response = await ctx.app.inject({
      method: 'PATCH',
      url: '/users/ไม่มีรหัสนี้',
      headers: { authorization: `Bearer ${token}` },
      payload: { full_name: 'ชื่อใหม่' },
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().code, 'USER_NOT_FOUND');
  });
});

describe('CORS allowlist (ผู้ใช้ตัดสินใจ 2026-09-04)', () => {
  it('อ่าน allowlist จาก environment และไม่มีค่าเริ่มต้นแบบ wildcard', () => {
    assert.deepEqual(readAllowedOrigins({}), []);
    assert.deepEqual(
      readAllowedOrigins({ CORS_ALLOWED_ORIGINS: ' https://a.go.th , https://b.go.th ' }),
      ['https://a.go.th', 'https://b.go.th'],
    );
  });

  it('origin ที่ไม่อยู่ใน allowlist ไม่ได้รับ header อนุญาต', async () => {
    await seedUser(ADMIN, 'admin01');
    const allowed = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: 'https://crackai.example.go.th' },
      payload: { username: 'admin01', credential_secret: 'รหัสผ่านที่ถูกต้อง', device_id: 'd' },
    });
    const blocked = await ctx.app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: 'https://evil.example.com' },
      payload: { username: 'admin01', credential_secret: 'รหัสผ่านที่ถูกต้อง', device_id: 'd' },
    });

    assert.equal(allowed.headers['access-control-allow-origin'], 'https://crackai.example.go.th');
    assert.equal(blocked.headers['access-control-allow-origin'], undefined);
  });
});
