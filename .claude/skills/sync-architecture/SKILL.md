---
name: sync-architecture
description: >
  สร้างหรือปรับปรุงเอกสาร High-Level Architecture เชิง conceptual ที่
  docs/02-design/02-technical/architecture.md (ไม่ผูกมัดกับ technical stack) ให้สอดคล้องกับ
  docs/02-design/feature-list.md/user-journey.md/backlog.md ล่าสุด ครอบคลุม logical component,
  ตัวขับเคลื่อนเชิงสถาปัตยกรรม, data flow ครบทุก user journey, cross-cutting concern,
  NFR mapping, เหตุผลการตัดสินใจ, ข้อสมมติ และประเด็นรอตัดสินใจ
  ใช้เมื่อผู้ใช้พิมพ์ /sync-architecture หรือขอให้ "ทำ architecture", "ทำ high level architecture",
  "ออกแบบ hi-level design", "เขียน system architecture", "ออกแบบ data flow ตาม user journey",
  "อัปเดต architecture จาก feature list"
---

# Sync Architecture

Skill นี้เป็น workflow มาตรฐานสำหรับสร้าง/ปรับปรุงเอกสาร **High-Level Architecture เชิง
conceptual** ที่ `docs/02-design/02-technical/architecture.md` ให้สอดคล้อง ("up to date") กับ
`docs/02-design/feature-list.md`/`docs/02-design/user-journey.md`/`docs/01-requirements/backlog.md`
โดย**ไม่ผูกมัดกับ technical stack ใดๆ** จนกว่า `technology-stack.md` จะถูกตัดสินใจจริง พร้อม
บันทึก log ตามกฎใน `CLAUDE.md`

## เมื่อถูกเรียกใช้

1. **หาวันที่ปัจจุบัน**: รูปแบบ `YYYYMMDD` เพื่อส่งต่อให้ subagent ใช้กับไฟล์ log ของวันนี้

2. **รับขอบเขตจากผู้ใช้ (ถ้ามีการระบุ)**: ผู้ใช้ระบุขอบเขตเจาะจงได้ เช่น เฉพาะ journey ใด
   journey หนึ่ง, เฉพาะฟีเจอร์, หรือเฉพาะ NFR บางกลุ่ม — ถ้าไม่ระบุ ให้ถือว่าครอบคลุมทั้งระบบ
   **ถ้าขอบเขตถูกจำกัด ต้องรายงานท้ายงานเสมอว่าอะไรยังไม่ถูกครอบคลุมในรอบนี้**

3. **ส่งต่อให้ subagent `architecture-writer`**: เรียกผ่าน Agent tool
   (`subagent_type: architecture-writer`, รันแบบ foreground คือ `run_in_background: false`
   เพราะ subagent นี้อาจต้องถามผู้ใช้แบบโต้ตอบระหว่างทาง) โดย prompt ที่ส่งต้องมี:
   - วันที่ปัจจุบัน (YYYYMMDD)
   - ขอบเขตที่ผู้ใช้ระบุ (ถ้ามี)
   - บริบทว่านี่คือ session สนทนากับผู้ใช้จริง คำถามที่ subagent ถามจะไปถึงผู้ใช้ทันที
   - **ย้ำกฎการถาม**: ถ้าพบประเด็นที่ตัดสินแทนผู้ใช้ไม่ได้ ต้องถามผ่าน `AskUserQuestion` โดย
     เสนออย่างน้อย 3 แนวทาง แต่ละแนวทางระบุข้อดี/ข้อเสีย และตัวเลือกแรกคือตัวที่แนะนำ
     ต่อท้าย label ด้วย `(แนะนำ)` — **ถ้า `AskUserQuestion` ใช้ไม่ได้ในเซสชันนั้น ห้ามเดาเอง
     ให้รายงานทางเลือกทั้งหมดกลับมาโดยยังไม่เขียนส่วนที่ต้องตัดสินใจ** แล้ว skill จะถามผู้ใช้แทน

4. **รอผลลัพธ์**: ระหว่างที่ subagent ถามคำถาม ให้ปล่อยให้ subagent จัดการเอง **อย่ายืนยัน/ตอบแทน
   ผู้ใช้** ถ้า subagent ส่งทางเลือกกลับมาเพราะถามเองไม่ได้ ให้ skill ถามผู้ใช้ตามรูปแบบในข้อ 3
   แล้วส่งคำตอบกลับไปให้ subagent เขียนต่อ

5. **ตรวจจับสัญญาณ "ต้องการ requirement ใหม่"**: อ่านรายงานที่ได้กลับมาทั้งหมด
   - **ถ้าไม่มีหัวข้อ `## NEEDS_NEW_REQUIREMENT` ในรายงาน**: ข้ามไปข้อ 7 ตามปกติ
   - **ถ้ามีหัวข้อนี้**: ทำตามข้อ 6 ก่อน (auto-chain ไป `requirement-writer`) แล้วค่อยไปข้อ 7

