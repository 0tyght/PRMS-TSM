import assert from "node:assert/strict";
import test from "node:test";
import { householdHealthPolicy } from "../src/domain/HouseholdHealthPolicy.js";
import { petDirectoryPolicy } from "../src/domain/PetDirectoryPolicy.js";
import { petStatusPolicy } from "../src/domain/PetStatusPolicy.js";
import { registrationReviewPolicy } from "../src/domain/RegistrationReviewPolicy.js";

test("PetStatusPolicy owns lifecycle and vaccination presentation rules", () => {
  assert.deepEqual(petStatusPolicy.allowedTransitions("MISSING"), ["ACTIVE", "MOVED_OUT", "DECEASED"]);
  assert.equal(petStatusPolicy.vaccinationStatus({ lastVaccinatedAt: null }).key, "NONE");
});

test("HouseholdHealthPolicy prioritizes villages by health risk", () => {
  const rows = householdHealthPolicy.summarizeByVillage([
    { villageNo: 1, vaccinated: false, sterilized: false },
    { villageNo: 2, vaccinated: true, sterilized: true },
    { villageNo: 2, vaccinated: true, sterilized: false },
  ]);
  assert.equal(rows[0].villageNo, 1);
  assert.equal(rows[0].critical, 1);
});

test("PetDirectoryPolicy summarizes registered pet coverage", () => {
  const summary = petDirectoryPolicy.summarize([
    { species: "DOG", lastVaccinatedAt: "2026-01-01", sterilized: 1 },
    { species: "CAT", lastVaccinatedAt: null, sterilized: 0 },
  ]);
  assert.deepEqual(summary, { total: 2, dogs: 1, cats: 1, vaccinated: 1, sterilized: 1 });
});

test("RegistrationReviewPolicy identifies urgent and closed work", () => {
  assert.equal(registrationReviewPolicy.isUrgent({ status: "SUBMITTED", ageDays: 3 }), true);
  assert.equal(registrationReviewPolicy.isClosed("APPROVED"), true);
  assert.equal(registrationReviewPolicy.ageLabel({ ageDays: 1 }), "1 วัน");
});
