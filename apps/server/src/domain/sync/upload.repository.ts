/**
 * สถานะการอัปโหลดไฟล์ของ `DamagePhoto`/`Sketch` — db-spec §6.1/§6.3 เฉพาะฟิลด์ที่กลไก
 * resumable upload ใช้ (db-spec §10 ข้อ 8) ฟิลด์เนื้อหาอื่นของสอง entity นี้อยู่ใน Phase 2/3
 */
export interface MediaUploadState {
  client_generated_id: string;
  total_file_size_bytes: number;
  /** ไม่มีค่า = ยังไม่เคยเริ่มรอบอัปโหลดใดเลย */
  upload_session_id: string | null;
  uploaded_bytes: number;
  last_chunk_received_at: Date | null;
}

export interface MediaUploadRepository {
  findByClientGeneratedId(clientGeneratedId: string): Promise<MediaUploadState | null>;
  upsert(state: MediaUploadState): Promise<MediaUploadState>;
}

/**
 * ที่เก็บเนื้อไฟล์จริง — technology-stack §3 เลือก local filesystem บนเซิร์ฟเวอร์
 * ซึ่งไม่มี resumable upload มาให้พร้อมใช้ จึงต้องคุมตำแหน่งเขียนเอง (db-spec §10 ข้อ 8)
 */
export interface MediaBlobStore {
  /** เขียนต่อท้ายที่ตำแหน่ง `offset` พอดี — ต้องปฏิเสธถ้าไฟล์ปัจจุบันสั้น/ยาวกว่านั้น */
  appendAt(uploadSessionId: string, offset: number, chunk: Uint8Array): Promise<void>;
  /** ล้างไฟล์ที่ค้างของรอบเดิมทิ้งเมื่อต้องเริ่มรอบใหม่ */
  discard(uploadSessionId: string): Promise<void>;
  sizeOf(uploadSessionId: string): Promise<number>;
}
