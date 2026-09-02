# Component Design: บันทึกข้อมูลอาคารและสภาพแวดล้อม

รองรับ [[feature-list#1. บันทึกข้อมูลอาคารและสภาพแวดล้อม|ฟีเจอร์ 1]] (Must have) — อ้างอิง operation จาก [[api-spec#4. บันทึกข้อมูลอาคารและสภาพแวดล้อม|api-spec หัวข้อ 4]] และ entity จาก [[db-spec#4.1 SurveyedBuilding|SurveyedBuilding]], [[db-spec#5.1 SurroundingHazard|SurroundingHazard]] ดู journey เต็มที่ [[user-journey]]

ทำงานทั้งหมดขณะออฟไลน์ได้ (NFR-01) บน [[architecture#2. Logical Component|Field Client App]] — ดูรายละเอียดวงจรซิงค์เต็มที่ [[offline-sync]]

## 1. Sequence Diagram

```mermaid
sequenceDiagram
    actor FS as ผู้สำรวจภาคสนาม
    participant FC as Field Client App
    participant Local as ที่เก็บข้อมูล/ไฟล์ในเครื่อง

    FS->>FC: กรอกข้อมูลทั่วไปของอาคาร + พิกัด GPS
    FC->>FC: ตรวจสอบ building_use_type ถูกต้อง / ตรวจ gps_accuracy_meters (NFR-06)
    alt gps_accuracy_meters แย่กว่าเกณฑ์ที่ยอมรับได้
        FC-->>FS: แจ้งเตือนความแม่นยำ GPS ต่ำ (ไม่บล็อกการทำงานต่อ)
    end
    FC->>Local: 4.1 เริ่มต้นแบบสำรวจอาคารใหม่ → สร้าง SurveyedBuilding<br/>(review_status=ฉบับร่าง, sync_status=ยังไม่ซิงค์, data_version=1)
    FS->>FC: กรอกข้อมูลกายภาพอาคาร (จำนวนชั้น/พื้นที่/โครงสร้าง/วัสดุผนัง)
    FC->>Local: 4.2 บันทึก/แก้ไขข้อมูลกายภาพอาคาร → ปรับปรุง SurveyedBuilding (data_version +1)
    FS->>FC: บันทึกอันตรายโดยรอบอาคาร (ทำซ้ำได้หลายรายการ)
    FC->>Local: 4.3 บันทึกอันตรายโดยรอบอาคาร → สร้าง SurroundingHazard ต่อรายการ
    Note over FC,Local: ระเบียนทั้งหมดรอในคิวซิงค์จนกว่าจะมีสัญญาณ — ดู [[offline-sync]]
```

## 2. Operation ↔ Entity ที่กระทบ

| Operation ([[api-spec#4. บันทึกข้อมูลอาคารและสภาพแวดล้อม\|api-spec 4.x]]) | Entity ที่กระทบ | การกระทำ | ลำดับ/เงื่อนไข |
|---|---|---|---|
| 4.1 เริ่มต้นแบบสำรวจอาคารใหม่ | [[db-spec#4.1 SurveyedBuilding\|SurveyedBuilding]] | สร้าง | ต้องทำก่อนเสมอ — `client_generated_id` ที่ได้เป็นตัวอ้างอิงของทุก operation ถัดไปในฟีเจอร์ 1-9 |
| 4.2 บันทึก/แก้ไขข้อมูลกายภาพอาคาร | [[db-spec#4.1 SurveyedBuilding\|SurveyedBuilding]] | แก้ไข | ทำได้ซ้ำหลายครั้งหลัง 4.1 จนกว่า `review_status = รับรองแล้ว` |
| 4.3 บันทึกอันตรายโดยรอบอาคาร | [[db-spec#5.1 SurroundingHazard\|SurroundingHazard]] | สร้าง (1 อาคาร : N รายการ) | ทำได้หลัง 4.1 เท่านั้น (ต้องมี `SurveyedBuilding.client_generated_id` อยู่ก่อน) |

## 3. State ที่เริ่มต้นในฟีเจอร์นี้ (ไม่ใช่ lifecycle เต็ม)

ฟีเจอร์นี้เป็นจุด**กำเนิด** ของสถานะสองชุดที่ถูกจัดการเต็มรูปแบบในเอกสารอื่น — แสดงเฉพาะจุดเริ่มต้นที่นี่:

```mermaid
stateDiagram-v2
    [*] --> ฉบับร่าง : 4.1 สร้าง SurveyedBuilding
    ฉบับร่าง --> รอตรวจทาน_เป็นต้นไป : ดู lifecycle เต็มที่ survey-review-signature
```

- `SurveyedBuilding.review_status` เริ่มที่ `ฉบับร่าง` เสมอเมื่อสร้างด้วย 4.1 — lifecycle เต็ม (รวมช่องว่างที่พบใน api-spec) อยู่ที่ [[survey-review-signature#3. State Diagram: review_status|survey-review-signature]]
- `SurveyedBuilding.sync_status` เริ่มที่ `ยังไม่ซิงค์` เสมอเมื่อสร้างด้วย 4.1 — lifecycle เต็มอยู่ที่ [[offline-sync#3. State Diagram: sync_status|offline-sync]]

## 4. Edge Case และวิธีจัดการ

| Edge Case | วิธีจัดการ | อ้างอิง |
|---|---|---|
| `client_generated_id` ซ้ำกับระเบียนที่มีอยู่แล้วบนอุปกรณ์เดียวกัน | ปฏิเสธการสร้างซ้ำ ให้ผู้สำรวจแก้ไขระเบียนเดิมแทน | [[api-spec#4. บันทึกข้อมูลอาคารและสภาพแวดล้อม\|api-spec 4.1]] |
| ไม่มีสัญญาณ GPS ขณะเริ่มแบบสำรวจ | บันทึกไม่ได้จนกว่าจะได้พิกัด (GPS เป็น field จำเป็น) — ต้องรอสัญญาณ GPS ของอุปกรณ์เอง ไม่เกี่ยวกับสัญญาณอินเทอร์เน็ต | [[api-spec#4. บันทึกข้อมูลอาคารและสภาพแวดล้อม\|api-spec 4.1]] |
| `gps_accuracy_meters` แย่กว่าเกณฑ์ที่ยอมรับได้ | แจ้งเตือนผู้สำรวจก่อนยอมรับการบันทึก แต่ไม่บล็อกการทำงานต่อขณะออฟไลน์ (เกณฑ์ตัวเลขจริงยังไม่กำหนด — รอ `technology-stack.md`) | NFR-06, [[api-spec#16. ประเด็นรอตัดสินใจ\|api-spec หัวข้อ 16]] |
| พยายามแก้ไขข้อมูลกายภาพของระเบียนที่ `review_status = รับรองแล้ว` | ปฏิเสธการแก้ไข | [[api-spec#4. บันทึกข้อมูลอาคารและสภาพแวดล้อม\|api-spec 4.2]] |
| บันทึกอันตรายโดยรอบอาคารโดยไม่พบ `SurveyedBuilding` ที่อ้างอิง | ปฏิเสธการบันทึก | [[api-spec#4. บันทึกข้อมูลอาคารและสภาพแวดล้อม\|api-spec 4.3]] |

## 5. Edge Case เพิ่มเติมสำหรับการใช้งานกลางแจ้งในพื้นที่ภัยพิบัติ (NFR-04)

ระบุตาม `nfr-review.md` ที่พบว่า NFR-04 (Usability/Compatibility) ยังไม่มี edge case รองรับในชั้น detailed-design — ฟีเจอร์นี้เป็นจุดเริ่มต้นของการกรอกแบบสำรวจที่ยาวหลายหมวด จึงเป็นจุดเสี่ยงข้อมูลสูญหายสูงสุด:

| Edge Case | วิธีจัดการ | อ้างอิง |
|---|---|---|
| กรอกข้อมูลอาคาร/สภาพแวดล้อมค้างอยู่ระหว่างหมวด แล้วแอปถูกปิด/เครื่องดับกลางคัน (แบตหมด/สลับแอปกะทันหันกลางแจ้ง) | ค่าที่กรอกแล้วในแต่ละ field ต้องถูกบันทึกลง [[db-spec#4.1 SurveyedBuilding\|SurveyedBuilding]] ทันทีที่กรอกเสร็จแต่ละ field/หมวดย่อย (ไม่ต้องรอกดบันทึกท้ายฟอร์มทั้งหมด) เพื่อไม่ให้ข้อมูลที่กรอกไปแล้วหายเมื่อเปิดแอปใหม่ | NFR-04, NFR-01 |
| ผู้สำรวจสวมถุงมือ/มือเปียกจากสภาพน้ำท่วมขณะกดเลือกตัวเลือก (เช่น `building_use_type`, `hazard_type`) | ตัวเลือกที่ต้องเลือกต้องมีขนาดสัมผัสใหญ่พอสำหรับการกดพลาดต่ำ ไม่ใช้การกดแบบต้องแม่นยำสูง (drag/pinch ละเอียด) | NFR-04 |
| อ่านหน้าจอกลางแดดจ้าไม่ชัด ระบุค่าพิกัด/ความแม่นยำ GPS ผิดโดยไม่ตั้งใจ | ข้อความแจ้งเตือนสำคัญ (เช่นแจ้ง `gps_accuracy_meters` แย่กว่าเกณฑ์ในหัวข้อ 4.1) ต้องมีความคมชัด/คอนทราสต์สูงพออ่านได้กลางแจ้ง ไม่พึ่งพาสีเพียงอย่างเดียวในการสื่อความหมาย | NFR-04, NFR-06 |
| ใช้งานบนอุปกรณ์ขนาดหน้าจอต่างกัน (มือถือจอเล็ก/แท็บเล็ตจอใหญ่) | เนื้อหาฟอร์มยาวหลายหมวดต้องแสดงผล/เลื่อนดูได้ครบถ้วนโดยไม่มี field ใดถูกตัดขาดหรือเข้าถึงไม่ได้บนขนาดหน้าจอใดๆ | NFR-04 |

## เอกสารที่เกี่ยวข้อง

- [[api-spec]], [[db-spec]], [[feature-list]], [[user-journey]], [[architecture]]
- [[offline-sync]] — วงจรซิงค์เต็มของ `sync_status`
- [[survey-review-signature]] — วงจรเต็มของ `review_status`
