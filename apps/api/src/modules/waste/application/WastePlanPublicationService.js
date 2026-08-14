import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

export class WastePlanPublicationService {
  constructor({
    publishUseCase,
    withdrawUseCase,
    repository,
    auditLog,
  }) {
    if (!publishUseCase) {
      throw new TypeError(
        "WastePlanPublicationService requires publishUseCase",
      );
    }

    if (!withdrawUseCase) {
      throw new TypeError(
        "WastePlanPublicationService requires withdrawUseCase",
      );
    }

    if (!repository) {
      throw new TypeError(
        "WastePlanPublicationService requires repository",
      );
    }

    if (!auditLog) {
      throw new TypeError(
        "WastePlanPublicationService requires auditLog",
      );
    }

    this.publishUseCase =
      publishUseCase;

    this.withdrawUseCase =
      withdrawUseCase;

    this.repository =
      repository;

    this.auditLog =
      auditLog;
  }

  async publish(
    planId,
    input,
    actor,
  ) {
    const result =
      await this.publishUseCase
        .execute({
          planId,
          officerId:
            actor.userId,
          publicNote:
            input.publicNote,
        });

    if (!result) {
      throw new DomainRuleViolation(
        "WASTE_PLAN_NOT_FOUND",
        "ไม่พบแผนปฏิบัติงานเก็บขยะ",
        { status: 404 },
      );
    }

    await this.auditLog.record({
      userId:
        actor.userId,
      action:
        "PUBLISH_WASTE_PLAN",
      entityType:
        "WASTE_PLAN",
      entityId:
        planId,
      nextValue:
        result,
      ipAddress:
        actor.ipAddress,
    });

    return {
      id: planId,
      ...result,
    };
  }

  async withdraw(
    planId,
    input,
    actor,
  ) {
    const result =
      await this.withdrawUseCase
        .execute({
          planId,
          officerId:
            actor.userId,
          reason:
            input.reason,
        });

    if (!result) {
      throw new DomainRuleViolation(
        "WASTE_PLAN_NOT_FOUND",
        "ไม่พบแผนปฏิบัติงานเก็บขยะ",
        { status: 404 },
      );
    }

    await this.auditLog.record({
      userId:
        actor.userId,
      action:
        "WITHDRAW_WASTE_PLAN",
      entityType:
        "WASTE_PLAN",
      entityId:
        planId,
      nextValue: {
        ...result,
        reason:
          input.reason,
      },
      ipAddress:
        actor.ipAddress,
    });

    return {
      id: planId,
      ...result,
    };
  }

  async deliverySummary(
    planId,
  ) {
    return this.repository
      .publicationDeliverySummary(
        planId,
      );
  }
}
