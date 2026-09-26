import { authorize, type Caller } from '../authorization/authorization.service.ts';
import type { DashboardFilter, DashboardRepository, SeverityTally } from './survey.repository.ts';

export interface DashboardView {
  /** จำนวนอาคารที่นับได้ทั้งหมดตามตัวกรอง (เฉพาะที่ซิงค์สำเร็จแล้ว) */
  total: number;
  by_severity: { เขียว: number; เหลือง: number; แดง: number; ยังไม่สรุป: number };
  by_area: readonly SeverityTally[];
}

/**
 * ภาพรวมผลสำรวจสำหรับหน่วยงานส่วนกลาง — T-2-19 (FR-22, NFR-10)
 * ครอบคลุม api-spec operation 11.1
 */
export class DashboardService {
  private readonly repository: DashboardRepository;

  constructor(repository: DashboardRepository) {
    this.repository = repository;
  }

  /** api-spec 11.1 ดู Dashboard ภาพรวมผลสำรวจ */
  async overview(caller: Caller, filter: DashboardFilter = {}): Promise<DashboardView> {
    authorize(caller, '11.1');

    if (
      filter.completed_from !== undefined &&
      filter.completed_to !== undefined &&
      filter.completed_to.getTime() < filter.completed_from.getTime()
    ) {
      // ช่วงวันที่กลับหัวจะคืนค่าว่างเสมอ ซึ่งอ่านเหมือน "ไม่มีข้อมูล" ทั้งที่เป็นตัวกรองผิด
      throw new RangeError('ช่วงวันที่ไม่ถูกต้อง: วันสิ้นสุดมาก่อนวันเริ่มต้น');
    }

    // ที่เก็บข้อมูลเป็นผู้กรอง sync_status ให้เหลือเฉพาะ "ซิงค์สำเร็จ" ตาม db-spec §10 ข้อ 4
    // (NFR-10) — ระเบียนที่ยังขัดแย้งค้างอยู่ต้องไม่ถูกนับรวมในภาพรวมเด็ดขาด
    const by_area = await this.repository.tallyBySeverity(filter);

    const by_severity = { เขียว: 0, เหลือง: 0, แดง: 0, ยังไม่สรุป: 0 };
    for (const row of by_area) {
      by_severity['เขียว'] += row['เขียว'];
      by_severity['เหลือง'] += row['เหลือง'];
      by_severity['แดง'] += row['แดง'];
      by_severity['ยังไม่สรุป'] += row['ยังไม่สรุป'];
    }
    const total =
      by_severity['เขียว'] + by_severity['เหลือง'] + by_severity['แดง'] + by_severity['ยังไม่สรุป'];

    return { total, by_severity, by_area };
  }
}
