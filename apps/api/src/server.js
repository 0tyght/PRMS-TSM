import { createApp } from "./app.js";
import { config } from "./config.js";
import { enqueueVaccinationReminders, processPendingLineNotifications } from "./lineNotifications.js";

const server = createApp().listen(config.port, () => {
  console.log(`PRMS-TSM API listening on http://localhost:${config.port}`);
  void enqueueVaccinationReminders()
    .then(() => processPendingLineNotifications())
    .catch((error) => console.error("Initial notification processing failed", error));
});

const notificationTimer = setInterval(() => {
  void processPendingLineNotifications().catch((error) => console.error("Notification retry failed", error));
}, 60_000);
notificationTimer.unref();

const reminderTimer = setInterval(() => {
  void enqueueVaccinationReminders().catch((error) => console.error("Vaccination reminder queue failed", error));
}, 60 * 60_000);
reminderTimer.unref();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    clearInterval(notificationTimer);
    clearInterval(reminderTimer);
    server.close(() => process.exit(0));
  });
}
