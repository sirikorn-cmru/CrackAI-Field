# CLAUDE.md

ไฟล์นี้ให้คำแนะนำแก่ Claude Code (claude.ai/code) เมื่อทำงานกับโค้ดในโปรเจกต์นี้

## สถานะของโปรเจกต์

โปรเจกต์นี้**ยังไม่มีซอร์สโค้ด** — เป็นพื้นที่ทำงานด้าน requirements/design สำหรับระบบที่ยังไม่ได้เริ่มพัฒนาจริง (**โดเมนของระบบดูจากเอกสารใน `docs/01-requirements/01-spec/` เท่านั้น ห้ามสมมติ** — ดูหัวข้อถัดไป) จึงยังไม่มีคำสั่ง build, lint หรือ test ให้รัน งานทั้งหมดที่มีอยู่ตอนนี้อยู่ภายใต้โฟลเดอร์ `docs/` ความคืบหน้าของแต่ละขั้นตอน (requirements/design/testing) ไม่เท่ากัน — บางไฟล์มีเนื้อหาแล้ว บางไฟล์/โฟลเดอร์ยังว่างรอเนื้อหาอยู่ ให้ตรวจสถานะจริงของแต่ละไฟล์ก่อนอ้างอิงหรือแก้ไข อย่าเชื่อคำอธิบายสถานะที่เขียนไว้ในเอกสารฉบับเก่า **อย่าสมมติ** ว่ามี tech stack, framework หรือขั้นตอน build อยู่แล้ว จนกว่าจะปรากฏจริงในโปรเจกต์ (`docs/02-design/02-technical/technology-stack.md` คือจุดที่จะกำหนดเรื่องนี้เมื่อมีการตัดสินใจแล้ว)

## ภาพรวมระบบที่กำลังวางแผน

เอกสารข้อกำหนด (ไฟล์ Markdown ใน `docs/01-requirements/01-spec/` — อาจมีมากกว่า 1 ไฟล์ตามความต้องการที่ทยอยเพิ่มเข้ามา ให้ดูรายการไฟล์จริงในโฟลเดอร์นี้แทนการอ้างชื่อไฟล์เจาะจง) คือแหล่งอ้างอิงเดียวที่บอกว่าระบบที่กำลังวางแผนคือระบบอะไร มีขอบเขตแค่ไหน และมีบทบาทผู้ใช้แบบใด **ห้ามสมมติโดเมนหรือฟีเจอร์ของระบบจากความจำหรือจากตัวอย่างโปรเจกต์อื่น** ให้เปิดอ่านไฟล์ spec จริงก่อนตอบคำถามเกี่ยวกับภาพรวมระบบเสมอ (โดเมนของระบบกำหนดโดยผู้ใช้และเปลี่ยนได้ในแต่ละช่วงของโปรเจกต์ ส่วนนี้ของ CLAUDE.md จึงตั้งใจไม่ระบุเจาะจงไว้ เพื่อไม่ให้ล้าสมัยเมื่อโดเมนเปลี่ยน)

กติกาที่คงที่ไม่ว่าโดเมนของระบบจะเป็นอะไร (มาจากรูปแบบของเอกสารทั้งวอลต์ ไม่ใช่จากตัวระบบที่วางแผนอยู่):
- ทุกความต้องการเชิงฟังก์ชัน/ไม่ใช่เชิงฟังก์ชันมีรหัสกำกับ (`FR-xx` / `NFR-xx`) และระดับความสำคัญ (สูง/กลาง/ต่ำ โดย "สูง" คือสิ่งที่ต้องมีใน MVP) — ดูสรุปล่าสุดที่ `docs/01-requirements/backlog.md`
- เอกสารทุกชั้นอ้างอิงกันด้วย `[[wikilink]]` แบบ Obsidian และควรอ้างอิงกลับไปยัง spec ต้นทางเสมอ
- ให้ตรวจสถานะจริงของ spec ก่อนอ้างอิงหรือแก้ไข อย่าเชื่อคำอธิบายภาพรวมระบบที่เคยเขียนไว้ในเอกสารฉบับเก่า (รวมถึงหัวข้อนี้เอง หากมีใครเติมรายละเอียดเจาะจงไว้ในอนาคตแล้วโดเมนถูกเปลี่ยนภายหลัง)

