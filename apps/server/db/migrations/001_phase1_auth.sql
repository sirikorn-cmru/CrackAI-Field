-- Phase 1 — รากฐานระบบ: บัญชีผู้ใช้และ session
--
-- แปลงโมเดลเชิงตรรกะใน `docs/02-design/02-technical/db-spec.md` §2.1 User และ §2.2 Session
-- เป็น schema จริงบน MySQL/MariaDB ตามที่ `technology-stack.md` §3 ตัดสินไว้
--
-- ครอบคลุม: FR-21, FR-25, FR-26, FR-27, NFR-08, NFR-09, NFR-11
--
-- การแปลงชนิดข้อมูล (db-spec §0 → MySQL/MariaDB):
--   ตัวระบุเฉพาะ      -> CHAR(36)      (รูปแบบ id จริงยังไม่ตัดสินใจ ดู db-spec §11 —
--                                       ตอนนี้ใช้ UUID ให้ตรงกับ UuidGenerator ในโค้ด)
--   ข้อความ           -> VARCHAR(n)/TEXT
--   วันที่-เวลา        -> DATETIME(3)   (เก็บเป็น UTC เสมอ)
--   จริง/เท็จ          -> TINYINT(1)
--   ค่าเลือกจากรายการ -> ENUM ด้วยค่าภาษาไทยตรงตัวตามเอกสาร ห้ามแปลเป็นภาษาอังกฤษ
--                        เพราะค่าเหล่านี้คือค่าที่เอกสารทุกชั้นและ test case อ้างถึง

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id                 CHAR(36)     NOT NULL,
  username           VARCHAR(100) NOT NULL,
  full_name          VARCHAR(200) NOT NULL,
  -- db-spec §2.1: เก็บในรูปแบบเข้ารหัส — วิธีเข้ารหัสยังไม่ตัดสินใจ (db-spec §11)
  -- ความยาวเผื่อไว้สำหรับรูปแบบ `<algo>$<salt>$<hash>` และการเปลี่ยนอัลกอริทึมภายหลัง
  credential_secret  VARCHAR(255) NOT NULL,
  phone_number       VARCHAR(30)      NULL,
  agency_name        VARCHAR(200)     NULL,
  position           VARCHAR(200)     NULL,
  role               ENUM('ผู้สำรวจภาคสนาม','หัวหน้าผู้สำรวจ','ผู้ดูแลระบบ','หน่วยงานส่วนกลาง-ผู้บริหาร') NOT NULL,
  account_status     ENUM('ใช้งานได้','ปิดใช้งาน') NOT NULL DEFAULT 'ใช้งานได้',
  created_by_user_id CHAR(36)         NULL,
  created_at         DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  -- db-spec §2.1: username ต้องไม่ซ้ำ (api-spec 2.1 กรณี error "username ซ้ำ")
  UNIQUE KEY uq_users_username (username),
  KEY ix_users_role (role),
  CONSTRAINT fk_users_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id                       CHAR(36)     NOT NULL,
  user_id                  CHAR(36)     NOT NULL,
  device_id                VARCHAR(200) NOT NULL,
  issued_at                DATETIME(3)  NOT NULL,
  -- NFR-09: อายุ 7 วันนับจากครั้งล่าสุดที่ยืนยันตัวตนกับเซิร์ฟเวอร์สำเร็จ
  expires_at               DATETIME(3)  NOT NULL,
  is_offline_cached        TINYINT(1)   NOT NULL DEFAULT 0,
  -- NFR-11: เก็บ PIN แยกจาก credential_secret ของ users เสมอ ไม่ปะปนกัน (architecture §6.8)
  -- db-spec §2.2: จำเป็นเมื่อ is_offline_cached = true
  cached_pin_secret        VARCHAR(255)     NULL,
  -- NFR-11: ตัวนับเฉพาะบนอุปกรณ์นี้ ไม่ซิงค์ขึ้นเซิร์ฟเวอร์
  failed_pin_attempt_count INT              NULL,
  last_verified_online_at  DATETIME(3)      NULL,
  status                   ENUM('ใช้งานอยู่','หมดอายุ','ถูกเพิกถอน') NOT NULL DEFAULT 'ใช้งานอยู่',
  PRIMARY KEY (id),
  -- api-spec 2.3: ต้องเพิกถอน session ที่ยัง "ใช้งานอยู่" ของผู้ใช้หนึ่งได้ทั้งหมดทันที
  KEY ix_sessions_user_status (user_id, status),
  KEY ix_sessions_expires_at (expires_at),
  CONSTRAINT fk_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE,
  -- db-spec §2.2 + NFR-11: session ที่แคชไว้ใช้ออฟไลน์ต้องมี PIN และตัวนับเสมอ
  -- ส่วน session ที่ไม่ได้แคชจะมีหรือไม่มีก็ได้ (ตั้งไว้ตอน 1.1 เพื่อใช้ปลดล็อกครั้งถัดไป)
  CONSTRAINT ck_sessions_offline_pin CHECK (
    is_offline_cached = 0
    OR (cached_pin_secret IS NOT NULL AND failed_pin_attempt_count IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- หมายเหตุความปลอดภัยที่ไม่ได้อยู่ใน schema แต่ต้องบังคับที่ชั้นแอป (NFR-01):
-- การล้าง credential/PIN จาก lockout ต้องแตะเฉพาะตาราง sessions เท่านั้น
-- ห้ามลบข้อมูลแบบสำรวจหรือคิวรอซิงค์บนอุปกรณ์เดียวกันเด็ดขาด
