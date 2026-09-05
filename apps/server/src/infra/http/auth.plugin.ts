import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Caller } from '../../domain/authorization/authorization.service.ts';
import type { SessionRepository } from '../../domain/auth/session.repository.ts';
import type { UserRepository } from '../../domain/user/user.repository.ts';
import type { Clock } from '../../domain/shared/ports.ts';

/**
 * การยืนยันตัวตนของชั้นขนส่ง — opaque token + Session ในฐานข้อมูล
 *
 * ผู้ใช้ตัดสินใจเมื่อ 2026-09-04 (technology-stack §3, architecture §6.11) **ไม่ใช้ JWT
 * แบบ stateless** เพราะ api-spec 2.3 สั่งให้เพิกถอน Session ที่ยัง "ใช้งานอยู่" ทั้งหมด
 * **ทันที** ตอนปิดบัญชี — JWT ที่ตรวจได้ด้วยตัวเองทำแบบนั้นไม่ได้ ต้องมี blocklist ที่ก็ต้อง
 * แตะฐานข้อมูลทุก request อยู่ดี จึงไม่เหลือข้อดีเรื่อง stateless
 */

/** สร้าง token ที่เดาไม่ได้ — 32 ไบต์จากแหล่งสุ่มเชิงรหัสลับ */
export function issueSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * เก็บเฉพาะค่าแฮชของ token ลงฐานข้อมูล ไม่เก็บตัวจริง
 *
 * ใช้ SHA-256 ตรงๆ ไม่ใช่ scrypt แบบรหัสผ่าน เพราะ token ถูกสุ่มมาเต็ม 32 ไบต์แล้ว
 * ไม่มีเอนโทรปีต่ำให้ต้องถ่วงเวลาโจมตีแบบพจนานุกรม และ token ถูกตรวจทุก request
 * การใส่ KDF ที่ช้าโดยเจตนาจะกลายเป็นคอขวดของทุกคำขอแทน (NFR-07)
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('base64');
}

export interface AuthenticatedRequest extends FastifyRequest {
  caller?: Caller;
  sessionId?: string;
}

export interface AuthDependencies {
  sessions: SessionRepository;
  users: UserRepository;
  clock: Clock;
  /** แปลง token ที่ client ส่งมาเป็น session id — ชั้น infra เป็นผู้ดูแลตารางแมป */
  resolveSessionIdByToken(tokenHash: string): Promise<string | null>;
}

const UNAUTHORIZED = { code: 'UNAUTHORIZED', message: 'ต้องเข้าสู่ระบบก่อนใช้งาน' };

/**
 * ตรวจ token ก่อนทุก operation ที่ต้องยืนยันตัวตน (NFR-08)
 *
 * ตรวจสถานะ session และสถานะบัญชีใหม่ทุกครั้ง ไม่แคชไว้ เพราะ api-spec 2.2 ระบุว่าการเปลี่ยน
 * บทบาทต้องมีผลกับ session ที่ใช้งานอยู่ทันที และ 2.3 ระบุเรื่องการเพิกถอนทันทีเช่นกัน
 */
export function makeAuthenticate(deps: AuthDependencies) {
  return async function authenticate(
    request: AuthenticatedRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      await reply.code(401).send(UNAUTHORIZED);
      return;
    }

    const sessionId = await deps.resolveSessionIdByToken(hashSessionToken(header.slice(7)));
    if (!sessionId) {
      await reply.code(401).send(UNAUTHORIZED);
      return;
    }

    const session = await deps.sessions.findById(sessionId);
    if (!session || session.status !== 'ใช้งานอยู่') {
      await reply.code(401).send(UNAUTHORIZED);
      return;
    }
    if (deps.clock.now() >= session.expires_at) {
      await reply.code(401).send({ code: 'SESSION_EXPIRED', message: 'session หมดอายุแล้ว' });
      return;
    }

    const user = await deps.users.findById(session.user_id);
    // api-spec 2.3: บัญชีที่ถูกปิดต้องใช้งานต่อไม่ได้ทันที แม้ session จะยังไม่ถูกเพิกถอน
    if (!user || user.account_status !== 'ใช้งานได้') {
      await reply.code(401).send(UNAUTHORIZED);
      return;
    }

    request.caller = { user_id: user.id, role: user.role };
    request.sessionId = session.id;
  };
}

/** เทียบความลับแบบไม่รั่วเวลา — ใช้เมื่อต้องเทียบ token กับค่าที่รู้ล่วงหน้า */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
