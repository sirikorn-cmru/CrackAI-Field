import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { IdGenerator, SecretHasher } from '../../domain/shared/ports.ts';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * เก็บความลับด้วย scrypt จากไลบรารีมาตรฐานของ Node
 *
 * db-spec §11 ระบุว่า **วิธีเข้ารหัสยังไม่ตัดสินใจ** — การเลือก scrypt ที่มากับ runtime
 * จึงเป็นค่าตั้งต้นที่ไม่เพิ่มการตัดสินใจเรื่อง stack ใหม่ (ไม่ต้องติดตั้ง dependency)
 * และเปลี่ยนได้ภายหลังโดยไม่กระทบ domain เพราะซ่อนอยู่หลัง `SecretHasher`
 *
 * รูปแบบที่เก็บ: `scrypt$<salt base64>$<hash base64>` เพื่อให้ย้ายอัลกอริทึมภายหลังได้
 * โดยยังอ่านค่าที่เก็บด้วยรูปแบบเดิมออก
 */
export class ScryptSecretHasher implements SecretHasher {
  async hash(plain: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const derived = await scryptAsync(plain, salt, KEY_BYTES);
    return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
  }

  async verify(plain: string, hashed: string): Promise<boolean> {
    const parts = hashed.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

    const salt = Buffer.from(parts[1] as string, 'base64');
    const expected = Buffer.from(parts[2] as string, 'base64');
    if (expected.length !== KEY_BYTES) return false;

    const actual = await scryptAsync(plain, salt, KEY_BYTES);
    // เทียบแบบเวลาคงที่ เพื่อไม่ให้เวลาที่ใช้เทียบบอกใบ้ค่าที่ถูกต้อง (NFR-08)
    return timingSafeEqual(actual, expected);
  }
}

/** ตัวระบุเฉพาะตาม db-spec §0 — รูปแบบที่ใช้จริงยังไม่ตัดสินใจ (db-spec §11) */
export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}
