import { WasteOperationPlan } from "../../../domain/waste/entities/WasteOperationPlan.js";

export class WithdrawWasteOperationPlanUseCase {
  constructor({ repository, noticeFactory }) {
    this.repository = repository;
    this.noticeFactory = noticeFactory;
  }

  async execute({ planId, officerId, reason }) {
    return this.repository.transaction(async (db) => {
      const record = await this.repository.findPublicationContext(db, planId, { lock: true });
      if (!record) return null;
      new WasteOperationPlan(record).withdraw();
      const message = this.noticeFactory.formatWithdrawn(record, reason);
      await this.repository.markWithdrawn(db, { planId, officerId });
      const recipientCount = await this.repository.enqueueRouteNotices(db, {
        plan: record,
        version: record.publicationVersion,
        type: "SCHEDULE_WITHDRAWN",
        message,
      });
      return { publicationStatus: "WITHDRAWN", publicationVersion: record.publicationVersion, recipientCount };
    });
  }
}
