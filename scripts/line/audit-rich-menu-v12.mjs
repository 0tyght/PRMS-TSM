import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const nativePath = path.join(root, "apps", "api", "src", "modules", "line", "lineNativeCitizen.v10.js");
const wizardPath = path.join(root, "apps", "api", "src", "modules", "line", "lineRichMenuWizard.js");
const botPath = path.join(root, "apps", "api", "src", "modules", "line", "lineBot.js");
const citizenPath = path.join(root, "apps", "api", "src", "modules", "line", "citizenExperience.js");

const native = fs.readFileSync(nativePath, "utf8");
const wizard = fs.readFileSync(wizardPath, "utf8");
const bot = fs.readFileSync(botPath, "utf8");
const citizen = fs.readFileSync(citizenPath, "utf8");

const emitted = new Set(
  [...native.matchAll(/["'`]action=([A-Za-z0-9_]+)/g)].map((match) => match[1]),
);
const handled = new Set(
  [...native.matchAll(/action\s*===\s*["']([A-Za-z0-9_]+)["']/g)].map((match) => match[1]),
);
for (const match of native.matchAll(/\[([^\]]+)\]\.includes\(action\)/g)) {
  for (const name of match[1].matchAll(/["']([A-Za-z0-9_]+)["']/g)) {
    handled.add(name[1]);
  }
}
const prefixes = [...native.matchAll(/action\.startsWith\(["']([A-Za-z0-9_]+)/g)]
  .map((match) => match[1]);
const missing = [...emitted]
  .filter((name) => !handled.has(name) && !prefixes.some((prefix) => name.startsWith(prefix)))
  .sort();

const forbidden = [
  [native, "convertNativeMessagesToListMenus"],
  [native, "buildNativeChoiceListFlex"],
  [native, "PET_PAGE_SIZE"],
  [wizard, "crypto.randomUUID()"],
  [native, "ORDER BY submittedAt DESC\n     LIMIT 200"],
  [citizen, "lineRichMenuGuestId"],
  [citizen, "lineRichMenuOwnerId"],
  [citizen, "lineRichMenuActionId"],
];
const forbiddenFound = forbidden
  .filter(([source, token]) => source.includes(token))
  .map(([, token]) => token);

const requiredWizardFeatures = [
  "line_rich_menu_assets",
  "richmenuswitch",
  "ensureRichMenuAlias",
  "STATIC_ALIAS_BY_KEY",
  "_wizardItems",
  "AbortSignal.timeout",
  "userQueues",
  "warmWizardRichMenus",
];
const missingFeatures = requiredWizardFeatures.filter((token) => !wizard.includes(token));
const botChecks = [
  ["non-blocking rich menu task", "continueRichMenuTask"],
  ["reply timeout", "AbortSignal.timeout"],
  ["richMenuTask handling", "result.richMenuTask"],
];
const quickReplyChecks = [
  "buildQuickReplyItemsFromWizardPage",
  "attachMatchingQuickReplies",
  "buildWizardMenuMessage",
];
const requestChecks = [
  "SELECT COUNT(*) AS total",
  "action=request_detail",
  "action=requests_page",
];
const missingRequestFeatures = requestChecks.filter((token) => !native.includes(token));

const missingBotFeatures = botChecks
  .filter(([, token]) => !bot.includes(token))
  .map(([label]) => label);
const missingQuickReplyFeatures = quickReplyChecks.filter((token) => !wizard.includes(token));

console.log(`Rich Menu V12 audit: emittedActions=${emitted.size}, handledActions=${handled.size}`);
console.log(`Rich Menu V12 audit: unresolvedActions=${missing.length}`);
console.log(`Rich Menu V12 audit: forbiddenLegacy=${forbiddenFound.length}`);
console.log(`Rich Menu V12 audit: missingWizardFeatures=${missingFeatures.length}`);
console.log(`Rich Menu V12 audit: missingBotFeatures=${missingBotFeatures.length}`);
console.log(`Rich Menu V12 audit: missingQuickReplyFeatures=${missingQuickReplyFeatures.length}`);
console.log(`Rich Menu V12 audit: missingRequestFeatures=${missingRequestFeatures.length}`);

if (missing.length) console.error(`Unhandled actions: ${missing.join(", ")}`);
if (forbiddenFound.length) console.error(`Legacy/unsafe tokens: ${forbiddenFound.join(", ")}`);
if (missingFeatures.length) console.error(`Missing wizard features: ${missingFeatures.join(", ")}`);
if (missingBotFeatures.length) console.error(`Missing bot features: ${missingBotFeatures.join(", ")}`);
if (missingQuickReplyFeatures.length) console.error(`Missing quick reply features: ${missingQuickReplyFeatures.join(", ")}`);
if (missingRequestFeatures.length) console.error(`Missing request features: ${missingRequestFeatures.join(", ")}`);

if (missing.length || forbiddenFound.length || missingFeatures.length || missingBotFeatures.length || missingQuickReplyFeatures.length || missingRequestFeatures.length) {
  process.exitCode = 1;
}
