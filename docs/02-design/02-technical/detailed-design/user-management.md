# Component Design: จัดการผู้ใช้และสิทธิ์การเข้าถึง

รองรับ [[feature-list#9. จัดการผู้ใช้และสิทธิ์การเข้าถึง|ฟีเจอร์ 9]] (Must have) — อ้างอิง operation จาก [[api-spec#2. จัดการผู้ใช้และสิทธิ์การเข้าถึง|api-spec หัวข้อ 2]] และ entity [[db-spec#2.1 User|User]], [[db-spec#2.2 Session|Session]], [[db-spec#7.2 AuditTrailEntry|AuditTrailEntry]]

ใช้งานผ่าน [[architecture#2. Logical Component|Management Web Client]] โดยผู้ดูแลระบบ — ผลลัพธ์ (`role`) เป็นฐานของการบังคับสิทธิ์ (RBAC) ที่ใช้จริงตอนเข้าสู่ระบบใน [[authentication-login]]

## 1. Sequence Diagram

```mermaid
sequenceDiagram
    actor AD as ผู้ดูแลระบบ
    participant MC as Management Web Client
    participant BE as Backend Service
    participant DB as Primary Data Store

    AD->>MC: กรอกข้อมูลบัญชีผู้ใช้ใหม่ (username/full_name/credential_secret/role/...)
    MC->>BE: 2.1 สร้างบัญชีผู้ใช้ใหม่
    BE->>BE: ตรวจสอบ username ไม่ซ้ำ + role ถูกต้อง
    alt ผ่านการตรวจสอบ
        BE->>DB: สร้าง User (account_status=ใช้งานได้)
    else username ซ้ำ / role ไม่ถูกต้อง
        BE-->>MC: ปฏิเสธ แจ้งสาเหตุ
    end

    AD->>MC: แก้ไขข้อมูล/บทบาทผู้ใช้
    MC->>BE: 2.2 แก้ไขข้อมูล/บทบาทผู้ใช้
    BE->>DB: ปรับปรุง User + สร้าง AuditTrailEntry (action_type=แก้ไขบัญชีผู้ใช้)
    Note over BE: การเปลี่ยน role มีผลกับ session ที่ใช้งานอยู่ทันที (บังคับตรวจสิทธิ์ใหม่ในคำขอถัดไป)

    AD->>MC: ปิดการใช้งานบัญชีผู้ใช้
    MC->>BE: 2.3 ปิดการใช้งานบัญชีผู้ใช้
    BE->>DB: ปรับปรุง User.account_status=ปิดใช้งาน + สร้าง AuditTrailEntry (action_type=ปิดการใช้งานบัญชีผู้ใช้)
    BE->>DB: เพิกถอน Session ที่ status=ใช้งานอยู่ ของผู้ใช้นี้ทั้งหมด (status=ถูกเพิกถอน)

    AD->>MC: เปิดใช้งานบัญชีผู้ใช้คืน
    MC->>BE: 2.4 เปิดใช้งานบัญชีผู้ใช้คืน
    BE->>BE: ตรวจสอบ account_status ปัจจุบัน=ปิดใช้งาน เท่านั้น
    alt account_status=ปิดใช้งาน อยู่ก่อน
        BE->>DB: ปรับปรุง User.account_status=ใช้งานได้ + สร้าง AuditTrailEntry (action_type=เปิดใช้งานบัญชีผู้ใช้คืน)
        Note over BE: ไม่กระทบ Session เดิม — ผู้ใช้ต้องเข้าสู่ระบบใหม่เองผ่าน authentication-login
    else account_status=ใช้งานได้ อยู่แล้ว / ไม่พบผู้ใช้
        BE-->>MC: ปฏิเสธ แจ้งสาเหตุ
    end
```

## 2. Operation ↔ Entity ที่กระทบ

| Operation ([[api-spec#2. จัดการผู้ใช้และสิทธิ์การเข้าถึง\|api-spec 2.x]]) | Entity ที่กระทบ | การกระทำ | ลำดับ/เงื่อนไข |
|---|---|---|---|
| 2.1 สร้างบัญชีผู้ใช้ใหม่ | [[db-spec#2.1 User\|User]] | สร้าง | `username` ต้องไม่ซ้ำ, `role` ต้องเป็น 1 ใน 4 ค่า |
| 2.2 แก้ไขข้อมูล/บทบาทผู้ใช้ | [[db-spec#2.1 User\|User]] (แก้ไข), [[db-spec#7.2 AuditTrailEntry\|AuditTrailEntry]] (สร้าง) | แก้ไข + สร้าง | ต้องมี `User` อยู่ก่อน (2.1); ถ้าเปลี่ยน `role` กระทบ `Session` ที่ใช้งานอยู่ทันที |
| 2.3 ปิดการใช้งานบัญชีผู้ใช้ | [[db-spec#2.1 User\|User]] (แก้ไข), [[db-spec#2.2 Session\|Session]] (แก้ไขหลายรายการ), [[db-spec#7.2 AuditTrailEntry\|AuditTrailEntry]] (สร้าง) | แก้ไข + เพิกถอน + สร้าง | ต้องเพิกถอน `Session` ที่ `status = ใช้งานอยู่` ของผู้ใช้นี้ทั้งหมดทันที |
| 2.4 เปิดใช้งานบัญชีผู้ใช้คืน | [[db-spec#2.1 User\|User]] (แก้ไข), [[db-spec#7.2 AuditTrailEntry\|AuditTrailEntry]] (สร้าง) | แก้ไข + สร้าง | ทำได้เฉพาะบัญชีที่ `account_status = ปิดใช้งาน` อยู่ก่อนเท่านั้น; ไม่กระทบ `Session` เดิม (ผู้ใช้ต้องเข้าสู่ระบบใหม่เองตาม [[authentication-login]]) |

## 3. State Diagram: User.account_status

```mermaid
stateDiagram-v2
    [*] --> ใช้งานได้ : 2.1 สร้างบัญชีผู้ใช้ใหม่
    ใช้งานได้ --> ปิดใช้งาน : 2.3 ปิดการใช้งานบัญชีผู้ใช้
    ปิดใช้งาน --> ใช้งานได้ : 2.4 เปิดใช้งานบัญชีผู้ใช้คืน
```

ช่องว่างที่เคยรายงานไว้ (ไม่มี operation เปิดใช้งานบัญชีคืน) **ถูกปิดแล้ว** — `api-db-writer` เพิ่ม operation [[api-spec#2. จัดการผู้ใช้และสิทธิ์การเข้าถึง|2.4 เปิดใช้งานบัญชีผู้ใช้คืน]] ให้แล้ว

## 4. Edge Case และวิธีจัดการ

| Edge Case | วิธีจัดการ | อ้างอิง |
|---|---|---|
| `username` ซ้ำ | ปฏิเสธการสร้างบัญชี | [[api-spec#2. จัดการผู้ใช้และสิทธิ์การเข้าถึง\|api-spec 2.1]] |
| `role` ไม่ถูกต้อง (ไม่ใช่ 1 ใน 4 ค่า) | ปฏิเสธการสร้างบัญชี | [[api-spec#2. จัดการผู้ใช้และสิทธิ์การเข้าถึง\|api-spec 2.1]] |
| ไม่พบผู้ใช้ที่ต้องการแก้ไข | ปฏิเสธการแก้ไข | [[api-spec#2. จัดการผู้ใช้และสิทธิ์การเข้าถึง\|api-spec 2.2]] |
| ไม่พบผู้ใช้ที่ต้องการปิดใช้งาน / บัญชีถูกปิดใช้งานอยู่แล้ว | ปฏิเสธการดำเนินการ | [[api-spec#2. จัดการผู้ใช้และสิทธิ์การเข้าถึง\|api-spec 2.3]] |
| ไม่พบผู้ใช้ที่ต้องการเปิดใช้งานคืน / บัญชีอยู่ในสถานะ "ใช้งานได้" อยู่แล้ว | ปฏิเสธการดำเนินการ | [[api-spec#2. จัดการผู้ใช้และสิทธิ์การเข้าถึง\|api-spec 2.4]] |

## เอกสารที่เกี่ยวข้อง

- [[api-spec]], [[db-spec]], [[feature-list]], [[user-journey]], [[architecture]]
- [[authentication-login]] — การบังคับสิทธิ์ตาม `role` ที่กำหนดในฟีเจอร์นี้ตอนเข้าสู่ระบบจริง
