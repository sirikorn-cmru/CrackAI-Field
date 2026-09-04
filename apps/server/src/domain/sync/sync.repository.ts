import type {
  SurveyedBuildingSyncState,
  SyncConflictStatus,
  SyncStatus,
} from '@crackai/shared';

/** db-spec §8.1 SyncConflict */
export interface SyncConflict {
  id: string;
  surveyedbuilding_id: string;
  status: SyncConflictStatus;
  detected_at: Date;
  resolution_type: string | null;
  resolution_note: string | null;
  resolved_by_user_id: string | null;
  resolved_at: Date | null;
}

/** db-spec §8.2 SyncConflictVersion */
export interface SyncConflictVersion {
  id: string;
  syncconflict_id: string;
  submitted_by_device_id: string;
  submitted_by_user_id: string | null;
  submitted_at: Date;
  data_version: number;
  snapshot_content: string;
  is_selected_as_final: boolean;
}

export interface CreateBuildingInput extends Omit<SurveyedBuildingSyncState, 'id'> {
  id: string;
  snapshot_content: string;
}

export interface ApplyBuildingInput {
  data_version: number;
  last_modified_at: Date;
  last_modified_by_device_id: string;
  device_id: string;
  sync_status: SyncStatus;
  synced_at: Date | null;
  snapshot_content: string;
}

export interface SurveyedBuildingSyncRepository {
  /** ค้นด้วย natural key ของอุปกรณ์ — หัวใจของ idempotency (db-spec §10 ข้อ 2) */
  findByClientGeneratedId(clientGeneratedId: string): Promise<SurveyedBuildingSyncState | null>;
  insert(input: CreateBuildingInput): Promise<SurveyedBuildingSyncState>;
  apply(id: string, input: ApplyBuildingInput): Promise<SurveyedBuildingSyncState>;
  setSyncStatus(id: string, status: SyncStatus): Promise<SurveyedBuildingSyncState>;
  /** ใช้เก็บเวอร์ชันปัจจุบันฝั่งเซิร์ฟเวอร์ไว้เทียบตอนเกิดความขัดแย้ง (db-spec §8.2) */
  snapshotOf(id: string): Promise<string>;
}

export interface CreateConflictInput {
  id: string;
  surveyedbuilding_id: string;
  detected_at: Date;
}

export interface CreateConflictVersionInput {
  id: string;
  syncconflict_id: string;
  submitted_by_device_id: string;
  submitted_by_user_id: string | null;
  submitted_at: Date;
  data_version: number;
  snapshot_content: string;
}

export interface SyncConflictRepository {
  /** ความขัดแย้งที่ยัง "รอแก้ไขด้วยมือ" ของอาคารนี้ (มีได้ไม่เกิน 1 รายการ — db-spec §8.1) */
  findOpenByBuilding(surveyedBuildingId: string): Promise<SyncConflict | null>;
  insert(input: CreateConflictInput): Promise<SyncConflict>;
  addVersion(input: CreateConflictVersionInput): Promise<SyncConflictVersion>;
  listVersions(syncConflictId: string): Promise<readonly SyncConflictVersion[]>;
}
