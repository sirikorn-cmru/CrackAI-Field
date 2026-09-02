# Component Design: การทำงานออฟไลน์และซิงค์ข้อมูลภาคสนาม

รองรับ [[feature-list#13. การทำงานออฟไลน์และซิงค์ข้อมูลภาคสนาม|ฟีเจอร์ 13]] (Must have) — อ้างอิง operation จาก [[api-spec#14. การทำงานออฟไลน์และซิงค์ข้อมูลภาคสนาม|api-spec หัวข้อ 14]] ดำเนินการโดย [[architecture#2. Logical Component|Sync & Conflict Resolution Service]]

เป็นกลไก cross-cutting ที่รองรับทุกฟีเจอร์ที่สร้างข้อมูลบนอุปกรณ์ขณะออฟไลน์: [[building-environment-info]], [[structural-damage-assessment]], [[ai-crack-photo-analysis]], [[additional-sketch]], [[surveyor-info-duration]] — ไฟล์นี้เป็นแหล่งอ้างอิงหลัก (single source) ของ lifecycle `sync_status`

## 1. Sequence Diagram

```mermaid
sequenceDiagram
    participant FC as Field Client App
    participant Queue as คิวรอซิงค์ในเครื่อง
    participant Sync as Sync & Conflict Resolution Service
    participant BE as Backend Service
    participant DB as Primary Data Store
    participant Media as Media/Object Storage

    Note over FC,Queue: ทุกระเบียนที่สร้าง/แก้ไขขณะออฟไลน์ (sync_status=ยังไม่ซิงค์) ถูกเพิ่มเข้าคิวอัตโนมัติ
    Note over FC,Queue: อุปกรณ์กลับมามีสัญญาณ
    Queue->>Sync: 14.1 ซิงค์ข้อมูลแบบสำรวจที่ค้างจากอุปกรณ์ (ระบุด้วย client_generated_id + device_id)
    Sync->>Sync: ตรวจสอบ client_generated_id เป็น idempotency key กันบันทึกซ้ำ
    alt ไม่พบความขัดแย้ง
        Sync->>DB: บันทึกข้อมูลเชิงโครงสร้าง + กำหนด id ฝั่งเซิร์ฟเวอร์ (client_generated_id ของทุก entity ที่ระบุใช้เป็น idempotency key)
        Sync->>Media: บันทึกไฟล์ภาพ/ภาพวาด (รองรับทำต่อได้เมื่อสัญญาณขาดหาย)
        Sync->>DB: สร้าง AuditTrailEntry ต่อ SurveyedBuilding ที่ซิงค์สำเร็จแต่ละอาคาร (related_entity_name=SurveyedBuilding, action_type=ซิงค์ข้อมูลสำเร็จ, performed_by_user_id ไม่บังคับ, note=device_id ต้นทาง) (NFR-05)
        Sync-->>Queue: sync_status=ซิงค์สำเร็จ
    else พบ SurveyedBuilding ชุดเดียวกันถูกแก้ไขจากหลายอุปกรณ์ (เทียบ data_version/last_modified_at ระดับอาคารแม่เท่านั้น)
        Sync->>Sync: 14.2 ตรวจสอบ/แก้ไขความขัดแย้งของข้อมูลที่ซิงค์
        alt merge อัตโนมัติสำเร็จ
            Sync->>DB: บันทึกผล merge
            Sync->>DB: สร้าง AuditTrailEntry (related_entity_name=SurveyedBuilding, action_type=ซิงค์ข้อมูลสำเร็จ, performed_by_user_id ไม่บังคับ) (NFR-05)
            Sync-->>Queue: sync_status=ซิงค์สำเร็จ
        else merge อัตโนมัติไม่ได้
            Sync->>DB: สร้าง SyncConflict (status=รอแก้ไขด้วยมือ) + SyncConflictVersion เก็บทุกเวอร์ชันที่ส่งเข้ามา
            Sync->>DB: สร้าง AuditTrailEntry เสมอ (related_entity_name=SurveyedBuilding, action_type=ตรวจพบความขัดแย้งของข้อมูล, performed_by_user_id ไม่บังคับ) (NFR-05)
            Sync-->>Queue: sync_status=มีความขัดแย้งรอแก้ไข
            Note over Sync,DB: ส่งต่อให้หัวหน้าผู้สำรวจ/ผู้ดูแลระบบแก้ไขด้วยมือ — ดู [[manual-conflict-resolution]]
        end
    end
    Sync->>BE: แจ้งผลการซิงค์
```

## 2. Operation ↔ Entity ที่กระทบ

| Operation ([[api-spec#14. การทำงานออฟไลน์และซิงค์ข้อมูลภาคสนาม\|api-spec 14.x]]) | Entity ที่กระทบ | การกระทำ | ลำดับ/เงื่อนไข |
|---|---|---|---|
| 14.1 ซิงค์ข้อมูลแบบสำรวจที่ค้างจากอุปกรณ์ | [[db-spec#4.1 SurveyedBuilding\|SurveyedBuilding]], [[db-spec#6.1 DamagePhoto\|DamagePhoto]], [[db-spec#6.3 Sketch\|Sketch]] (มี `client_generated_id`/`sync_status` ของตัวเอง) + [[db-spec#4.2 SurveyParticipant\|SurveyParticipant]], [[db-spec#5.1 SurroundingHazard\|SurroundingHazard]], [[db-spec#5.2 ExternalDamage\|ExternalDamage]], [[db-spec#5.3 StructuralDamage\|StructuralDamage]], [[db-spec#5.4 ComponentDamage\|ComponentDamage]], [[db-spec#5.5 ElectricalSystemDamage\|ElectricalSystemDamage]] (มี `client_generated_id` เพื่อ idempotent upsert เท่านั้น — ไม่มี `sync_status` ของตัวเอง ดูหัวข้อ 5), [[db-spec#7.2 AuditTrailEntry\|AuditTrailEntry]] (สร้างต่อ `SurveyedBuilding` ที่ซิงค์สำเร็จแต่ละอาคาร — `action_type = ซิงค์ข้อมูลสำเร็จ`, `performed_by_user_id` ไม่บังคับเพราะระบบเป็นผู้บันทึกเอง) | สร้าง/กำหนด id ฝั่งเซิร์ฟเวอร์ + สร้าง audit entry | ใช้ `client_generated_id` เป็น idempotency key กันบันทึกซ้ำสำหรับทุก entity ที่ระบุ; ต้องทำหลังระเบียนต้นทางถูกสร้างในฟีเจอร์ 1/2/4/5/6 แล้ว; audit entry ถูกสร้างหลังบันทึกข้อมูล/ไฟล์สำเร็จเสมอ (NFR-05) |
| 14.2 ตรวจสอบ/แก้ไขความขัดแย้งของข้อมูลที่ซิงค์ | [[db-spec#4.1 SurveyedBuilding\|SurveyedBuilding]] (เทียบ `data_version`/`last_modified_at` — **ระดับ aggregate เท่านั้น**), [[db-spec#8.1 SyncConflict\|SyncConflict]] (สร้างเมื่อ merge อัตโนมัติไม่ได้), [[db-spec#8.2 SyncConflictVersion\|SyncConflictVersion]] (สร้างต่อเวอร์ชันที่ขัดแย้ง), [[db-spec#7.2 AuditTrailEntry\|AuditTrailEntry]] (สร้างเสมอทั้ง 2 กรณี — merge อัตโนมัติสำเร็จ: `action_type = ซิงค์ข้อมูลสำเร็จ`; merge ไม่ได้: `action_type = ตรวจพบความขัดแย้งของข้อมูล`; `performed_by_user_id` ไม่บังคับทั้งคู่เพราะระบบเป็นผู้บันทึกเอง) | เปรียบเทียบ + สร้าง | ทำงานเป็นส่วนหนึ่งของ 14.1 เมื่อพบความขัดแย้งเท่านั้น ไม่มีผู้ใช้เรียกตรง; เมื่อ merge ไม่ได้ ส่งต่อให้มนุษย์ตัดสินใจผ่าน [[manual-conflict-resolution]] เสมอ; audit entry ต้องถูกสร้างเสมอไม่ว่าผลจะเป็นแบบใด (NFR-05) |

## 3. State Diagram: sync_status

```mermaid
stateDiagram-v2
    [*] --> ยังไม่ซิงค์ : สร้าง/แก้ไขระเบียนบนอุปกรณ์ขณะออฟไลน์
    ยังไม่ซิงค์ --> กำลังซิงค์ : 14.1 เริ่มส่งข้อมูล/ไฟล์เมื่อกลับมามีสัญญาณ
    กำลังซิงค์ --> ซิงค์สำเร็จ : 14.1 บันทึกสำเร็จ (ไม่พบความขัดแย้ง หรือ merge อัตโนมัติสำเร็จ)
    กำลังซิงค์ --> มีความขัดแย้งรอแก้ไข : 14.2 ตรวจพบ SurveyedBuilding ชุดเดียวกันถูกแก้ไขจากหลายอุปกรณ์ และ merge อัตโนมัติไม่ได้
    กำลังซิงค์ --> ยังไม่ซิงค์ : ไฟล์ภาพส่งไม่สำเร็จบางส่วน/สัญญาณขาดหาย (ทำต่อได้ภายหลัง ไม่ต้องเริ่มใหม่ทั้งหมด)
    มีความขัดแย้งรอแก้ไข --> ซิงค์สำเร็จ : 15.2 แก้ไขความขัดแย้งด้วยมือสำเร็จ (ดู [[manual-conflict-resolution]])
    ซิงค์สำเร็จ --> [*]
```

## 4. ขอบเขตของ conflict detection (ปิดช่องว่างเดิมแล้ว)

ช่องว่างที่เคยรายงานไว้ 2 จุด **ถูกปิดแล้วโดย `api-db-writer`**:

1. **กลไกแก้ไขความขัดแย้งด้วยมือ** — เพิ่ม FR-30/FR-31 และ operation 15.1/15.2 ครบแล้ว ดูรายละเอียดเต็มที่ [[manual-conflict-resolution]] (แทนที่จะเป็นสถานะค้างถาวรตามที่เคยระบุไว้)
2. **`client_generated_id` ของ entity ย่อย** — เพิ่มให้ `SurveyParticipant`/`SurroundingHazard`/`ExternalDamage`/`StructuralDamage`/`ComponentDamage`/`ElectricalSystemDamage` แล้ว **แต่ขอบเขตถูกจำกัดชัดเจน**: ใช้เพื่อ idempotent upsert (กันบันทึกซ้ำเมื่อซิงค์) และเป็นจุดอ้างอิงที่เสถียรให้ `DamagePhoto.linked_area_id` ชี้มาเท่านั้น **entity ย่อยเหล่านี้ไม่มี `sync_status` ของตัวเองและไม่ถูกตรวจจับความขัดแย้งเป็นรายระเบียน** — conflict detection (การเทียบ `data_version`/`last_modified_at`) ยังอยู่ที่ระดับ `SurveyedBuilding` (aggregate) เพียงจุดเดียวเท่านั้นตามที่ [[db-spec#10. กฎทางธุรกิจที่กระทบโครงสร้างข้อมูล|db-spec หัวข้อ 10]] ระบุไว้เดิม ไม่ได้ขยายเป็นการตรวจ conflict รายระเบียนย่อยแต่อย่างใด

กลยุทธ์ **auto-merge** ที่เป็นรูปธรรม (ก่อนตัดสินว่า "merge ไม่ได้" ต้องส่งต่อ 15) ยังไม่ตัดสินใจ รอ `technology-stack.md` ตาม [[api-spec#16. ประเด็นรอตัดสินใจ|api-spec หัวข้อ 16]]

## 5. Edge Case และวิธีจัดการ

| Edge Case | วิธีจัดการ | อ้างอิง |
|---|---|---|
| ไฟล์ภาพส่งไม่สำเร็จบางส่วน (สัญญาณขาดหาย) | ต้องส่งต่อได้โดยไม่ต้องเริ่มใหม่ทั้งหมด (NFR-02) | [[api-spec#14. การทำงานออฟไลน์และซิงค์ข้อมูลภาคสนาม\|api-spec 14.1]] |
| พบข้อมูลชุดเดียวกันถูกแก้ไขจากหลายอุปกรณ์ | ส่งต่อไปยัง 14.2 เพื่อตรวจจับ/แก้ไขความขัดแย้ง | [[api-spec#14. การทำงานออฟไลน์และซิงค์ข้อมูลภาคสนาม\|api-spec 14.1, 14.2]] |
| ไม่สามารถ merge อัตโนมัติได้ | สร้าง `SyncConflict`+`SyncConflictVersion` แล้วส่งต่อให้หัวหน้าผู้สำรวจ/ผู้ดูแลระบบแก้ไขด้วยมือผ่าน [[manual-conflict-resolution]] | [[api-spec#14. การทำงานออฟไลน์และซิงค์ข้อมูลภาคสนาม\|api-spec 14.2]] |
| หลายทีมซิงค์พร้อมกันจำนวนมากหลังเกิดเหตุ | ต้องไม่บล็อกการทำงานอื่นของ Field Client (NFR-07) เข้าคิวผ่าน Server-side Sync Intake Queue ก่อนประมวลผล | [[api-spec#14. การทำงานออฟไลน์และซิงค์ข้อมูลภาคสนาม\|api-spec 14.1]] |
| แอปถูกปิด/เครื่องดับกลางคันระหว่างที่มีระเบียนค้างในคิวรอซิงค์ (สภาพแวดล้อมกลางแจ้งพื้นที่ภัยพิบัติ, NFR-04) | ระเบียนที่บันทึกแล้วในที่เก็บข้อมูล/ไฟล์ในเครื่องต้องคงอยู่ครบถ้วนหลังเปิดแอปใหม่ (ไม่สูญหาย) และคิวรอซิงค์ต้องกลับมาทำงานต่อจากจุดเดิมได้เองโดยผู้สำรวจไม่ต้องกรอกซ้ำ | NFR-04, NFR-01 |

## เอกสารที่เกี่ยวข้อง

- [[api-spec]], [[db-spec]], [[feature-list]], [[user-journey]], [[architecture]]
- [[building-environment-info]], [[structural-damage-assessment]], [[ai-crack-photo-analysis]], [[additional-sketch]], [[surveyor-info-duration]] — ฟีเจอร์ต้นทางของข้อมูลที่ต้องซิงค์
- [[survey-review-signature]], [[dashboard-overview]], [[search-filter-buildings]] — ใช้เงื่อนไข `sync_status = ซิงค์สำเร็จ` ก่อนดำเนินการ
- [[manual-conflict-resolution]] — ขั้นตอนต่อเนื่องเมื่อ merge อัตโนมัติไม่ได้