## โครงสร้างพื้นที่เอกสาร (`docs/`)

โปรเจกต์นี้ใช้รูปแบบโฟลเดอร์แบ่งตามขั้นตอน SDLC โดยมีลำดับเลขนำหน้า เมื่อสร้างเอกสารใหม่ ให้ใส่ในโฟลเดอร์ขั้นตอนที่ตรงกัน อย่าสร้างตำแหน่งใหม่เอง:

```
docs/
  00-archived/                    เอกสารที่เลิกใช้/ถูกแทนที่แล้ว
  01-requirements/
    00-source/                    เอกสารอ้างอิงต้นทางจากผู้ใช้ (PDF/ไฟล์แนบ) ที่ยังไม่ถูกแปลงเป็น spec — ใช้อ่านประกอบตอนเขียนไฟล์ใน 01-spec/
    01-spec/                      เอกสารความต้องการทุกฉบับ (1 ไฟล์ต่อ 1 requirement/หัวข้อ ตั้งชื่อแบบ `YYYYMMDD-NN-<slug>.md`) — ดูรายการไฟล์จริงในโฟลเดอร์นี้เสมอ อาจมีมากกว่า 1 ไฟล์
    02-plan/
      release-plan.md              แผนแบ่ง phase/release ก่อนเริ่ม dev จริง (จัดกลุ่ม FR/NFR ตามลำดับที่ควรทำก่อน-หลัง พร้อมเหตุผล)
    03-task/
      {phase-slug}-tasks.md         การแตกงานย่อยระดับ implementation ต่อ phase (อ้างอิง release-plan.md) เขียนแบบไม่ผูก tech stack จนกว่าจะมีการตัดสินใจจริง
    backlog.md                    Backlog รวม FR/NFR ทั้งหมดจากทุกไฟล์ใน 01-spec/ (ตรวจสถานะ/เนื้อหาจริงในไฟล์ก่อนอ้างอิง)
  02-design/
    01-prototypes/<date>-<n>-<version>/   โฟลเดอร์ Prototype แบบมีวันที่และเวอร์ชัน (HTML mockup, prototype.md)
    02-technical/
      architecture.md              สถาปัตยกรรมระดับ logical/conceptual (component, data flow) — ไม่ผูก tech stack จนกว่า technology-stack.md จะถูกตัดสินใจ
      api-spec.md                  สัญญา API เชิง logical (resource/operation/request-response) ไม่ผูก framework
      db-spec.md                   โมเดลข้อมูลเชิง logical (entity/attribute/ความสัมพันธ์) ไม่ผูก database engine
      detailed-design/{feature-slug}.md   การออกแบบระดับ component ต่อฟีเจอร์ อ้างอิง api-spec.md/db-spec.md
      nfr-review.md                ตรวจสอบว่าการออกแบบ (architecture/api-spec/db-spec/detailed-design) รองรับทุก NFR ใน backlog หรือไม่
      technology-stack.md          ยังไม่ตัดสินใจ — รอจนกว่าจะเริ่มพัฒนาจริง
    feature-list.md
    user-journey.md
    DESIGN.md                     Design System หลัก (Brand Identity, สี, ตัวอักษร, ระยะห่าง, องค์ประกอบ UI, UX rules) — อ้างอิงก่อนทำ Prototype ใน 01-prototypes/ เจ้าของไฟล์คือ agent `design-system-writer` (ผ่าน `/sync-design-system`) เท่านั้น
  03-testing/
    01-test-plan/
      acceptance-criteria.md      เกณฑ์ยอมรับ (Given-When-Then) ต่อ FR/NFR จัดกลุ่มตาม feature-list
      test-plan.md                 ภาพรวมกลยุทธ์ทดสอบ 1 ไฟล์ต่อโปรเจกต์ (scope, ประเภทการทดสอบ, environment, risk management, entry/exit criteria, บทบาทผู้ทดสอบ)
      test-cases/{feature-slug}.md Test case แบบ step-by-step ต่อฟีเจอร์ ต้องมีอย่างน้อย test id / ชื่อ / pre-condition / test step / expected result / test data พร้อม reference กลับไป acceptance-criteria.md และรหัส FR/NFR
    02-test-result/                ผลการรันทดสอบจริง — ยังไม่มีเอกสาร/agent ดูแล เพราะโปรเจกต์ยังไม่มีซอร์สโค้ดให้ทดสอบจริง
  04-retrospectives/
  05-log/
  .obsidian/                      Vault นี้เปิด/แก้ไขด้วย Obsidian — Markdown + wikilink คือรูปแบบหลักของพื้นที่นี้เช่นกัน
```

