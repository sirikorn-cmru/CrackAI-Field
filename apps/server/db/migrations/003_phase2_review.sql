-- Phase 2 — ทีมสำรวจ ช่วงเวลาสำรวจ การตรวจทาน และการรับรองผล
--
-- แปลง `docs/02-design/02-technical/db-spec.md` §4.1 (เฉพาะส่วนที่กระบวนการตรวจทานใช้),
-- §4.2 SurveyParticipant และ §7.1 CertificationRecord
--
-- ครอบคลุม: FR-16, FR-17, FR-18, FR-19, FR-22, NFR-05, NFR-10 (T-2-14 ถึง T-2-19)
--
-- **ขอบเขตที่ตั้งใจไม่ทำในไฟล์นี้**: คอลัมน์เนื้อหาความเสียหาย (หมวด 3–5 ของแบบฟอร์ม) และ
-- ตาราง SurroundingHazard / ExternalDamage / StructuralDamage / ComponentDamage /
-- ElectricalSystemDamage ยังไม่ถูกสร้าง เพราะค่าที่เลือกได้จริงของหมวดเหล่านั้นใน
-- `db-spec.md` ไม่ตรงกับแบบฟอร์มต้นฉบับ `Form_DPT_Flood_Survey.pdf` (ดู log 2026-09-26)
-- การสร้างตารางตามค่าที่ไม่ตรงจะทำให้ต้องย้ายข้อมูลทีหลัง

SET NAMES utf8mb4;

-- คอลัมน์ของ SurveyedBuilding ที่กระบวนการตรวจทาน/ภาพรวมใช้ (db-spec §4.1)
ALTER TABLE surveyed_buildings
  ADD COLUMN building_name                VARCHAR(200) NOT NULL DEFAULT '' AFTER client_generated_id,
  ADD COLUMN province                     VARCHAR(100) NOT NULL DEFAULT '' AFTER building_name,
  ADD COLUMN district                     VARCHAR(100) NOT NULL DEFAULT '' AFTER province,
  ADD COLUMN survey_start_at              DATETIME(3)      NULL AFTER district,
  ADD COLUMN survey_completed_at          DATETIME(3)      NULL AFTER survey_start_at,
  -- db-spec §4.1: ไม่บังคับ แต่จำเป็นก่อนส่งตรวจทาน (api-spec 6.1/10.1) — บังคับที่ชั้นแอป
  ADD COLUMN overall_severity_level       ENUM('เขียว','เหลือง','แดง') NULL AFTER survey_completed_at,
  ADD COLUMN severity_recommendation_note TEXT             NULL AFTER overall_severity_level,
  ADD COLUMN review_status                ENUM('ฉบับร่าง','รอตรวจทาน','ส่งกลับแก้ไข','รับรองแล้ว')
                                          NOT NULL DEFAULT 'ฉบับร่าง' AFTER severity_recommendation_note,
  -- api-spec 11.1 + db-spec §10 ข้อ 4: dashboard กรองด้วย sync_status แล้วจัดกลุ่มตามพื้นที่
  ADD KEY ix_surveyed_buildings_area (sync_status, province, district),
  ADD KEY ix_surveyed_buildings_review_status (review_status);

CREATE TABLE IF NOT EXISTS survey_participants (
  id                  CHAR(36)     NOT NULL,
  client_generated_id VARCHAR(100) NOT NULL,
  surveyedbuilding_id CHAR(36)     NOT NULL,
  user_id             CHAR(36)     NOT NULL,
  role_in_team        ENUM('หัวหน้าผู้สำรวจ','ผู้สำรวจร่วม') NOT NULL,
  -- db-spec §4.2: ลำดับ 1-3 ตามช่องกรอกในแบบฟอร์ม บังคับจำนวนรวมที่ชั้น operation (api-spec 9.1)
  sequence_order      INT          NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_survey_participants_client_generated_id (client_generated_id),
  -- คนเดียวกันอยู่ในทีมของอาคารเดียวกันซ้ำสองครั้งไม่ได้ และลำดับในอาคารหนึ่งต้องไม่ซ้ำ
  UNIQUE KEY uq_survey_participants_building_user (surveyedbuilding_id, user_id),
  UNIQUE KEY uq_survey_participants_building_order (surveyedbuilding_id, sequence_order),
  -- api-spec 13.1/15.1/15.5.1: ใช้หาว่าหัวหน้าผู้สำรวจคนหนึ่งรับผิดชอบอาคารใดบ้าง (NFR-08)
  KEY ix_survey_participants_user_role (user_id, role_in_team),
  CONSTRAINT fk_survey_participants_building
    FOREIGN KEY (surveyedbuilding_id) REFERENCES surveyed_buildings (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_survey_participants_user
    FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT ck_survey_participants_order CHECK (sequence_order BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS certification_records (
  id                     CHAR(36)    NOT NULL,
  surveyedbuilding_id    CHAR(36)    NOT NULL,
  reviewed_by_user_id    CHAR(36)    NOT NULL,
  review_result          ENUM('รับรอง','ส่งกลับแก้ไข') NOT NULL,
  review_comment         TEXT            NULL,
  digital_signature_file VARCHAR(500)    NULL,
  reviewed_at            DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_certification_records_building (surveyedbuilding_id, reviewed_at),
  CONSTRAINT fk_certification_records_building
    FOREIGN KEY (surveyedbuilding_id) REFERENCES surveyed_buildings (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_certification_records_user
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id),
  -- db-spec §10 ข้อ 5: ผลเป็น "รับรอง" ต้องมีลายมือชื่อดิจิทัลเสมอ
  CONSTRAINT ck_certification_records_signature CHECK (
    review_result <> 'รับรอง' OR digital_signature_file IS NOT NULL
  ),
  -- api-spec 10.2: ส่งกลับแก้ไขต้องมีความเห็นเพื่อให้ทีมทราบสิ่งที่ต้องแก้
  CONSTRAINT ck_certification_records_comment CHECK (
    review_result <> 'ส่งกลับแก้ไข' OR review_comment IS NOT NULL
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
