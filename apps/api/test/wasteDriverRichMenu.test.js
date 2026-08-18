import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWasteDriverRichMenuDefinition,
  renderWasteDriverRichMenuImage,
  wasteDriverRichMenuAlias,
} from "../src/modules/line/wasteDriverRichMenu.js";

test("driver Rich Menu exposes distinct complete entry points", () => {
  const definition = buildWasteDriverRichMenuDefinition();
  assert.equal(wasteDriverRichMenuAlias, "waste-driver-main-v1");
  assert.deepEqual(definition.size, { width: 2500, height: 1686 });
  assert.equal(definition.chatBarText, "เมนูพนักงาน");
  assert.equal(definition.areas.length, 4);
  assert.deepEqual(
    definition.areas.map((area) => area.action.data),
    ["waste=driver_jobs", "waste=driver_jobs_today", "waste=driver_link", "waste=driver_help"],
  );
  for (const area of definition.areas) {
    assert.ok(area.action.displayText, "each Rich Menu tap must be visible in the chat");
    assert.equal(area.bounds.width, 1250);
    assert.equal(area.bounds.height, 843);
  }
});

test("driver Rich Menu is a LINE-compatible PNG asset", async () => {
  const image = await renderWasteDriverRichMenuImage();
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(image.length < 1024 * 1024, "LINE Rich Menu image must be below 1 MB");
});
