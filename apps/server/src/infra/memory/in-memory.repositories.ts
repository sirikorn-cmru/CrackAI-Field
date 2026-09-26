import type {
  AccountStatus,
  CertificationRecord,
  ReviewStatus,
  Session,
  SurveyParticipant,
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
  CertificationRepository,
  CreateCertificationInput,
  CreateParticipantInput,
  DashboardFilter,
  DashboardRepository,
  SeverityTally,
  SurveyParticipantRepository,
  SurveyedBuildingRepository,
  SurveyedBuildingReviewState,
  UpdateTimingInput,
} from '../../domain/survey/survey.repository.ts';
import type {
  MediaBlobStore,
  MediaUploadRepository,
  MediaUploadState,
} from '../../domain/sync/upload.repository.ts';
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

export class InMemoryMediaUploadRepository implements MediaUploadRepository {
  private readonly rows = new Map<string, MediaUploadState>();

  async findByClientGeneratedId(clientGeneratedId: string): Promise<MediaUploadState | null> {
    const row = this.rows.get(clientGeneratedId);
    return row ? { ...row } : null;
  }

  async upsert(state: MediaUploadState): Promise<MediaUploadState> {
    this.rows.set(state.client_generated_id, { ...state });
    return { ...state };
  }
}

/** จำลองที่เก็บไฟล์บนดิสก์ — ตรวจตำแหน่งเขียนเข้มเหมือนของจริงเพื่อให้เทสต์จับ bug ได้ */
export class InMemoryMediaBlobStore implements MediaBlobStore {
  private readonly files = new Map<string, Uint8Array>();

  async appendAt(uploadSessionId: string, offset: number, chunk: Uint8Array): Promise<void> {
    const current = this.files.get(uploadSessionId) ?? new Uint8Array(0);
    if (current.byteLength !== offset) {
      throw new Error(
        `เขียนไฟล์ผิดตำแหน่ง: ไฟล์มี ${current.byteLength} ไบต์ แต่สั่งเขียนที่ ${offset}`,
      );
    }
    const next = new Uint8Array(current.byteLength + chunk.byteLength);
    next.set(current, 0);
    next.set(chunk, current.byteLength);
    this.files.set(uploadSessionId, next);
  }

  async discard(uploadSessionId: string): Promise<void> {
    this.files.delete(uploadSessionId);
  }

  async sizeOf(uploadSessionId: string): Promise<number> {
    return this.files.get(uploadSessionId)?.byteLength ?? 0;
  }
}

export class InMemorySurveyedBuildingRepository implements SurveyedBuildingRepository {
  readonly rows = new Map<string, SurveyedBuildingReviewState>();

  seed(row: SurveyedBuildingReviewState): void {
    this.rows.set(row.id, { ...row });
  }

  async findById(id: string): Promise<SurveyedBuildingReviewState | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async findByClientGeneratedId(
    clientGeneratedId: string,
  ): Promise<SurveyedBuildingReviewState | null> {
    for (const row of this.rows.values()) {
      if (row.client_generated_id === clientGeneratedId) return { ...row };
    }
    return null;
  }

  async updateTiming(id: string, input: UpdateTimingInput): Promise<SurveyedBuildingReviewState> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`ไม่พบอาคาร ${id}`);
    const next = { ...row, ...input };
    this.rows.set(id, next);
    return { ...next };
  }

  async setReviewStatus(id: string, status: ReviewStatus): Promise<SurveyedBuildingReviewState> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`ไม่พบอาคาร ${id}`);
    const next = { ...row, review_status: status };
    this.rows.set(id, next);
    return { ...next };
  }
}

export class InMemorySurveyParticipantRepository implements SurveyParticipantRepository {
  private rows: SurveyParticipant[] = [];

  async listByBuilding(surveyedBuildingId: string): Promise<readonly SurveyParticipant[]> {
    return this.rows
      .filter((row) => row.surveyedbuilding_id === surveyedBuildingId)
      .map((row) => ({ ...row }));
  }

  async replaceForBuilding(
    surveyedBuildingId: string,
    participants: readonly CreateParticipantInput[],
  ): Promise<readonly SurveyParticipant[]> {
    this.rows = this.rows.filter((row) => row.surveyedbuilding_id !== surveyedBuildingId);
    for (const input of participants) this.rows.push({ ...input });
    return this.listByBuilding(surveyedBuildingId);
  }
}

export class InMemoryCertificationRepository implements CertificationRepository {
  readonly rows: CertificationRecord[] = [];

  async insert(input: CreateCertificationInput): Promise<CertificationRecord> {
    const row: CertificationRecord = { ...input };
    this.rows.push(row);
    return { ...row };
  }

  async listByBuilding(surveyedBuildingId: string): Promise<readonly CertificationRecord[]> {
    return this.rows
      .filter((row) => row.surveyedbuilding_id === surveyedBuildingId)
      .map((row) => ({ ...row }));
  }
}

/**
 * นับจากตาราง `SurveyedBuildingReviewState` ที่ฉีดเข้ามา — **กรอง `sync_status` ให้เหลือ
 * เฉพาะ "ซิงค์สำเร็จ" ที่นี่** ตาม db-spec §10 ข้อ 4 (NFR-10) เพื่อให้เทสต์จับได้จริงถ้ามี
 * ระเบียนที่ยังขัดแย้งหลุดเข้าภาพรวม
 */
export class InMemoryDashboardRepository implements DashboardRepository {
  private readonly source: InMemorySurveyedBuildingRepository;

  constructor(source: InMemorySurveyedBuildingRepository) {
    this.source = source;
  }

  async tallyBySeverity(filter: DashboardFilter): Promise<readonly SeverityTally[]> {
    const byArea = new Map<string, SeverityTally>();
    for (const row of this.source.rows.values()) {
      if (row.sync_status !== 'ซิงค์สำเร็จ') continue;
      if (filter.province !== undefined && row.province !== filter.province) continue;
      const done = row.survey_completed_at;
      if (filter.completed_from !== undefined && (!done || done < filter.completed_from)) continue;
      if (filter.completed_to !== undefined && (!done || done > filter.completed_to)) continue;

      const key = `${row.province}|${row.district}`;
      const tally =
        byArea.get(key) ??
        { province: row.province, district: row.district, เขียว: 0, เหลือง: 0, แดง: 0, ยังไม่สรุป: 0 };
      if (row.overall_severity_level === null) tally['ยังไม่สรุป'] += 1;
      else tally[row.overall_severity_level] += 1;
      byArea.set(key, tally);
    }
    return [...byArea.values()];
  }
}
