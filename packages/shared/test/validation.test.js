import test from "node:test";
import assert from "node:assert/strict";
import { normalizeThaiPhone, validatePetRegistration } from "../src/index.js";

test("normalizes a Thai phone number", () => {
  assert.equal(normalizeThaiPhone("081-234-5678"), "0812345678");
});

test("rejects an incomplete registration", () => {
  const result = validatePetRegistration({});
  assert.equal(result.valid, false);
  assert.ok(result.errors.ownerName);
  assert.ok(result.errors.petName);
});

test("accepts required registration data", () => {
  const result = validatePetRegistration({
    ownerName: "สมชาย ใจดี",
    phone: "0812345678",
    houseNo: "99/1",
    villageId: "1",
    petName: "เจ้าดำ",
    species: "DOG",
  });
  assert.equal(result.valid, true);
});
