# สัญญาการทำงาน (Operation Contract)

เอกสารนี้อธิบาย operation ทั้งหมดของระบบสำรวจความเสียหายขั้นต้นของโครงสร้างอาคารหลังอุทกภัยในรูปแบบ **operation contract เชิง logical** อิงจาก [[architecture]], [[feature-list]] และ [[backlog]]

> **หมายเหตุสำคัญ**: [[technology-stack.md|technology-stack]] ยังไม่มีเนื้อหา เอกสารนี้จึงจงใจ**ไม่ระบุ** HTTP method/path, protocol (REST/GraphQL/gRPC) หรือรูปแบบการสื่อสารใดๆ ทั้งสิ้น แต่ละ operation อธิบายด้วย: ชื่อ operation, ผู้เรียกได้ (บทบาท), input, output, กฎทางธุรกิจ/validation, กรณี error หลัก และรหัส FR/NFR ที่รองรับ

คู่กับเอกสารนี้เสมอ: [[db-spec]] — ทุก field ที่ระบุในหัวข้อ input/output ของ operation ด้านล่างตรงกับชื่อ attribute (canonical name) ใน [[db-spec]] ทุกประการ

บทบาทที่ใช้ในเอกสารนี้ (อ้างอิง [[db-spec#2.1 User|User.role]]): **ผู้สำรวจภาคสนาม**, **หัวหน้าผู้สำรวจ**, **ผู้ดูแลระบบ**, **หน่วยงานส่วนกลาง/ผู้บริหาร**

## 1. ยืนยันตัวตนและเข้าสู่ระบบ

รองรับ [[feature-list#14. ยืนยันตัวตนและเข้าสู่ระบบ|ฟีเจอร์ 14]]

### 1.1 เข้าสู่ระบบ

- **ผู้เรียกได้**: ทุกบทบาท
- **Input**: `username`, `credential_secret`, `device_id`
- **Output**: `Session` ใหม่ (`id`, `user_id`, `device_id`, `issued_at`, `expires_at`, `is_offline_cached = false`, `status = ใช้งานอยู่`) พร้อมข้อมูล `User.role` เพื่อให้ client กำหนดเมนู/หน้าจอที่อนุญาต
- **กฎทางธุรกิจ**: ตรวจสอบ `credential_secret` ตรงกับที่บันทึกไว้ของ `username`, บัญชีต้องมี `account_status = ใช้งานได้` เท่านั้นจึงเข้าสู่ระบบได้
- **กรณี error**: ชื่อบัญชี/รหัสผ่านไม่ถูกต้อง, บัญชีถูกปิดใช้งาน (`account_status = ปิดใช้งาน`)
- **FR/NFR**: [[feature-list#14. ยืนยันตัวตนและเข้าสู่ระบบ|FR-25, FR-26]]

### 1.2 ออกจากระบบ

- **ผู้เรียกได้**: ทุกบทบาท (เจ้าของ session)
- **Input**: `Session.id`
- **Output**: `Session.status = หมดอายุ`
- **กฎทางธุรกิจ**: เพิกถอน session ทันที ไม่สามารถใช้ต่อได้แม้ยังไม่ครบ `expires_at`
- **กรณี error**: session ไม่พบ/ถูกเพิกถอนไปแล้ว
- **FR/NFR**: [[feature-list#14. ยืนยันตัวตนและเข้าสู่ระบบ|FR-25]]

### 1.3 เข้าสู่ระบบด้วย credential ที่แคชไว้ขณะออฟไลน์

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: `username`, `credential_secret` (ตรวจสอบกับค่าที่แคชไว้บนอุปกรณ์เอง เนื่องจากไม่มีสัญญาณ), `device_id`
- **Output**: `Session` ใหม่ที่ `is_offline_cached = true`, `expires_at` ถูกกำหนดตามอายุ credential ที่แคชไว้ (นับจากครั้งล่าสุดที่เชื่อมต่อเซิร์ฟเวอร์สำเร็จ)
- **กฎทางธุรกิจ**: ใช้ได้เฉพาะเมื่อไม่มีสัญญาณอินเทอร์เน็ต, session ที่ได้ต้องมีอายุจำกัดตาม NFR-09 และบังคับต่ออายุ/ยืนยันตัวตนใหม่กับเซิร์ฟเวอร์ทันทีที่ครบกำหนดหรือกลับมามีสัญญาณ
- **กรณี error**: credential ที่แคชไว้หมดอายุแล้ว (ต้องเชื่อมต่อเซิร์ฟเวอร์เพื่อเข้าสู่ระบบใหม่), ไม่เคยเข้าสู่ระบบสำเร็จบนอุปกรณ์นี้มาก่อนจึงไม่มี credential ให้แคช
- **FR/NFR**: [[feature-list#14. ยืนยันตัวตนและเข้าสู่ระบบ|FR-27, NFR-09]]

### 1.4 ต่ออายุ/ยืนยันตัวตนใหม่เมื่อกลับมามีสัญญาณ

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม (เรียกอัตโนมัติโดย Field Client App)
- **Input**: `Session.id` (ที่เป็น `is_offline_cached = true`), `device_id`
- **Output**: `Session.last_verified_online_at` ถูกปรับปรุง หรือออก `Session` ใหม่ที่ `is_offline_cached = false`
- **กฎทางธุรกิจ**: ต้องเรียกทันทีที่อุปกรณ์กลับมามีสัญญาณ หากไม่ผ่านการยืนยัน ต้องบังคับให้เข้าสู่ระบบใหม่ (1.1) ก่อนใช้งานฟังก์ชันที่ต้องซิงค์ต่อ
- **กรณี error**: บัญชีถูกปิดใช้งานระหว่างที่ออฟไลน์อยู่ (ต้องปฏิเสธและบังคับออกจากระบบ)
- **FR/NFR**: [[feature-list#14. ยืนยันตัวตนและเข้าสู่ระบบ|FR-27, NFR-09]]

## 2. จัดการผู้ใช้และสิทธิ์การเข้าถึง

รองรับ [[feature-list#9. จัดการผู้ใช้และสิทธิ์การเข้าถึง|ฟีเจอร์ 9]]

### 2.1 สร้างบัญชีผู้ใช้ใหม่

- **ผู้เรียกได้**: ผู้ดูแลระบบ
- **Input**: `username`, `full_name`, `credential_secret` (ค่าตั้งต้น), `phone_number`, `agency_name`, `position`, `role`
- **Output**: `User` ใหม่ (`account_status = ใช้งานได้`, `created_by_user_id` = ผู้ดูแลระบบที่เรียก)
- **กฎทางธุรกิจ**: `username` ต้องไม่ซ้ำ, `role` ต้องเป็นหนึ่งใน 4 ค่าที่กำหนด
- **กรณี error**: `username` ซ้ำ, `role` ไม่ถูกต้อง
- **FR/NFR**: [[feature-list#9. จัดการผู้ใช้และสิทธิ์การเข้าถึง|FR-21]], [[architecture#5. Mapping NFR ไปยัง Component|NFR-08]]

### 2.2 แก้ไขข้อมูล/บทบาทผู้ใช้

- **ผู้เรียกได้**: ผู้ดูแลระบบ
- **Input**: `User.id`, field ที่ต้องการแก้ไข (`full_name`, `phone_number`, `agency_name`, `position`, `role`)
- **Output**: `User` ที่ปรับปรุงแล้ว + `AuditTrailEntry` (`related_entity_name = User`, `action_type = แก้ไขบัญชีผู้ใช้`, `value_before`, `value_after`)
- **กฎทางธุรกิจ**: การเปลี่ยน `role` มีผลกับ session ที่ยังใช้งานอยู่ทันที (ต้องบังคับตรวจสิทธิ์ใหม่ในคำขอถัดไป)
- **กรณี error**: ไม่พบผู้ใช้
- **FR/NFR**: [[feature-list#9. จัดการผู้ใช้และสิทธิ์การเข้าถึง|FR-21]], [[architecture#5. Mapping NFR ไปยัง Component|NFR-08]]

### 2.3 ปิดการใช้งานบัญชีผู้ใช้

- **ผู้เรียกได้**: ผู้ดูแลระบบ
- **Input**: `User.id`
- **Output**: `User.account_status = ปิดใช้งาน` + `AuditTrailEntry` (`action_type = ปิดการใช้งานบัญชีผู้ใช้`)
- **กฎทางธุรกิจ**: ต้องเพิกถอน `Session` ที่ยัง `ใช้งานอยู่` ของผู้ใช้นี้ทั้งหมดทันที
- **กรณี error**: ไม่พบผู้ใช้, บัญชีถูกปิดใช้งานอยู่แล้ว
- **FR/NFR**: [[feature-list#9. จัดการผู้ใช้และสิทธิ์การเข้าถึง|FR-21]], [[architecture#5. Mapping NFR ไปยัง Component|NFR-08]]

## 3. มอบหมายงานสำรวจให้ทีม

รองรับ [[feature-list#8. มอบหมายงานสำรวจให้ทีม|ฟีเจอร์ 8]]

### 3.1 สร้างงานมอบหมายสำรวจ

- **ผู้เรียกได้**: หัวหน้าผู้สำรวจ
- **Input**: `title_text`, `target_area_description`, `due_date` (ไม่บังคับ), รายชื่อ `user_id` ของผู้สำรวจที่จะมอบหมาย (ใช้สร้าง `AssignmentMember`)
- **Output**: `Assignment` ใหม่ (`status = มอบหมายแล้ว`, `created_by_user_id` = หัวหน้าผู้สำรวจที่เรียก) + `AssignmentMember` ตามรายชื่อ
- **กฎทางธุรกิจ**: ผู้ถูกมอบหมายทุกคนต้องมี `role = ผู้สำรวจภาคสนาม`
- **กรณี error**: รายชื่อผู้สำรวจว่างเปล่า, พบ `user_id` ที่ไม่ใช่บทบาทผู้สำรวจภาคสนาม
- **FR/NFR**: [[feature-list#8. มอบหมายงานสำรวจให้ทีม|FR-20]]

### 3.2 ดูรายการงานที่ได้รับมอบหมาย

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม (เฉพาะงานของตน), หัวหน้าผู้สำรวจ (งานที่ตนมอบหมาย)
- **Input**: `user_id` ของผู้เรียก (ใช้กรองอัตโนมัติตามสิทธิ์)
- **Output**: รายการ `Assignment` พร้อมสถานะ
- **กฎทางธุรกิจ**: ผู้สำรวจภาคสนามเห็นเฉพาะงานที่ตนเป็นสมาชิกใน `AssignmentMember`
- **กรณี error**: ไม่มี
- **FR/NFR**: [[feature-list#8. มอบหมายงานสำรวจให้ทีม|FR-20]]

## 4. บันทึกข้อมูลอาคารและสภาพแวดล้อม

รองรับ [[feature-list#1. บันทึกข้อมูลอาคารและสภาพแวดล้อม|ฟีเจอร์ 1]] — สามารถเรียกได้ขณะออฟไลน์เต็มรูปแบบ (NFR-01)

### 4.1 เริ่มต้นแบบสำรวจอาคารใหม่

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: `client_generated_id` (สร้างบนอุปกรณ์), `device_id`, `assignment_id` (ไม่บังคับ), `building_name`, `owner_name`, `address_text`, `sub_district`, `district`, `province`, `building_use_type`, `ownership_type`, `gps_latitude`, `gps_longitude`, `gps_accuracy_meters`
- **Output**: `SurveyedBuilding` ใหม่ (`review_status = ฉบับร่าง`, `sync_status = ยังไม่ซิงค์`, `data_version = 1`, `created_on_device_at` = เวลาปัจจุบันบนอุปกรณ์)
- **กฎทางธุรกิจ**: `building_use_type` ต้องเป็นหนึ่งใน 13 ประเภทที่กำหนด; ถ้า `gps_accuracy_meters` แย่กว่าเกณฑ์ที่ยอมรับได้ ต้องแจ้งเตือนผู้สำรวจก่อนยอมรับการบันทึก (NFR-06) แต่ไม่บล็อกการทำงานต่อขณะออฟไลน์
- **กรณี error**: `client_generated_id` ซ้ำกับระเบียนที่มีอยู่แล้วบนอุปกรณ์เดียวกัน, ไม่มีสัญญาณ GPS
- **FR/NFR**: [[feature-list#1. บันทึกข้อมูลอาคารและสภาพแวดล้อม|FR-01–FR-04]], [[architecture#5. Mapping NFR ไปยัง Component|NFR-06]]

### 4.2 บันทึก/แก้ไขข้อมูลกายภาพอาคาร

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: `SurveyedBuilding.client_generated_id`, `floor_count`, `total_floor_area_sqm`, `primary_structure_type`, `wall_material`
- **Output**: `SurveyedBuilding` ที่ปรับปรุงแล้ว (`data_version` +1, `last_modified_at`, `last_modified_by_device_id` ปรับปรุง)
- **กฎทางธุรกิจ**: แก้ไขได้เฉพาะเมื่อ `review_status` ยังไม่เป็น "รับรองแล้ว"
- **กรณี error**: พยายามแก้ไขระเบียนที่ `review_status = รับรองแล้ว`
- **FR/NFR**: [[feature-list#1. บันทึกข้อมูลอาคารและสภาพแวดล้อม|FR-01–FR-04]]

### 4.3 บันทึกอันตรายโดยรอบอาคาร

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: `SurveyedBuilding.client_generated_id`, รายการ (`hazard_type`, `description`)
- **Output**: `SurroundingHazard` ใหม่ 1 รายการต่อรายการ input
- **กฎทางธุรกิจ**: บันทึกได้หลายรายการต่ออาคารเดียว (1:N)
- **กรณี error**: ไม่พบ `SurveyedBuilding` ที่อ้างอิง
- **FR/NFR**: [[feature-list#1. บันทึกข้อมูลอาคารและสภาพแวดล้อม|FR-01–FR-04]]

## 5. ประเมินความเสียหายโครงสร้างและส่วนประกอบอาคารแยกตามหมวด

รองรับ [[feature-list#2. ประเมินความเสียหายโครงสร้างและส่วนประกอบอาคารแยกตามหมวด|ฟีเจอร์ 2]]

### 5.1 บันทึกความเสียหายภายนอกอาคาร

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: `SurveyedBuilding.client_generated_id`, `location_area_text`, `damage_description`, `damage_severity_level`
- **Output**: `ExternalDamage` ใหม่
- **กฎทางธุรกิจ**: `location_area_text` จำเป็นเสมอเพื่อให้ผูกกับภาพถ่ายในหมวด 6 ได้ (FR-12)
- **กรณี error**: ไม่พบ `SurveyedBuilding` ที่อ้างอิง
- **FR/NFR**: [[feature-list#2. ประเมินความเสียหายโครงสร้างและส่วนประกอบอาคารแยกตามหมวด|FR-05–FR-09]]

### 5.2 บันทึกความเสียหายโครงสร้างอาคาร

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: `SurveyedBuilding.client_generated_id`, `material_type`, `structural_part`, `location_area_text`, `damage_severity_level`, `source_of_value`, `damage_description`
- **Output**: `StructuralDamage` ใหม่
- **กฎทางธุรกิจ**: `damage_severity_level` ต้องมาจากหนึ่งใน 2 เส้นทางเท่านั้น: (ก) กรอกเอง → `source_of_value = กรอกเอง` (เชื่อมกับ [[#7.4 กรอกระดับความเสียหายของรอยร้าวด้วยตนเอง|7.4]]) หรือ (ข) มาจากผลยืนยัน/แก้ไขผล AI → `source_of_value = ยืนยันผลจาก AI ตรงตามที่เสนอ` หรือ `แก้ไขจากผลที่ AI เสนอ` (เชื่อมกับ [[#7.3 ยืนยัน/แก้ไขผลวิเคราะห์ AI ก่อนบันทึกจริง|7.3]]); ห้ามให้ AI เขียนค่านี้โดยตรงโดยไม่ผ่านการยืนยันของผู้สำรวจ
- **กรณี error**: ไม่พบ `SurveyedBuilding` ที่อ้างอิง, `source_of_value = แก้ไขจากผลที่ AI เสนอ` แต่ไม่มี `AIAnalysisResult` อ้างอิงมาก่อน
- **FR/NFR**: [[feature-list#2. ประเมินความเสียหายโครงสร้างและส่วนประกอบอาคารแยกตามหมวด|FR-05–FR-09]]

### 5.3 บันทึกความเสียหายส่วนประกอบอาคาร

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: `SurveyedBuilding.client_generated_id`, `component_type`, `location_area_text`, `damage_severity_level`, `source_of_value`, `damage_description`
- **Output**: `ComponentDamage` ใหม่
- **กฎทางธุรกิจ**: เหมือน 5.2 (แยกที่มาของค่าด้วย `source_of_value`)
- **กรณี error**: เหมือน 5.2
- **FR/NFR**: [[feature-list#2. ประเมินความเสียหายโครงสร้างและส่วนประกอบอาคารแยกตามหมวด|FR-05–FR-09]]

### 5.4 บันทึกความเสียหายระบบไฟฟ้า

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: `SurveyedBuilding.client_generated_id`, `issue_location_text`, `issue_description`, `risk_level`
- **Output**: `ElectricalSystemDamage` ใหม่
- **กฎทางธุรกิจ**: ไม่มีข้อจำกัดพิเศษ
- **กรณี error**: ไม่พบ `SurveyedBuilding` ที่อ้างอิง
- **FR/NFR**: [[feature-list#2. ประเมินความเสียหายโครงสร้างและส่วนประกอบอาคารแยกตามหมวด|FR-05–FR-09]]

## 6. สรุปผลประเมินเป็น 3 ระดับสีพร้อมเกณฑ์อ้างอิงคู่มือ

รองรับ [[feature-list#3. สรุปผลประเมินเป็น 3 ระดับสีพร้อมเกณฑ์อ้างอิงคู่มือ|ฟีเจอร์ 3]]

### 6.1 บันทึกผลสรุประดับสี

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: `SurveyedBuilding.client_generated_id`, `overall_severity_level`, `severity_recommendation_note`
- **Output**: `SurveyedBuilding.overall_severity_level`/`severity_recommendation_note` ปรับปรุงแล้ว
- **กฎทางธุรกิจ**: ต้องกรอกความเสียหายอย่างน้อย 1 หมวด (หมวด 5) มาก่อนจึงจะบันทึกผลสรุปได้; ต้องมีค่านี้ก่อนเปลี่ยน `review_status` เป็น "รอตรวจทาน" (7.1)
- **กรณี error**: ยังไม่มีข้อมูลความเสียหายหมวดใดเลย
- **FR/NFR**: [[feature-list#3. สรุปผลประเมินเป็น 3 ระดับสีพร้อมเกณฑ์อ้างอิงคู่มือ|FR-10]]

### 6.2 ดึงเกณฑ์อ้างอิงคู่มือ

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: หมวดที่กำลังกรอก (เช่น `structural_part` หรือ `component_type`)
- **Output**: เนื้อหาเกณฑ์อ้างอิง (ข้อความ/เลขหน้าคู่มือที่เกี่ยวข้อง) — เป็นเนื้อหาอ้างอิงสถิต (static reference content) ไม่ใช่ entity ข้อมูลผู้ใช้ตาม [[db-spec]]
- **กฎทางธุรกิจ**: ต้องใช้งานได้ขณะออฟไลน์เช่นกัน (เนื้อหาคู่มือต้องถูกฝังไว้ใน Field Client App ล่วงหน้า)
- **กรณี error**: ไม่มีเกณฑ์อ้างอิงสำหรับหมวดที่ระบุ
- **FR/NFR**: [[feature-list#3. สรุปผลประเมินเป็น 3 ระดับสีพร้อมเกณฑ์อ้างอิงคู่มือ|FR-11]]

## 7. ถ่ายภาพและประเมินรอยร้าวด้วย AI พร้อมทางเลือกกรอกเอง (Human-in-the-loop)

รองรับ [[feature-list#4. ถ่ายภาพและประเมินรอยร้าวด้วย AI พร้อมทางเลือกกรอกเอง (Human-in-the-loop)|ฟีเจอร์ 4]] — ทำงานบน [[architecture#2. Logical Component|โมดูลวิเคราะห์รอยร้าวบนอุปกรณ์]] เป็นเส้นทางหลัก

### 7.1 ถ่ายภาพประกอบความเสียหาย/ผูกกับบริเวณ

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: `SurveyedBuilding.client_generated_id`, `client_generated_id` ของภาพ, `linked_area_type`, `linked_area_id` (ไม่บังคับ), `area_description_text` (ไม่บังคับ), `photo_file`, `gps_latitude`/`gps_longitude` (ไม่บังคับ)
- **Output**: `DamagePhoto` ใหม่ (`sync_status = ยังไม่ซิงค์`, `image_quality_check_status` ตามผลตรวจสอบทันทีบนอุปกรณ์)
- **กฎทางธุรกิจ**: ถ้า `linked_area_type` ไม่ใช่ "ทั่วไป" ต้องระบุ `linked_area_id` ที่อ้างอิงระเบียนของ entity ที่ตรงกับ `linked_area_type` (ดูกฎ 6 ใน [[db-spec#9. กฎทางธุรกิจที่กระทบโครงสร้างข้อมูล|db-spec หัวข้อ 9]]); ต้องตรวจสอบคุณภาพภาพ (ความคมชัด/แสง) ก่อนยอมรับ (NFR-06)
- **กรณี error**: ภาพเบลอ/แสงไม่พอเกินเกณฑ์ (`image_quality_check_status` ไม่ผ่าน) — ยังคงบันทึกได้แต่ต้องแจ้งเตือนให้ถ่ายใหม่, `linked_area_id` ไม่ตรงประเภทกับ `linked_area_type`
- **FR/NFR**: [[feature-list#4. ถ่ายภาพและประเมินรอยร้าวด้วย AI พร้อมทางเลือกกรอกเอง (Human-in-the-loop)|FR-12]], [[architecture#5. Mapping NFR ไปยัง Component|NFR-06]]

### 7.2 ส่งภาพให้ AI วิเคราะห์ (on-device)

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม (เลือกใช้ได้ ไม่บังคับ)
- **Input**: `DamagePhoto.client_generated_id`
- **Output**: `AIAnalysisResult` ใหม่ (`analysis_source = on-device`, `analysis_status`, และถ้าสำเร็จ: `estimated_crack_width_mm`, `suggested_severity_level`; ถ้าไม่สำเร็จ: `failure_reason`)
- **กฎทางธุรกิจ**: ต้องทำงานได้สมบูรณ์โดยไม่มีสัญญาณเครือข่าย (NFR-01); ผลลัพธ์เป็นเพียง**ข้อเสนอ** ห้ามเขียนลง `StructuralDamage.damage_severity_level`/`ComponentDamage.damage_severity_level` โดยตรง ต้องผ่าน 7.3 หรือ 7.4 ก่อนเสมอ
- **กรณี error**: ภาพเบลอ/แสงไม่พอ/ไม่พบรอยร้าวในภาพ → บันทึกเป็น `analysis_status = ไม่สำเร็จ` พร้อม `failure_reason` แล้วส่งต่อไปยัง [[#7.5 รายงานผลวิเคราะห์ AI ไม่สำเร็จ+เสนอถ่ายใหม่|7.5]]
- **FR/NFR**: [[feature-list#4. ถ่ายภาพและประเมินรอยร้าวด้วย AI พร้อมทางเลือกกรอกเอง (Human-in-the-loop)|FR-13]]

### 7.3 ยืนยัน/แก้ไขผลวิเคราะห์ AI ก่อนบันทึกจริง

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: `AIAnalysisResult.id`, การเลือกของผู้สำรวจ (ยืนยันตามที่เสนอ หรือแก้ไขค่าใหม่), ค่าที่ยืนยัน/แก้ไข (`damage_severity_level` ปลายทาง), entity/รหัสปลายทาง (`StructuralDamage.id` หรือ `ComponentDamage.id`)
- **Output**: อัปเดต `StructuralDamage.damage_severity_level`/`ComponentDamage.damage_severity_level` และ `source_of_value` (`ยืนยันผลจาก AI ตรงตามที่เสนอ` หรือ `แก้ไขจากผลที่ AI เสนอ`) + `AuditTrailEntry` ใหม่เสมอ (`related_entity_name`, `action_type = แก้ไขผลประเมินความเสียหาย`, `value_before = suggested_severity_level`, `value_after` = ค่าที่ยืนยัน)
- **กฎทางธุรกิจ**: **บังคับ** ต้องมีการยืนยัน/แก้ไขจากผู้สำรวจก่อนบันทึกเป็นผลจริงเสมอ (ห้าม AI บันทึกอัตโนมัติ) และทุกครั้งต้องสร้าง `AuditTrailEntry` แม้ผู้สำรวจจะยืนยันตรงตามที่ AI เสนอก็ตาม (เพื่อ auditability ครบถ้วนตาม NFR-05)
- **กรณี error**: `AIAnalysisResult.analysis_status = ไม่สำเร็จ` (ไม่มีค่าให้ยืนยัน ต้องใช้ 7.4 แทน)
- **FR/NFR**: [[feature-list#4. ถ่ายภาพและประเมินรอยร้าวด้วย AI พร้อมทางเลือกกรอกเอง (Human-in-the-loop)|FR-14]], [[architecture#5. Mapping NFR ไปยัง Component|NFR-05]]

### 7.4 กรอกระดับความเสียหายของรอยร้าวด้วยตนเอง

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: entity/รหัสปลายทาง (`StructuralDamage.id` หรือ `ComponentDamage.id`), `damage_severity_level`
- **Output**: อัปเดต `damage_severity_level` พร้อม `source_of_value = กรอกเอง`
- **กฎทางธุรกิจ**: ใช้งานได้เสมอไม่ว่าจะเคยเรียก AI มาก่อนหรือไม่ (เส้นทางปกติคู่ขนาน ไม่ใช่ทางออกฉุกเฉิน)
- **กรณี error**: ไม่พบระเบียนความเสียหายปลายทางที่อ้างอิง
- **FR/NFR**: [[feature-list#4. ถ่ายภาพและประเมินรอยร้าวด้วย AI พร้อมทางเลือกกรอกเอง (Human-in-the-loop)|FR-29]]

### 7.5 รายงานผลวิเคราะห์ AI ไม่สำเร็จ+เสนอถ่ายใหม่

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม (ผลลัพธ์ของ 7.2 เมื่อ `analysis_status = ไม่สำเร็จ`)
- **Input**: `AIAnalysisResult.id`
- **Output**: ข้อความแจ้งสาเหตุ (`failure_reason`) + ทางเลือกในหน้างานเดียวกัน: ถ่ายภาพใหม่ (กลับไป 7.1) หรือกรอกระดับความเสียหายด้วยตนเอง (ไป 7.4)
- **กฎทางธุรกิจ**: ต้องแจ้งสาเหตุให้ชัดเจน (เบลอ/แสงไม่พอ/ไม่พบรอยร้าว) ไม่ปล่อยให้ผู้สำรวจติดค้างไม่รู้สาเหตุ
- **กรณี error**: ไม่มี (เป็นเส้นทางจัดการ error ของ 7.2 เอง)
- **FR/NFR**: [[feature-list#4. ถ่ายภาพและประเมินรอยร้าวด้วย AI พร้อมทางเลือกกรอกเอง (Human-in-the-loop)|FR-28]]

## 8. วาดภาพประกอบเพิ่มเติม

รองรับ [[feature-list#5. วาดภาพประกอบเพิ่มเติม|ฟีเจอร์ 5]]

### 8.1 วาดภาพประกอบเพิ่มเติม

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: `SurveyedBuilding.client_generated_id`, `client_generated_id` ของภาพวาด, `sketch_file`, `caption_text`
- **Output**: `Sketch` ใหม่ (`sync_status = ยังไม่ซิงค์`)
- **กฎทางธุรกิจ**: ไม่บังคับ (Should have) — เป็นส่วนเสริมนอกเหนือจากภาพถ่าย
- **กรณี error**: ไม่พบ `SurveyedBuilding` ที่อ้างอิง
- **FR/NFR**: [[feature-list#5. วาดภาพประกอบเพิ่มเติม|FR-15]]

## 9. บันทึกข้อมูลผู้สำรวจและระยะเวลาการสำรวจ

รองรับ [[feature-list#6. บันทึกข้อมูลผู้สำรวจและระยะเวลาการสำรวจ|ฟีเจอร์ 6]]

### 9.1 บันทึกรายชื่อผู้สำรวจและหัวหน้าผู้สำรวจ

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม, หัวหน้าผู้สำรวจ
- **Input**: `SurveyedBuilding.client_generated_id`, รายการ (`user_id`, `role_in_team`, `sequence_order`) สูงสุด 3 รายการ
- **Output**: `SurveyParticipant` ใหม่ตามรายการ
- **กฎทางธุรกิจ**: ต้องมีอย่างน้อย 1 รายการที่ `role_in_team = หัวหน้าผู้สำรวจ`, รวมไม่เกิน 3 คน (ดู [[db-spec#4.2 SurveyParticipant|db-spec 4.2]])
- **กรณี error**: จำนวนผู้สำรวจเกิน 3 คน, ไม่มีหัวหน้าผู้สำรวจในรายการ
- **FR/NFR**: [[feature-list#6. บันทึกข้อมูลผู้สำรวจและระยะเวลาการสำรวจ|FR-16]]

### 9.2 บันทึกเวลาเริ่ม/เสร็จสิ้นการสำรวจ

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม
- **Input**: `SurveyedBuilding.client_generated_id`, `survey_start_at`, `survey_completed_at`
- **Output**: `SurveyedBuilding.survey_start_at`/`survey_completed_at` ปรับปรุงแล้ว
- **กฎทางธุรกิจ**: `survey_completed_at` ต้องไม่มาก่อน `survey_start_at`
- **กรณี error**: ลำดับเวลาไม่ถูกต้อง
- **FR/NFR**: [[feature-list#6. บันทึกข้อมูลผู้สำรวจและระยะเวลาการสำรวจ|FR-17]]

## 10. ตรวจทานและรับรองผลสำรวจด้วยลายเซ็นดิจิทัล

รองรับ [[feature-list#7. ตรวจทานและรับรองผลสำรวจด้วยลายเซ็นดิจิทัล|ฟีเจอร์ 7]] — ต้องมีสัญญาณอินเทอร์เน็ต (ใช้งานผ่าน Management Web Client)

### 10.1 ตรวจทานผลสำรวจ (ส่งกลับแก้ไข)

- **ผู้เรียกได้**: หัวหน้าผู้สำรวจ
- **Input**: `SurveyedBuilding.id`, `review_comment`
- **Output**: `CertificationRecord` ใหม่ (`review_result = ส่งกลับแก้ไข`) + `SurveyedBuilding.review_status = ส่งกลับแก้ไข` + `AuditTrailEntry` (`action_type = ส่งกลับแก้ไข`)
- **กฎทางธุรกิจ**: ต้องระบุ `review_comment` เพื่อให้ทีมทราบสิ่งที่ต้องแก้ไข; ทำได้เฉพาะระเบียนที่ `sync_status = ซิงค์สำเร็จ` เท่านั้น (ต้องอยู่บนเซิร์ฟเวอร์แล้ว)
- **กรณี error**: ระเบียนยังไม่ซิงค์ขึ้นเซิร์ฟเวอร์, ไม่มี `review_comment`
- **FR/NFR**: [[feature-list#7. ตรวจทานและรับรองผลสำรวจด้วยลายเซ็นดิจิทัล|FR-19]]

### 10.2 ลงลายมือชื่อดิจิทัลรับรองผล

- **ผู้เรียกได้**: หัวหน้าผู้สำรวจ
- **Input**: `SurveyedBuilding.id`, `digital_signature_file`
- **Output**: `CertificationRecord` ใหม่ (`review_result = รับรอง`) + `SurveyedBuilding.review_status = รับรองแล้ว` + `AuditTrailEntry` (`action_type = รับรองผล`)
- **กฎทางธุรกิจ**: ทำได้เฉพาะเมื่อข้อมูลครบถ้วน (`overall_severity_level` ต้องมีค่าแล้วตาม 6.1) และผู้ลงนามต้องเป็น `SurveyParticipant.role_in_team = หัวหน้าผู้สำรวจ` ของอาคารนั้น หรือหัวหน้าผู้สำรวจที่มีสิทธิ์ตรวจทานทีม
- **กรณี error**: ยังไม่มีผลสรุประดับสี, ผู้เรียกไม่ใช่หัวหน้าผู้สำรวจของทีมนั้น
- **FR/NFR**: [[feature-list#7. ตรวจทานและรับรองผลสำรวจด้วยลายเซ็นดิจิทัล|FR-18]], [[architecture#5. Mapping NFR ไปยัง Component|NFR-05]]

## 11. Dashboard ภาพรวมผลสำรวจ

รองรับ [[feature-list#10. Dashboard ภาพรวมผลสำรวจ|ฟีเจอร์ 10]]

### 11.1 ดู Dashboard ภาพรวมผลสำรวจ

- **ผู้เรียกได้**: หน่วยงานส่วนกลาง/ผู้บริหาร
- **Input**: ตัวกรอง (ไม่บังคับ): `province`, ช่วงวันที่ (`survey_completed_at`)
- **Output**: จำนวนอาคารที่สำรวจแล้วทั้งหมด, สัดส่วนตาม `overall_severity_level` (เขียว/เหลือง/แดง), แยกตาม `province`/`district`
- **กฎทางธุรกิจ**: นับเฉพาะ `SurveyedBuilding` ที่ `sync_status = ซิงค์สำเร็จ`
- **กรณี error**: ไม่มี (คืนค่าว่างเมื่อไม่มีข้อมูลตรงเงื่อนไข)
- **FR/NFR**: [[feature-list#10. Dashboard ภาพรวมผลสำรวจ|FR-22]]

## 12. ส่งออกรายงานผลการสำรวจ

รองรับ [[feature-list#11. ส่งออกรายงานผลการสำรวจ|ฟีเจอร์ 11]]

### 12.1 ส่งออกรายงานผลการสำรวจ

- **ผู้เรียกได้**: หน่วยงานส่วนกลาง/ผู้บริหาร
- **Input**: ขอบเขต (รายอาคารเดียว ระบุ `SurveyedBuilding.id`, หรือสรุปภาพรวมตามตัวกรอง `province`/ช่วงวันที่/`overall_severity_level`)
- **Output**: ไฟล์รายงาน (รูปแบบไฟล์เป็นประเด็นรอตัดสินใจ ดูหัวข้อ 15)
- **กฎทางธุรกิจ**: รวมเฉพาะข้อมูลที่ `sync_status = ซิงค์สำเร็จ`
- **กรณี error**: ไม่พบข้อมูลตรงเงื่อนไข
- **FR/NFR**: [[feature-list#11. ส่งออกรายงานผลการสำรวจ|FR-23]]

## 13. ค้นหา/กรองรายการอาคารที่สำรวจแล้ว

รองรับ [[feature-list#12. ค้นหา/กรองรายการอาคารที่สำรวจแล้ว|ฟีเจอร์ 12]]

### 13.1 ค้นหา/กรองรายการอาคารที่สำรวจแล้ว

- **ผู้เรียกได้**: หน่วยงานส่วนกลาง/ผู้บริหาร, หัวหน้าผู้สำรวจ
- **Input**: ตัวกรอง (ไม่บังคับ, ใช้ร่วมกันได้): `province`/`district`, `overall_severity_level`, ช่วงวันที่ (`survey_start_at`–`survey_completed_at`), `user_id` ของผู้สำรวจ (ผ่าน `SurveyParticipant`)
- **Output**: รายการ `SurveyedBuilding` ที่ตรงเงื่อนไข (พร้อมข้อมูลสรุปสำคัญ: `building_name`, `overall_severity_level`, `review_status`)
- **กฎทางธุรกิจ**: หัวหน้าผู้สำรวจเห็นเฉพาะอาคารของทีมตน; หน่วยงานส่วนกลางเห็นทุกอาคารที่ `sync_status = ซิงค์สำเร็จ`
- **กรณี error**: ไม่มี (คืนรายการว่างเมื่อไม่พบ)
- **FR/NFR**: [[feature-list#12. ค้นหา/กรองรายการอาคารที่สำรวจแล้ว|FR-24]]

## 14. การทำงานออฟไลน์และซิงค์ข้อมูลภาคสนาม

รองรับ [[feature-list#13. การทำงานออฟไลน์และซิงค์ข้อมูลภาคสนาม|ฟีเจอร์ 13]] — ดำเนินการโดย [[architecture#2. Logical Component|Sync & Conflict Resolution Service]]

### 14.1 ซิงค์ข้อมูลแบบสำรวจที่ค้างจากอุปกรณ์

- **ผู้เรียกได้**: ผู้สำรวจภาคสนาม (เรียกอัตโนมัติโดย Field Client App ผ่านคิวรอซิงค์เมื่อมีสัญญาณ)
- **Input**: รายการระเบียนที่ค้างซิงค์ทั้งหมดจากอุปกรณ์ (`SurveyedBuilding`, `SurroundingHazard`, `ExternalDamage`, `StructuralDamage`, `ComponentDamage`, `ElectricalSystemDamage`, `DamagePhoto`, `AIAnalysisResult`, `Sketch`, `SurveyParticipant`) ระบุด้วย `client_generated_id` ของแต่ละระเบียน, `device_id`
- **Output**: สถานะการซิงค์ต่อระเบียน (`sync_status = ซิงค์สำเร็จ` พร้อม `id` ที่เซิร์ฟเวอร์กำหนดให้, หรือ `sync_status = มีความขัดแย้งรอแก้ไข`)
- **กฎทางธุรกิจ**: ต้องรองรับไฟล์ภาพขนาดใหญ่แบบทำต่อได้เมื่อสัญญาณขาดหาย (NFR-02) และรองรับหลายอุปกรณ์/หลายทีมซิงค์พร้อมกันจำนวนมาก (NFR-07) โดยไม่บล็อกการทำงานอื่นของ Field Client; ใช้ `client_generated_id` เป็น idempotency key กันบันทึกซ้ำ
- **กรณี error**: ไฟล์ภาพส่งไม่สำเร็จบางส่วน (ต้องส่งต่อได้โดยไม่ต้องเริ่มใหม่ทั้งหมด), พบข้อมูลชุดเดียวกันถูกแก้ไขจากหลายอุปกรณ์ → ส่งต่อไปยัง 14.2
- **FR/NFR**: [[feature-list#13. การทำงานออฟไลน์และซิงค์ข้อมูลภาคสนาม|NFR-01, NFR-02, NFR-04, NFR-07]]

### 14.2 ตรวจสอบ/แก้ไขความขัดแย้งของข้อมูลที่ซิงค์

- **ผู้เรียกได้**: ระบบภายใน (Sync & Conflict Resolution Service ไม่มีผู้ใช้เรียกตรง)
- **Input**: ระเบียนที่ขัดแย้งกัน (เทียบ `data_version`/`last_modified_at` ของ `SurveyedBuilding` หรือเทียบเนื้อหาของ entity ย่อยที่มี `client_generated_id` เดียวกันจากหลายอุปกรณ์)
- **Output**: ผลการ merge หรือสถานะ `sync_status = มีความขัดแย้งรอแก้ไข` พร้อมบันทึก `AuditTrailEntry` (`action_type = อื่นๆ`, หมายเหตุระบุรายละเอียดความขัดแย้ง)
- **กฎทางธุรกิจ**: ต้องมีกฎ merge/แจ้งเตือนที่ชัดเจนก่อนบันทึกเป็นข้อมูลจริง (กลยุทธ์ merge ที่เป็นรูปธรรมยังไม่ตัดสินใจ ดูหัวข้อ 15)
- **กรณี error**: ไม่สามารถ merge อัตโนมัติได้ → คงสถานะ `มีความขัดแย้งรอแก้ไข` ไว้จนกว่าจะมีการแก้ไข (กลไกแก้ไขด้วยมือยังไม่ถูกออกแบบ — ดู `## NEEDS_NEW_REQUIREMENT` ท้ายรายงาน)
- **FR/NFR**: [[feature-list#13. การทำงานออฟไลน์และซิงค์ข้อมูลภาคสนาม|NFR-03, NFR-07]]

## 15. ประเด็นรอตัดสินใจ

รอ [[technology-stack.md|technology-stack]] ก่อนตัดสินใจในรายการต่อไปนี้:

- รูปแบบการเรียก operation จริง (function call ภายใน monolith / message queue / API แบบใดก็ตาม) และ protocol การสื่อสาร
- รูปแบบไฟล์ที่ใช้ส่งออกรายงาน (12.1)
- กลยุทธ์ merge conflict ที่เป็นรูปธรรมใน 14.2 (last-write-wins / field-level merge / ต้องมีมนุษย์ตัดสินใจ)
- เกณฑ์ตัวเลขที่ยอมรับได้ของ `gps_accuracy_meters` และเกณฑ์ตรวจสอบคุณภาพภาพ (ความคมชัด/ความสว่างขั้นต่ำ) ใน NFR-06
- วิธีจัดเก็บ/ส่งไฟล์ภาพขนาดใหญ่แบบแบ่งส่วน/ทำต่อได้ใน 14.1

## เอกสารที่เกี่ยวข้อง

- [[db-spec]] — entity/attribute ที่ operation ทั้งหมดในเอกสารนี้ใช้งาน
- [[architecture]] — component ที่รับผิดชอบแต่ละกลุ่ม operation
- [[feature-list]] — ฟีเจอร์ทั้ง 14 รายการที่ operation ชุดนี้ต้องรองรับ
- [[backlog]] — รายการ FR/NFR ต้นทาง
