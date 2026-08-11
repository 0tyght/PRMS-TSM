import crypto from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import { buildCitizenStatusFlex } from "../src/modules/line/citizenExperience.js";
import { verifyLineWebhookSignature } from "../src/modules/line/lineBot.js";
import {
  buildMainMenuActions,
  buildStatusMenuActions,
  isValidLineUserId,
  normalizeNativeCommand,
  normalizeThaiPhone,
  parsePostbackData,
} from "../src/modules/line/lineNativeCitizen.js";

test("verifies an authentic LINE webhook signature", () => {
  const secret = "test-channel-secret";
  const body = Buffer.from('{"destination":"U123","events":[]}', "utf8");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64");

  assert.equal(verifyLineWebhookSignature(body, signature, secret), true);
  assert.equal(verifyLineWebhookSignature(body, "invalid", secret), false);
});

test("builds a dynamic owner status flex message", () => {
  const message = buildCitizenStatusFlex({
    linked: true,
    menuKey: "action",
    owner: { fullName: "ผู้ทดสอบ" },
    location: { missing: true },
    counts: {
      pets: 3,
      pending: 2,
      needsAttention: 1,
      vaccinationDue: 2,
      unsterilized: 1,
      missingPets: 0,
    },
  });

  assert.equal(message.type, "flex");
  assert.match(message.altText, /3/);
  assert.equal(message.contents.type, "bubble");
});

test("normalizes Thai phone numbers for native chat workflows", () => {
  assert.equal(normalizeThaiPhone("081-234-5678"), "0812345678");
  assert.equal(normalizeThaiPhone("66812345678"), "0812345678");
});

test("parses LINE postback actions without opening LIFF", () => {
  assert.deepEqual(
    parsePostbackData("action=pet_detail&petId=42"),
    { action: "pet_detail", petId: "42" },
  );
});

test("rejects demo LINE IDs and accepts real-shaped user IDs", () => {
  assert.equal(isValidLineUserId("U_DEMO_01"), false);
  assert.equal(isValidLineUserId(`U${"a".repeat(32)}`), true);
});

test("normalizes native Thai commands", () => {
  assert.equal(normalizeNativeCommand("  แจ้ง   วัคซีน  "), "แจ้ง วัคซีน");
});


test("groups owner services into visible postback selections", () => {
  const actions = buildMainMenuActions({ linked: true });

  assert.deepEqual(
    actions.slice(0, 5).map((item) => [item.type, item.data, item.displayText]),
    [
      ["postback", "wizard=switched&target=pets", "สัตว์ของฉัน"],
      ["postback", "wizard=switched&target=health", "สุขภาพสัตว์"],
      ["postback", "wizard=switched&target=status", "แจ้งสถานะสัตว์"],
      ["postback", "wizard=switched&target=requests", "ข้อมูลที่ส่ง"],
      ["postback", "wizard=switched&target=owner", "ข้อมูลเจ้าของ"],
    ],
  );
  assert.equal(actions.every((item) => item.type === "postback"), true);
});

test("keeps lost, deceased, and moved-out actions under the pet status submenu", () => {
  const actions = buildStatusMenuActions({
    id: 42,
    petName: "โบ้",
    status: "ACTIVE",
  });

  const parsed = actions.map((item) =>
    parsePostbackData(item.data),
  );

  assert.equal(
    parsed.some((item) =>
      item.action === "status_set" &&
      item.value === "MISSING",
    ),
    true,
  );

  assert.equal(
    parsed.some((item) =>
      item.action === "status_set" &&
      item.value === "DECEASED",
    ),
    true,
  );

  assert.equal(
    parsed.some((item) =>
      item.action === "status_set" &&
      item.value === "MOVED_OUT",
    ),
    true,
  );

  assert.equal(
    parsed.some((item) =>
      item.action === "status_set" &&
      item.value === "ACTIVE",
    ),
    false,
  );
});

test("shows found-again only when the current pet is missing", () => {
  const actions = buildStatusMenuActions({
    id: 7,
    petName: "มะลิ",
    status: "MISSING",
  });

  const parsed = actions.map((item) =>
    parsePostbackData(item.data),
  );

  assert.equal(
    parsed.some((item) =>
      item.action === "status_set" &&
      item.value === "ACTIVE",
    ),
    true,
  );

  assert.equal(
    parsed.some((item) =>
      item.action === "status_set" &&
      item.value === "MISSING",
    ),
    false,
  );
});
