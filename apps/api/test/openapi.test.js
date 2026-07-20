import test from "node:test";
import assert from "node:assert/strict";
import { openApiDocument } from "../src/openapi.js";

const documentedPaths = [
  "/openapi.json", "/health", "/health/live", "/health/ready",
  "/public/villages", "/public/registrations", "/public/registrations/{referenceNo}", "/public/line-config",
  "/citizen/line/session", "/citizen/line/link", "/citizen/me", "/auth/login",
  "/citizen/pets/{id}/submissions", "/citizen/submissions/{id}/cancel",
  "/admin/dashboard", "/admin/owners", "/admin/owners/{id}", "/admin/users", "/admin/users/{id}",
  "/admin/system-status", "/admin/registrations", "/admin/registrations/{id}", "/admin/registrations/{id}/status",
  "/admin/attachments/{id}",
  "/admin/citizen-submissions", "/admin/citizen-submissions/{id}", "/admin/citizen-submissions/{id}/status",
  "/admin/pets", "/admin/pets/{id}", "/admin/pets/{id}/status", "/admin/pets/{id}/owner", "/admin/map",
  "/admin/pets/{petId}/vaccinations", "/admin/vaccinations/{id}",
  "/admin/pets/{petId}/sterilizations", "/admin/sterilizations/{id}",
  "/admin/cases", "/admin/cases/{id}/status", "/admin/audit-logs",
  "/admin/reports/villages-v2", "/admin/reports/villages/export/{format}", "/admin/reports/villages",
  "/admin/reports/{type}/export/{format}",
];

test("publishes OpenAPI 3.1 documentation for every supported route family", () => {
  assert.equal(openApiDocument.openapi, "3.1.0");
  for (const path of documentedPaths) assert.ok(openApiDocument.paths[path], `missing OpenAPI path ${path}`);
});
