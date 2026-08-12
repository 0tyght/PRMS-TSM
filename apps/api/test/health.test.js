import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { prepareRegistrationAttachment } from "../src/app.js";
import { createApp } from "../src/composition-root/createHttpApplication.js";
import { config } from "../src/core/config.js";

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

test("retires the citizen web API in favor of LINE OA", async (t) => {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/citizen/me`);
  assert.equal(response.status, 410);
  assert.match((await response.json()).message, /LINE Official Account/);
});

test("protects waste-management endpoints through the versioned API contract", async (t) => {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/waste/dashboard`);
  assert.equal(response.status, 401);
  assert.ok((await response.json()).message);
});

test("protects the waste route preview endpoint before calling the routing provider", async (t) => {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/waste/routes/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ waypoints: [{ latitude: 16.77, longitude: 100.22 }, { latitude: 16.78, longitude: 100.23 }] }),
  });
  assert.equal(response.status, 401);
  assert.ok((await response.json()).message);
});

test("returns a road-following GeoJSON preview for authorized waste officers", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    if (String(input).startsWith(config.routingApiBaseUrl)) {
      return new Response(JSON.stringify({
        code: "Ok",
        routes: [{ distance: 4412.7, duration: 436.2, geometry: { type: "LineString", coordinates: [[100.219, 16.77], [100.228, 16.779]] } }],
        waypoints: [{ name: "", location: [100.219, 16.77], distance: 3.2 }, { name: "", location: [100.228, 16.779], distance: 1.1 }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input, options);
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const token = jwt.sign({ sub: "route-test", role: "OFFICER" }, config.jwtSecret, { expiresIn: "5m" });
  const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/v1/waste/routes/preview`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ waypoints: [{ latitude: 16.77, longitude: 100.219 }, { latitude: 16.779, longitude: 100.228 }] }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.routeGeojson.geometry.type, "LineString");
  assert.equal(body.data.routeGeojson.properties.source, "OpenStreetMap / OSRM");
  assert.equal(body.data.routeGeojson.properties.waypoints.length, 2);
  assert.equal(body.data.distanceMeters, 4413);
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
