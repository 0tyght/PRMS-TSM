import test from "node:test";
import assert from "node:assert/strict";
import { createApp, prepareRegistrationAttachment } from "../src/app.js";

test("creates the API application", () => {
  const app = createApp();
  assert.equal(typeof app.listen, "function");
});

test("serves the versioned API contract without breaking the legacy path", async (t) => {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const port = server.address().port;
  const [versioned, legacy] = await Promise.all([
    fetch(`http://127.0.0.1:${port}/api/v1/health/live`),
    fetch(`http://127.0.0.1:${port}/api/health/live`),
  ]);

  assert.equal(versioned.status, 200);
  assert.equal(legacy.status, 200);
  assert.equal((await versioned.json()).status, "alive");
  assert.equal((await legacy.json()).status, "alive");
});

test("validates attachment signatures instead of trusting the browser MIME type", () => {
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const attachment = prepareRegistrationAttachment({
    fileName: "pet.png",
    mimeType: "image/png",
    base64: onePixelPng.toString("base64"),
  });
  assert.equal(attachment.mimeType, "image/png");
  assert.equal(attachment.bytes.length, onePixelPng.length);
  assert.match(attachment.checksum, /^[a-f0-9]{64}$/);

  assert.throws(
    () => prepareRegistrationAttachment({ fileName: "fake.png", mimeType: "image/png", base64: Buffer.from("not an image").toString("base64") }),
    /ชนิดไฟล์จริง/,
  );
});
