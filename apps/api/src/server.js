import { createApp } from "./app.js";
import { config } from "./core/config.js";
import {
  enqueueVaccinationReminders,
  processPendingLineNotifications,
} from "./modules/line/lineNotifications.js";
import { cleanupNativeLineState } from "./modules/line/lineNativeCitizen.js";
import { warmWizardRichMenus } from "./modules/line/lineRichMenuWizard.js";

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`Smart Tha Pho API listening on http://localhost:${config.port}`);
});


async function warmRichMenus() {
  try {
    const menus = await warmWizardRichMenus();
    console.log(`[rich-menu-v12] warmed=${menus.length}`);
  } catch (error) {
    console.error("[rich-menu-v12] warm failed", String(error?.message || error));
  }
}

let queueRunning = false;
let reminderRunning = false;

async function processNotificationQueue() {
  if (queueRunning) return;
  queueRunning = true;

  try {
    const results = await processPendingLineNotifications(30);
    const sent = results.filter((item) => item.status === "SENT").length;

    if (results.length) {
      console.log(
        `[line-notification] processed=${results.length} sent=${sent}`,
      );
    }
  } catch (error) {
    console.error(
      "[line-notification] queue failed",
      String(error?.message || error),
    );
  } finally {
    queueRunning = false;
  }
}

async function scanVaccinationReminders() {
  if (reminderRunning) return;
  reminderRunning = true;

  try {
    const result = await enqueueVaccinationReminders();

    if (result.queued) {
      console.log(
        `[line-notification] vaccination reminders queued=${result.queued}`,
      );
      await processNotificationQueue();
    }
  } catch (error) {
    console.error(
      "[line-notification] reminder scan failed",
      String(error?.message || error),
    );
  } finally {
    reminderRunning = false;
  }
}

async function cleanupNativeWorkflow() {
  try {
    const result = await cleanupNativeLineState();
    if (result.attachments || result.sessions || result.events) {
      console.log(
        `[line-native] cleanup attachments=${result.attachments} sessions=${result.sessions} events=${result.events}`,
      );
    }
  } catch (error) {
    console.error(
      "[line-native] cleanup failed",
      String(error?.message || error),
    );
  }
}

void processNotificationQueue();
void scanVaccinationReminders();
void cleanupNativeWorkflow();
void warmRichMenus();

const queueTimer = setInterval(
  () => void processNotificationQueue(),
  60_000,
);
const reminderTimer = setInterval(
  () => void scanVaccinationReminders(),
  6 * 60 * 60 * 1000,
);
const cleanupTimer = setInterval(
  () => void cleanupNativeWorkflow(),
  6 * 60 * 60 * 1000,
);

queueTimer.unref();
reminderTimer.unref();
cleanupTimer.unref();

function shutdown(signal) {
  console.log(`[server] received ${signal}; shutting down`);
  clearInterval(queueTimer);
  clearInterval(reminderTimer);
  clearInterval(cleanupTimer);

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
