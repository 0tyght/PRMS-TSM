import assert from "node:assert/strict";
import test from "node:test";
import { Pet } from "../src/domain/pets/entities/Pet.js";
import { Registration } from "../src/domain/registrations/entities/Registration.js";
import { CitizenSubmission } from "../src/domain/submissions/entities/CitizenSubmission.js";
import { WasteOperationPlan } from "../src/domain/waste/entities/WasteOperationPlan.js";

test("Pet enforces lifecycle and owner-transfer rules", () => {
  const pet = new Pet({ ownerId: 10, status: "ACTIVE" });
  pet.changeStatusTo("MISSING").changeStatusTo("ACTIVE").transferTo(20);
  assert.equal(pet.status, "ACTIVE");
  assert.equal(pet.ownerId, 20);
  assert.throws(() => pet.changeStatusTo("ACTIVE"), { code: "PET_STATUS_UNCHANGED" });
  assert.throws(() => pet.transferTo(20), { code: "PET_OWNER_UNCHANGED" });
});

test("Registration rejects transitions from terminal states", () => {
  const registration = new Registration({ status: "SUBMITTED", version: 2 });
  registration.assertVersion(2).transitionTo("UNDER_REVIEW").transitionTo("APPROVED");
  assert.equal(registration.status, "APPROVED");
  assert.throws(() => registration.assertVersion(1), { code: "REGISTRATION_VERSION_CONFLICT" });
  assert.throws(() => registration.transitionTo("REJECTED"), { code: "REGISTRATION_TRANSITION_NOT_ALLOWED" });
});

test("CitizenSubmission enforces optimistic version and workflow", () => {
  const submission = new CitizenSubmission({ status: "SUBMITTED", version: 3 });
  submission.assertVersion(3).transitionTo("NEED_MORE_INFO");
  assert.equal(submission.status, "NEED_MORE_INFO");
  assert.throws(() => submission.assertVersion(2), { code: "SUBMISSION_VERSION_CONFLICT" });
});

test("WasteOperationPlan can only be edited before work starts", () => {
  const plan = new WasteOperationPlan({ status: "SCHEDULED", publicationStatus: "PUBLISHED", publicationVersion: 1 });
  assert.throws(() => plan.assertEditable(), { code: "WASTE_PLAN_PUBLISHED_NOT_EDITABLE" });
  plan.transitionTo("IN_PROGRESS");
  assert.throws(() => plan.assertEditable(), { code: "WASTE_PLAN_NOT_EDITABLE" });
  plan.transitionTo("COMPLETED");
  assert.equal(plan.status, "COMPLETED");
});

test("WasteOperationPlan requires a complete plan before FR17 publication", () => {
  const plan = new WasteOperationPlan({ status: "SCHEDULED", publicationStatus: "DRAFT" });
  assert.throws(() => plan.transitionTo("IN_PROGRESS"), { code: "WASTE_PLAN_MUST_BE_PUBLISHED" });
  assert.throws(() => plan.publish({ hasSchedule: false, activeStopCount: 1 }), { code: "WASTE_PLAN_SCHEDULE_REQUIRED" });
  assert.throws(() => plan.publish({ hasSchedule: true, activeStopCount: 0 }), { code: "WASTE_PLAN_STOP_REQUIRED" });
  plan.publish({ hasSchedule: true, activeStopCount: 3 });
  assert.equal(plan.publicationStatus, "PUBLISHED");
  assert.equal(plan.publicationVersion, 1);
});
