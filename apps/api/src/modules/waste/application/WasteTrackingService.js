import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

export class WasteTrackingService {
  constructor({
    repository,
    policy,
    now = () => new Date(),
  }) {
    if (!repository) {
      throw new TypeError(
        "WasteTrackingService requires repository",
      );
    }

    if (!policy) {
      throw new TypeError(
        "WasteTrackingService requires policy",
      );
    }

    if (typeof now !== "function") {
      throw new TypeError(
        "WasteTrackingService requires now function",
      );
    }

    this.repository = repository;
    this.policy = policy;
    this.now = now;
  }

  assertPlanAccess(plan) {
    if (!plan) {
      throw new DomainRuleViolation(
        "WASTE_TRACKING_PLAN_ACCESS_DENIED",
        "ลิงก์นี้ไม่ตรงกับคนขับหรือแผนปฏิบัติงาน",
        { status: 403 },
      );
    }

    return plan;
  }

  async getDriverSession(claims) {
    const plan =
      this.assertPlanAccess(
        await this.repository
          .findPlanForClaims(
            claims,
          ),
      );

    return {
      ...plan,
      canTrack:
        this.policy.canTrack(
          plan.status,
        ),
    };
  }

  async recordLocation(
    claims,
    input,
  ) {
    this.policy
      .assertInsideServiceArea(
        input.latitude,
        input.longitude,
      );

    const serverNow =
      this.now();

    const result =
      await this.repository.transaction(
        async (db) => {
          const plan =
            this.assertPlanAccess(
              await this.repository
                .findPlanForClaims(
                  claims,
                  {
                    database: db,
                    lock: true,
                  },
                ),
            );

          this.policy
            .assertTrackableStatus(
              plan.status,
            );

          const latest =
            await this.repository
              .findLatestLocation(
                db,
                plan.id,
              );

          if (
            this.policy.isTooFrequent(
              latest?.recordedAt,
              serverNow,
            )
          ) {
            return {
              accepted: false,
              reason:
                "TOO_FREQUENT",
            };
          }

          const recordedAt =
            input.recordedAt
              ? new Date(
                  input.recordedAt,
                )
              : serverNow;

          await this.repository
            .insertLocation(
              db,
              {
                planId: plan.id,
                latitude:
                  input.latitude,
                longitude:
                  input.longitude,
                accuracyM:
                  input.accuracyM ??
                  null,
                speedKph:
                  input.speedKph ??
                  null,
                recordedAt,
              },
            );

          await this.repository
            .updateVehicleLocation(
              db,
              {
                vehicleId:
                  plan.vehicleId,
                latitude:
                  input.latitude,
                longitude:
                  input.longitude,
                recordedAt,
              },
            );

          return {
            accepted: true,
            reason: null,
          };
        },
      );

    return {
      ...result,
      serverTime:
        serverNow.toISOString(),
    };
  }

  async getPlanTracking(planId) {
    const data =
      await this.repository
        .getPlanTracking(planId);

    if (!data) {
      throw new DomainRuleViolation(
        "WASTE_PLAN_NOT_FOUND",
        "ไม่พบแผนปฏิบัติงานเก็บขยะ",
        { status: 404 },
      );
    }

    return data;
  }
}
