import assert from "node:assert/strict";
import test from "node:test";
import { MunicipalSystemCatalog, PetRegistrationValidator, ThaiPhoneNumber } from "../src/index.js";

test("ThaiPhoneNumber is normalized as a value object", () => {
  const phone = new ThaiPhoneNumber("081-234-5678");
  assert.equal(phone.value, "0812345678");
  assert.equal(String(phone), "0812345678");
  assert.throws(() => new ThaiPhoneNumber("123"));
});

test("MunicipalSystemCatalog returns immutable supported systems", () => {
  const catalog = new MunicipalSystemCatalog([{ id: "pet", route: "prms-tsm" }, { id: "waste", route: "waste-management" }]);
  assert.equal(catalog.findById("pet")?.route, "prms-tsm");
  assert.equal(catalog.list().length, 2);
  assert.equal(Object.isFrozen(catalog.list()), true);
});

test("PetRegistrationValidator reports invalid required data", () => {
  const validator = new PetRegistrationValidator({ supportedSpecies: ["DOG", "CAT"] });
  const result = validator.validate({ ownerName: "", phone: "123", petName: "", species: "BIRD", villageId: 0 });
  assert.equal(result.valid, false);
  assert.ok(Object.keys(result.errors).length >= 4);
});
