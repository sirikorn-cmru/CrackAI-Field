import type { AccountStatus, User, UserRole } from '@crackai/shared';

/** ระเบียน User พร้อม `credential_secret` — ใช้เฉพาะภายในชั้น domain/infra เท่านั้น */
export interface UserRecord extends User {
  credential_secret: string;
}

export interface CreateUserInput {
  id: string;
  username: string;
  full_name: string;
  credential_secret: string;
  phone_number: string | null;
  agency_name: string | null;
  position: string | null;
  role: UserRole;
  account_status: AccountStatus;
  created_by_user_id: string | null;
  created_at: Date;
}

/** ฟิลด์ที่ api-spec 2.2 อนุญาตให้แก้ไข — `username` และ `credential_secret` ไม่อยู่ในรายการโดยเจตนา */
export interface UpdateUserInput {
  full_name?: string;
  phone_number?: string | null;
  agency_name?: string | null;
  position?: string | null;
  role?: UserRole;
}

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByUsername(username: string): Promise<UserRecord | null>;
  insert(input: CreateUserInput): Promise<UserRecord>;
  update(id: string, changes: UpdateUserInput): Promise<UserRecord>;
  setAccountStatus(id: string, status: AccountStatus): Promise<UserRecord>;
}
