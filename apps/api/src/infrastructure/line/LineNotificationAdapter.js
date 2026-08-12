import { LineNotificationService } from "../../application/line/LineNotificationService.js";
import { deliverLineNotification, enqueueLineNotification, enqueueVaccinationReminders, processPendingLineNotifications, shouldSendRealtimeStatusNotification } from "../../modules/line/lineNotifications.js";

export class LineNotificationAdapter extends LineNotificationService {
  shouldSendRealtimeStatus(status) { return shouldSendRealtimeStatusNotification(status); }
  enqueue(database, notification) { return enqueueLineNotification(database, notification); }
  deliver(id) { return deliverLineNotification(id); }
  processPending(limit = 20) { return processPendingLineNotifications(limit); }
  enqueueVaccinationReminders() { return enqueueVaccinationReminders(); }
}

