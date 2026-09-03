# Technology Stack

เอกสารนี้บันทึกว่า **เลือกอะไร เพราะอะไร ไม่เลือกอะไรเพราะอะไร และอะไรยังไม่ตัดสินใจ** สำหรับ tech stack ของระบบ อ้างอิง [[backlog]] (FR/NFR ต้นทาง) และ [[architecture]] (ข้อจำกัดเชิงสถาปัตยกรรมที่ตัดสินไปแล้ว) เอกสารนี้**ไม่ derive จาก FR/NFR แบบ mechanical** — ทุกแถวในหัวข้อ 3 คือสิ่งที่ผู้ใช้เลือกเองจริงหลังผ่านการสัมภาษณ์ ไม่ใช่ผลคำนวณอัตโนมัติ

## 1. สถานะการตัดสินใจ

**อัปเดตล่าสุด: 2026-09-03**

- **ตัดสินใจแล้ว 5 ชั้น** (ครอบคลุมทุกชั้นที่ [[release-plan|Phase 1]] ต้องใช้): Field Client Framework, Local Persistent Store, Server-side Runtime, Primary Data Store, Media/Object Storage
- **ยังไม่ตัดสินใจ 1 ชั้น**: Runtime ของโมเดล AI วิเคราะห์รอยร้าว (บล็อกเฉพาะ Phase 3 ไม่บล็อก Phase 1-2 — ดูหัวข้อ 4)
- **ประเด็นคร่อมชั้นที่ยังไม่มีคำตอบ**: hosting/deployment target (on-premise ของหน่วยงาน หรือ cloud) — **กระทบวิธี deploy ของ 3 ใน 5 ชั้นที่ตัดสินแล้ว** (Server-side Runtime, Primary Data Store, Media/Object Storage) แม้ชื่อเทคโนโลยีที่เลือกจะไม่เปลี่ยน แต่วิธี deploy/ดูแลรักษาอาจเปลี่ยนมากถ้าหน่วยงานบังคับ on-prem
- **ผู้อ่านที่ต้องการอ้างอิง**: ใช้เอกสารนี้ได้เต็มที่สำหรับงาน Phase 1-2 ทุกชั้น ยกเว้นสิ่งที่เกี่ยวกับ AI model ให้รอจนกว่าหัวข้อ 4 จะปิด และสิ่งที่เกี่ยวกับ infrastructure/hosting จริงให้รอจนกว่าจะคุยกับหน่วยงานเสร็จ
- **บริบทของผู้ใช้ที่ใช้ประกอบการตัดสินใจรอบนี้** (บันทึกไว้เพื่อความโปร่งใส ไม่ใช่ข้อจำกัดของ session งาน): ทีมพัฒนาคือ**ผู้ใช้คนเดียว** ถนัด **JavaScript/TypeScript และ Python** อุปกรณ์ภาคสนามเป้าหมายคือ **Android เป็นหลัก** (ยังไม่ยืนยันรุ่น) ยังไม่ได้คุยกับหน่วยงาน (กรมโยธาธิการและผังเมือง) เรื่องข้อกำหนด hosting/data residency

## 2. ข้อจำกัดที่บีบตัวเลือก

