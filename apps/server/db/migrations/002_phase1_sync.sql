-- Phase 1 — การซิงค์ข้อมูลภาคสนามและการตรวจจับความขัดแย้ง
--
-- แปลง `docs/02-design/02-technical/db-spec.md` §4.1 (เฉพาะส่วนควบคุมการซิงค์),
-- §7.2 AuditTrailEntry, §8.1 SyncConflict และ §8.2 SyncConflictVersion
--
-- ครอบคลุม: NFR-01, NFR-02, NFR-03, NFR-05, NFR-07, NFR-10 (T-1-06, T-1-07, T-1-08)
--
-- **ขอบเขตที่ตั้งใจไม่ทำในไฟล์นี้**: `surveyed_buildings` ด้านล่างมีเฉพาะคอลัมน์ที่กลไก
-- ซิงค์ของ Phase 1 อ่าน/เขียนจริงตาม db-spec §10 ข้อ 3 (การตรวจจับความขัดแย้งอยู่ที่ระดับ
-- aggregate เท่านั้น) ส่วนคอลัมน์เนื้อหาแบบสำรวจ (ที่อยู่ ประเภทอาคาร ระดับความเสียหาย ฯลฯ)
-- และตาราง entity ย่อยทั้งหมดเป็นงานของ Phase 2 ซึ่งจะ ALTER ตารางนี้เพิ่ม
-- ระหว่างนี้เนื้อหาที่อุปกรณ์ส่งมาถูกเก็บทั้งก้อนไว้ใน `snapshot_content` เพื่อให้
-- SyncConflictVersion เปรียบเทียบเวอร์ชันได้ครบตาม db-spec §8.2

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS surveyed_buildings (
  id                         CHAR(36)     NOT NULL,
  -- db-spec §10 ข้อ 2: natural key ที่สร้างบนอุปกรณ์ขณะออฟไลน์ ใช้เป็น idempotency key
  client_generated_id        VARCHAR(100) NOT NULL,
  device_id                  VARCHAR(200) NOT NULL,
  -- db-spec §4.1: เพิ่มค่าทุกครั้งที่มีการแก้ไข ใช้เทียบเวอร์ชันตรวจจับความขัดแย้ง (NFR-03)
  data_version               INT          NOT NULL,
  last_modified_at           DATETIME(3)  NOT NULL,
  last_modified_by_device_id VARCHAR(200) NOT NULL,
  sync_status                ENUM('ยังไม่ซิงค์','กำลังซิงค์','ซิงค์สำเร็จ','มีความขัดแย้งรอแก้ไข') NOT NULL,
  synced_at                  DATETIME(3)      NULL,
  created_on_device_at       DATETIME(3)  NOT NULL,
  -- ที่พักเนื้อหาแบบสำรวจจนกว่า Phase 2 จะแตกเป็นคอลัมน์/ตารางจริง (ดูหมายเหตุด้านบน)
  -- รูปแบบข้อความเชิงโครงสร้างที่ใช้จริงยังไม่ตัดสินใจ (db-spec §11)
  snapshot_content           LONGTEXT     NOT NULL,
  PRIMARY KEY (id),
  -- กันระเบียนซ้ำเมื่ออุปกรณ์ส่งซ้ำ — บังคับ idempotency ที่ระดับโครงสร้าง ไม่พึ่ง logic อย่างเดียว
  UNIQUE KEY uq_surveyed_buildings_client_generated_id (client_generated_id),
  -- db-spec §10 ข้อ 4 (NFR-10): ทุก operation ที่อ่านเพื่อสรุป/ส่งออก/ค้นหาต้องกรองด้วย sync_status
  KEY ix_surveyed_buildings_sync_status (sync_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id                  CHAR(36)    NOT NULL,
  surveyedbuilding_id CHAR(36)    NOT NULL,
  status              ENUM('รอแก้ไขด้วยมือ','แก้ไขแล้ว') NOT NULL,
  detected_at         DATETIME(3) NOT NULL,
  -- db-spec §8.1: สามคอลัมน์ถัดไปจำเป็นเมื่อ status = แก้ไขแล้ว (บังคับด้วย CHECK ด้านล่าง)
  resolution_type     ENUM('เลือกทั้งเวอร์ชันใดเวอร์ชันหนึ่ง','รวมค่าเป็นรายฟิลด์ด้วยมือ') NULL,
  resolution_note     TEXT            NULL,
  resolved_by_user_id CHAR(36)        NULL,
  resolved_at         DATETIME(3)     NULL,
  PRIMARY KEY (id),
  KEY ix_sync_conflicts_building_status (surveyedbuilding_id, status),
  CONSTRAINT fk_sync_conflicts_building
    FOREIGN KEY (surveyedbuilding_id) REFERENCES surveyed_buildings (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_sync_conflicts_resolved_by
    FOREIGN KEY (resolved_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL,
  CONSTRAINT ck_sync_conflicts_resolution CHECK (
    status = 'รอแก้ไขด้วยมือ'
    OR (resolution_type IS NOT NULL AND resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_conflict_versions (
  id                     CHAR(36)     NOT NULL,
  syncconflict_id        CHAR(36)     NOT NULL,
  submitted_by_device_id VARCHAR(200) NOT NULL,
  submitted_by_user_id   CHAR(36)         NULL,
  submitted_at           DATETIME(3)  NOT NULL,
  data_version           INT          NOT NULL,
  -- db-spec §11: รูปแบบ/format จริงของ snapshot_content ยังไม่ตัดสินใจ จึงเก็บเป็นข้อความ
  snapshot_content       LONGTEXT     NOT NULL,
  is_selected_as_final   TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_sync_conflict_versions_conflict (syncconflict_id),
  CONSTRAINT fk_sync_conflict_versions_conflict
    FOREIGN KEY (syncconflict_id) REFERENCES sync_conflicts (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_sync_conflict_versions_user
    FOREIGN KEY (submitted_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_trail_entries (
  id                          CHAR(36)     NOT NULL,
  related_entity_name         VARCHAR(100) NOT NULL,
  -- polymorphic ตาม related_entity_name จึงไม่มี foreign key (db-spec §7.2)
  related_entity_id           CHAR(36)     NOT NULL,
  -- db-spec §10 ข้อ 9: resolve ไว้ล่วงหน้าตอนสร้างระเบียน ไม่ใช่ join ทีหลัง
  -- ว่างได้เฉพาะเหตุการณ์ที่ไม่ผูกกับอาคารใด (related_entity_name = User)
  related_surveyedbuilding_id CHAR(36)         NULL,
  action_type                 ENUM(
    'แก้ไขผลประเมินความเสียหาย','รับรองผล','ส่งกลับแก้ไข','สร้างบัญชีผู้ใช้','แก้ไขบัญชีผู้ใช้',
    'ปิดการใช้งานบัญชีผู้ใช้','เปิดใช้งานบัญชีผู้ใช้คืน','ซิงค์ข้อมูลสำเร็จ',
    'ตรวจพบความขัดแย้งของข้อมูล','แก้ไขความขัดแย้งของข้อมูล','อื่นๆ'
  ) NOT NULL,
  -- db-spec §7.2: ไม่บังคับเมื่อผู้กระทำคือระบบเอง (ซิงค์สำเร็จ/ตรวจพบความขัดแย้ง)
  performed_by_user_id        CHAR(36)         NULL,
  value_before                TEXT             NULL,
  value_after                 TEXT             NULL,
  performed_at                DATETIME(3)  NOT NULL,
  note                        TEXT             NULL,
  PRIMARY KEY (id),
  -- FR-32 ดึงประวัติรายอาคารเรียงตามเวลา / FR-33 กรองตามช่วงเวลา-ประเภท-ผู้แก้ไข
  -- กลยุทธ์ดัชนีที่เหมาะสมเมื่อข้อมูลสะสมมากยังเป็นประเด็นเปิดใน db-spec §11
  KEY ix_audit_building_time (related_surveyedbuilding_id, performed_at),
  KEY ix_audit_action_time (action_type, performed_at),
  CONSTRAINT fk_audit_building
    FOREIGN KEY (related_surveyedbuilding_id) REFERENCES surveyed_buildings (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_audit_performed_by
    FOREIGN KEY (performed_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL,
  CONSTRAINT ck_audit_performed_by CHECK (
    action_type IN ('ซิงค์ข้อมูลสำเร็จ','ตรวจพบความขัดแย้งของข้อมูล')
    OR performed_by_user_id IS NOT NULL
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
