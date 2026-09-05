import { UPLOAD_CHUNK_SIZE_BYTES, UPLOAD_STALE_THRESHOLD_HOURS } from '@crackai/shared';
import { authorize, type Caller } from '../authorization/authorization.service.ts';
import { UploadChunkRejectedError } from '../shared/errors.ts';
import type { Clock, IdGenerator } from '../shared/ports.ts';
import type {
  MediaBlobStore,
  MediaUploadRepository,
  MediaUploadState,
} from './upload.repository.ts';

/** เหตุที่เซิร์ฟเวอร์บังคับให้เริ่มรอบอัปโหลดใหม่จาก 0 — db-spec §10 ข้อ 8 */
export type UploadRestartReason =
  | 'ยังไม่เคยเริ่มรอบอัปโหลดไฟล์นี้'
  | 'รหัสรอบอัปโหลดไม่ตรงกับที่เซิร์ฟเวอร์บันทึกไว้'
  | 'รอบอัปโหลดเดิมค้างนานเกินเกณฑ์';

/** สิ่งที่อุปกรณ์ต้องรู้ก่อนส่งเนื้อไฟล์รอบถัดไป — api-spec 14.1 Output */
export interface UploadTicket {
  upload_session_id: string;
  /** จำนวนไบต์ที่เซิร์ฟเวอร์ยืนยันว่ารับครบแล้ว = ตำแหน่งที่ต้องส่งต่อ */
  uploaded_bytes: number;
  /** ขนาดที่ควรแบ่งส่งต่อครั้ง (NFR-02) */
  chunk_size_bytes: number;
  /** true = เซิร์ฟเวอร์ออกรหัสรอบใหม่ อุปกรณ์ต้องส่งใหม่ตั้งแต่ต้น */
  restarted: boolean;
  restart_reason?: UploadRestartReason;
  completed: boolean;
}

export interface BeginUploadCommand {
  client_generated_id: string;
  total_file_size_bytes: number;
  /** รหัสรอบที่อุปกรณ์ถืออยู่จากรอบก่อน — ไม่ระบุเมื่อเริ่มอัปโหลดไฟล์นี้ครั้งแรก */
  upload_session_id?: string | null;
}

export interface SendChunkCommand {
  client_generated_id: string;
  upload_session_id: string;
  /** ตำแหน่งเริ่มต้นของชิ้นนี้ในไฟล์ ต้องตรงกับ `uploaded_bytes` ปัจจุบันพอดี */
  offset: number;
  chunk: Uint8Array;
}

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/**
 * อัปโหลดไฟล์ภาพ/ภาพวาดแบบทำต่อได้เมื่อสัญญาณขาดหาย — T-1-07 (NFR-02)
 * ครอบคลุมกฎทางธุรกิจข้อ 8 ของ db-spec §10 และส่วนไฟล์ของ api-spec 14.1
 *
 * เกณฑ์เวลา stale และขนาด chunk รับเข้ามาทางพารามิเตอร์ ไม่ใช่ค่าคงที่ในตัวคลาส เพราะ
 * `architecture.md` §6.10 ระบุว่าทั้งสองค่าต้องปรับได้ตามสภาพเครือข่ายจริงของหน่วยงาน
 * แม้ตัวเลขจะถูกยืนยันแล้วก็ตาม
 */
export class ResumableUploadService {
  private readonly uploads: MediaUploadRepository;
  private readonly blobs: MediaBlobStore;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;
  private readonly chunkSizeBytes: number;
  private readonly staleThresholdHours: number;

  constructor(
    uploads: MediaUploadRepository,
    blobs: MediaBlobStore,
    ids: IdGenerator,
    clock: Clock,
    chunkSizeBytes: number = UPLOAD_CHUNK_SIZE_BYTES,
    staleThresholdHours: number = UPLOAD_STALE_THRESHOLD_HOURS,
  ) {
    this.uploads = uploads;
    this.blobs = blobs;
    this.ids = ids;
    this.clock = clock;
    this.chunkSizeBytes = chunkSizeBytes;
    this.staleThresholdHours = staleThresholdHours;
    if (!Number.isInteger(chunkSizeBytes) || chunkSizeBytes < 1) {
      throw new Error('chunkSizeBytes ต้องเป็นจำนวนเต็มบวก (NFR-02)');
    }
    if (!(staleThresholdHours > 0)) {
      throw new Error('staleThresholdHours ต้องมากกว่า 0 (NFR-02)');
    }
  }

  /**
   * api-spec 14.1 — ก่อนส่ง(ต่อ)เนื้อไฟล์ใดๆ ต้องถามเซิร์ฟเวอร์ก่อนเสมอว่ารับไปถึงไหนแล้ว
   * เพื่อไม่ให้อุปกรณ์ส่งซ้ำส่วนที่มีอยู่แล้ว
   */
  async begin(caller: Caller, command: BeginUploadCommand): Promise<UploadTicket> {
    authorize(caller, '14.1');
    if (!Number.isInteger(command.total_file_size_bytes) || command.total_file_size_bytes < 1) {
      throw new UploadChunkRejectedError('ขนาดไฟล์ทั้งหมดต้องเป็นจำนวนเต็มบวก');
    }

    const existing = await this.uploads.findByClientGeneratedId(command.client_generated_id);
    const restartReason = this.restartReasonFor(existing, command.upload_session_id ?? null);

    if (restartReason !== null) {
      // db-spec §10 ข้อ 8: ต้องล้างรอบเดิมทิ้งก่อนออกรหัสใหม่ ไม่ปล่อยไฟล์ครึ่งทางค้างไว้
      if (existing?.upload_session_id) await this.blobs.discard(existing.upload_session_id);
      const started = await this.uploads.upsert({
        client_generated_id: command.client_generated_id,
        total_file_size_bytes: command.total_file_size_bytes,
        upload_session_id: this.ids.next(),
        uploaded_bytes: 0,
        last_chunk_received_at: null,
      });
      return this.ticket(started, true, restartReason);
    }

    return this.ticket(existing!, false);
  }

