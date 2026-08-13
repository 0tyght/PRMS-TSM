import assert from "node:assert/strict";
import test from "node:test";
import { LocationHistoryPolicy } from "../src/application/LocationHistoryPolicy.js";

test("does not draw a straight trail between sparse GPS samples", () => {
  const policy = new LocationHistoryPolicy({ maximumGapMinutes: 5 });
  const segments = policy.createContinuousSegments([
    { latitude: 16.7794, longitude: 100.2206, recordedAt: "2026-08-13T05:45:00+07:00" },
    { latitude: 16.7748, longitude: 100.2165, recordedAt: "2026-08-13T07:02:00+07:00" },
    { latitude: 16.7701, longitude: 100.2122, recordedAt: "2026-08-13T08:42:00+07:00" },
  ]);
  assert.deepEqual(segments, []);
});

test("keeps continuous GPS samples in the same trail segment", () => {
  const policy = new LocationHistoryPolicy({ maximumGapMinutes: 5 });
  const segments = policy.createContinuousSegments([
    { latitude: 16.7794, longitude: 100.2206, recordedAt: "2026-08-13T05:45:00+07:00" },
    { latitude: 16.7790, longitude: 100.2202, recordedAt: "2026-08-13T05:48:00+07:00" },
    { latitude: 16.7786, longitude: 100.2198, recordedAt: "2026-08-13T05:51:00+07:00" },
  ]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].length, 3);
});
