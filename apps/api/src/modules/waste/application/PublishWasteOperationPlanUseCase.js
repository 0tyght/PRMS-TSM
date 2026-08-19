import { WasteOperationPlan } from "../../../domain/waste/entities/WasteOperationPlan.js";
import { DomainRuleViolation } from "../../../domain/common/errors/DomainRuleViolation.js";

export class PublishWasteOperationPlanUseCase {
  constructor({
    repository,
    noticeFactory,
    now = () => new Date(),
  }) {
    if (!repository) {
      throw new TypeError(
        "PublishWasteOperationPlanUseCase requires repository",
      );
    }

    if (!noticeFactory) {
      throw new TypeError(
        "PublishWasteOperationPlanUseCase requires noticeFactory",
      );
    }

    if (typeof now !== "function") {
      throw new TypeError(
        "PublishWasteOperationPlanUseCase requires now function",
      );
    }

    this.repository = repository;
    this.noticeFactory = noticeFactory;
    this.now = now;
  }

  async execute({ planId, officerId, publicNote = null }) {
    return this.repository.transaction(async (db) => {
      const record = await this.repository.findPublicationContext(db, planId, { lock: true });
      if (!record) return null;

      if (!record.readinessConfirmedAt) {
        throw new DomainRuleViolation(
          "WASTE_PLAN_READINESS_NOT_CONFIRMED",
          "กรุณายืนยันการตรวจความพร้อมของแผนก่อนประกาศตารางกำหนดการเก็บขยะประจำพื้นที่",
          { status: 422 },
        );
      }

      const hasSchedule = Boolean(
        record.scheduledStartAt &&
        record.scheduledEndAt
      );

      const scheduledEndAt = record.scheduledEndAt
        ? new Date(record.scheduledEndAt)
        : null;

      const scheduleWindowOpen =
        record.scheduleWindowOpen === undefined
          ? Boolean(
              scheduledEndAt &&
              !Number.isNaN(scheduledEndAt.getTime()) &&
              scheduledEndAt.getTime() > this.now().getTime()
            )
          : Boolean(record.scheduleWindowOpen);

      if (
        hasSchedule &&
        !scheduleWindowOpen
      ) {
        throw new DomainRuleViolation(
          "WASTE_PLAN_PUBLICATION_WINDOW_ENDED",
          "ไม่สามารถประกาศแผนปฏิบัติงานเก็บขยะที่ช่วงเวลาปฏิบัติงานสิ้นสุดแล้ว กรุณาแก้ไขวันและเวลาของแผนก่อนประกาศ",
          { status: 422 },
        );
      }

      const plan = new WasteOperationPlan(record).publish({
        hasSchedule,
        activeStopCount: record.activeStopCount,
      });

      const published = { ...record, publicNote };
      const message = this.noticeFactory.formatPublished(published);
      await this.repository.markPublished(db, {
        planId,
        version: plan.publicationVersion,
        publicNote,
        officerId,
      });
      const queuedRecipientCount = await this.repository.enqueueRouteNotices(db, {
        plan: published,
        version: plan.publicationVersion,
        type: "SCHEDULE_PUBLISHED",
        message,
      });
      return { publicationStatus: plan.publicationStatus, publicationVersion: plan.publicationVersion, recipientCount: queuedRecipientCount };
    });
  }
}
