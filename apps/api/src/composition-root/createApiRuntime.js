import { createApp } from "./createHttpApplication.js";
import { config } from "../core/config.js";
import { ScheduledTask } from "../application/background/ScheduledTask.js";
import { ApiRuntime } from "../infrastructure/server/ApiRuntime.js";
import { LineNotificationAdapter } from "../infrastructure/line/LineNotificationAdapter.js";
import { NativeCitizenAdapter } from "../infrastructure/line/NativeCitizenAdapter.js";
import { RichMenuAdapter } from "../infrastructure/line/RichMenuAdapter.js";
import { WasteLineAdapter } from "../infrastructure/line/WasteLineAdapter.js";
import { database } from "../core/db.js";
import { WasteLineNotificationQueue } from "../modules/waste/infrastructure/WasteLineNotificationQueue.js";`nimport { WastePaymentReminderScanner } from "../modules/waste/infrastructure/WastePaymentReminderScanner.js";

export function createApiRuntime({ logger = console } = {}) {
  const notifications = new LineNotificationAdapter();
  const nativeCitizen = new NativeCitizenAdapter();
  const richMenus = new RichMenuAdapter();
  const wasteLine = new WasteLineAdapter();
  const wasteNotifications = new WasteLineNotificationQueue({ database });`n  const wastePaymentReminders = new WastePaymentReminderScanner({ database });
  const notificationQueue = new ScheduledTask({
    name: "line-notification",
    intervalMs: 60_000,
    logger,
    action: async () => {
      const [petResults, wasteResults] = await Promise.all([
        notifications.processPending(30),
        wasteNotifications.processPending(30),
      ]);
      const results = [...petResults, ...wasteResults];
      const sent = results.filter((item) => item.status === "SENT").length;
      if (results.length) logger.log(`[line-notification] processed=${results.length} sent=${sent}`);
      return results;
    },
  });

  const reminderScanner = new ScheduledTask({
    name: "line-reminder",
    intervalMs: 6 * 60 * 60 * 1000,
    logger,
    action: async () => {
      const result = await notifications.enqueueVaccinationReminders();
      if (result.queued) {
        logger.log(`[line-notification] vaccination reminders queued=${result.queued}`);
        await notificationQueue.run();
      }
      return result;
    },
  });



  const wastePaymentReminderScanner = new ScheduledTask({
    name: "waste-payment-reminder",
    intervalMs: 6 * 60 * 60 * 1000,
    logger,
    action: async () => {
      const result = await wastePaymentReminders.enqueueDueReminders({ daysBefore: 3 });
      if (result.queued) {
        logger.log(`[waste-line] payment reminders queued=${result.queued}`);
        await notificationQueue.run();
      }
      return result;
    },
  });
  const workflowCleanup = new ScheduledTask({
    name: "line-native-cleanup",
    intervalMs: 6 * 60 * 60 * 1000,
    logger,
    action: async () => {
      const [petResult, wasteResult] = await Promise.all([nativeCitizen.cleanupState(), wasteLine.cleanupState()]);
      if (petResult.attachments || petResult.sessions || petResult.events) logger.log(`[line-native] cleanup attachments=${petResult.attachments} sessions=${petResult.sessions} events=${petResult.events}`);
      if (wasteResult.sessions || wasteResult.linkCodes) logger.log(`[line-waste] cleanup sessions=${wasteResult.sessions} linkCodes=${wasteResult.linkCodes}`);
      return { petResult, wasteResult };
    },
  });

  const warmRichMenus = async () => {
    try {
      const menus = await richMenus.warm();
      logger.log(`[rich-menu-v12] warmed=${menus.length}`);
    } catch (error) {
      logger.error("[rich-menu-v12] warm failed", String(error?.message || error));
    }
  };

  return new ApiRuntime({
    app: createApp(),
    port: config.port,
    logger,
    tasks: [notificationQueue, reminderScanner, wastePaymentReminderScanner, workflowCleanup],
    warmups: [warmRichMenus],
  });
}
