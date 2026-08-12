export class LineNotificationService {
  shouldSendRealtimeStatus() { throw new Error("LineNotificationService.shouldSendRealtimeStatus must be implemented"); }
  enqueue() { throw new Error("LineNotificationService.enqueue must be implemented"); }
  deliver() { throw new Error("LineNotificationService.deliver must be implemented"); }
  processPending() { throw new Error("LineNotificationService.processPending must be implemented"); }
  enqueueVaccinationReminders() { throw new Error("LineNotificationService.enqueueVaccinationReminders must be implemented"); }
}
