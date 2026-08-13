import { WasteOperationPlan } from "../../../domain/waste/entities/WasteOperationPlan.js";

export class PublishWasteOperationPlanUseCase {
  constructor({ repository, noticeFactory }) {
    this.repository = repository;
    this.noticeFactory = noticeFactory;
  }

  async execute({ planId, officerId, publicNote = null }) {
    return this.repository.transaction(async (db) => {
      const record = await this.repository.findPublicationContext(db, planId, { lock: true });
      if (!record) return null;
      const plan = new WasteOperationPlan(record).publish({
        hasSchedule: Boolean(record.scheduledStartAt && record.scheduledEndAt),
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
      const recipientCount = await this.repository.enqueueRouteNotices(db, {
        plan: published,
        version: plan.publicationVersion,
        type: "SCHEDULE_PUBLISHED",
        message,
      });
      return { publicationStatus: plan.publicationStatus, publicationVersion: plan.publicationVersion, recipientCount };
    });
  }
}
