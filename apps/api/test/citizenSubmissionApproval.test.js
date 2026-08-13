import assert from "node:assert/strict";
import test from "node:test";

import { CitizenSubmissionApprovalService } from "../src/application/submissions/CitizenSubmissionApprovalService.js";

const OFFICIAL_PET = Object.freeze({
  id: "pet-1",
  ownerId: "owner-1",
  petName: "มะลิ",
  species: "DOG",
  sex: "FEMALE",
  breed: "ไทย",
  color: "น้ำตาล",
  birthDate: "2024-01-10",
  microchipNo: "",
  status: "ACTIVE",
});

class FakeDatabase {
  constructor(responses) {
    this.responses = [...responses];
    this.calls = [];
  }

  async execute(sql, parameters = []) {
    this.calls.push({ sql, parameters });
    if (!this.responses.length) throw new Error(`Unexpected SQL: ${sql}`);
    return this.responses.shift();
  }
}

function createService() {
  return new CitizenSubmissionApprovalService({
    nativeCitizenService: { async applyOwnerTransfer() {} },
  });
}

test("approves a pet update only when the official snapshot is unchanged", async () => {
  const database = new FakeDatabase([
    [[OFFICIAL_PET]],
    [{ affectedRows: 1 }],
  ]);
  await createService().execute({
    database,
    reviewerId: "officer-1",
    submission: {
      id: "submission-1",
      ownerId: "owner-1",
      petId: "pet-1",
      subjectType: "PET_UPDATE",
      currentPayload: JSON.stringify(OFFICIAL_PET),
      proposedPayload: JSON.stringify({ ...OFFICIAL_PET, petName: "มะลิใหม่" }),
    },
  });
  assert.match(database.calls.at(-1).sql, /UPDATE pets/u);
});

test("rejects approval when official pet data changed while waiting for review", async () => {
  const database = new FakeDatabase([[[{ ...OFFICIAL_PET, petName: "ชื่อที่เจ้าหน้าที่แก้แล้ว" }]]]);
  await assert.rejects(
    createService().execute({
      database,
      reviewerId: "officer-1",
      submission: {
        id: "submission-2",
        ownerId: "owner-1",
        petId: "pet-1",
        subjectType: "PET_UPDATE",
        currentPayload: JSON.stringify(OFFICIAL_PET),
        proposedPayload: JSON.stringify({ ...OFFICIAL_PET, color: "ขาว" }),
      },
    }),
    { code: "OFFICIAL_PET_CHANGED" },
  );
});

test("requires evidence before approving vaccination data", async () => {
  const database = new FakeDatabase([
    [[OFFICIAL_PET]],
    [[]],
  ]);
  await assert.rejects(
    createService().execute({
      database,
      reviewerId: "officer-1",
      submission: {
        id: "submission-3",
        ownerId: "owner-1",
        petId: "pet-1",
        subjectType: "VACCINATION",
        currentPayload: null,
        proposedPayload: JSON.stringify({
          vaccineName: "วัคซีนพิษสุนัขบ้า",
          vaccinatedAt: "2026-08-01",
          nextDueAt: "2027-08-01",
          lotNo: "LOT-01",
          providerName: "คลินิกเทศบาล",
        }),
      },
    }),
    { code: "HEALTH_EVIDENCE_REQUIRED" },
  );
});

test("prevents a duplicate vaccination from entering the official registry", async () => {
  const database = new FakeDatabase([
    [[OFFICIAL_PET]],
    [[{ id: "attachment-1" }]],
    [[{ id: "vaccination-1" }]],
  ]);
  await assert.rejects(
    createService().execute({
      database,
      reviewerId: "officer-1",
      submission: {
        id: "submission-4",
        ownerId: "owner-1",
        petId: "pet-1",
        subjectType: "VACCINATION",
        currentPayload: null,
        proposedPayload: JSON.stringify({
          vaccineName: "วัคซีนพิษสุนัขบ้า",
          vaccinatedAt: "2026-08-01",
          nextDueAt: "",
          lotNo: "",
          providerName: "",
        }),
      },
    }),
    { code: "VACCINATION_DUPLICATE" },
  );
});

test("prevents a second sterilization record from entering the official registry", async () => {
  const database = new FakeDatabase([
    [[OFFICIAL_PET]],
    [[{ id: "attachment-1" }]],
    [[{ id: "sterilization-1" }]],
  ]);
  await assert.rejects(
    createService().execute({
      database,
      reviewerId: "officer-1",
      submission: {
        id: "submission-5",
        ownerId: "owner-1",
        petId: "pet-1",
        subjectType: "STERILIZATION",
        currentPayload: null,
        proposedPayload: JSON.stringify({
          sterilizedAt: "2026-08-01",
          providerName: "คลินิกเทศบาล",
          note: "",
        }),
      },
    }),
    { code: "STERILIZATION_DUPLICATE" },
  );
});

