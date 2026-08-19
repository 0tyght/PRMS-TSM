import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const trackingPage =
  fs.readFileSync(
    new URL(
      "../../waste-management/src/pages/TrackingPage.jsx",
      import.meta.url,
    ),
    "utf8",
  );

const trackingRepository =
  fs.readFileSync(
    new URL(
      "../src/modules/waste/infrastructure/MariaDbWasteTrackingRepository.js",
      import.meta.url,
    ),
    "utf8",
  );

const lineBot =
  fs.readFileSync(
    new URL(
      "../src/modules/line/lineBot.js",
      import.meta.url,
    ),
    "utf8",
  );

const richMenuWizard =
  fs.readFileSync(
    new URL(
      "../src/modules/line/lineRichMenuWizard.js",
      import.meta.url,
    ),
    "utf8",
  );

const citizenSystemMenus =
  fs.readFileSync(
    new URL(
      "../src/modules/line/CitizenSystemRichMenus.js",
      import.meta.url,
    ),
    "utf8",
  );

const wasteNotificationQueue =
  fs.readFileSync(
    new URL(
      "../src/modules/waste/infrastructure/WasteLineNotificationQueue.js",
      import.meta.url,
    ),
    "utf8",
  );

const petNotifications =
  fs.readFileSync(
    new URL(
      "../src/modules/line/lineNotifications.js",
      import.meta.url,
    ),
    "utf8",
  );

test(
  "tracking page shows published plans and renders collection stops on the map",
  () => {
    assert.match(
      trackingPage,
      /publicationStatus\s*===\s*"PUBLISHED"/,
    );

    assert.match(
      trackingPage,
      /routeStops=\{\s*track\.stops\s*\|\|\s*\[\]\s*\}/,
    );

    assert.match(
      trackingPage,
      /ความคืบหน้าจุดเก็บขยะ/,
    );

    assert.match(
      trackingPage,
      /point\.accuracyM/,
    );
  },
);

test(
  "tracking repository resolves latest coordinates from the selected plan GPS log",
  () => {
    assert.match(
      trackingRepository,
      /SELECT latest\.latitude[\s\S]*?FROM waste_location_logs latest[\s\S]*?latest\.plan_id = p\.id/,
    );

    assert.match(
      trackingRepository,
      /SELECT latest\.longitude[\s\S]*?FROM waste_location_logs latest[\s\S]*?latest\.plan_id = p\.id/,
    );

    assert.doesNotMatch(
      trackingRepository,
      /v\.last_latitude AS latitude,\s*v\.last_longitude AS longitude,\s*v\.last_gps_at AS lastGpsAt/,
    );
  },
);

test(
  "Smart Tha Pho and waste citizen use standalone persistent Rich Menus outside PET runtime",
  () => {
    assert.match(
      richMenuWizard,
      /export async function showStandaloneRichMenuForLineUser/,
    );

    assert.match(
      richMenuWizard,
      /DELETE FROM line_runtime_rich_menus WHERE line_user_id = \?/,
    );

    assert.match(
      citizenSystemMenus,
      /key:\s*"smart-tha-pho-main-v1"/,
    );

    assert.match(
      citizenSystemMenus,
      /key:\s*"smart-tha-pho-waste-citizen-v1"/,
    );
  },
);

test(
  "Smart home and citizen waste actions bind the correct persistent system menu",
  () => {
    assert.match(
      lineBot,
      /smartMenuRequest\?\.action === "menu"[\s\S]*?showSmartThaPhoMainRichMenu/,
    );

    assert.match(
      lineBot,
      /smartMenuRequest\.system === "waste"[\s\S]*?showWasteCitizenRichMenu/,
    );

    assert.match(
      lineBot,
      /if\s*\(wasteResult\.handled\)[\s\S]*?showWasteCitizenRichMenu/,
    );

    assert.doesNotMatch(
      lineBot,
      /clearCitizenPetRichMenu/,
    );
  },
);

test(
  "citizen waste push binds waste Rich Menu before the waste notification",
  () => {
    assert.match(
      wasteNotificationQueue,
      /channelKind === "CITIZEN"[\s\S]*?showWasteCitizenRichMenu[\s\S]*?"WASTE_PUSH"/,
    );

    const citizenBlock =
      wasteNotificationQueue.indexOf(
        'channelKind === "CITIZEN"',
      );

    const menuIndex =
      wasteNotificationQueue.indexOf(
        "showWasteCitizenRichMenu",
        citizenBlock,
      );

    const pushIndex =
      wasteNotificationQueue.indexOf(
        "https://api.line.me/v2/bot/message/push",
      );

    assert.ok(
      citizenBlock >= 0,
    );

    assert.ok(
      menuIndex > citizenBlock,
    );

    assert.ok(
      pushIndex > menuIndex,
    );

    assert.doesNotMatch(
      wasteNotificationQueue,
      /clearWizardRichMenuForLineUser/,
    );
  },
);

test(
  "PET notifications refresh a PET menu only when PET runtime is active",
  () => {
    assert.match(
      petNotifications,
      /async function hasActivePetRichMenu/,
    );

    assert.match(
      petNotifications,
      /FROM line_runtime_rich_menus[\s\S]*?expires_at > NOW\(\)/,
    );

    assert.match(
      petNotifications,
      /PET_MENU_ACTIVE_ONLY[\s\S]*?syncRichMenuForLineUser/,
    );
  },
);