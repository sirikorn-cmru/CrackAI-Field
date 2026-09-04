import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { USER_ROLES, type UserRole } from '@crackai/shared';
import {
  allowedOperationsFor,
  assertWithinScope,
  authorize,
  isOperationAllowed,
} from '../src/domain/authorization/authorization.service.ts';
import {
  OPERATION_POLICIES,
  type OperationId,
} from '../src/domain/authorization/operation-policy.ts';
import { ForbiddenError } from '../src/domain/shared/errors.ts';

const FIELD: UserRole = 'ผู้สำรวจภาคสนาม';
const LEAD: UserRole = 'หัวหน้าผู้สำรวจ';
const ADMIN: UserRole = 'ผู้ดูแลระบบ';
const CENTRAL: UserRole = 'หน่วยงานส่วนกลาง-ผู้บริหาร';

const callerOf = (role: UserRole) => ({ user_id: `u-${role}`, role });

/**
 * จำนวน operation ทั้งหมดใน api-spec ณ วันที่เขียนเทสต์นี้ (2026-09-04)
 * ตรวจได้ด้วย: grep -c '^- \*\*ผู้เรียกได้\*\*' docs/02-design/02-technical/api-spec.md
 */
const OPERATION_COUNT_IN_API_SPEC = 40;

describe('T-1-03 บังคับสิทธิ์ตามบทบาท (FR-26)', () => {
  it('ตารางนโยบายครอบคลุมทุก operation ใน api-spec และไม่มีรหัสซ้ำ', () => {
    assert.equal(OPERATION_POLICIES.length, OPERATION_COUNT_IN_API_SPEC);
    const ids = OPERATION_POLICIES.map((policy) => policy.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('ทุกบทบาทในตารางเป็นค่าที่ db-spec รองรับจริง', () => {
    for (const policy of OPERATION_POLICIES) {
      for (const caller of policy.callers) {
        assert.ok(
          (USER_ROLES as readonly string[]).includes(caller.role),
          `operation ${policy.id} อ้างบทบาท "${caller.role}" ที่ไม่มีใน USER_ROLES`,
        );
      }
    }
  });

  it('ผู้สำรวจภาคสนามเข้าถึงประวัติการแก้ไขไม่ได้เลยทั้งสอง operation (FR-26)', () => {
    for (const operationId of ['15.5.1', '15.5.2'] as const) {
      assert.equal(isOperationAllowed(FIELD, operationId), false);
      assert.throws(() => authorize(callerOf(FIELD), operationId), ForbiddenError);
    }
  });

  it('หัวหน้าผู้สำรวจดูประวัติรายอาคารได้ แต่ค้นหาทั่วทั้งระบบไม่ได้ (api-spec 15.5.2)', () => {
    assert.equal(authorize(callerOf(LEAD), '15.5.1').scope, 'เฉพาะทีมที่ตนรับผิดชอบ');
    assert.throws(() => authorize(callerOf(LEAD), '15.5.2'), ForbiddenError);
    for (const role of [ADMIN, CENTRAL]) {
      assert.equal(authorize(callerOf(role), '15.5.2').scope, undefined);
    }
  });

  it('operation ภายในระบบ (14.2) ไม่มีบทบาทผู้ใช้ใดเรียกได้', () => {
    for (const role of USER_ROLES) {
      assert.throws(() => authorize(callerOf(role), '14.2'), ForbiddenError);
    }
  });

  it('รายการ operation ต่อบทบาทตรงกับที่ api-spec ระบุ (ใช้สร้างเมนูฝั่ง client)', () => {
    const expected: Record<UserRole, readonly OperationId[]> = {
      [FIELD]: [
        '1.1', '1.2', '1.3', '1.4',
        '3.2', '3.3',
        '4.1', '4.2', '4.3',
        '5.1', '5.2', '5.3', '5.4',
        '6.1', '6.2',
        '7.1', '7.2', '7.3', '7.4', '7.5',
        '8.1',
        '9.1', '9.2',
        '10.1',
        '14.1',
      ],
      [LEAD]: ['1.1', '1.2', '3.1', '3.2', '3.3', '9.1', '10.1', '10.2', '10.3', '13.1', '15.1', '15.2', '15.5.1'],
      [ADMIN]: ['1.1', '1.2', '2.1', '2.2', '2.3', '2.4', '15.1', '15.2', '15.5.1', '15.5.2'],
      [CENTRAL]: ['1.1', '1.2', '11.1', '12.1', '13.1', '15.5.1', '15.5.2'],
    };
    for (const role of USER_ROLES) {
      assert.deepEqual(allowedOperationsFor(role), expected[role], `บทบาท ${role}`);
    }
  });

  it('ไม่มีบทบาทใดเรียกได้ทุก operation — ทุกบทบาทถูกจำกัดจริง (FR-26)', () => {
    for (const role of USER_ROLES) {
      assert.ok(allowedOperationsFor(role).length < OPERATION_COUNT_IN_API_SPEC);
    }
  });
});

describe('T-1-11 จำกัดขอบเขตข้อมูลตามสิทธิ์ (NFR-08)', () => {
  it('operation ที่ api-spec ระบุขอบเขตไว้ ต้องคืน scope ให้ผู้เรียกบังคับใช้ต่อ', () => {
    assert.equal(authorize(callerOf(FIELD), '3.2').scope, 'เฉพาะระเบียนของตน');
    assert.equal(authorize(callerOf(LEAD), '3.2').scope, 'เฉพาะทีมที่ตนรับผิดชอบ');
    assert.equal(authorize(callerOf(LEAD), '13.1').scope, 'เฉพาะทีมที่ตนรับผิดชอบ');
    // api-spec 13.1 ระบุขอบเขตไว้เฉพาะหัวหน้าผู้สำรวจ หน่วยงานส่วนกลางไม่จำกัดขอบเขต
    assert.equal(authorize(callerOf(CENTRAL), '13.1').scope, undefined);
  });

  it('ระเบียนนอกขอบเขตถูกปฏิเสธ แม้บทบาทจะเรียก operation นั้นได้', () => {
    const authorized = authorize(callerOf(LEAD), '15.5.1');
    assert.throws(() => assertWithinScope(authorized, false), ForbiddenError);
    assert.doesNotThrow(() => assertWithinScope(authorized, true));
  });

  it('operation ที่ไม่มีขอบเขตกำกับ ไม่ถูกปฏิเสธจากการตรวจขอบเขต', () => {
    const authorized = authorize(callerOf(ADMIN), '15.5.2');
    assert.doesNotThrow(() => assertWithinScope(authorized, false));
  });

  it('ข้อความปฏิเสธสิทธิ์ไม่เปิดเผยว่าระเบียนที่ขอมีอยู่จริงหรือไม่ (NFR-08)', () => {
    const outOfScope = () => assertWithinScope(authorize(callerOf(LEAD), '15.5.1'), false);
    const wrongRole = () => authorize(callerOf(FIELD), '15.5.1');
    let outOfScopeMessage = '';
    let wrongRoleMessage = '';
    assert.throws(outOfScope, (error: ForbiddenError) => {
      outOfScopeMessage = error.message;
      return true;
    });
    assert.throws(wrongRole, (error: ForbiddenError) => {
      wrongRoleMessage = error.message;
      return true;
    });
    // "ไม่มีสิทธิ์" กับ "ไม่พบระเบียน" ต้องแยกไม่ออกจากภายนอก มิฉะนั้นหัวหน้าผู้สำรวจ
    // จะใช้ข้อความ error ไล่เดาว่าอาคารใดของทีมอื่นมีอยู่จริงได้
    assert.equal(outOfScopeMessage, wrongRoleMessage);
  });
});
