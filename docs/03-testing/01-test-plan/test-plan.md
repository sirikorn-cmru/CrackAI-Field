# แผนการทดสอบ (Test Plan)

เอกสารนี้สรุปภาพรวมกลยุทธ์การทดสอบทั้งหมดของโปรเจกต์ระบบสำรวจความเสียหายขั้นต้นของโครงสร้างอาคารหลังเหตุการณ์อุทกภัย อ้างอิงขอบเขตจาก [[feature-list]], [[user-journey]] และ [[backlog]] เป็นแหล่งความจริงว่า "มีอะไรบ้างที่ต้องทดสอบ" รายละเอียดเกณฑ์ยอมรับต่อรหัส FR/NFR อยู่ใน [[acceptance-criteria]] และ test case แบบ step-by-step อยู่ใน `test-cases/{feature-slug}.md`

## 1. Scope (ขอบเขตการทดสอบ)

ทดสอบครบทั้ง 14 ฟีเจอร์ตาม [[feature-list]] (36 รหัส FR-01–FR-27, NFR-01–NFR-09) ครอบคลุม 4 บทบาทผู้ใช้ตาม [[user-journey]]: ผู้สำรวจภาคสนาม, หัวหน้าผู้สำรวจ, ผู้ดูแลระบบ, หน่วยงานส่วนกลาง/ผู้บริหาร

| # | ฟีเจอร์ | MoSCoW | ไฟล์ test case |
|---|---|---|---|
| 1 | บันทึกข้อมูลอาคารและสภาพแวดล้อม | Must have | `test-cases/building-environment-info.md` |
| 2 | ประเมินความเสียหายโครงสร้างและส่วนประกอบอาคารแยกตามหมวด | Must have | `test-cases/structural-damage-assessment.md` |
| 3 | สรุปผลประเมินเป็น 3 ระดับสีพร้อมเกณฑ์อ้างอิงคู่มือ | Must have | `test-cases/damage-color-summary.md` |
| 4 | ถ่ายภาพและวิเคราะห์รอยร้าวด้วย AI (Human-in-the-loop) | Must have | `test-cases/ai-crack-photo-analysis.md` |
| 5 | วาดภาพประกอบเพิ่มเติม | Should have | `test-cases/additional-sketch.md` |
| 6 | บันทึกข้อมูลผู้สำรวจและระยะเวลาการสำรวจ | Must have | `test-cases/surveyor-info-duration.md` |
| 7 | ตรวจทานและรับรองผลสำรวจด้วยลายเซ็นดิจิทัล | Must have | `test-cases/survey-review-signature.md` |
| 8 | มอบหมายงานสำรวจให้ทีม | Should have | `test-cases/team-assignment.md` |
| 9 | จัดการผู้ใช้และสิทธิ์การเข้าถึง | Must have | `test-cases/user-management.md` |
| 10 | Dashboard ภาพรวมผลสำรวจ | Must have | `test-cases/dashboard-overview.md` |
| 11 | ส่งออกรายงานผลการสำรวจ | Should have | `test-cases/export-report.md` |
| 12 | ค้นหา/กรองรายการอาคารที่สำรวจแล้ว | Should have | `test-cases/search-filter-buildings.md` |
| 13 | การทำงานออฟไลน์และซิงค์ข้อมูลภาคสนาม | Must have | `test-cases/offline-sync.md` |
| 14 | ยืนยันตัวตนและเข้าสู่ระบบ | Must have | `test-cases/authentication-login.md` |

นอกขอบเขต (ไม่มีระบุใน spec/feature-list ให้ทดสอบในรอบนี้):
- รูปแบบไฟล์ที่ส่งออกจริงของฟีเจอร์ 11 (FR-23) — spec ระบุว่ารูปแบบไฟล์ยังไม่กำหนด รอการตัดสินใจด้าน `technology-stack.md` จึงทดสอบได้เฉพาะพฤติกรรมเชิงตรรกะ (ข้อมูลตรง/มีไฟล์ให้ดาวน์โหลด/แจ้งเตือนเมื่อไม่มีข้อมูล) ไม่ใช่รูปแบบไฟล์เจาะจง
- การทดสอบด้านความปลอดภัยเชิงลึกระดับ penetration testing ไม่อยู่ในขอบเขตเอกสารชุดนี้ (ครอบคลุมเฉพาะ functional security testing ตาม NFR-08/NFR-09)

## 2. ประเภทการทดสอบ

