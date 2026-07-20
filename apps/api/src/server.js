import { createApp } from "./app.js";
import { config } from "./config.js";
import { processPendingLineNotifications } from "./lineNotifications.js";

const server = createApp().listen(config.port, () => {
  console.log(`PRMS-TSM API listening on http://localhost:${config.port}`);
  void processPendingLineNotifications().catch((error) => console.error("Initial notification delivery failed", error));
});

const notificationTimer = setInterval(() => {
  void processPendingLineNotifications().catch((error) => console.error("Notification retry failed", error));
}, 60_000);
notificationTimer.unref();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    clearInterval(notificationTimer);
    server.close(() => process.exit(0));
  });
}