ไฟล์ในโฟลเดอร์ที่มีวันที่ (เช่น prototypes) ใช้รูปแบบชื่อ `YYYYMMDD-NN-<slug>` ให้คงรูปแบบนี้ต่อไปเมื่อสร้างไฟล์ใหม่ที่มีวันที่กำกับ เพื่อให้เรียงตามลำดับเวลาได้ถูกต้อง

เนื่องจาก `docs/` เป็น Obsidian vault เมื่อเพิ่มเนื้อหาใหม่ ควรใช้การอ้างอิงข้ามเอกสารแบบ `[[wikilink]]` เสมอ และเมื่ออ้างถึงหัวข้อย่อยให้ตรวจว่า anchor หลัง `#` ตรงกับข้อความ heading จริงทุกตัวอักษร มิฉะนั้นลิงก์จะเสียเมื่อเปิดใน Obsidian

## เครื่องมืออัตโนมัติดูแลความสอดคล้องของเอกสาร (agents & skills)

โปรเจกต์นี้มี custom agents ใน `.claude/agents/` และ skills ใน `.claude/skills/` สำหรับสร้าง/ตรวจสอบความสอดคล้องของเอกสารแต่ละชั้นให้ตรงกับชั้นก่อนหน้าเสมอ ตามลำดับ: spec → `backlog.md` → `feature-list.md`/`user-journey.md` → แตกแขนงขนานกัน 3 สาย (technical spec ใน `02-technical/`, test plan ใน `03-testing/`, prototype ใน `01-prototypes/`) → phase plan ใน `01-requirements/02-plan/`+`03-task/` เมื่อผู้ใช้ขอให้ทำงานที่ตรงกับหน้าที่ของ skill ใดอยู่แล้ว **ให้เรียกใช้ skill/agent นั้นแทนการแก้ไฟล์เอกสารตรงๆ เอง** เพื่อให้การตรวจสอบ cross-file consistency และการบันทึกสรุปงานลง `docs/05-log/{YYYYMMDD}-log.md` เป็นไปตามรูปแบบเดิมของโปรเจกต์

### เจ้าของไฟล์ (file ownership) — กติกาสำคัญที่สุดของระบบ agent

**เอกสารแต่ละไฟล์มี agent เจ้าของเพียงตัวเดียวที่เขียนได้** agent อื่นอ่านได้อย่างเดียว ถ้าพบว่าไฟล์ที่ตัวเองไม่ได้เป็นเจ้าของจำเป็นต้องแก้ ให้**ส่งสัญญาณกลับไปให้ skill ที่เรียกส่งต่อให้เจ้าของไฟล์แทน** ห้ามแก้เอง — การมี agent สองตัวเป็นเจ้าของไฟล์เดียวกันคือต้นเหตุของข้อมูลขัดแย้งที่ตามแก้ยากที่สุด

