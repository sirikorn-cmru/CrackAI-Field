import type { UserRole } from '@crackai/shared';

/**
 * ตารางสิทธิ์เรียก operation ตามบทบาท — T-1-03, T-1-11 (FR-26, NFR-08)
 *
 * เนื้อหาในไฟล์นี้**คัดลอกตรงตัวจากบรรทัด "ผู้เรียกได้" ของทุก operation ใน**
 * `docs/02-design/02-technical/api-spec.md` เอกสารคือแหล่งความจริง ไฟล์นี้คือสำเนาที่
 * บังคับใช้ได้จริง เมื่อ api-spec เปลี่ยน ต้องแก้ไฟล์นี้ตามเสมอ
 *
 * เหตุผลที่รวมไว้ที่เดียว: FR-26 บังคับให้ "แสดง/อนุญาตเฉพาะฟังก์ชันและหน้าจอที่ตรงกับบทบาท"
 * (ฝั่ง client ใช้สร้างเมนู) และ NFR-08 บังคับให้ตรวจสิทธิ์ก่อนทุก operation (ฝั่งเซิร์ฟเวอร์)
 * ถ้าปล่อยให้แต่ละ service เขียนเงื่อนไขบทบาทเอง สองฝั่งจะเพี้ยนจากกันโดยไม่มีใครรู้ —
 * `allowedOperationsFor()` จึงเป็นคำตอบเดียวกันทั้งสองฝั่ง
 */

/** รหัส operation ตามเลขหัวข้อใน api-spec ตรงตัว ไม่แปลงเป็นชื่ออื่น */
export type OperationId =
  | '1.1' | '1.2' | '1.3' | '1.4'
  | '2.1' | '2.2' | '2.3' | '2.4'
  | '3.1' | '3.2' | '3.3'
  | '4.1' | '4.2' | '4.3'
  | '5.1' | '5.2' | '5.3' | '5.4'
  | '6.1' | '6.2'
  | '7.1' | '7.2' | '7.3' | '7.4' | '7.5'
  | '8.1'
  | '9.1' | '9.2'
  | '10.1' | '10.2' | '10.3'
  | '11.1'
  | '12.1'
  | '13.1'
  | '14.1' | '14.2'
  | '15.1' | '15.2'
  | '15.5.1' | '15.5.2';

/**
 * ขอบเขตข้อมูลที่บทบาทหนึ่งเข้าถึงได้ภายใน operation หนึ่ง (ownership-based scoping ตาม
 * architecture §5.5) — ประกาศไว้**เฉพาะ operation ที่ api-spec ระบุขอบเขตไว้จริงเท่านั้น**
 * ถ้าไม่มีค่านี้ แปลว่า api-spec ระบุแค่บทบาท ไม่ได้ระบุขอบเขตเพิ่ม ห้ามเดาขอบเขตเอง
 */
export type DataScope = 'เฉพาะระเบียนของตน' | 'เฉพาะทีมที่ตนรับผิดชอบ';

export interface RoleAccess {
  role: UserRole;
  scope?: DataScope;
}

export interface OperationPolicy {
  id: OperationId;
  /** ชื่อหัวข้อใน api-spec ใช้ประกอบข้อความปฏิเสธสิทธิ์ */
  title: string;
  /** ว่างเปล่า = ไม่มีบทบาทผู้ใช้ใดเรียกได้ (operation ภายในระบบ) */
  callers: readonly RoleAccess[];
}

const FIELD: UserRole = 'ผู้สำรวจภาคสนาม';
const LEAD: UserRole = 'หัวหน้าผู้สำรวจ';
const ADMIN: UserRole = 'ผู้ดูแลระบบ';
const CENTRAL: UserRole = 'หน่วยงานส่วนกลาง-ผู้บริหาร';

const EVERY_ROLE: readonly RoleAccess[] = [
  { role: FIELD },
  { role: LEAD },
  { role: ADMIN },
  { role: CENTRAL },
];

/** บันทึกแบบสำรวจทุกหมวดเรียกได้เฉพาะผู้สำรวจภาคสนาม (api-spec §4–§8) */
const FIELD_ONLY: readonly RoleAccess[] = [{ role: FIELD }];

