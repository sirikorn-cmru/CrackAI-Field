import type { Session, SessionStatus } from '@crackai/shared';

export interface CreateSessionInput {
  id: string;
  user_id: string;
  device_id: string;
  issued_at: Date;
  expires_at: Date;
  is_offline_cached: boolean;
  cached_pin_secret: string | null;
  failed_pin_attempt_count: number | null;
  last_verified_online_at: Date | null;
  status: SessionStatus;
}

export interface SessionRepository {
  findById(id: string): Promise<Session | null>;
  insert(input: CreateSessionInput): Promise<Session>;
  update(id: string, changes: Partial<Omit<Session, 'id'>>): Promise<Session>;
  /** ใช้ตอนปิดบัญชี (api-spec 2.3) — ต้องเพิกถอน session ที่ยัง "ใช้งานอยู่" ทั้งหมดทันที */
  revokeAllActiveByUser(userId: string): Promise<number>;
}
