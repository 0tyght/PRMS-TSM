import {
  lineChannelSettings,
} from "../../apps/api/src/modules/line/lineChannelSettings.js";

import {
  syncSmartThaPhoDefaultRichMenu,
} from "../../apps/api/src/modules/line/CitizenSystemRichMenus.js";

await lineChannelSettings.refresh({
  force: true,
});

const citizen =
  await lineChannelSettings.get(
    "CITIZEN",
  );

if (!citizen.configured) {
  console.log(
    "[line-rich-menu-default] CITIZEN: skipped (not configured or disabled)",
  );
  process.exit(0);
}

try {
  const result =
    await syncSmartThaPhoDefaultRichMenu();

  console.log(
    `[line-rich-menu-default] CITIZEN: Smart Tha Pho default (${result.richMenuId})`,
  );
} catch (error) {
  console.error(
    `[line-rich-menu-default] CITIZEN: failed: ${String(error?.message || error)}`,
  );
  process.exit(1);
}