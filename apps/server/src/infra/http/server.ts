import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AuthService } from '../../domain/auth/auth.service.ts';
import { allowedOperationsFor } from '../../domain/authorization/authorization.service.ts';
import type { UserService } from '../../domain/user/user.service.ts';
import type { ResumableUploadService } from '../../domain/sync/upload.service.ts';
import type { SyncIntakeService } from '../../domain/sync/sync-intake.service.ts';
import {
  issueSessionToken,
  hashSessionToken,
  makeAuthenticate,
  type AuthDependencies,
  type AuthenticatedRequest,
} from './auth.plugin.ts';
import { toHttpError } from './error-mapping.ts';

/**
 * ชั้นขนส่ง REST over HTTP บน Fastify — ตัดสินใจเมื่อ 2026-09-04
 * (`technology-stack.md` §3, `architecture.md` §8)
 *
 * **ชั้นนี้ไม่มีตรรกะธุรกิจใดๆ โดยเจตนา** หน้าที่มีสามอย่าง: แปลงคำขอเป็นคำสั่งของ domain,
 * แปลง error ของ domain เป็นสถานะ HTTP, และตรวจ token ก่อนส่งต่อ — ตรรกะทั้งหมดอยู่ในชั้น
 * domain ที่ไม่รู้จัก HTTP เลย ทำให้เปลี่ยน protocol ภายหลังได้โดยไม่แตะกฎธุรกิจ
 *
 * เส้นทางที่เปิดไว้ตอนนี้ครอบคลุมเฉพาะ operation ของ Phase 1 ที่ implement แล้ว
 * (api-spec 1.1–1.4, 2.1–2.4, 14.1) operation ที่เหลืออยู่ใน Phase 2–4
 */
export interface ServerDependencies extends AuthDependencies {
  authService: AuthService;
  userService: UserService;
  syncService: SyncIntakeService;
  uploadService: ResumableUploadService;
  /** ผูก token กับ session หลังเข้าสู่ระบบสำเร็จ — ชั้น infra เป็นผู้ดูแลตารางแมป */
  bindSessionToken(tokenHash: string, sessionId: string): Promise<void>;
  /** รายชื่อ origin ของ web client ที่อนุญาต — อ่านจาก environment variable */
  allowedOrigins: readonly string[];
}