| Agent | ไฟล์ที่เขียนได้ |
|---|---|
| `requirement-writer` | `01-spec/*.md` · `backlog.md` |
| `backlog-auditor` | `backlog.md` (ตรวจครอบคลุม 7 ชั้นถึง test-plan แต่เขียนได้เฉพาะไฟล์นี้) |
| `feature-journey-writer` | `feature-list.md` · `user-journey.md` |
| `design-system-writer` | `DESIGN.md` |
| `prototype-writer` | `01-prototypes/{version-folder}/` (โฟลเดอร์เป้าหมายเดียวเท่านั้น) |
| `architecture-writer` | `02-technical/architecture.md` |
| `api-db-writer` | `02-technical/api-spec.md` · `02-technical/db-spec.md` |
| `detailed-design-writer` | `02-technical/detailed-design/*.md` |
| `test-writer` | `03-testing/01-test-plan/**` |
| `phase-planner` | `02-plan/release-plan.md` · `03-task/*.md` |
| `nfr-reviewer` | `02-technical/nfr-review.md` — **ตรวจอย่างเดียว ห้ามแก้เอกสารที่ตรวจ** |
| `prototype-auditor` | (ไม่มี) — **ตรวจอย่างเดียว** ตรวจ prototype เทียบเอกสารทุกชั้นทั้งสองทิศทาง |

ทุก agent เขียนต่อท้าย (append) `docs/05-log/{YYYYMMDD}-log.md` ของวันนั้นได้เสมอ **ห้ามเขียนทับ**

### กฎการถามผู้ใช้ (ใช้กับทุก agent และทุก skill)

เมื่อ agent หรือ skill ใดต้องถามผู้ใช้ผ่าน `AskUserQuestion` **ต้องเสนออย่างน้อย 3 ตัวเลือก/แนวทาง** แต่ละตัวเลือกระบุ**ข้อดีและข้อเสีย**ไว้ใน `description` ให้ผู้ใช้ชั่งน้ำหนักได้ และ**ระบุตัวเลือกที่แนะนำ**เป็นตัวเลือกแรก ต่อท้าย label ด้วย "(แนะนำ)" พร้อมเหตุผลที่อิงบริบทจริงของโปรเจกต์ ไม่ใช่ค่าเริ่มต้นตายตัว

ถ้าจุดใดไม่ชัดเจนจนทำงานต่อไม่ได้ **ให้ถามเสมอ อย่าเดา** — และเมื่อขอบเขตงานถูกจำกัด ต้องรายงานเสมอว่าอะไรยัง**ไม่**ถูกครอบคลุมในรอบนั้น

