import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const systemMenus =
  fs.readFileSync(
    new URL(
      "../src/modules/line/CitizenSystemRichMenus.js",
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

const wizard =
  fs.readFileSync(
    new URL(
      "../src/modules/line/lineRichMenuWizard.js",
      import.meta.url,
    ),
    "utf8",
  );

const wasteQueue =
  fs.readFileSync(
    new URL(
      "../src/modules/waste/infrastructure/WasteLineNotificationQueue.js",
      import.meta.url,
    ),
    "utf8",
  );

const launcher =
  fs.readFileSync(
    new URL(
      "../../../scripts/server/start-smart-tha-pho.ps1",
      import.meta.url,
    ),
    "utf8",
  );

test(
  "Smart Tha Pho has its own persistent four-system Rich Menu",
  () => {
    assert.match(
      systemMenus,
      /key:\s*"smart-tha-pho-main-v1"/,
    );

    for (const action of [
      "smart=pet",
      "smart=waste",
      "smart=disaster",
      "smart=waterworks",
    ]) {
      assert.ok(
        systemMenus.includes(action),
        `missing ${action}`,
      );
    }
  },
);

test(
  "citizen waste has a dedicated persistent Rich Menu",
  () => {
    assert.match(
      systemMenus,
      /key:\s*"smart-tha-pho-waste-citizen-v1"/,
    );

    for (const action of [
      "waste=register",
      "waste=citizen_schedule",
      "waste=citizen_location",
      "waste=citizen_charges",
      "smart=menu",
    ]) {
      assert.ok(
        systemMenus.includes(action),
        `missing ${action}`,
      );
    }
  },
);

test(
  "standalone Smart and waste menus are not PET wizard runtimes",
  () => {
    assert.match(
      wizard,
      /export async function showStandaloneRichMenuForLineUser/,
    );

    assert.match(
      wizard,
      /DELETE FROM line_runtime_rich_menus WHERE line_user_id = \?/,
    );

    assert.match(
      wizard,
      /export async function setDefaultStandaloneRichMenu/,
    );

    assert.match(
      wizard,
      /\/v2\/bot\/user\/all\/richmenu\/\$\{encodeURIComponent\(asset\.richMenuId\)\}/,
    );
  },
);

test(
  "LINE switches persistent menus by citizen system context",
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
      /if \(wasteResult\.handled\)[\s\S]*?showWasteCitizenRichMenu/,
    );

    assert.doesNotMatch(
      lineBot,
      /clearCitizenPetRichMenu/,
    );
  },
);

test(
  "waste push binds the waste citizen menu rather than unlinking to channel default",
  () => {
    assert.match(
      wasteQueue,
      /showWasteCitizenRichMenu/,
    );

    assert.doesNotMatch(
      wasteQueue,
      /clearWizardRichMenuForLineUser/,
    );
  },
);

test(
  "startup synchronizes Smart Tha Pho as Citizen OA default Rich Menu",
  () => {
    assert.match(
      launcher,
      /sync-line-rich-menu-default\.mjs/,
    );

    assert.match(
      launcher,
      /Default Rich Menu/,
    );
  },
);