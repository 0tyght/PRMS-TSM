import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";
import { WasteRouteProposal } from "../domain/WasteRouteProposal.js";

function unique(values) {
  return [...new Set(values)];
}

export class ProposeWasteRouteServiceUsersUseCase {
  constructor({ routeRepository, routeOptimizer, maximumStops = 50 }) {
    if (!routeRepository || !routeOptimizer) {
      throw new TypeError("ProposeWasteRouteServiceUsersUseCase requires dependencies");
    }
    this.routeRepository = routeRepository;
    this.routeOptimizer = routeOptimizer;
    this.maximumStops = maximumStops;
  }

  async execute({ routeId, serviceUserIds }) {
    const ids = unique(serviceUserIds || []);
    if (!ids.length) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_SERVICE_USERS_REQUIRED",
        "กรุณาเลือกผู้ใช้บริการที่ยังไม่มีเส้นทางอย่างน้อย 1 ราย",
        { status: 422 },
      );
    }

    const route = await this.routeRepository.findById(routeId);
    if (!route) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_NOT_FOUND",
        "ไม่พบข้อมูลเส้นทางเก็บขยะ",
        { status: 404 },
      );
    }

    const [currentStops, users] = await Promise.all([
      this.routeRepository.listActiveStops(routeId),
      this.routeRepository.findActiveUnassignedServiceUsersByIds(ids),
    ]);

    const orphanStops = currentStops.filter(
      (stop) => !stop.serviceUserId,
    );
    if (orphanStops.length) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_ORPHAN_STOPS_NOT_ALLOWED",
        "เส้นทางนี้มีจุดเก็บขยะที่ไม่ได้เชื่อมกับทะเบียนผู้ใช้บริการเก็บขยะ กรุณาตรวจข้อมูลเดิมก่อนเพิ่มผู้ใช้บริการ",
        { status: 409 },
      );
    }

    if (users.length !== ids.length) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_SERVICE_USERS_NOT_UNASSIGNED",
        "มีผู้ใช้บริการบางรายถูกกำหนดเส้นทางแล้ว ถูกยกเลิก หรือไม่มีอยู่ในระบบ กรุณาโหลดข้อมูลใหม่",
        { status: 409 },
      );
    }

    const missingLocation = users.filter((user) =>
      !Number.isFinite(Number(user.latitude)) ||
      !Number.isFinite(Number(user.longitude))
    );
    if (missingLocation.length) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_SERVICE_USERS_MISSING_LOCATION",
        "ผู้ใช้บริการที่เลือกต้องมีพิกัดสถานที่รับบริการครบทุกคนก่อนคำนวณเส้นทาง",
        { status: 422 },
      );
    }

    const candidates = users.map((user) => ({
      id: `candidate:${user.id}`,
      serviceUserId: user.id,
      stopName: `บ้าน ${user.houseNo} · ${user.fullName}`,
      latitude: Number(user.latitude),
      longitude: Number(user.longitude),
      assignmentCandidate: true,
      previousRouteId: null,
    }));

    const stops = [
      ...currentStops.map((stop) => ({
        ...stop,
        latitude: Number(stop.latitude),
        longitude: Number(stop.longitude),
        assignmentCandidate: false,
      })),
      ...candidates,
    ];

    if (stops.length < 2) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_MINIMUM_SERVICE_USERS",
        "เส้นทางต้องมีสถานที่รับบริการรวมอย่างน้อย 2 จุดจึงจะแสดงแนวเส้นทางก่อนยืนยันได้",
        { status: 422 },
      );
    }
    if (stops.length > this.maximumStops) {
      throw new DomainRuleViolation(
        "WASTE_ROUTE_TOO_MANY_SERVICE_USERS",
        `เส้นทางหนึ่งรองรับการจัดลำดับอัตโนมัติไม่เกิน ${this.maximumStops} จุด`,
        { status: 422 },
      );
    }

    let optimized;
    try {
      optimized = await this.routeOptimizer.optimize(
        stops.map((stop) => ({
          id: stop.id,
          latitude: stop.latitude,
          longitude: stop.longitude,
        })),
        { returnToStart: true },
      );
    } catch (error) {
      const mapped = {
        ROUTE_NOT_FOUND_BY_PROVIDER: "ไม่พบถนนที่เชื่อมต่อสถานที่รับบริการที่เลือกทั้งหมด",
        ROUTING_SERVICE_UNAVAILABLE: "ไม่สามารถเชื่อมต่อบริการคำนวณเส้นทางได้ในขณะนี้",
        ROUTING_SERVICE_FAILED: "บริการคำนวณเส้นทางไม่สามารถประมวลผลสถานที่รับบริการที่เลือกได้",
      }[error?.message];
      if (!mapped) throw error;
      throw new DomainRuleViolation(
        error.message,
        mapped,
        { status: error.message === "ROUTE_NOT_FOUND_BY_PROVIDER" ? 422 : 502 },
      );
    }

    const byId = new Map(stops.map((stop) => [stop.id, stop]));
    const orderedStops = optimized.orderedStopIds
      .map((id) => byId.get(id))
      .filter(Boolean);

    const proposal = new WasteRouteProposal({
      routeId,
      stops: orderedStops,
      geometry: optimized.geometry,
      distanceMeters: optimized.distanceMeters,
      durationSeconds: optimized.durationSeconds,
    });

    return this.routeRepository.saveProposal(proposal);
  }
}