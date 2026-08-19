import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

const CONFIRM_ERRORS = Object.freeze({
  PROPOSAL_EXPIRED: [410, "ข้อเสนอเส้นทางหมดอายุหรือถูกยืนยันไปแล้ว กรุณาคำนวณใหม่"],
  ROUTE_NOT_FOUND: [404, "ไม่พบข้อมูลเส้นทางเก็บขยะที่เปิดใช้งาน"],
  ROUTE_STOPS_CHANGED: [409, "จุดเก็บขยะของเส้นทางเปลี่ยนแปลงหลังจากคำนวณ กรุณาคำนวณใหม่ก่อนยืนยัน"],
  SERVICE_USER_ROUTE_CHANGED: [409, "มีผู้ใช้บริการบางรายถูกกำหนดเส้นทางไปแล้ว กรุณาโหลดข้อมูลและคำนวณใหม่"],
  SERVICE_USER_LOCATION_CHANGED: [409, "พิกัดสถานที่รับบริการมีการเปลี่ยนแปลงหลังจากคำนวณ กรุณาคำนวณใหม่"],
});

export class ConfirmWasteRouteServiceUsersUseCase {
  constructor({ routeRepository }) {
    if (!routeRepository) {
      throw new TypeError("ConfirmWasteRouteServiceUsersUseCase requires routeRepository");
    }
    this.routeRepository = routeRepository;
  }

  async execute({ routeId, proposalId, confirmedBy, ipAddress = null }) {
    const proposal = await this.routeRepository.findProposal(proposalId);

    if (!proposal) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_PROPOSAL_EXPIRED",
        "ข้อเสนอเส้นทางหมดอายุหรือถูกยืนยันไปแล้ว กรุณาคำนวณใหม่",
        { status: 410 },
      );
    }

    if (proposal.routeId !== routeId) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_PROPOSAL_MISMATCH",
        "ข้อเสนอเส้นทางไม่ตรงกับเส้นทางที่กำลังจัดการ",
        { status: 422 },
      );
    }

    const candidates = proposal.stops.filter(
      (stop) => stop.assignmentCandidate === true,
    );

    if (!candidates.length) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_PROPOSAL_HAS_NO_SERVICE_USERS",
        "ข้อเสนอนี้ไม่มีผู้ใช้บริการใหม่ให้กำหนดเส้นทาง",
        { status: 422 },
      );
    }

    try {
      const result = await this.routeRepository.confirmServiceUserBatchAssignment({
        proposal,
        routeGeojson: proposal.toGeoJson(),
        confirmedBy,
        ipAddress,
      });

      return {
        routeId,
        proposalId,
        assignedServiceUserCount: result.assignedServiceUserCount,
        stopCount: proposal.stops.length,
        distanceMeters: proposal.distanceMeters,
        durationSeconds: proposal.durationSeconds,
        confirmed: true,
      };
    } catch (error) {
      const mapped = CONFIRM_ERRORS[error?.message];
      if (!mapped) throw error;
      throw new DomainRuleViolation(
        error.message,
        mapped[1],
        { status: mapped[0] },
      );
    }
  }
}
