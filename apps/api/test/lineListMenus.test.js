import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import * as nativeCitizen from "../src/modules/line/lineNativeCitizen.js";
import { extractWizardChoicesFromMessages } from "../src/modules/line/lineRichMenuWizard.js";

test("removes the legacy Flex-list compatibility layer", () => {
  assert.equal("buildNativeChoiceListFlex" in nativeCitizen, false);
  assert.equal("convertNativeMessagesToListMenus" in nativeCitizen, false);
});

test("derives one choice set for both Quick Reply and Rich Menu", () => {
  const message = {
    type: "text",
    text: "เลือกเพศสัตว์",
    quickReply: {
      items: [
        { type: "action", action: { type: "postback", label: "เพศผู้", data: "session=sex&value=MALE" } },
        { type: "action", action: { type: "postback", label: "เพศเมีย", data: "session=sex&value=FEMALE" } },
      ],
    },
  };
  assert.deepEqual(
    extractWizardChoicesFromMessages([message]).map((item) => item.action.data),
    ["session=sex&value=MALE", "session=sex&value=FEMALE"],
  );
});


test("paginates request history from the database without a hidden 200-row cap", () => {
  const source = fs.readFileSync(new URL("../src/modules/line/lineNativeCitizen.v10.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /ORDER BY submittedAt DESC\s+LIMIT 200/);
  assert.match(source, /SELECT COUNT\(\*\) AS total/);
  assert.match(source, /action=request_detail/);
  assert.match(source, /action=requests_page/);
});