export function buildServer(deps: ServerDependencies): FastifyInstance {
  const app = Fastify({ logger: false });
  const authenticate = makeAuthenticate(deps);

  // CORS: allowlist เฉพาะ origin ที่รู้จัก ไม่เปิด wildcard (ผู้ใช้ตัดสินใจ 2026-09-04)
  // แอปภาคสนามเป็น React Native ไม่ได้อยู่ใต้กติกา CORS จึงไม่กระทบ (NFR-08)
  app.register(cors, {
    origin: deps.allowedOrigins.length === 0 ? false : [...deps.allowedOrigins],
    credentials: true,
  });

  app.setErrorHandler((error, _request, reply) => {
    const { status, body } = toHttpError(error);
    void reply.code(status).send(body);
  });

  /** api-spec 1.1 เข้าสู่ระบบ */
  app.post('/auth/login', async (request, reply) => {
    const body = request.body as {
      username: string;
      credential_secret: string;
      device_id: string;
      cached_pin_secret?: string;
    };
    const result = await deps.authService.login(body);
    const token = issueSessionToken();
    await deps.bindSessionToken(hashSessionToken(token), result.session.id);
    return reply.code(201).send({
      access_token: token,
      session_id: result.session.id,
      expires_at: result.session.expires_at,
      role: result.role,
      // FR-26: client ใช้รายการนี้ประกอบเมนู/หน้าจอ ไม่ต้องมีตารางสิทธิ์ของตัวเอง
      allowed_operations: allowedOperationsFor(result.role),
    });
  });

  /** api-spec 1.2 ออกจากระบบ */
  app.post('/auth/logout', { preHandler: authenticate }, async (request, reply) => {
    const { sessionId } = request as AuthenticatedRequest;
    const session = await deps.authService.logout(sessionId!);
    return reply.send({ session_id: session.id, status: session.status });
  });

  /**
   * api-spec 1.4 ต่ออายุ/ยืนยันตัวตนใหม่เมื่อกลับมามีสัญญาณ
   *
   * ไม่มีเส้นทางสำหรับ api-spec 1.3 (ปลดล็อกออฟไลน์ด้วย PIN) โดยเจตนา — operation นั้น
   * ทำงานบนอุปกรณ์ล้วน ไม่ติดต่อเซิร์ฟเวอร์ การเปิดเป็น endpoint จะขัดกับ FR-27 ที่ทั้งหมด
   * ต้องทำได้ขณะไม่มีสัญญาณ
   */
  app.post('/auth/reverify', { preHandler: authenticate }, async (request, reply) => {
    const { sessionId } = request as AuthenticatedRequest;
    const { device_id } = request.body as { device_id: string };
    const session = await deps.authService.reverifyOnline(sessionId!, device_id);
    return reply.send({
      session_id: session.id,
      expires_at: session.expires_at,
      last_verified_online_at: session.last_verified_online_at,
    });
  });

  /** api-spec 2.1 สร้างบัญชีผู้ใช้ใหม่ */
  app.post('/users', { preHandler: authenticate }, async (request, reply) => {
    const { caller } = request as AuthenticatedRequest;
    const user = await deps.userService.createUser(caller!, request.body as never);
    return reply.code(201).send(user);
  });

  /** api-spec 2.2 แก้ไขข้อมูล/บทบาทผู้ใช้ */
  app.patch('/users/:id', { preHandler: authenticate }, async (request, reply) => {
    const { caller } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    return reply.send(await deps.userService.updateUser(caller!, id, request.body as never));
  });

  /** api-spec 2.3 ปิดการใช้งานบัญชีผู้ใช้ */
  app.post('/users/:id/disable', { preHandler: authenticate }, async (request, reply) => {
    const { caller } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    return reply.send(await deps.userService.disableUser(caller!, id));
  });

  /** api-spec 2.4 เปิดใช้งานบัญชีผู้ใช้คืน */
  app.post('/users/:id/enable', { preHandler: authenticate }, async (request, reply) => {
    const { caller } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    return reply.send(await deps.userService.enableUser(caller!, id));
  });

  /** api-spec 14.1 ซิงค์ระเบียนแบบสำรวจที่ค้าง */
  app.post('/sync/buildings', { preHandler: authenticate }, async (request, reply) => {
    const { caller } = request as AuthenticatedRequest;
    const raw = request.body as Record<string, string | null>;
    const outcome = await deps.syncService.syncBuilding(caller!, {
      client_generated_id: String(raw['client_generated_id']),
      device_id: String(raw['device_id']),
      data_version: Number(raw['data_version']),
      // วันที่มาทาง JSON เป็นข้อความ ต้องแปลงกลับก่อนเข้าชั้น domain ที่คาดหวัง Date
      last_modified_at: new Date(String(raw['last_modified_at'])),
      created_on_device_at: new Date(String(raw['created_on_device_at'])),
      submitted_by_user_id: raw['submitted_by_user_id'] ?? null,
      snapshot_content: String(raw['snapshot_content']),
    });
    return reply.send(outcome);
  });

  /** api-spec 14.1 (ส่วนไฟล์) — ถามตำแหน่งที่ต้องส่งต่อก่อนส่งเนื้อไฟล์เสมอ */
  app.post('/sync/uploads/begin', { preHandler: authenticate }, async (request, reply) => {
    const { caller } = request as AuthenticatedRequest;
    return reply.send(await deps.uploadService.begin(caller!, request.body as never));
  });

  /** api-spec 14.1 (ส่วนไฟล์) — ส่งเนื้อไฟล์หนึ่งชิ้นต่อจากตำแหน่งที่ยืนยันไว้ */
  app.post('/sync/uploads/chunk', { preHandler: authenticate }, async (request, reply) => {
    const { caller } = request as AuthenticatedRequest;
    const query = request.query as { client_generated_id: string; upload_session_id: string; offset: string };
    const ticket = await deps.uploadService.sendChunk(caller!, {
      client_generated_id: query.client_generated_id,
      upload_session_id: query.upload_session_id,
      offset: Number(query.offset),
      chunk: new Uint8Array(request.body as Buffer),
    });
    return reply.send(ticket);
  });

  return app;
}

/** อ่าน allowlist ของ CORS จาก environment — ค่าว่างแปลว่าไม่อนุญาต origin ใดเลย */
export function readAllowedOrigins(env: NodeJS.ProcessEnv): readonly string[] {
  return (env['CORS_ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
