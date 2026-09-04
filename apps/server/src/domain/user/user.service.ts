import { isUserRole, type AccountStatus, type AuditActionType, type User } from '@crackai/shared';
import {
  AccountStatusUnchangedError,
  InvalidRoleError,
  UsernameAlreadyExistsError,
  UserNotFoundError,
} from '../shared/errors.ts';
import { authorize, type Caller } from '../authorization/authorization.service.ts';
import type { AuditTrailRecorder, Clock, IdGenerator, SecretHasher } from '../shared/ports.ts';
import type { SessionRepository } from '../auth/session.repository.ts';
import type { UpdateUserInput, UserRecord, UserRepository } from './user.repository.ts';

export type { Caller };

export interface CreateUserCommand {
  username: string;
  full_name: string;
  credential_secret: string;
  phone_number?: string | null;
  agency_name?: string | null;
  position?: string | null;
  role: string;
}

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
    authorize(caller, '2.1');

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
    authorize(caller, '2.2');

    const before = await this.users.findById(userId);
    if (!before) throw new UserNotFoundError(userId);
    if (changes.role !== undefined && !isUserRole(changes.role)) {
      throw new InvalidRoleError(changes.role);
    }

    const after = await this.users.update(userId, changes);

    await this.audit.record({
      related_entity_name: 'User',
      related_entity_id: userId,
      // db-spec §10 ข้อ 9: เหตุการณ์เกี่ยวกับบัญชีผู้ใช้ไม่ผูกกับอาคารใด
      related_surveyedbuilding_id: null,
      action_type: 'แก้ไขบัญชีผู้ใช้',
      performed_by_user_id: caller.user_id,
      value_before: summarise(before, Object.keys(changes) as (keyof UpdateUserInput)[]),
      value_after: summarise(after, Object.keys(changes) as (keyof UpdateUserInput)[]),
      performed_at: this.clock.now(),
      note: null,
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
    const disabling = target === 'ปิดใช้งาน';
    authorize(caller, disabling ? '2.3' : '2.4');
    // `action_type` เขียนตรงตัวตาม Output ของ api-spec 2.3/2.4 ไม่ดึงจากชื่อ operation
    // เพราะสองอย่างนี้บังเอิญตรงกันเฉยๆ (2.2 ใช้ชื่อ operation กับ action_type ต่างกัน)
    const actionLabel: AuditActionType = disabling
      ? 'ปิดการใช้งานบัญชีผู้ใช้'
      : 'เปิดใช้งานบัญชีผู้ใช้คืน';

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
    if (disabling) {
      await this.sessions.revokeAllActiveByUser(userId);
    }

    await this.audit.record({
      related_entity_name: 'User',
      related_entity_id: userId,
      related_surveyedbuilding_id: null,
      action_type: actionLabel,
      performed_by_user_id: caller.user_id,
      value_before: before.account_status,
      value_after: after.account_status,
      performed_at: this.clock.now(),
      note: null,
    });

    return toUser(after);
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
