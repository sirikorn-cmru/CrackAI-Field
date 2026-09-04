import type { AccountStatus, Session } from '@crackai/shared';
import type {
  CreateUserInput,
  UpdateUserInput,
  UserRecord,
  UserRepository,
} from '../../domain/user/user.repository.ts';
import type {
  CreateSessionInput,
  SessionRepository,
} from '../../domain/auth/session.repository.ts';
import type { AuditTrailDraft, AuditTrailRecorder } from '../../domain/shared/ports.ts';

/**
 * การใช้งานแบบเก็บในหน่วยความจำ — สำหรับทดสอบ domain โดยไม่ต้องมีฐานข้อมูลจริง
 * ฉบับที่ต่อ MySQL/MariaDB จริงจะถูกเพิ่มเมื่อชั้นขนส่งถูกเลือกแล้ว
 */
export class InMemoryUserRepository implements UserRepository {
  private readonly rows = new Map<string, UserRecord>();

  async findById(id: string): Promise<UserRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    for (const row of this.rows.values()) if (row.username === username) return row;
    return null;
  }

  async insert(input: CreateUserInput): Promise<UserRecord> {
    const row: UserRecord = { ...input };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async update(id: string, changes: UpdateUserInput): Promise<UserRecord> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`ไม่พบผู้ใช้ ${id}`);
    const next: UserRecord = { ...row };
    for (const [key, value] of Object.entries(changes)) {
      if (value !== undefined) Reflect.set(next, key, value);
    }
    this.rows.set(id, next);
    return { ...next };
  }

  async setAccountStatus(id: string, status: AccountStatus): Promise<UserRecord> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`ไม่พบผู้ใช้ ${id}`);
    const next: UserRecord = { ...row, account_status: status };
    this.rows.set(id, next);
    return { ...next };
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly rows = new Map<string, Session>();

  async findById(id: string): Promise<Session | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async insert(input: CreateSessionInput): Promise<Session> {
    const row: Session = { ...input };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async update(id: string, changes: Partial<Omit<Session, 'id'>>): Promise<Session> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`ไม่พบ session ${id}`);
    const next: Session = { ...row, ...changes };
    this.rows.set(id, next);
    return { ...next };
  }

  async revokeAllActiveByUser(userId: string): Promise<number> {
    let revoked = 0;
    for (const [id, row] of this.rows) {
      if (row.user_id === userId && row.status === 'ใช้งานอยู่') {
        this.rows.set(id, { ...row, status: 'ถูกเพิกถอน' });
        revoked += 1;
      }
    }
    return revoked;
  }
}

export class InMemoryAuditTrailRecorder implements AuditTrailRecorder {
  readonly entries: AuditTrailDraft[] = [];
  async record(entry: AuditTrailDraft): Promise<void> {
    this.entries.push(entry);
  }
}
