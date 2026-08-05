import crypto from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCitizenStatusFlex,
} from "../src/citizenExperience.js";
import {
  verifyLineWebhookSignature,
} from "../src/lineBot.js";

test("verifies an authentic LINE webhook signature", () => {
  const secret = "test-channel-secret";
  const body = Buffer.from(
    '{"destination":"U123","events":[]}',
    "utf8",
  );
  const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64");

  assert.equal(
    verifyLineWebhookSignature(body, signature, secret),
    true,
  );
  assert.equal(
    verifyLineWebhookSignature(body, "invalid", secret),
    false,
  );
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
