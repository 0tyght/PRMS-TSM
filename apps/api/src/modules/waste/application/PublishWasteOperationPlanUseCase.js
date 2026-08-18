import { WasteOperationPlan } from "../../../domain/waste/entities/WasteOperationPlan.js";

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
      const hasSchedule = Boolean(
        record.scheduledStartAt &&
        record.scheduledEndAt
      );

      const scheduledEndAt = record.scheduledEndAt
        ? new Date(record.scheduledEndAt)
        : null;

      if (
        hasSchedule &&
        (
          !scheduledEndAt ||
          Number.isNaN(scheduledEndAt.getTime()) ||
          scheduledEndAt.getTime() <= this.now().getTime()
        )
      ) {
        const error = new Error(
          "ไม่สามารถประกาศแผนปฏิบัติงานเก็บขยะที่ช่วงเวลาปฏิบัติงานสิ้นสุดแล้ว กรุณาเลือกวันและเวลาปัจจุบันหรืออนาคต"
        );
        error.status = 422;
        throw error;
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