### Functional Testing (ต่อกลุ่ม FR)
- ข้อมูลอาคารและสภาพแวดล้อม (FR-01–FR-04)
- การประเมินความเสียหาย (FR-05–FR-09)
- การสรุปผลเป็นระดับสีและเกณฑ์อ้างอิง (FR-10, FR-11)
- ภาพถ่ายและ AI วิเคราะห์รอยร้าว รวม human-in-the-loop confirmation (FR-12–FR-14)
- ภาพวาดประกอบ (FR-15)
- ข้อมูลผู้สำรวจและระยะเวลา (FR-16, FR-17)
- การตรวจทาน/รับรองผลด้วยลายเซ็นดิจิทัล (FR-18, FR-19)
- การมอบหมายงาน (FR-20)
- การจัดการผู้ใช้และสิทธิ์ (FR-21)
- Dashboard ภาพรวม (FR-22)
- การส่งออกรายงาน (FR-23)
- การค้นหา/กรอง (FR-24)
- การยืนยันตัวตนและควบคุมสิทธิ์ (FR-25–FR-27)

### Non-Functional Testing (ต่อ NFR แต่ละด้าน)
- **Availability / Offline Support Testing** — NFR-01: ทดสอบว่าฟังก์ชันหลัก (ฟีเจอร์ 1-6) ใช้งานได้ครบขณะไม่มีสัญญาณอินเทอร์เน็ต
- **Performance / Reliability Testing** — NFR-02: ทดสอบความสำเร็จและความต่อเนื่องของการซิงค์ข้อมูลอัตโนมัติ รวมกรณีซิงค์ถูกขัดจังหวะ
- **Data Integrity Testing** — NFR-03: ทดสอบการตรวจจับและจัดการความขัดแย้งของข้อมูลเมื่อหลายอุปกรณ์แก้ไขข้อมูลชุดเดียวกัน
- **Usability / Compatibility Testing** — NFR-04: ทดสอบการใช้งานจริงบนมือถือ/แท็บเล็ตในสภาพแวดล้อมกลางแจ้งหลังน้ำท่วม
- **Auditability Testing** — NFR-05: ทดสอบว่าประวัติการแก้ไขผลวิเคราะห์ของ AI ถูกบันทึกครบและแก้ไขย้อนหลังไม่ได้
- **Accuracy Testing** — NFR-06: ทดสอบความแม่นยำของพิกัด GPS เทียบกับเกณฑ์ที่กำหนด
- **Scalability Testing** — NFR-07: ทดสอบการรองรับหลายทีมซิงค์ข้อมูลพร้อมกันจำนวนมาก
- **Security Testing** — NFR-08, NFR-09: ทดสอบการบังคับสิทธิ์ตามบทบาท และอายุ/การหมดอายุของ credential ที่แคชไว้สำหรับการเข้าสู่ระบบออฟไลน์

## 3. Environment (สภาพแวดล้อมการทดสอบ)

`docs/02-design/02-technical/technology-stack.md` ยังไม่มีการตัดสินใจเรื่อง tech stack ในโปรเจกต์นี้ — **รอกำหนด tech stack ก่อน** จึงยังไม่สามารถระบุ environment เชิงเทคนิค (อุปกรณ์ทดสอบจริง, เวอร์ชันระบบปฏิบัติการ, เครื่องมือทดสอบอัตโนมัติ, ระบบจัดการ test execution) ได้ในตอนนี้ เมื่อมีการตัดสินใจ tech stack แล้วให้กลับมาเติมเนื้อหาส่วนนี้

สิ่งที่ระบุได้แล้วจาก NFR-04 (ไม่ผูก tech stack): ต้องทดสอบบนอุปกรณ์มือถือ/แท็บเล็ตภายใต้สภาพแวดล้อมกลางแจ้งจำลอง (แสงจ้า/ฝุ่น/ความชื้น) เพื่อให้ครอบคลุมสภาพการใช้งานจริงหลังเหตุอุทกภัย

## 4. Entry Criteria (เกณฑ์เริ่มทดสอบ)

- [[feature-list]] และ [[user-journey]] มีเนื้อหาครบและสอดคล้องกับ [[backlog]] แล้ว (ตรวจสอบแล้วในรอบนี้)
- [[acceptance-criteria]] เขียนครบทุกรหัส FR/NFR ที่เกี่ยวข้องกับฟีเจอร์ที่จะทดสอบ
- มี test case แบบ step-by-step ในไฟล์ `test-cases/{feature-slug}.md` ของฟีเจอร์นั้นแล้ว
- (เมื่อเริ่มพัฒนาจริง) มี build/environment ที่พร้อมให้ทดสอบตามที่จะระบุใน `technology-stack.md`

## 5. Exit Criteria (เกณฑ์ผ่านการทดสอบ)

