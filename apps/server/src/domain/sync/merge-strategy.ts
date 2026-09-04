import type { SurveyedBuildingSyncState } from '@crackai/shared';

/**
 * กลยุทธ์ merge อัตโนมัติก่อนตัดสินว่า "merge ไม่ได้" — NFR-03 (T-1-08)
 *
 * **db-spec §11 และ api-spec §16 ระบุตรงกันว่ากลยุทธ์นี้ยังไม่ตัดสินใจ** ว่าจะมี auto-merge
 * บางส่วนก่อน (เช่น last-write-wins เฉพาะ field ที่ไม่ขัดแย้งจริง) หรือส่งให้มนุษย์ตัดสินใจ
 * ทั้งหมดทุกครั้ง — จึงกันไว้เป็น port ให้ผู้เรียกเลือกใส่เอง `SyncIntakeService` ไม่มีค่า
 * เริ่มต้นให้ เพราะการตั้งค่าเริ่มต้นเท่ากับตัดสินใจแทนผู้ใช้ในสิ่งที่เอกสารบอกว่ายังไม่ตัดสิน
 */
export interface MergeCandidate {
  /** ค่าที่เซิร์ฟเวอร์ถืออยู่ตอนนี้ */
  current: SurveyedBuildingSyncState;
  currentSnapshot: string;
  /** ค่าที่อุปกรณ์ส่งเข้ามา */
  incomingSnapshot: string;
  incomingDeviceId: string;
  incomingDataVersion: number;
  incomingLastModifiedAt: Date;
}

export interface MergeStrategy {
  /** ชื่อกลยุทธ์ — บันทึกลง audit trail เพื่อให้ตรวจย้อนหลังได้ว่าใช้กติกาใดตอนนั้น */
  readonly name: string;
  /** คืน snapshot ที่ merge แล้ว หรือ `null` เมื่อ merge อัตโนมัติไม่ได้ (ส่งต่อให้มนุษย์) */
  tryMerge(candidate: MergeCandidate): Promise<string | null>;
}

/**
 * ทางเลือกที่ 1 จากสองทางที่ db-spec §11 ระบุไว้: ส่งให้มนุษย์ตัดสินใจทุกครั้งที่พบความขัดแย้ง
 *
 * **นี่ไม่ใช่การตัดสินใจของโปรเจกต์** เป็นเพียงหนึ่งในตัวเลือกที่เอกสารเขียนไว้ ให้ผู้เรียก
 * เลือกใช้อย่างชัดแจ้งระหว่างที่ยังไม่มีข้อสรุป เมื่อผู้ใช้ตัดสินใจแล้วจึงเพิ่มกลยุทธ์อีกตัว
 * และเปลี่ยนที่จุดประกอบระบบจุดเดียว
 */
export const manualOnlyMergeStrategy: MergeStrategy = {
  name: 'ส่งให้มนุษย์ตัดสินใจทุกครั้ง',
  tryMerge: async () => null,
};
