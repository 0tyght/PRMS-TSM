import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { verifyAuthenticatedToken } from "../src/presentation/http/AuthMiddleware.js";

const SECRET = "test-secret-for-session-resume";

function signExpiredToken({ staffSession, issuedHoursAgo = 1 }) {
  const issuedAt = Math.floor(
    (Date.now() - issuedHoursAgo * 60 * 60 * 1000) / 1000,
  );

  return jwt.sign(
    {
      sub: "staff-1",
      role: staffSession ? "OFFICER" : "CITIZEN",
      staffSession,
      iat: issuedAt,
    },
    SECRET,
    { expiresIn: "30m" },
  );
}

test("expired staff token remains usable during the same workday", () => {
  const token = signExpiredToken({ staffSession: true, issuedHoursAgo: 1 });
  const payload = verifyAuthenticatedToken(token, SECRET);

  assert.equal(payload.sub, "staff-1");
  assert.equal(payload.staffSession, true);
});

test("expired non-staff token is rejected", () => {
  const token = signExpiredToken({ staffSession: false, issuedHoursAgo: 1 });

  assert.throws(() => verifyAuthenticatedToken(token, SECRET));
});

test("staff token older than the maximum workday session is rejected", () => {
  const token = signExpiredToken({ staffSession: true, issuedHoursAgo: 13 });

  assert.throws(() => verifyAuthenticatedToken(token, SECRET));
});