- Test case ทั้งหมดของฟีเจอร์ระดับ Must have (MVP) ผ่านผลลัพธ์ตามที่คาดหวัง 100%
- Test case ของฟีเจอร์ระดับ Should have ผ่านผลลัพธ์ตามที่คาดหวังอย่างน้อย 90% หรือมีแผนแก้ไขข้อบกพร่องที่เหลือชัดเจนก่อน release
- ไม่มี defect ระดับวิกฤต (critical) ที่กระทบการทำงานออฟไลน์ (NFR-01–NFR-04), ความถูกต้องของการสรุปผล 3 ระดับสี (FR-10), หรือกลไก human-in-the-loop ของ AI (FR-14) ค้างอยู่
- ผลการรันทดสอบถูกบันทึกไว้ใน `docs/03-testing/02-test-result/` (เมื่อมีซอร์สโค้ดให้ทดสอบจริง — ปัจจุบันโฟลเดอร์นี้ยังไม่มีเนื้อหาเพราะยังไม่มีการพัฒนา)

## 6. บทบาทผู้ทดสอบ

| บทบาทในระบบ | ขอบเขตที่ต้องทดสอบเป็นหลัก |
|---|---|
| ผู้สำรวจภาคสนาม (Field Surveyor) | ฟีเจอร์ 1-6, 13 และการเข้าสู่ระบบออฟไลน์ในฟีเจอร์ 14 |
| หัวหน้าผู้สำรวจ (Survey Lead) | ฟีเจอร์ 7, 8, 12 และการเข้าสู่ระบบ/สิทธิ์ทั่วไปในฟีเจอร์ 14 |
| ผู้ดูแลระบบ (System Admin) | ฟีเจอร์ 9 และการเข้าสู่ระบบ/สิทธิ์ทั่วไปในฟีเจอร์ 14 |
| หน่วยงานส่วนกลาง/ผู้บริหาร (Central Agency / Executive) | ฟีเจอร์ 10, 11, 12 และการเข้าสู่ระบบ/สิทธิ์ทั่วไปในฟีเจอร์ 14 |

## 7. ตารางสรุปฟีเจอร์ ↔ ไฟล์ test case ↔ จำนวน AC ที่ครอบคลุม

| # | ฟีเจอร์ | ไฟล์ test case | รหัส FR/NFR | จำนวน AC ใน [[acceptance-criteria]] |
|---|---|---|---|---|
| 1 | บันทึกข้อมูลอาคารและสภาพแวดล้อม | `test-cases/building-environment-info.md` | FR-01, FR-02, FR-03, FR-04, NFR-06 | 9 |
| 2 | ประเมินความเสียหายโครงสร้างและส่วนประกอบอาคารแยกตามหมวด | `test-cases/structural-damage-assessment.md` | FR-05, FR-06, FR-07, FR-08, FR-09 | 8 |
| 3 | สรุปผลประเมินเป็น 3 ระดับสีพร้อมเกณฑ์อ้างอิงคู่มือ | `test-cases/damage-color-summary.md` | FR-10, FR-11 | 4 |
| 4 | ถ่ายภาพและวิเคราะห์รอยร้าวด้วย AI (Human-in-the-loop) | `test-cases/ai-crack-photo-analysis.md` | FR-12, FR-13, FR-14, NFR-05 | 7 |
| 5 | วาดภาพประกอบเพิ่มเติม | `test-cases/additional-sketch.md` | FR-15 | 2 |
| 6 | บันทึกข้อมูลผู้สำรวจและระยะเวลาการสำรวจ | `test-cases/surveyor-info-duration.md` | FR-16, FR-17 | 3 |
| 7 | ตรวจทานและรับรองผลสำรวจด้วยลายเซ็นดิจิทัล | `test-cases/survey-review-signature.md` | FR-18, FR-19 | 4 |
| 8 | มอบหมายงานสำรวจให้ทีม | `test-cases/team-assignment.md` | FR-20 | 2 |
| 9 | จัดการผู้ใช้และสิทธิ์การเข้าถึง | `test-cases/user-management.md` | FR-21, NFR-08 | 4 |
| 10 | Dashboard ภาพรวมผลสำรวจ | `test-cases/dashboard-overview.md` | FR-22 | 2 |
| 11 | ส่งออกรายงานผลการสำรวจ | `test-cases/export-report.md` | FR-23 | 2 |
| 12 | ค้นหา/กรองรายการอาคารที่สำรวจแล้ว | `test-cases/search-filter-buildings.md` | FR-24 | 2 |
| 13 | การทำงานออฟไลน์และซิงค์ข้อมูลภาคสนาม | `test-cases/offline-sync.md` | NFR-01, NFR-02, NFR-03, NFR-04, NFR-07 | 6 |
| 14 | ยืนยันตัวตนและเข้าสู่ระบบ | `test-cases/authentication-login.md` | FR-25, FR-26, FR-27, NFR-09 | 8 |

รวม 63 AC ครอบคลุมครบ 36 รหัส FR/NFR ทั้งหมดตาม [[backlog]]
