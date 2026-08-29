# Component Design: มอบหมายงานสำรวจให้ทีม

รองรับ [[feature-list#8. มอบหมายงานสำรวจให้ทีม|ฟีเจอร์ 8]] (Should have) — อ้างอิง operation จาก [[api-spec#3. มอบหมายงานสำรวจให้ทีม|api-spec หัวข้อ 3]] และ entity [[db-spec#3.1 Assignment|Assignment]], [[db-spec#3.2 AssignmentMember|AssignmentMember]]

เป็นจุดเริ่มต้นของ journey การสำรวจภาคสนาม (ฟีเจอร์ 1-6) ใช้งานผ่าน [[architecture#2. Logical Component|Management Web Client]] โดยหัวหน้าผู้สำรวจ — `Assignment.id` ที่ได้เป็น input ไม่บังคับของ [[building-environment-info#2. Operation ↔ Entity ที่กระทบ|4.1 เริ่มต้นแบบสำรวจอาคารใหม่]]

## 1. Sequence Diagram

```mermaid
sequenceDiagram
    actor SL as หัวหน้าผู้สำรวจ
    participant MC as Management Web Client
    participant BE as Backend Service
    participant DB as Primary Data Store

    SL->>MC: สร้างงานมอบหมาย (ชื่องาน/พื้นที่/กำหนดวัน/รายชื่อผู้สำรวจ)
    MC->>BE: 3.1 สร้างงานมอบหมายสำรวจ
    BE->>BE: ตรวจสอบผู้ถูกมอบหมายทุกคนมี role=ผู้สำรวจภาคสนาม
    alt ผ่านเงื่อนไข
        BE->>DB: สร้าง Assignment (status=มอบหมายแล้ว) + AssignmentMember ตามรายชื่อ
    else รายชื่อว่าง/พบ role ไม่ถูกต้อง
        BE-->>MC: ปฏิเสธ แจ้งสาเหตุ
    end

    SL->>MC: ดูรายการงานที่มอบหมาย
    MC->>BE: 3.2 ดูรายการงานที่ได้รับมอบหมาย
    BE->>DB: อ่าน Assignment ที่ created_by_user_id=หัวหน้าผู้สำรวจนี้
    DB-->>BE: รายการ Assignment
    BE-->>MC: แสดงรายการพร้อมสถานะ
```

## 2. Operation ↔ Entity ที่กระทบ

| Operation ([[api-spec#3. มอบหมายงานสำรวจให้ทีม\|api-spec 3.x]]) | Entity ที่กระทบ | การกระทำ | ลำดับ/เงื่อนไข |
|---|---|---|---|
| 3.1 สร้างงานมอบหมายสำรวจ | [[db-spec#3.1 Assignment\|Assignment]] (สร้าง), [[db-spec#3.2 AssignmentMember\|AssignmentMember]] (สร้างตามรายชื่อ) | สร้าง | ผู้ถูกมอบหมายทุกคนต้อง `role = ผู้สำรวจภาคสนาม` |
| 3.2 ดูรายการงานที่ได้รับมอบหมาย | [[db-spec#3.1 Assignment\|Assignment]] | อ่าน | กรองตามสิทธิ์ผู้เรียก (ผู้สำรวจเห็นเฉพาะงานตน, หัวหน้าเห็นงานที่ตนมอบหมาย) |

## 3. State Diagram: Assignment.status (พบช่องว่างใน api-spec)

```mermaid
stateDiagram-v2
    [*] --> มอบหมายแล้ว : 3.1 สร้างงานมอบหมายสำรวจ
    มอบหมายแล้ว --> กำลังดำเนินการ : ??? ไม่มี operation ใน api-spec รองรับ transition นี้
    กำลังดำเนินการ --> เสร็จสิ้น : ??? ไม่มี operation ใน api-spec รองรับ transition นี้
```

**ช่องว่างที่พบ**: [[db-spec#3.1 Assignment|db-spec 3.1]] นิยาม `Assignment.status` ไว้ 3 ค่า (`มอบหมายแล้ว` / `กำลังดำเนินการ` / `เสร็จสิ้น`) แต่ [[api-spec#3. มอบหมายงานสำรวจให้ทีม|api-spec หัวข้อ 3]] มีเพียง 2 operation (3.1 สร้าง, 3.2 อ่านอย่างเดียว) — **ไม่มี operation ใดเปลี่ยน `status` จาก `มอบหมายแล้ว` ไปเป็น `กำลังดำเนินการ`/`เสร็จสิ้น`** ปัจจุบันจึงไม่มีวิธีอัปเดตความคืบหน้าของงานมอบหมายในระบบ ควรรัน `sync-api-db` เพื่อพิจารณาเพิ่ม operation ปรับสถานะงาน (อาจอัตโนมัติจากการที่สมาชิกเริ่ม/สำรวจอาคารในพื้นที่ที่มอบหมายเสร็จ หรือด้วยตนเองโดยหัวหน้าทีม)

## 4. Edge Case และวิธีจัดการ

| Edge Case | วิธีจัดการ | อ้างอิง |
|---|---|---|
| รายชื่อผู้สำรวจว่างเปล่า | ปฏิเสธการสร้างงานมอบหมาย | [[api-spec#3. มอบหมายงานสำรวจให้ทีม\|api-spec 3.1]] |
| พบ `user_id` ที่ไม่ใช่บทบาทผู้สำรวจภาคสนาม | ปฏิเสธการสร้างงานมอบหมาย | [[api-spec#3. มอบหมายงานสำรวจให้ทีม\|api-spec 3.1]] |
| ไม่มีงานมอบหมายตรงเงื่อนไขผู้เรียก (3.2) | คืนรายการว่าง ไม่ถือเป็น error | [[api-spec#3. มอบหมายงานสำรวจให้ทีม\|api-spec 3.2]] |

## เอกสารที่เกี่ยวข้อง

- [[api-spec]], [[db-spec]], [[feature-list]], [[user-journey]]
- [[building-environment-info]] — ใช้ `Assignment.id` เป็น input ไม่บังคับตอนเริ่มแบบสำรวจ
