import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  UPLOAD_CHUNK_SIZE_BYTES,
  UPLOAD_STALE_THRESHOLD_HOURS,
  type UserRole,
} from '@crackai/shared';
import { ResumableUploadService } from '../src/domain/sync/upload.service.ts';
import {
  InMemoryMediaBlobStore,
  InMemoryMediaUploadRepository,
} from '../src/infra/memory/in-memory.repositories.ts';
import { ForbiddenError, UploadChunkRejectedError } from '../src/domain/shared/errors.ts';
import type { Clock, IdGenerator } from '../src/domain/shared/ports.ts';

const FIELD: UserRole = 'ผู้สำรวจภาคสนาม';
const surveyor = { user_id: 'u-field', role: FIELD };
const PHOTO = 'cg-ภาพ-1';

class SequentialIds implements IdGenerator {
  private counter = 0;
  next(): string {
    this.counter += 1;
    return `upload-${this.counter}`;
  }
}

class MovableClock implements Clock {
  private current = new Date(Date.UTC(2026, 8, 4, 8, 0, 0));
  now(): Date {
    return new Date(this.current);
  }
  advanceHours(hours: number): void {
    this.current = new Date(this.current.getTime() + hours * 60 * 60 * 1000);
  }
}

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill);

let uploads: InMemoryMediaUploadRepository;
let blobs: InMemoryMediaBlobStore;
let clock: MovableClock;
let service: ResumableUploadService;

beforeEach(() => {
  uploads = new InMemoryMediaUploadRepository();
  blobs = new InMemoryMediaBlobStore();
  clock = new MovableClock();
  service = new ResumableUploadService(uploads, blobs, new SequentialIds(), clock);
});

