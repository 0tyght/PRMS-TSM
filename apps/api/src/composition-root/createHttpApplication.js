import { createApp as createExpressApplication } from "../app.js";
import { LineBotAdapter } from "../infrastructure/line/LineBotAdapter.js";
import { LineNotificationAdapter } from "../infrastructure/line/LineNotificationAdapter.js";
import { NativeCitizenAdapter } from "../infrastructure/line/NativeCitizenAdapter.js";
import { ReportExportAdapter } from "../infrastructure/reports/ReportExportAdapter.js";
import { MfaAdapter } from "../infrastructure/security/MfaAdapter.js";

export function createHttpApplicationServices() {
  return Object.freeze({
    lineNotifications: new LineNotificationAdapter(),
    nativeCitizen: new NativeCitizenAdapter(),
    lineBot: new LineBotAdapter(),
    reportExports: new ReportExportAdapter(),
    mfa: new MfaAdapter(),
  });
}

export function createApp(options = {}) {
  return createExpressApplication({ ...options, services: options.services || createHttpApplicationServices() });
}