  /** api-spec 14.1 — รับเนื้อไฟล์หนึ่งชิ้นต่อจากตำแหน่งที่ยืนยันไว้ */
  async sendChunk(caller: Caller, command: SendChunkCommand): Promise<UploadTicket> {
    authorize(caller, '14.1');

    const state = await this.uploads.findByClientGeneratedId(command.client_generated_id);
    if (!state || state.upload_session_id === null) {
      throw new UploadChunkRejectedError('ยังไม่ได้เริ่มรอบอัปโหลดของไฟล์นี้');
    }
    if (state.upload_session_id !== command.upload_session_id) {
      // ไม่ยอมรับเงียบๆ แล้วเขียนทับ เพราะจะได้ไฟล์ที่ปนกันสองรอบโดยไม่มีใครรู้
      throw new UploadChunkRejectedError(
        'รหัสรอบอัปโหลดไม่ตรงกับที่เซิร์ฟเวอร์บันทึกไว้ ต้องเริ่มรอบใหม่',
      );
    }
    if (this.isStale(state)) {
      throw new UploadChunkRejectedError('รอบอัปโหลดนี้ค้างนานเกินเกณฑ์แล้ว ต้องเริ่มรอบใหม่');
    }
    if (command.offset !== state.uploaded_bytes) {
      // ตำแหน่งต้องตรงพอดี — ถ้ายอมให้ข้ามจะได้ไฟล์ที่มีรูโหว่ ถ้ายอมให้ทับจะได้ไฟล์เพี้ยน
      throw new UploadChunkRejectedError(
        `ตำแหน่งที่ส่งมา (${command.offset}) ไม่ตรงกับที่เซิร์ฟเวอร์รับไว้แล้ว (${state.uploaded_bytes})`,
      );
    }
    if (command.chunk.byteLength === 0) {
      throw new UploadChunkRejectedError('ชิ้นข้อมูลว่างเปล่า');
    }
    const nextBytes = state.uploaded_bytes + command.chunk.byteLength;
    if (nextBytes > state.total_file_size_bytes) {
      throw new UploadChunkRejectedError(
        `ข้อมูลที่ส่งมาเกินขนาดไฟล์ที่แจ้งไว้ (${state.total_file_size_bytes} ไบต์)`,
      );
    }

    await this.blobs.appendAt(state.upload_session_id, command.offset, command.chunk);
    const updated = await this.uploads.upsert({
      ...state,
      uploaded_bytes: nextBytes,
      last_chunk_received_at: this.clock.now(),
    });
    return this.ticket(updated, false);
  }

  /**
   * db-spec §10 ข้อ 8 — ตั้ง `sync_status = ซิงค์สำเร็จ` ได้ก็ต่อเมื่อ
   * `uploaded_bytes = total_file_size_bytes` **และไฟล์บนดิสก์สมบูรณ์จริง**
   *
   * ตรวจขนาดไฟล์จริงซ้ำอีกครั้งโดยเจตนา ไม่เชื่อตัวนับอย่างเดียว เพราะตัวนับกับดิสก์
   * หลุดจากกันได้เมื่อเซิร์ฟเวอร์ล่มกลางการเขียน
   */
  async isComplete(clientGeneratedId: string): Promise<boolean> {
    const state = await this.uploads.findByClientGeneratedId(clientGeneratedId);
    if (!state || state.upload_session_id === null) return false;
    if (state.uploaded_bytes !== state.total_file_size_bytes) return false;
    return (await this.blobs.sizeOf(state.upload_session_id)) === state.total_file_size_bytes;
  }

  private restartReasonFor(
    existing: MediaUploadState | null,
    deviceSessionId: string | null,
  ): UploadRestartReason | null {
    if (!existing || existing.upload_session_id === null) return 'ยังไม่เคยเริ่มรอบอัปโหลดไฟล์นี้';
    if (deviceSessionId !== existing.upload_session_id) {
      return 'รหัสรอบอัปโหลดไม่ตรงกับที่เซิร์ฟเวอร์บันทึกไว้';
    }
    if (this.isStale(existing)) return 'รอบอัปโหลดเดิมค้างนานเกินเกณฑ์';
    return null;
  }

  private isStale(state: MediaUploadState): boolean {
    if (state.last_chunk_received_at === null) return false;
    const elapsedHours =
      (this.clock.now().getTime() - state.last_chunk_received_at.getTime()) / MILLISECONDS_PER_HOUR;
    return elapsedHours > this.staleThresholdHours;
  }

  private ticket(
    state: MediaUploadState,
    restarted: boolean,
    reason?: UploadRestartReason,
  ): UploadTicket {
    const base = {
      upload_session_id: state.upload_session_id!,
      uploaded_bytes: state.uploaded_bytes,
      chunk_size_bytes: this.chunkSizeBytes,
      restarted,
      completed: state.uploaded_bytes === state.total_file_size_bytes,
    };
    return reason === undefined ? base : { ...base, restart_reason: reason };
  }
}