describe('T-1-07 อัปโหลดไฟล์แบบทำต่อได้ (NFR-02, api-spec 14.1)', () => {
  it('ค่าที่ระบบใช้ตรงกับที่ผู้ใช้ยืนยันในเอกสาร (256 KB / 72 ชั่วโมง)', () => {
    // ปิดประเด็นเมื่อ 2026-09-04 — ถ้ามีใครเปลี่ยนค่าโดยไม่แก้เอกสารก่อน เทสต์นี้จะพัง
    assert.equal(UPLOAD_CHUNK_SIZE_BYTES, 256 * 1024);
    assert.equal(UPLOAD_STALE_THRESHOLD_HOURS, 72);
  });

  it('เริ่มครั้งแรกได้รหัสรอบใหม่ ตัวนับเป็น 0 และบอกขนาด chunk ที่ควรใช้', async () => {
    const ticket = await service.begin(surveyor, {
      client_generated_id: PHOTO,
      total_file_size_bytes: 1000,
    });
    assert.equal(ticket.uploaded_bytes, 0);
    assert.equal(ticket.restarted, true);
    assert.equal(ticket.restart_reason, 'ยังไม่เคยเริ่มรอบอัปโหลดไฟล์นี้');
    assert.equal(ticket.chunk_size_bytes, UPLOAD_CHUNK_SIZE_BYTES);
  });

  it('สัญญาณหลุดกลางคัน ส่งต่อจากตำแหน่งเดิมได้ ไม่ต้องเริ่มใหม่ (หัวใจของ NFR-02)', async () => {
    const start = await service.begin(surveyor, {
      client_generated_id: PHOTO,
      total_file_size_bytes: 1000,
    });
    const sessionId = start.upload_session_id;

    await service.sendChunk(surveyor, {
      client_generated_id: PHOTO,
      upload_session_id: sessionId,
      offset: 0,
      chunk: bytes(400),
    });

    // อุปกรณ์กลับมาถามใหม่หลังสัญญาณหลุด — ต้องได้รหัสรอบเดิมและตำแหน่งที่ค้างไว้
    const resumed = await service.begin(surveyor, {
      client_generated_id: PHOTO,
      total_file_size_bytes: 1000,
      upload_session_id: sessionId,
    });
    assert.equal(resumed.restarted, false);
    assert.equal(resumed.upload_session_id, sessionId);
    assert.equal(resumed.uploaded_bytes, 400);

    await service.sendChunk(surveyor, {
      client_generated_id: PHOTO,
      upload_session_id: sessionId,
      offset: 400,
      chunk: bytes(600),
    });
    assert.equal(await service.isComplete(PHOTO), true);
  });

  it('ส่งผิดตำแหน่งถูกปฏิเสธ ไม่ยอมให้เกิดไฟล์ที่มีรูโหว่หรือเขียนทับ', async () => {
    const start = await service.begin(surveyor, {
      client_generated_id: PHOTO,
      total_file_size_bytes: 1000,
    });
    for (const wrongOffset of [100, -1]) {
      await assert.rejects(
        () =>
          service.sendChunk(surveyor, {
            client_generated_id: PHOTO,
            upload_session_id: start.upload_session_id,
            offset: wrongOffset,
            chunk: bytes(10),
          }),
        UploadChunkRejectedError,
      );
    }
    assert.equal(await service.isComplete(PHOTO), false);
  });

  it('ส่งเกินขนาดไฟล์ที่แจ้งไว้ถูกปฏิเสธ', async () => {
    const start = await service.begin(surveyor, {
      client_generated_id: PHOTO,
      total_file_size_bytes: 100,
    });
    await assert.rejects(
      () =>
        service.sendChunk(surveyor, {
          client_generated_id: PHOTO,
          upload_session_id: start.upload_session_id,
          offset: 0,
          chunk: bytes(101),
        }),
      UploadChunkRejectedError,
    );
  });

  it('รหัสรอบไม่ตรงกัน (เช่นแอปถูกล้าง) ต้องออกรอบใหม่และเริ่มนับจาก 0', async () => {
    const start = await service.begin(surveyor, {
      client_generated_id: PHOTO,
      total_file_size_bytes: 1000,
    });
    await service.sendChunk(surveyor, {
      client_generated_id: PHOTO,
      upload_session_id: start.upload_session_id,
      offset: 0,
      chunk: bytes(400),
    });

    const restarted = await service.begin(surveyor, {
      client_generated_id: PHOTO,
      total_file_size_bytes: 1000,
      upload_session_id: 'รหัสที่ไม่ตรงกัน',
    });
    assert.equal(restarted.restarted, true);
    assert.equal(restarted.restart_reason, 'รหัสรอบอัปโหลดไม่ตรงกับที่เซิร์ฟเวอร์บันทึกไว้');
    assert.equal(restarted.uploaded_bytes, 0);
    assert.notEqual(restarted.upload_session_id, start.upload_session_id);
    // ไฟล์ครึ่งทางของรอบเดิมต้องถูกล้างทิ้ง ไม่ปล่อยค้างกินพื้นที่
    assert.equal(await blobs.sizeOf(start.upload_session_id), 0);
  });

  it('boundary ของเกณฑ์ stale — 71 ชม. ยังส่งต่อได้ แต่ 73 ชม. ต้องเริ่มรอบใหม่', async () => {
    const start = await service.begin(surveyor, {
      client_generated_id: PHOTO,
      total_file_size_bytes: 1000,
    });
    await service.sendChunk(surveyor, {
      client_generated_id: PHOTO,
      upload_session_id: start.upload_session_id,
      offset: 0,
      chunk: bytes(400),
    });

    clock.advanceHours(71);
    const stillFine = await service.begin(surveyor, {
      client_generated_id: PHOTO,
      total_file_size_bytes: 1000,
      upload_session_id: start.upload_session_id,
    });
    assert.equal(stillFine.restarted, false);
    assert.equal(stillFine.uploaded_bytes, 400);

    clock.advanceHours(2); // รวมเป็น 73 ชม.
    const tooOld = await service.begin(surveyor, {
      client_generated_id: PHOTO,
      total_file_size_bytes: 1000,
      upload_session_id: start.upload_session_id,
    });
    assert.equal(tooOld.restarted, true);
    assert.equal(tooOld.restart_reason, 'รอบอัปโหลดเดิมค้างนานเกินเกณฑ์');
    assert.equal(tooOld.uploaded_bytes, 0);
  });

  it('ครบตัวนับแต่ไฟล์บนดิสก์ไม่ครบ ต้องไม่ถือว่าสำเร็จ (db-spec §10 ข้อ 8)', async () => {
    const start = await service.begin(surveyor, {
      client_generated_id: PHOTO,
      total_file_size_bytes: 100,
    });
    await service.sendChunk(surveyor, {
      client_generated_id: PHOTO,
      upload_session_id: start.upload_session_id,
      offset: 0,
      chunk: bytes(100),
    });
    assert.equal(await service.isComplete(PHOTO), true);

    // จำลองเซิร์ฟเวอร์ล่มกลางการเขียนจนตัวนับกับดิสก์หลุดจากกัน
    await blobs.discard(start.upload_session_id);
    assert.equal(await service.isComplete(PHOTO), false);
  });

  it('บทบาทอื่นเรียกไม่ได้ (api-spec 14.1, NFR-08)', async () => {
    await assert.rejects(
      () =>
        service.begin(
          { user_id: 'u-lead', role: 'หัวหน้าผู้สำรวจ' },
          { client_generated_id: PHOTO, total_file_size_bytes: 10 },
        ),
      ForbiddenError,
    );
  });

  it('สร้าง service ด้วยค่า chunk/stale ที่ไม่ถูกต้องไม่ได้', () => {
    for (const badChunk of [0, -1, 1.5]) {
      assert.throws(
        () => new ResumableUploadService(uploads, blobs, new SequentialIds(), clock, badChunk),
        /chunkSizeBytes/,
      );
    }
    assert.throws(
      () => new ResumableUploadService(uploads, blobs, new SequentialIds(), clock, 1024, 0),
      /staleThresholdHours/,
    );
  });
});