export const OPERATION_POLICIES: readonly OperationPolicy[] = [
  { id: '1.1', title: 'เข้าสู่ระบบ', callers: EVERY_ROLE },
  {
    id: '1.2',
    title: 'ออกจากระบบ',
    // api-spec: "ทุกบทบาท (เจ้าของ session)"
    callers: EVERY_ROLE.map((caller) => ({ ...caller, scope: 'เฉพาะระเบียนของตน' as const })),
  },
  {
    id: '1.3',
    title: 'เข้าสู่ระบบด้วย credential ที่แคชไว้ขณะออฟไลน์',
    callers: [{ role: FIELD, scope: 'เฉพาะระเบียนของตน' }],
  },
  {
    id: '1.4',
    title: 'ต่ออายุ/ยืนยันตัวตนใหม่เมื่อกลับมามีสัญญาณ',
    callers: [{ role: FIELD, scope: 'เฉพาะระเบียนของตน' }],
  },

  { id: '2.1', title: 'สร้างบัญชีผู้ใช้ใหม่', callers: [{ role: ADMIN }] },
  { id: '2.2', title: 'แก้ไขข้อมูล/บทบาทผู้ใช้', callers: [{ role: ADMIN }] },
  { id: '2.3', title: 'ปิดการใช้งานบัญชีผู้ใช้', callers: [{ role: ADMIN }] },
  { id: '2.4', title: 'เปิดใช้งานบัญชีผู้ใช้คืน', callers: [{ role: ADMIN }] },

  { id: '3.1', title: 'สร้างงานมอบหมายสำรวจ', callers: [{ role: LEAD }] },
  {
    id: '3.2',
    title: 'ดูรายการงานที่ได้รับมอบหมาย',
    callers: [
      { role: FIELD, scope: 'เฉพาะระเบียนของตน' },
      { role: LEAD, scope: 'เฉพาะทีมที่ตนรับผิดชอบ' },
    ],
  },
  {
    id: '3.3',
    title: 'เปลี่ยนสถานะงานมอบหมาย',
    callers: [
      { role: FIELD, scope: 'เฉพาะระเบียนของตน' },
      { role: LEAD, scope: 'เฉพาะทีมที่ตนรับผิดชอบ' },
    ],
  },

  { id: '4.1', title: 'เริ่มต้นแบบสำรวจอาคารใหม่', callers: FIELD_ONLY },
  { id: '4.2', title: 'บันทึก/แก้ไขข้อมูลกายภาพอาคาร', callers: FIELD_ONLY },
  { id: '4.3', title: 'บันทึกอันตรายโดยรอบอาคาร', callers: FIELD_ONLY },

  { id: '5.1', title: 'บันทึกความเสียหายภายนอกอาคาร', callers: FIELD_ONLY },
  { id: '5.2', title: 'บันทึกความเสียหายโครงสร้างอาคาร', callers: FIELD_ONLY },
  { id: '5.3', title: 'บันทึกความเสียหายส่วนประกอบอาคาร', callers: FIELD_ONLY },
  { id: '5.4', title: 'บันทึกความเสียหายระบบไฟฟ้า', callers: FIELD_ONLY },

  { id: '6.1', title: 'บันทึกผลสรุประดับสี', callers: FIELD_ONLY },
  { id: '6.2', title: 'ดึงเกณฑ์อ้างอิงคู่มือ', callers: FIELD_ONLY },

  { id: '7.1', title: 'ถ่ายภาพประกอบความเสียหาย/ผูกกับบริเวณ', callers: FIELD_ONLY },
  { id: '7.2', title: 'ส่งภาพให้ AI วิเคราะห์ (on-device)', callers: FIELD_ONLY },
  { id: '7.3', title: 'ยืนยัน/แก้ไขผลวิเคราะห์ AI ก่อนบันทึกจริง', callers: FIELD_ONLY },
  { id: '7.4', title: 'กรอกระดับความเสียหายของรอยร้าวด้วยตนเอง', callers: FIELD_ONLY },
  { id: '7.5', title: 'รายงานผลวิเคราะห์ AI ไม่สำเร็จ+เสนอถ่ายใหม่', callers: FIELD_ONLY },

  { id: '8.1', title: 'วาดภาพประกอบเพิ่มเติม', callers: FIELD_ONLY },

  {
    id: '9.1',
    title: 'บันทึกรายชื่อผู้สำรวจและหัวหน้าผู้สำรวจ',
    callers: [{ role: FIELD }, { role: LEAD }],
  },
  { id: '9.2', title: 'บันทึกเวลาเริ่ม/เสร็จสิ้นการสำรวจ', callers: FIELD_ONLY },

  {
    id: '10.1',
    title: 'ส่งแบบสำรวจเข้าสู่คิวตรวจทาน',
    callers: [{ role: FIELD }, { role: LEAD }],
  },
  { id: '10.2', title: 'ตรวจทานผลสำรวจ (ส่งกลับแก้ไข)', callers: [{ role: LEAD }] },
  { id: '10.3', title: 'ลงลายมือชื่อดิจิทัลรับรองผล', callers: [{ role: LEAD }] },

  { id: '11.1', title: 'ดู Dashboard ภาพรวมผลสำรวจ', callers: [{ role: CENTRAL }] },

  { id: '12.1', title: 'ส่งออกรายงานผลการสำรวจ', callers: [{ role: CENTRAL }] },

  {
    id: '13.1',
    title: 'ค้นหา/กรองรายการอาคารที่สำรวจแล้ว',
    callers: [{ role: CENTRAL }, { role: LEAD, scope: 'เฉพาะทีมที่ตนรับผิดชอบ' }],
  },

  {
    id: '14.1',
    title: 'ซิงค์ข้อมูลแบบสำรวจที่ค้างจากอุปกรณ์',
    callers: [{ role: FIELD, scope: 'เฉพาะระเบียนของตน' }],
  },
  {
    id: '14.2',
    title: 'ตรวจสอบ/แก้ไขความขัดแย้งของข้อมูลที่ซิงค์',
    // api-spec: "ระบบภายใน (Sync & Conflict Resolution Service ไม่มีผู้ใช้เรียกตรง)"
    // รายการว่างจึงแปลว่าไม่มีบทบาทใดผ่านการตรวจสิทธิ์นี้ได้เลย ไม่ใช่ "ผ่านทุกบทบาท"
    callers: [],
  },

  {
    id: '15.1',
    title: 'แสดงรายการระเบียนที่มีความขัดแย้งของข้อมูลรอการแก้ไขด้วยมือ',
    callers: [{ role: LEAD, scope: 'เฉพาะทีมที่ตนรับผิดชอบ' }, { role: ADMIN }],
  },
  {
    id: '15.2',
    title: 'เปรียบเทียบเวอร์ชันข้อมูลที่ขัดแย้งกันและเลือก/รวมค่าด้วยมือ',
    callers: [{ role: LEAD, scope: 'เฉพาะทีมที่ตนรับผิดชอบ' }, { role: ADMIN }],
  },

  {
    id: '15.5.1',
    title: 'เรียกดูประวัติการแก้ไขผลประเมินรายอาคาร',
    // ไม่รวมผู้สำรวจภาคสนาม (FR-26)
    callers: [
      { role: LEAD, scope: 'เฉพาะทีมที่ตนรับผิดชอบ' },
      { role: ADMIN },
      { role: CENTRAL },
    ],
  },
  {
    id: '15.5.2',
    title: 'ค้นหา/กรองประวัติการแก้ไขทั่วทั้งระบบ',
    // ไม่รวมหัวหน้าผู้สำรวจ (ขอบเขตกว้างกว่าทีมตน ให้ใช้ 15.5.1 แทน) และไม่รวมผู้สำรวจภาคสนาม (FR-26)
    callers: [{ role: ADMIN }, { role: CENTRAL }],
  },
];

const POLICY_BY_ID = new Map<OperationId, OperationPolicy>(
  OPERATION_POLICIES.map((policy) => [policy.id, policy]),
);

export function policyOf(operationId: OperationId): OperationPolicy {
  const policy = POLICY_BY_ID.get(operationId);
  // ตารางถูกสร้างจากรายการเดียวกับที่ประกาศชนิด OperationId จึงไม่ควรเกิดขึ้นจริง
  // แต่ตรวจไว้เพื่อไม่ให้ operation ที่ลืมใส่ในตารางกลายเป็น "ผ่านสิทธิ์" โดยเงียบๆ
  if (!policy) throw new Error(`ไม่พบนโยบายสิทธิ์ของ operation ${operationId} ใน api-spec`);
  return policy;
}