6. **Auto-chain ไป `requirement-writer` (เฉพาะเมื่อมีสัญญาณในข้อ 5)**:
   a. แจ้งผู้ใช้สั้นๆ ว่าเจอความต้องการใหม่ระหว่างออกแบบ architecture กำลังส่งต่อให้
      `requirement-writer` เขียนเป็น FR/NFR ให้อัตโนมัติ (ไม่ต้องถามผู้ใช้ก่อน)
   b. เรียก subagent `requirement-writer` ผ่าน Agent tool (`run_in_background: false`) โดย prompt
      มีเนื้อหาใต้หัวข้อ `## NEEDS_NEW_REQUIREMENT` แบบ verbatim + วันที่ปัจจุบัน + บริบท session จริง
   c. รอผลลัพธ์ สุ่มตรวจสอบเองอย่างน้อย 1 จุด (`backlog.md`)
   d. เรียก `sync-feature-journey` ต่อ (ผ่าน Skill tool) เพื่อให้ feature-list/user-journey
      สะท้อนรหัสใหม่ก่อน แล้วเรียก subagent `architecture-writer` อีกรอบ (prompt เดิม)
   e. **ป้องกัน infinite loop**: ทำซ้ำได้อีกไม่เกิน 1 รอบ ถ้ายังพบสัญญาณอีก ให้หยุดและรายงาน
      ผู้ใช้ตรงๆ

7. **ตรวจสอบผลลัพธ์ก่อนรายงาน** — อ่าน `architecture.md` จริง ตรวจครบทุกข้อต่อไปนี้:
   - มี Mermaid diagram จริง (ทั้ง component diagram และ data flow)
   - **ไม่มีชื่อ technology/framework/database engine/ภาษาโปรแกรม/cloud provider หลุดเข้าไป**
     (ถ้า `technology-stack.md` ยังว่างเปล่า)
   - **มีหัวข้อบังคับครบ**: ภาพรวมและขอบเขต · ตัวขับเคลื่อนและข้อจำกัดเชิงสถาปัตยกรรม ·
     Component Diagram · ตารางขอบเขตความรับผิดชอบ · ระบบภายนอกและจุดเชื่อมต่อ · Data Flow ต่อ
     journey · ตารางความครอบคลุม journey · Cross-cutting concerns · ตาราง NFR Mapping ·
     เหตุผลการตัดสินใจเชิงสถาปัตยกรรม · ข้อสมมติ · ประเด็นรอตัดสินใจ
   - **ตารางความครอบคลุม journey มีครบทุก journey ใน `user-journey.md`** — นับเทียบกันจริง
     journey ที่ถูกรวมกับอันอื่นต้องมีแถวของตัวเองพร้อมเหตุผล ไม่ใช่หายไปเฉยๆ
   - **ตาราง NFR Mapping ครบทุก NFR ใน `backlog.md`** — นับเทียบกันจริง
   - anchor ของ `[[wikilink]]` หลัง `#` ตรงกับ heading จริงทุกตัวอักษร

8. **สรุปให้ผู้ใช้ทราบ**: up to date อยู่แล้วหรือไม่ก่อนตรวจ, ส่วนที่แก้ไข, จำนวน journey/NFR ที่
   ครอบคลุม, คำถามที่ถามผู้ใช้และคำตอบที่ได้ (ถ้ามี), ความต้องการใหม่ที่ auto-chain ไปให้ (ถ้ามี),
   **และสิ่งที่ยังไม่ถูกครอบคลุมในรอบนี้**

## ข้อควรระวัง

- ห้ามข้ามการเรียก subagent แล้วเขียน `architecture.md` เองตรงๆ ในเทรดหลัก
- Subagent นี้ไม่มีเครื่องมือ Bash และห้ามแตะไฟล์ใดๆ นอกจาก `architecture.md` กับไฟล์ log ของ
  วันนั้น หากผลลัพธ์พูดถึงการแก้ไขไฟล์อื่น (โดยเฉพาะ `backlog.md`, `feature-list.md`,
  `user-journey.md`, `technology-stack.md`) ให้หยุดและแจ้งผู้ใช้ทันที
- **ถ้าผลลัพธ์ที่ได้กลับมาระบุชื่อ technology/framework/database engine ใดๆ ทั้งที่
  `technology-stack.md` ยังว่างเปล่าอยู่ ให้ถือว่าผิดกฎ** หยุดและแจ้งผู้ใช้ทันที
- **ถ้า subagent ตัดสินใจประเด็นที่ควรถามผู้ใช้เองโดยไม่ถาม ให้ถือว่าผิดกฎ** — ตรวจได้จากหัวข้อ
  "เหตุผลการตัดสินใจเชิงสถาปัตยกรรม" ว่ามีการตัดสินใจใดที่อ้างเหตุผลลอยๆ โดยไม่มีฐานจาก FR/NFR
  หรือคำตอบของผู้ใช้ ให้หยุดและแจ้งผู้ใช้
- **ถ้าเอกสารที่ได้มีข้อความอธิบายข้อจำกัดของรอบการทำงานปนอยู่** (เช่น "ไม่ได้อ่านไฟล์นั้นเพราะ
  ประหยัดเวลา/session") ให้ส่งกลับไปให้ subagent แก้ — เอกสารถาวรต้องระบุแหล่งอ้างอิงที่ใช้จริง
  ไม่ใช่เล่าสิ่งที่ไม่ได้ทำ
- ห้ามวน auto-chain เกิน 1 รอบเด็ดขาด
- ถ้า subagent รายงานว่า `feature-list.md`/`user-journey.md` ไม่สอดคล้องกับ `backlog.md` ให้แจ้ง
  ผู้ใช้ให้รัน `sync-feature-journey` ก่อน อย่าฝืนทำต่อ
