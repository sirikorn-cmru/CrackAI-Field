import type {
  AccountStatus,
  Session,
  SurveyedBuildingSyncState,
  SyncStatus,
} from '@crackai/shared';
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
import type {
  ApplyBuildingInput,
  CreateBuildingInput,
  CreateConflictInput,
  CreateConflictVersionInput,
  SurveyedBuildingSyncRepository,
  SyncConflict,
  SyncConflictRepository,
  SyncConflictVersion,
} from '../../domain/sync/sync.repository.ts';

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

export class InMemorySurveyedBuildingSyncRepository implements SurveyedBuildingSyncRepository {
  private readonly rows = new Map<string, SurveyedBuildingSyncState>();
  private readonly snapshots = new Map<string, string>();

  async findByClientGeneratedId(
    clientGeneratedId: string,
  ): Promise<SurveyedBuildingSyncState | null> {
    for (const row of this.rows.values()) {
      if (row.client_generated_id === clientGeneratedId) return { ...row };
    }
    return null;
  }

  async insert(input: CreateBuildingInput): Promise<SurveyedBuildingSyncState> {
    const { snapshot_content, ...state } = input;
    this.rows.set(state.id, { ...state });
    this.snapshots.set(state.id, snapshot_content);
    return { ...state };
  }

  async apply(id: string, input: ApplyBuildingInput): Promise<SurveyedBuildingSyncState> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`ไม่พบอาคาร ${id}`);
    const { snapshot_content, ...changes } = input;
    const next: SurveyedBuildingSyncState = { ...row, ...changes };
    this.rows.set(id, next);
    this.snapshots.set(id, snapshot_content);
    return { ...next };
  }

  async setSyncStatus(id: string, status: SyncStatus): Promise<SurveyedBuildingSyncState> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`ไม่พบอาคาร ${id}`);
    const next: SurveyedBuildingSyncState = { ...row, sync_status: status };
    this.rows.set(id, next);
    return { ...next };
  }

  async snapshotOf(id: string): Promise<string> {
    const snapshot = this.snapshots.get(id);
    if (snapshot === undefined) throw new Error(`ไม่พบ snapshot ของอาคาร ${id}`);
    return snapshot;
  }
}

export class InMemorySyncConflictRepository implements SyncConflictRepository {
  private readonly conflicts = new Map<string, SyncConflict>();
  private readonly versions: SyncConflictVersion[] = [];

  async findOpenByBuilding(surveyedBuildingId: string): Promise<SyncConflict | null> {
    for (const row of this.conflicts.values()) {
      if (row.surveyedbuilding_id === surveyedBuildingId && row.status === 'รอแก้ไขด้วยมือ') {
        return { ...row };
      }
    }
    return null;
  }

  async insert(input: CreateConflictInput): Promise<SyncConflict> {
    const row: SyncConflict = {
      ...input,
      status: 'รอแก้ไขด้วยมือ',
      resolution_type: null,
      resolution_note: null,
      resolved_by_user_id: null,
      resolved_at: null,
    };
    this.conflicts.set(row.id, row);
    return { ...row };
  }

  async addVersion(input: CreateConflictVersionInput): Promise<SyncConflictVersion> {
    const row: SyncConflictVersion = { ...input, is_selected_as_final: false };
    this.versions.push(row);
    return { ...row };
  }

  async listVersions(syncConflictId: string): Promise<readonly SyncConflictVersion[]> {
    return this.versions
      .filter((version) => version.syncconflict_id === syncConflictId)
      .map((version) => ({ ...version }));
  }
}