จุดเริ่มต้นที่ใช้บ่อย:
- `/capture-requirement` — แปลง requirement ดิบจากผู้ใช้เป็นเอกสาร spec ใหม่/แก้ไขของเดิม พร้อมอัปเดต backlog
- `/audit-backlog` — ตรวจความสอดคล้องตั้งแต่ requirement ถึง test plan ครบ 7 ชั้น (spec → backlog → feature-list → user-journey → acceptance-criteria → test-cases → test-plan) แก้ backlog ให้ตรงกับ spec แล้ว auto-chain ตามลำดับ `requirement-writer` → `sync-feature-journey` → `sync-test-plan` จนทุกชั้นกลับมาตรงกันในคำสั่งเดียว (ไม่รวม prototype และเอกสารเชิงเทคนิค — ใช้ `/audit-pipeline` แทน)
- `/sync-feature-journey`, `/sync-technical-spec` (รวม architecture → api-spec/db-spec → detailed-design → nfr-review), `/sync-test-plan`, `/sync-phase-plan` — ตรวจสอบและ sync เอกสารแต่ละชั้นให้ตรงกับชั้นก่อนหน้า
- `/sync-design-system` — สร้าง/ปรับปรุง `docs/02-design/DESIGN.md` โดยสัมภาษณ์ผู้ใช้เรื่องโทนสี สไตล์ และโลโก้/ภาพอ้างอิงก่อนเสมอ (เอกสารนี้ derive จาก FR/NFR แบบ mechanical ไม่ได้ จึงต้องถามผู้ใช้)
- `/audit-prototype` — ตรวจว่า Prototype สอดคล้องกับเอกสารทุกชั้นหรือไม่ **ทั้งสองทิศทาง** (เอกสารนำ prototype ตาม / prototype ถูกแก้แล้วเอกสารยังไม่ตาม) แล้ว auto-chain ไปอัปเดตเอกสารที่เกี่ยวข้องให้ครบ
- `/build-prototype` — สร้าง/ปรับปรุง Prototype โดยระบุขอบเขตเจาะจงได้ (ทั้งระบบ/ตามบทบาท/ตาม journey/ตามฟีเจอร์/ตามรหัส FR) เสนอแผนให้ยืนยันก่อนเสมอ ถามทุกครั้งว่าจะสร้างเวอร์ชันใหม่หรือแก้โฟลเดอร์เดิม และ auto-chain ไป `sync-design-system` ถ้ายังไม่มี `DESIGN.md`
- `/run-requirements-phase`, `/run-technical-phase`, `/run-prototype-phase` — รวมหลายขั้นตอนที่เกี่ยวข้องกันไว้ในคำสั่งเดียว
- `/audit-pipeline` — ตรวจสอบความสอดคล้องทั้งสายงานตั้งแต่ spec ถึงปลายทางในคำสั่งเดียว

## แนวทางการทำงานในโปรเจกต์นี้ตอนนี้

- ให้ยึดเอกสารทั้งหมดใน `docs/01-requirements/01-spec/` (ไม่ใช่ไฟล์ใดไฟล์หนึ่งโดยเฉพาะ) เป็นแหล่งอ้างอิงหลักของความต้องการเชิงฟังก์ชัน/ไม่ใช่เชิงฟังก์ชัน (รหัส FR-xx / NFR-xx) — ใช้รหัสเหล่านี้อ้างอิงเมื่อพูดคุยหรือวางแผนฟีเจอร์ และให้ตรวจ `docs/01-requirements/backlog.md` เพื่อดูสรุป FR/NFR ล่าสุดทั้งหมดก่อนเสมอ
- เอกสารออกแบบเชิงเทคนิคใน `docs/02-design/02-technical/` (`architecture.md`, `api-spec.md`, `db-spec.md`, `technology-stack.md` และไฟล์ใน `detailed-design/`) หากยังไม่มีไฟล์หรือยังว่างเปล่า หากถูกขอให้ช่วยออกแบบระบบ ให้สร้าง/เติมเนื้อหาลงในไฟล์เหล่านี้ตามตำแหน่งที่ระบุไว้ในโครงสร้างด้านบน ไม่ควรสร้างเอกสารคู่ขนานแยกที่อื่น
- `docs/02-design/DESIGN.md` คือแหล่งอ้างอิงหลัก (single source of truth) ของ Design System เชิงภาพ (สี, ตัวอักษร, ระยะห่าง, องค์ประกอบ UI, accessibility) — เมื่อสร้างหรือแก้ไข Prototype ใดๆ ใน `01-prototypes/` ให้ยึด token และกติกาใน `DESIGN.md` เสมอ ห้ามกำหนดสี/สไตล์ใหม่นอกเอกสารนี้โดยไม่จำเป็น หากพบว่า Design System ต้องเปลี่ยน ให้แก้ที่ `DESIGN.md` ก่อน แล้วค่อยสะท้อนไปยัง Prototype
- ยังไม่มี package manifest, โครงสร้างซอร์สโค้ด หรือ CI config ใดๆ เมื่อเริ่มพัฒนาจริงแล้ว ควรกลับมาอัปเดตไฟล์นี้ให้มีคำสั่ง build/lint/test และสถาปัตยกรรมโค้ดจริง
