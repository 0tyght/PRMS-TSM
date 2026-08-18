import assert from "node:assert/strict";
import test from "node:test";

import {
  LineChannelSettingsRegistry,
  decryptLineSecret,
  encryptLineSecret,
  webhookPathFor,
} from "../src/modules/line/lineChannelSettings.js";
import { lineChannelKindForWasteNotification } from "../src/modules/waste/infrastructure/WasteLineNotificationQueue.js";

function emptyDatabase() {
  return {
    async execute(sql) {
      if (/FROM\s+system_line_channels/i.test(sql)) return [[], []];
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
  };
}

test("LINE settings encrypt secrets without storing plaintext", () => {
  const encrypted = encryptLineSecret("very-sensitive-token-value");
  assert.ok(encrypted);
  assert.equal(encrypted.includes("very-sensitive-token-value"), false);
  assert.equal(decryptLineSecret(encrypted), "very-sensitive-token-value");
});

test("LINE settings test validates token without returning secrets", async () => {
  let request = null;
  const registry = new LineChannelSettingsRegistry({
    database: emptyDatabase(),
    cacheTtlMs: 0,
    fetchImplementation: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            userId: "U0123456789abcdef0123456789abcdef",
            basicId: "@123abcde",
            displayName: "Smart Tha Pho Staff",
          };
        },
      };
    },
  });

  const result = await registry.test("DRIVER", {
    channelId: "2001234567",
    channelSecret: "driver-secret",
    channelAccessToken: "driver-access-token",
  });

  assert.equal(request.url, "https://api.line.me/v2/bot/info");
  assert.equal(request.options.headers.Authorization, "Bearer driver-access-token");
  assert.equal(result.kind, "DRIVER");
  assert.equal(result.displayName, "Smart Tha Pho Staff");
  assert.equal(result.basicId, "@123abcde");
  assert.equal(result.webhookPath, "/api/line/driver-webhook");
  assert.equal(Object.hasOwn(result, "channelSecret"), false);
  assert.equal(Object.hasOwn(result, "channelAccessToken"), false);
});


test("LINE settings list never exposes saved secret fields", async () => {
  const registry = new LineChannelSettingsRegistry({ database: emptyDatabase(), cacheTtlMs: 0 });
  const channels = await registry.listSafe();
  assert.deepEqual(channels.map((item) => item.kind), ["CITIZEN", "DRIVER"]);
  for (const channel of channels) {
    assert.equal(Object.hasOwn(channel, "channelSecret"), false);
    assert.equal(Object.hasOwn(channel, "channelAccessToken"), false);
    assert.equal(typeof channel.hasChannelSecret, "boolean");
    assert.equal(typeof channel.hasAccessToken, "boolean");
  }
});

test("LINE settings expose separate citizen and driver webhook paths", () => {
  assert.equal(webhookPathFor("CITIZEN"), "/api/line/webhook");
  assert.equal(webhookPathFor("DRIVER"), "/api/line/driver-webhook");
});

test("waste notifications use the correct LINE OA", () => {
  assert.equal(lineChannelKindForWasteNotification("PLAN_ASSIGNMENT"), "DRIVER");
  assert.equal(lineChannelKindForWasteNotification("COLLECTION_STATUS"), "CITIZEN");
  assert.equal(lineChannelKindForWasteNotification("CHARGE_NOTICE"), "CITIZEN");
  assert.equal(lineChannelKindForWasteNotification("PAYMENT_REMINDER"), "CITIZEN");
});
