import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ProposeWasteRouteServiceUsersUseCase } from "../src/modules/waste/application/ProposeWasteRouteServiceUsersUseCase.js";

const resourcesPage = fs.readFileSync(new URL("../../waste-management/src/pages/ResourcesPage.jsx", import.meta.url), "utf8");
const workspace = fs.readFileSync(new URL("../../waste-management/src/components/RouteServiceUserWorkspace.jsx", import.meta.url), "utf8");
const router = fs.readFileSync(new URL("../src/modules/waste/waste.router.js", import.meta.url), "utf8");
const repository = fs.readFileSync(new URL("../src/modules/waste/infrastructure/MariaDbWasteRouteRepository.js", import.meta.url), "utf8");

test("new route workflow starts from unassigned service users and previews before confirmation", () => {
  assert.match(resourcesPage, /เพิ่มผู้ใช้บริการในเส้นทาง/);
  assert.match(resourcesPage, /type: "service-users"/);
  assert.match(workspace, /user\.isActive && !user\.routeId/);
  assert.match(workspace, /service-user-proposals/);
  assert.match(workspace, /PREVIEW ก่อนยืนยัน/);
  assert.match(workspace, /service-user-confirmations/);
});

test("route points remain service-user-backed and batch confirmation is atomic", () => {
  assert.match(repository, /route_id IS NULL/);
  assert.match(repository, /confirmServiceUserBatchAssignment/);
  assert.match(repository, /UPDATE waste_service_users[\s\S]*?route_id = \?/);
  assert.match(repository, /INSERT INTO waste_route_stops[\s\S]*?service_user_id/);
  assert.doesNotMatch(workspace, /ปักจุดใหม่/);
});

test("API exposes proposal and confirmation endpoints", () => {
  assert.match(router, /\/routes\/:id\/service-user-proposals/);
  assert.match(router, /\/routes\/:id\/service-user-confirmations/);
});

test("proposal optimizes existing stops plus selected unassigned users without persisting assignments", async () => {
  const saved = [];
  const useCase = new ProposeWasteRouteServiceUsersUseCase({
    routeRepository: {
      findById: async () => ({ id: "route-1" }),
      listActiveStops: async () => [{ id: "stop-1", serviceUserId: "old", stopName: "เดิม", latitude: 16.8, longitude: 100.2 }],
      findActiveUnassignedServiceUsersByIds: async () => [{ id: "new-user", fullName: "ผู้ใช้ใหม่", houseNo: "10", latitude: 16.81, longitude: 100.21 }],
      saveProposal: async (proposal) => { saved.push(proposal); return proposal; },
    },
    routeOptimizer: {
      optimize: async (points) => ({
        orderedStopIds: points.map((point) => point.id),
        geometry: { type: "LineString", coordinates: [[100.2,16.8],[100.21,16.81]] },
        distanceMeters: 1200,
        durationSeconds: 300,
      }),
    },
  });
  const proposal = await useCase.execute({ routeId: "route-1", serviceUserIds: ["new-user"] });
  assert.equal(saved.length, 1);
  assert.equal(proposal.stops.length, 2);
  assert.equal(proposal.stops[1].assignmentCandidate, true);
});

test("route proposal rejects existing points that are not backed by a service user", async () => {
  const useCase = new ProposeWasteRouteServiceUsersUseCase({
    routeRepository: {
      findById: async () => ({ id: "route-1" }),
      listActiveStops: async () => [{
        id: "orphan",
        serviceUserId: null,
        stopName: "จุดเดิม",
        latitude: 16.8,
        longitude: 100.2,
      }],
      findActiveUnassignedServiceUsersByIds: async () => [{
        id: "new-user",
        fullName: "ผู้ใช้ใหม่",
        houseNo: "10",
        latitude: 16.81,
        longitude: 100.21,
      }],
    },
    routeOptimizer: {
      optimize: async () => {
        throw new Error("optimizer must not run");
      },
    },
  });

  await assert.rejects(
    () => useCase.execute({
      routeId: "route-1",
      serviceUserIds: ["new-user"],
    }),
    /ไม่ได้เชื่อมกับทะเบียนผู้ใช้บริการ/,
  );
});
