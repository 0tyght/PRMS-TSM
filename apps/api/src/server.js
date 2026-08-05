import { createApp } from "./app.js";
import { config } from "./config.js";
import {
  enqueueVaccinationReminders,
  processPendingLineNotifications,
} from "./lineNotifications.js";

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`PRMS-TSM API listening on http://localhost:${config.port}`);
});

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

void processNotificationQueue();
void scanVaccinationReminders();

const queueTimer = setInterval(
  () => void processNotificationQueue(),
  60_000,
);
const reminderTimer = setInterval(
  () => void scanVaccinationReminders(),
  6 * 60 * 60 * 1000,
);

queueTimer.unref();
reminderTimer.unref();

function shutdown(signal) {
  console.log(`[server] received ${signal}; shutting down`);
  clearInterval(queueTimer);
  clearInterval(reminderTimer);

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
