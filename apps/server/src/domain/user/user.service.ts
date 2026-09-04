import { isUserRole, type AccountStatus, type User, type UserRole } from '@crackai/shared';
import {
  AccountStatusUnchangedError,
  ForbiddenError,
  InvalidRoleError,
  UsernameAlreadyExistsError,
  UserNotFoundError,
} from '../shared/errors.ts';
import type { AuditTrailRecorder, Clock, IdGenerator, SecretHasher } from '../shared/ports.ts';
import type { SessionRepository } from '../auth/session.repository.ts';
import type { UpdateUserInput, UserRecord, UserRepository } from './user.repository.ts';

/** ผู้เรียก operation — ชั้นขนส่งเป็นผู้ประกอบค่านี้จาก session ที่ยืนยันแล้ว */
export interface Caller {
  user_id: string;
  role: UserRole;
}

export interface CreateUserCommand {
  username: string;
  full_name: string;
  credential_secret: string;
  phone_number?: string | null;
  agency_name?: string | null;
  position?: string | null;
  role: string;
}

/** บทบาทเดียวที่จัดการบัญชีผู้ใช้ได้ — api-spec 2.1–2.4 ระบุ "ผู้เรียกได้: ผู้ดูแลระบบ" */
const ACCOUNT_ADMIN_ROLE: UserRole = 'ผู้ดูแลระบบ';

/**
 * จัดการผู้ใช้และสิทธิ์การเข้าถึง — T-1-01 (FR-21, NFR-08)
 * ครอบคลุม api-spec operation 2.1, 2.2, 2.3, 2.4
 */
export class UserService {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;
  private readonly hasher: SecretHasher;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;
  private readonly audit: AuditTrailRecorder;

  constructor(
    users: UserRepository,
    sessions: SessionRepository,
    hasher: SecretHasher,
    ids: IdGenerator,
    clock: Clock,
    audit: AuditTrailRecorder,
  ) {
    this.users = users;
    this.sessions = sessions;
    this.hasher = hasher;
    this.ids = ids;
    this.clock = clock;
    this.audit = audit;
  }

  /** api-spec 2.1 สร้างบัญชีผู้ใช้ใหม่ */
  async createUser(caller: Caller, command: CreateUserCommand): Promise<User> {
    this.assertAccountAdmin(caller, 'สร้างบัญชีผู้ใช้');

    if (!isUserRole(command.role)) throw new InvalidRoleError(command.role);
    if (await this.users.findByUsername(command.username)) {
      throw new UsernameAlreadyExistsError(command.username);
    }

    const created = await this.users.insert({
      id: this.ids.next(),
      username: command.username,
      full_name: command.full_name,
      credential_secret: await this.hasher.hash(command.credential_secret),
      phone_number: command.phone_number ?? null,
      agency_name: command.agency_name ?? null,
      position: command.position ?? null,
      role: command.role,
      account_status: 'ใช้งานได้',
      created_by_user_id: caller.user_id,
      created_at: this.clock.now(),
    });

    // api-spec 2.1 ไม่ได้กำหนด AuditTrailEntry ไว้ ต่างจาก 2.2/2.3/2.4 จึงไม่บันทึกที่นี่
    // เพื่อไม่ให้โค้ดทำเกินกว่าสัญญาที่เอกสารระบุ
    return toUser(created);
  }

  /** api-spec 2.2 แก้ไขข้อมูล/บทบาทผู้ใช้ */
  async updateUser(caller: Caller, userId: string, changes: UpdateUserInput): Promise<User> {
    this.assertAccountAdmin(caller, 'แก้ไขบัญชีผู้ใช้');

    const before = await this.users.findById(userId);
    if (!before) throw new UserNotFoundError(userId);
    if (changes.role !== undefined && !isUserRole(changes.role)) {
      throw new InvalidRoleError(changes.role);
    }

    const after = await this.users.update(userId, changes);

    await this.audit.record({
      related_entity_name: 'User',
      related_entity_id: userId,
      action_type: 'แก้ไขบัญชีผู้ใช้',
      performed_by_user_id: caller.user_id,
      value_before: summarise(before, Object.keys(changes) as (keyof UpdateUserInput)[]),
      value_after: summarise(after, Object.keys(changes) as (keyof UpdateUserInput)[]),
      performed_at: this.clock.now(),
    });

    // api-spec 2.2: การเปลี่ยน role มีผลกับ session ที่ยังใช้งานอยู่ทันที
    // ชั้นนี้ไม่เพิกถอน session เพราะเอกสารไม่ได้สั่งให้เพิกถอน แต่สั่งให้ "บังคับตรวจสิทธิ์ใหม่"
    // การตรวจสิทธิ์อ่าน role จาก User ทุกครั้ง (ดู AuthService.authorize) จึงมีผลทันทีอยู่แล้ว
    return toUser(after);
  }

  /** api-spec 2.3 ปิดการใช้งานบัญชีผู้ใช้ */
  async disableUser(caller: Caller, userId: string): Promise<User> {
    return this.changeAccountStatus(caller, userId, 'ปิดใช้งาน');
  }

  /** api-spec 2.4 เปิดใช้งานบัญชีผู้ใช้คืน */
  async enableUser(caller: Caller, userId: string): Promise<User> {
    return this.changeAccountStatus(caller, userId, 'ใช้งานได้');
  }

  private async changeAccountStatus(
    caller: Caller,
    userId: string,
    target: AccountStatus,
  ): Promise<User> {
    const actionLabel = target === 'ปิดใช้งาน' ? 'ปิดการใช้งานบัญชีผู้ใช้' : 'เปิดใช้งานบัญชีผู้ใช้คืน';
    this.assertAccountAdmin(caller, actionLabel);

    const before = await this.users.findById(userId);
    if (!before) throw new UserNotFoundError(userId);
    if (before.account_status === target) {
      throw new AccountStatusUnchangedError(
        target === 'ปิดใช้งาน' ? 'บัญชีนี้ถูกปิดใช้งานอยู่แล้ว' : 'บัญชีนี้ใช้งานได้อยู่แล้ว',
      );
    }

    const after = await this.users.setAccountStatus(userId, target);

    // api-spec 2.3: ต้องเพิกถอน Session ที่ยัง "ใช้งานอยู่" ของผู้ใช้นี้ทั้งหมดทันที
    // api-spec 2.4 ระบุชัดว่าการเปิดใช้งานคืน "ไม่กระทบ Session" จึงทำเฉพาะขาปิด
    if (target === 'ปิดใช้งาน') {
      await this.sessions.revokeAllActiveByUser(userId);
    }

    await this.audit.record({
      related_entity_name: 'User',
      related_entity_id: userId,
      action_type: actionLabel,
      performed_by_user_id: caller.user_id,
      value_before: before.account_status,
      value_after: after.account_status,
      performed_at: this.clock.now(),
    });

    return toUser(after);
  }

  private assertAccountAdmin(caller: Caller, action: string): void {
    if (caller.role !== ACCOUNT_ADMIN_ROLE) throw new ForbiddenError(action);
  }
}

/** ตัด `credential_secret` ออกก่อนส่งออกนอกชั้น domain เสมอ (NFR-08) */
function toUser(record: UserRecord): User {
  const { credential_secret: _omitted, ...user } = record;
  return user;
}

function summarise(record: UserRecord, fields: (keyof UpdateUserInput)[]): string {
  const picked: Record<string, unknown> = {};
  for (const field of fields) picked[field] = record[field];
  return JSON.stringify(picked);
}
