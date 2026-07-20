import assert from "node:assert/strict";
import test from "node:test";
import { createMfaSecret, createTotp, decryptMfaSecret, encryptMfaSecret, verifyTotp } from "../src/mfa.js";

test("encrypts and decrypts an MFA secret", () => {
  const secret = createMfaSecret();
  const encrypted = encryptMfaSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptMfaSecret(encrypted), secret);
});

test("validates a time-based one-time password within the allowed clock window", () => {
  const secret = "JBSWY3DPEHPK3PXP";
  const timestamp = 1_700_000_000_000;
  const code = createTotp(secret, timestamp);
  assert.match(code, /^\d{6}$/);
  assert.equal(verifyTotp(secret, code, timestamp), true);
  assert.equal(verifyTotp(secret, "12345", timestamp), false);
});
