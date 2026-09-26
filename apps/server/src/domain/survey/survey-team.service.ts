import { MAX_SURVEY_PARTICIPANTS, type SurveyParticipant, type TeamRole } from '@crackai/shared';
import { authorize, type Caller } from '../authorization/authorization.service.ts';
import { SurveyNotFoundError, SurveyRuleViolationError } from '../shared/errors.ts';
import type { IdGenerator } from '../shared/ports.ts';
import type {
  SurveyParticipantRepository,
  SurveyedBuildingRepository,
} from './survey.repository.ts';

export interface ParticipantInput {
  client_generated_id: string;
  user_id: string;
  role_in_team: TeamRole;
  sequence_order: number;
}

/**
 * ทีมสำรวจและช่วงเวลาสำรวจของอาคารหนึ่งหลัง — T-2-14, T-2-15 (FR-16, FR-17)
 * ครอบคลุม api-spec operation 9.1 และ 9.2
 */
export class SurveyTeamService {
  private readonly buildings: SurveyedBuildingRepository;
  private readonly participants: SurveyParticipantRepository;
  private readonly ids: IdGenerator;

  constructor(
    buildings: SurveyedBuildingRepository,
    participants: SurveyParticipantRepository,
    ids: IdGenerator,
  ) {
    this.buildings = buildings;
    this.participants = participants;
    this.ids = ids;
  }

  /** api-spec 9.1 บันทึกรายชื่อผู้สำรวจและหัวหน้าผู้สำรวจ */
  async setTeam(
    caller: Caller,
    clientGeneratedId: string,
    team: readonly ParticipantInput[],
  ): Promise<readonly SurveyParticipant[]> {
    authorize(caller, '9.1');
    const building = await this.requireBuilding(clientGeneratedId);

    if (team.length === 0) throw new SurveyRuleViolationError('ต้องระบุผู้สำรวจอย่างน้อย 1 คน');
    if (team.length > MAX_SURVEY_PARTICIPANTS) {
      throw new SurveyRuleViolationError(
        `ทีมสำรวจต่ออาคารมีได้ไม่เกิน ${MAX_SURVEY_PARTICIPANTS} คน (FR-16)`,
      );
    }
    if (!team.some((member) => member.role_in_team === 'หัวหน้าผู้สำรวจ')) {
      throw new SurveyRuleViolationError('ทีมสำรวจต้องมีหัวหน้าผู้สำรวจอย่างน้อย 1 คน (FR-16)');
    }

    // คนเดียวกันถูกใส่สองครั้งจะทำให้จำนวนคนจริงน้อยกว่าที่นับได้ และทำให้ลำดับในแบบฟอร์มเพี้ยน
    const userIds = new Set(team.map((member) => member.user_id));
    if (userIds.size !== team.length) {
      throw new SurveyRuleViolationError('มีผู้สำรวจซ้ำกันในรายการ');
    }
    const orders = new Set(team.map((member) => member.sequence_order));
    if (orders.size !== team.length) {
      throw new SurveyRuleViolationError('ลำดับผู้สำรวจซ้ำกัน');
    }

    return this.participants.replaceForBuilding(
      building.id,
      team.map((member) => ({
        id: this.ids.next(),
        client_generated_id: member.client_generated_id,
        surveyedbuilding_id: building.id,
        user_id: member.user_id,
        role_in_team: member.role_in_team,
        sequence_order: member.sequence_order,
      })),
    );
  }

  /** api-spec 9.2 บันทึกเวลาเริ่ม/เสร็จสิ้นการสำรวจ */
  async setTiming(
    caller: Caller,
    clientGeneratedId: string,
    startAt: Date | null,
    completedAt: Date | null,
  ): Promise<{ survey_start_at: Date | null; survey_completed_at: Date | null }> {
    authorize(caller, '9.2');
    const building = await this.requireBuilding(clientGeneratedId);

    if (startAt !== null && completedAt !== null && completedAt.getTime() < startAt.getTime()) {
      throw new SurveyRuleViolationError('เวลาที่สำรวจเสร็จต้องไม่มาก่อนเวลาที่เริ่มสำรวจ');
    }
    // เวลาเสร็จโดยไม่มีเวลาเริ่มทำให้ตรวจลำดับไม่ได้เลย และแบบฟอร์มต้นฉบับมีทั้งสองช่องคู่กัน
    if (startAt === null && completedAt !== null) {
      throw new SurveyRuleViolationError('ระบุเวลาที่สำรวจเสร็จได้ก็ต่อเมื่อมีเวลาที่เริ่มสำรวจแล้ว');
    }

    const updated = await this.buildings.updateTiming(building.id, {
      survey_start_at: startAt,
      survey_completed_at: completedAt,
    });
    return {
      survey_start_at: updated.survey_start_at,
      survey_completed_at: updated.survey_completed_at,
    };
  }

  private async requireBuilding(clientGeneratedId: string) {
    const building = await this.buildings.findByClientGeneratedId(clientGeneratedId);
    if (!building) throw new SurveyNotFoundError(clientGeneratedId);
    return building;
  }
}
