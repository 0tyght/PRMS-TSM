import assert from "node:assert/strict";
import test from "node:test";

import { LineChannelProfile } from "../src/application/line/LineChannelProfile.js";

test("represents citizen and driver LINE credentials independently", () => {
  const citizen = new LineChannelProfile({ kind: "CITIZEN", channelSecret: "citizen-secret", channelAccessToken: "citizen-token" });
  const driver = new LineChannelProfile({ kind: "DRIVER", channelSecret: "driver-secret", channelAccessToken: "driver-token" });
  assert.equal(citizen.configured, true);
  assert.equal(driver.configured, true);
  assert.notEqual(citizen.channelAccessToken, driver.channelAccessToken);
});

test("reports the correct environment key for an unconfigured driver channel", () => {
  const driver = new LineChannelProfile({ kind: "DRIVER" });
  assert.throws(() => driver.requireSecret(), /LINE_DRIVER_CHANNEL_SECRET/);
  assert.throws(() => driver.requireAccessToken(), /LINE_DRIVER_CHANNEL_ACCESS_TOKEN/);
});