| รหัส | บีบชั้น | บีบแค่ไหน | เหตุผล |
|---|---|---|---|
| NFR-01 (Availability/Offline) | Field Client Framework, Local Persistent Store | **มาก** | ต้องรองรับ full local persistence ของข้อมูลสำรวจครบ 10 หมวดโดยไม่พึ่งเครือข่ายเลย (ตัด framework ที่พึ่งพา network เป็นหลักทิ้งไปแล้วตั้งแต่ขั้นเลือกรูปแบบแอปภาคสนามเป็น cross-platform native) |
| FR-27 (เข้าสู่ระบบขณะออฟไลน์) | Field Client Framework, Local Persistent Store | มาก | ต้องเก็บ credential/session ที่แคชไว้ในเครื่องและเรียกใช้ได้โดยไม่มีสัญญาณ |
| NFR-02 (Performance/Reliability — sync ไฟล์ใหญ่) | Media/Object Storage, Local Persistent Store (queue), Server-side Runtime (background job) | **มาก** | ต้องรองรับอัปโหลด/ทำต่อจากจุดค้างของไฟล์ภาพขนาดใหญ่แบบพื้นหลัง ตัดตัวเลือกที่ไม่รองรับ resumable upload ทิ้ง |
| NFR-04 (Usability/Compatibility — อุปกรณ์หลากรุ่นราคาประหยัด) | Field Client Framework | **มาก** | ตัด framework ที่กินทรัพยากรหนัก/ประสิทธิภาพแย่บนแท็บเล็ตสเปกต่ำของหน่วยงานราชการ |
| NFR-09 (Security — อายุ session ที่แคชไว้) | Field Client Framework, Local Persistent Store | ปานกลาง | framework ต้องมี API เข้าถึงที่เก็บข้อมูลปลอดภัยระดับ OS (Keystore บน Android) ได้ |
| NFR-03 (Data Integrity — ตรวจจับความขัดแย้ง) | Primary Data Store | ปานกลาง | ต้องเปรียบเทียบ version/เวลาแก้ไขล่าสุดได้ เอียงไปทาง store ที่จัดการ relationship ชัดเจน |
| NFR-07 (Scalability — โหลดกระจุกตัวหลังกลับจากพื้นที่) | Server-side Runtime, Primary Data Store | ปานกลาง | ต้องมี queue/worker รองรับ burst และ DB รองรับ concurrent write โดยไม่เสียหาย |
| NFR-08 (Security — RBAC) | Server-side Runtime | **น้อย** | ทำได้แทบทุก stack — เป็น business logic ไม่ใช่ข้อจำกัดเทคโนโลยี |
| FR-21, FR-25, FR-26 (จัดการสิทธิ์/ยืนยันตัวตน/บังคับสิทธิ์) | Server-side Runtime | น้อย | ไม่บีบเทคโนโลยีเฉพาะเจาะจง เป็น business logic เช่นเดียวกับ NFR-08 |
| architecture.md [[architecture#6.4 แยก Primary Data Store และ Media/Object Storage เป็นคนละที่เก็บข้อมูล\|§6.4]] | Primary Data Store, Media/Object Storage | มาก (ตัดสินแล้วในชั้นสถาปัตยกรรม) | บังคับให้สองที่เก็บนี้เป็นคนละระบบ — ไม่ใช่ NFR โดยตรงแต่เป็นข้อจำกัดที่สืบทอดมาจาก architecture ที่ตัดสินไปก่อนชั้นนี้แล้ว |

**สรุป**: ชั้นที่ถูกบีบมากที่สุดคือ **Field Client Framework** (ถูกบีบพร้อมกันจาก NFR-01/02/04/09) รองลงมาคือ **Primary Data Store** (NFR-03/07 + ข้อจำกัดจาก §6.4) ส่วน **Server-side Runtime ถูกบีบน้อยที่สุด** — ไม่มี NFR ใดบังคับภาษา/runtime เฉพาะเจาะจง จึงเปิดให้เลือกตามความถนัดทีมได้อิสระที่สุดในบรรดา 5 ชั้น

## 3. การตัดสินใจรายชั้น

| ชั้น | สิ่งที่เลือก | เหตุผล (อ้างรหัส NFR/FR) | ทางเลือกที่พิจารณาแล้วไม่เลือกและเพราะอะไร |
|---|---|---|---|
| **Field Client Framework** (แอปภาคสนาม) | **React Native** (ยังไม่กำหนดเวอร์ชัน) | ผู้ใช้ถนัด JavaScript/TypeScript อยู่แล้ว (ทีมคนเดียว) ทำให้พัฒนา/ดูแลได้เร็วกว่าเรียนภาษาใหม่ — ตอบโจทย์ NFR-01/FR-27 (offline เต็มรูปแบบ) ได้ผ่าน ecosystem local-first ที่มีอยู่ | **Flutter** — เคยเสนอเป็นตัวแนะนำหลักเพราะคอมไพล์เป็น native ARM ไม่ผ่าน JS bridge (ตอบ NFR-04 ได้ตรงกว่า) แต่ผู้ใช้เลือก React Native เพราะทีมไม่ถนัด Dart และเป็นทีมคนเดียว การเรียนภาษาใหม่มีต้นทุนสูงกว่าประโยชน์ด้านประสิทธิภาพที่ยังไม่มีปัญหาจริง ณ ตอนนี้ · **.NET MAUI** — ตัดเพราะ ecosystem ปลั๊กอิน offline-first/กล้อง/AI on-device เล็กกว่ามาก และทีมไม่ได้ถนัด C#/.NET · **Native แยก Kotlin+Swift** — ตัดเพราะทีมคนเดียวไม่สามารถดูแล 2 โค้ดเบสคู่ขนานได้ ไม่มี NFR ใดบังคับว่าต้องแยก |
| **Local Persistent Store** (ที่เก็บข้อมูลบนอุปกรณ์) | **SQLite** ผ่าน library ของ React Native (ยังไม่เลือก library ตัวใดตัวหนึ่ง — ดูหัวข้อ 4) | ตอบ NFR-01 (เก็บข้อมูลแบบสำรวจครบ 10 หมวดแบบมี relationship ได้), NFR-03 (เก็บ version/timestamp เปรียบเทียบได้สำหรับตรวจจับความขัดแย้งภายหลัง), NFR-09 (แยกเก็บ credential ผ่าน secure storage ของ OS ได้) — เป็นทางเลือกที่ผูกกับ ecosystem ของ React Native ที่เลือกไปแล้ว | **Embedded NoSQL/document store** (เช่น Realm, ObjectBox) — พิจารณาแล้วไม่เลือกเพราะบาง engine ผูกกับ sync engine/vendor เฉพาะที่อาจขัดกับข้อจำกัดจัดซื้อ/data residency ของหน่วยงานราชการที่ยังไม่ทราบคำตอบ (ดูหัวข้อ 4) · **จัดการไฟล์ดิบเอง (JSON+filesystem)** — ตัดเพราะไม่รองรับ query/index/versioning ที่โดเมนข้อมูล 10 หมวดต้องการ เสี่ยง data integrity สูงกว่า |
| **Server-side Runtime** | **Node.js / TypeScript** (ยังไม่กำหนดเวอร์ชัน) | ผู้ใช้ถนัด JavaScript/TypeScript อยู่แล้ว ทำให้ใช้ภาษาเดียวกันได้ทั้งฝั่ง client (React Native) และฝั่งเซิร์ฟเวอร์ ลดภาระสลับบริบทสำหรับทีมคนเดียว — ตอบ NFR-07 (ecosystem queue/background job รองรับโหลดกระจุกตัว) และ NFR-02 (รองรับ resumable upload แบบพื้นหลัง) ได้ | **Python** — พิจารณาแล้วไม่เลือกแม้ทีมถนัดเช่นกัน เพราะ Node.js ทำให้ใช้ภาษาเดียวกับฝั่ง client ได้ (Python จะต้องสลับ 2 ภาษาคู่กับ frontend/React Native) จุดแข็งของ Python ด้าน ML ecosystem ยังไม่มีผลตอนนี้เพราะ Phase 1 ไม่มีรหัสเกี่ยวกับ AI เลย และ runtime ของโมเดล AI ยังไม่ตัดสินใจ (ดูหัวข้อ 4) — หากถึงเวลาตัดสิน Server-side AI Analysis ในอนาคตและพบว่าจำเป็นต้องใช้ Python ecosystem ให้ทบทวนใหม่ (ดูหัวข้อ 6) · **Java/Kotlin (Spring Boot) หรือ .NET (ASP.NET Core)** — ตัดเพราะทีมไม่ถนัด และ boilerplate/เวลาเรียนรู้ไม่เหมาะกับทีมคนเดียว แม้บางหน่วยงานราชการจะคุ้นเคยกับ stack นี้มากกว่า |
| **Primary Data Store** | **MySQL / MariaDB** (ยังไม่กำหนดเวอร์ชัน) | เป็น relational DB ตอบ NFR-03 (versioning/comparison), NFR-07 (concurrent write ที่ยังคง integrity), NFR-08 (โครงสร้างสิทธิ์แบบ role/ownership) ได้ — เข้ากับ ecosystem ของ Node.js/TypeScript ที่เลือกไปแล้ว | **PostgreSQL** — เคยเสนอเป็นตัวแนะนำหลักเพราะรองรับ JSON column/indexing ขั้นสูงกว่าและตรงกับโครงสร้าง entity-relationship ที่ [[db-spec]] ออกแบบไว้อย่างตรงไปตรงมาที่สุด แต่ผู้ใช้เลือก MySQL/MariaDB โดยรับทราบข้อเสียนี้แล้ว (ฟีเจอร์ขั้นสูงบางอย่าง เช่น extension สำหรับพิกัด GPS อาจด้อยกว่า Postgres เล็กน้อย) — บันทึกไว้เป็นข้อแลกเปลี่ยนที่รู้ตัว ไม่ใช่การมองข้าม · **MongoDB (NoSQL)** — ตัดเพราะ ownership-based scoping ที่ต้อง join อาคาร↔ทีม↔ผู้ใช้ตาม [[architecture#7. ข้อสมมติ\|architecture §7 ข้อ 7]] เขียน/ดูแลยากกว่า relational DB โดยทั่วไป เสี่ยงต่อ data integrity ที่ NFR-03 ต้องการมากกว่า |
| **Media/Object Storage** | **Local filesystem บนเซิร์ฟเวอร์** | ยังคงแยกเป็นคนละที่เก็บข้อมูลจาก Primary Data Store ตามที่ [[architecture#6.4 แยก Primary Data Store และ Media/Object Storage เป็นคนละที่เก็บข้อมูล\|architecture §6.4]] ตัดสินไปแล้ว (ไม่ขัดกัน) — เลือกเป็นทางเริ่มต้นที่ต้นทุน/ความซับซ้อนต่ำสุดสำหรับทีมคนเดียวที่ยังไม่ทราบข้อจำกัด hosting ของหน่วยงาน | **S3-compatible object storage** (AWS S3 หรือ self-host เช่น MinIO) — เคยเสนอเป็นตัวแนะนำหลักเพราะรองรับ multipart/resumable upload มาให้พร้อมใช้ตรงกับ NFR-02 โดยไม่ต้องเขียนเอง แต่ผู้ใช้เลือก local filesystem โดยรับทราบข้อเสียนี้แล้วว่า **resumable upload ตาม NFR-02 ต้องเขียนเอง** ไม่ได้มาฟรีเหมือน object storage — บันทึกไว้เป็นข้อแลกเปลี่ยนที่รู้ตัว (ดูเกณฑ์ทบทวนในหัวข้อ 6) · **Managed cloud storage อื่น** (Azure Blob/GCS) — ตัดเพราะไม่มีเหตุผลผูกกับ cloud provider ใดโดยเฉพาะ ณ ตอนนี้ |

## 4. สิ่งที่ยังไม่ตัดสินใจ

### 4.1 Runtime ของโมเดล AI วิเคราะห์รอยร้าว + รูปแบบไฟล์โมเดล

**เงื่อนไขที่ต้องมีก่อนถึงจะตัดสินได้**:
- ต้องมีโมเดล AI จริง (หรืออย่างน้อยรู้ขนาด/สถาปัตยกรรมโมเดลที่จะใช้) — ปัจจุบันยังไม่มี
- ต้องมีชุดข้อมูลสำหรับฝึก/ทดสอบ — ปัจจุบันยังไม่มี
- ต้องแก้ข้อสมมติข้อ 2 และ 8 ในหมวด 6 ของ [[20260828-01-flood-damage-survey#6. ข้อสมมติ / ประเด็นค้างพิจารณา|spec]] ก่อน (เกณฑ์ความกว้างรอยร้าวยังยืมจากคู่มือแผ่นดินไหวโดยไม่ยืนยันว่าใช้กับอุทกภัยได้ และยังไม่มีเกณฑ์ตัดสินว่า "วิเคราะห์ไม่สำเร็จ")

**ผลกระทบถ้าเลื่อนต่อ**: บล็อกเฉพาะ Phase 3 (ฟีเจอร์ที่เกี่ยวกับ FR-13/FR-14/FR-28/FR-29) **ไม่บล็อก Phase 1-2** เพราะ Phase 1 ไม่มีรหัสเกี่ยวกับ AI เลย (ยืนยันจาก [[release-plan]])

**ข้อควรระวังล่วงหน้าที่บันทึกไว้แล้ว**: [[architecture#6.1 ตำแหน่งการทำงานของ AI วิเคราะห์รอยร้าว|architecture §6.1]] ตัดสินไปแล้วว่า AI ต้องรันบนอุปกรณ์เป็นเส้นทางหลัก (ไม่ใช่ทางเลือก) — React Native ที่เลือกไว้สำหรับ Field Client Framework เป็น cross-platform framework ที่การรัน on-device AI inference (เช่นผ่าน TensorFlow Lite/ONNX Runtime) ทำได้ยากกว่าทางเลือกที่คอมไพล์เป็น native โดยตรง (เช่น Flutter หรือ native แยก platform) — **ยังไม่ใช่ปัญหาตอนนี้เพราะยังไม่มีโมเดลและยังไม่ใช่ Phase 1** แต่ต้องนำมาพิจารณาอีกครั้งเมื่อถึงเวลาตัดสินใจจริง (ดูเกณฑ์ทบทวนในหัวข้อ 6)

### 4.2 Hosting/Deployment target

**เงื่อนไขที่ต้องมีก่อนถึงจะตัดสินได้**: ต้องคุยกับหน่วยงาน (กรมโยธาธิการและผังเมือง) ว่ามีข้อกำหนดเรื่อง data residency / ห้ามใช้ cloud สาธารณะ / ต้องเป็น on-premise หรือไม่ และงบประมาณ hosting เป็นอย่างไร — ปัจจุบันผู้ใช้ยังไม่ได้คุยกับหน่วยงานเรื่องนี้

**ผลกระทบถ้าเลื่อนต่อ**: ไม่บล็อกการเริ่มพัฒนา Phase 1 (พัฒนา/ทดสอบในเครื่อง dev ได้ก่อน) แต่ **กระทบวิธี deploy จริงของ Server-side Runtime, Primary Data Store, และ Media/Object Storage** ทั้งสามชั้นที่ตัดสินชื่อเทคโนโลยีไปแล้วในหัวข้อ 3 — ถ้าหน่วยงานบังคับ on-prem อาจต้องเปลี่ยนจากการใช้ managed service (ถ้าเคยวางแผนไว้) มาเป็น self-host ทั้งหมด แต่**ชื่อเทคโนโลยีที่เลือก (Node.js, MySQL/MariaDB, local filesystem) ไม่จำเป็นต้องเปลี่ยนเพราะเลือกได้ทั้ง on-prem และ cloud อยู่แล้ว**

### 4.3 Library เฉพาะตัวสำหรับ SQLite บน React Native

**เงื่อนไขที่ต้องมีก่อนถึงจะตัดสินได้**: ผู้ใช้เลือกไว้เพียงระดับ "SQLite" ยังไม่ได้เลือก library ตัวใดตัวหนึ่ง (มีหลายตัวในตลาดที่มี trade-off ต่างกัน เช่น เรื่อง reactive query/performance/ขนาด binary) — เอกสารนี้**ห้ามเดาชื่อ library แทนผู้ใช้**

**ผลกระทบถ้าเลื่อนต่อ**: ไม่บล็อกงานออกแบบระดับ architecture/API/DB ที่เป็น logical เพราะยังคงอ้างอิงแค่ "SQLite" ได้ แต่**บล็อกการเริ่มเขียนโค้ดจริงของ Local Persistent Store** — ต้องตัดสินใจก่อนเริ่ม implementation Phase 1

## 5. ผลกระทบต่อเอกสารชั้นอื่น

- **[[architecture]]** — ปัจจุบันจงใจไม่ระบุชื่อเทคโนโลยีใดๆ ตามที่ระบุไว้ในหมายเหตุต้นเอกสาร ตอนนี้ `technology-stack.md` มีเนื้อหาแล้ว **ควรกลับไปทบทวนเพื่ออ้างอิงชื่อ stack จริงในจุดที่เหมาะสม** โดยเฉพาะ:
  - หัวข้อ 2 (Logical Component) — Field Client App, Backend Service, Sync & Conflict Resolution Service, Primary Data Store, Media/Object Storage อาจเพิ่มหมายเหตุอ้างอิงชื่อ stack จริงประกอบ (ไม่จำเป็นต้องเปลี่ยนชื่อ component)
  - §8 (ประเด็นรอตัดสินใจ) — ลบ/ปรับรายการที่ตอนนี้ตัดสินใจแล้ว (เทคโนโลยี Field Client App, Backend Service, Primary Data Store, Media/Object Storage) ให้เหลือเฉพาะที่ยังไม่ตัดสิน (runtime โมเดล AI, รูปแบบไฟล์รายงาน FR-23, กลไก auth/session ที่เป็นรูปธรรม, กลยุทธ์ค้นหา FR-33)
- **[[api-spec]] / [[db-spec]]** — ยังคง logical ต่อไปได้ตามเดิม แต่**ประเด็นรอตัดสินใจ**ของทั้งสองไฟล์ (ถ้ามีข้อที่ผูกกับชนิด database เช่น relational vs document) ควรกลับไปตรวจว่าปิดได้แล้วหรือไม่ เนื่องจาก Primary Data Store ถูกตัดสินเป็น relational (MySQL/MariaDB) แล้ว
- **[[release-plan]] / `03-task/`** — งานย่อยระดับ implementation เขียนไว้แบบไม่ผูก tech stack ตามกติกาเดิม ตอนนี้เมื่อ tech stack Phase 1 ตัดสินแล้ว **ควรพิจารณาเพิ่มรายละเอียดระดับ implementation ที่อ้างอิง stack จริงได้ในรอบถัดไป** (ไม่บังคับ แต่เป็นโอกาส)
- **`nfr-review.md`** — ควรกลับไปตรวจว่าการเลือก React Native + MySQL/MariaDB + local filesystem ยังคงตอบ NFR-01/02/04/07/09 ได้ตามที่ architecture ออกแบบไว้หรือไม่ในระดับ implementation จริง โดยเฉพาะ NFR-02 (resumable upload ต้องเขียนเอง) และ NFR-04 (ต้องทดสอบบนอุปกรณ์จริง)

## 6. เกณฑ์ที่จะทำให้ต้องทบทวนการตัดสินใจนี้ใหม่

1. **React Native + NFR-04** — ถ้าทดสอบบนแท็บเล็ต Android สเปกต่ำจริง (ไม่ใช่ emulator) แล้วพบปัญหาประสิทธิภาพที่แก้ไม่ได้ ต้องทบทวน Field Client Framework ใหม่ (Flutter เป็นตัวเลือกที่เคยพิจารณาไว้)
2. **React Native + NFR-02 (background upload)** — ถ้า background upload ไฟล์ภาพขนาดใหญ่ผ่าน native module ที่ต้องเพิ่มเข้ามาไม่เสถียรพอ ต้องทบทวนทั้ง Field Client Framework และวิธี implement Local Sync Queue
3. **React Native + AI on-device (architecture §6.1)** — เมื่อถึงเวลาตัดสิน runtime ของโมเดล AI จริง (Phase 3) ถ้าพบว่า React Native รองรับ on-device inference ได้ไม่ดีพอ (เทียบกับ NFR-01 ที่บังคับให้ AI ทำงานได้ขณะออฟไลน์) **ต้องทบทวน Field Client Framework ทั้งชั้น** ไม่ใช่แค่เพิ่ม runtime AI เข้ามา
4. **Android เป็นหลักแต่เลือก cross-platform** — ถ้าหน่วยงานยืนยันในภายหลังว่าไม่ต้องรองรับ iOS เลย ควรทบทวนว่า React Native (cross-platform) ยังคุ้มค่ากับความซับซ้อนที่แลกมาหรือไม่ เทียบกับ native Android เดี่ยว (Kotlin)
5. **Local filesystem + hosting ที่ยังไม่ทราบ (ข้อ 4.2)** — ถ้าหน่วยงานตอบมาว่าต้องใช้โครงสร้างพื้นฐานของเขาเอง หรือถ้าปริมาณผู้ใช้/ไฟล์โตเกินเซิร์ฟเวอร์เดียวจะรองรับไหว โค้ดส่วนที่ผูกกับ local filesystem โดยตรงอาจต้องรื้อเพื่อย้ายไป object storage — เขียน abstraction layer แยกไว้ตั้งแต่ต้นจะช่วยลดต้นทุนการย้ายในอนาคต (คำแนะนำเชิงปฏิบัติ ไม่ใช่การตัดสินใจใหม่)
6. **MySQL/MariaDB + FR-33 (ค้นหา audit trail ปริมาณมาก)** — ถ้าปริมาณการค้นหาของ FR-33 สูงมากจนกระทบประสิทธิภาพเมื่อ audit log สะสมมากขึ้นเรื่อยๆ โดยไม่มีการลบอัตโนมัติ (ตามข้อสมมติที่ [[architecture#7. ข้อสมมติ|architecture §7 ข้อ 6]] ระบุไว้) ให้ทบทวนกลยุทธ์การจัดทำดัชนี/แยก read replica ตามที่ [[architecture#8. ประเด็นรอตัดสินใจ|architecture §8]] เปิดไว้เป็นประเด็นเปิดอยู่แล้ว
7. **ทีมขยายจากคนเดียวเป็นหลายคน หรือทักษะทีมเปลี่ยน** — การเลือก Node.js/TypeScript ทั้ง client และ server อิงจากบริบท "ทีมคนเดียว ถนัด JS/TS" ถ้าทีมขยายและมีคนถนัดภาษาอื่นเข้ามาแทน ควรทบทวน Server-side Runtime ใหม่โดยเฉพาะถ้ามีความจำเป็นต้องใช้ Python ecosystem สำหรับ Server-side AI Analysis ในอนาคต

## เอกสารที่เกี่ยวข้อง

- [[backlog]] — FR/NFR ต้นทางทั้งหมดที่ใช้อ้างอิงในหัวข้อ 2-3
- [[architecture]] — ข้อจำกัดเชิงสถาปัตยกรรมที่ตัดสินไปแล้วก่อนชั้นนี้ (§6.1, §6.3, §6.4, §7, §8)
- [[release-plan]] — ขอบเขต Phase 1 ที่กำหนดว่าชั้นใด "ต้องใช้" ในรอบนี้
- [[20260828-01-flood-damage-survey]] — spec ต้นทาง โดยเฉพาะหมวด 6 (ข้อสมมติ/ประเด็นค้างพิจารณา) ที่บล็อกหัวข้อ 4.1
