import assert from "node:assert/strict";
import test from "node:test";
import { NavigationService } from "../src/application/NavigationService.js";
import { SessionStore } from "../src/application/SessionStore.js";
import { SystemApplicationController } from "../src/application/SystemApplicationController.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function createWindow(overrides = {}) {
  const navigation = { assigned: "", replaced: "" };
  return {
    location: {
      hostname: "localhost",
      protocol: "http:",
      origin: "http://localhost:5173",
      pathname: "/",
      href: "http://localhost:5173/",
      hash: "",
      assign(value) { navigation.assigned = value; },
      replace(value) { navigation.replaced = value; },
      ...overrides.location,
    },
    history: { replaceState() {} },
    addEventListener() {},
    removeEventListener() {},
    atob(value) { return Buffer.from(value, "base64").toString("binary"); },
    navigation,
  };
}

test("NavigationService resolves each local municipal application", () => {
  const windowObject = createWindow();
  const navigation = new NavigationService({ windowObject });
  assert.equal(navigation.getPortalUrl(), "http://localhost:5173/");
  assert.equal(navigation.getSystemUrl("pet"), "http://localhost:5174/");
  assert.equal(navigation.getSystemUrl("waste"), "http://localhost:5175/");
});

test("SessionStore owns shared authentication state", () => {
  const storage = new MemoryStorage();
  const session = new SessionStore({ storage, windowObject: createWindow() });
  session.setAccessToken("token");
  session.setActiveSystem("pet");
  assert.equal(session.getAccessToken(), "token");
  assert.equal(session.getActiveSystem(), "pet");
  session.clear();
  assert.equal(session.getAccessToken(), "");
});

test("SessionStore migrates an existing tab session to persistent storage", () => {
  const persistentStorage = new MemoryStorage();
  const transientStorage = new MemoryStorage();
  transientStorage.setItem("smart_thapho_access_token", "tab-token");
  transientStorage.setItem("smart_thapho_active_system", "waste");

  const session = new SessionStore({
    storage: persistentStorage,
    transientStorage,
    windowObject: createWindow(),
  });

  assert.equal(session.getAccessToken(), "tab-token");
  assert.equal(session.getActiveSystem(), "waste");
  assert.equal(persistentStorage.getItem("smart_thapho_access_token"), "tab-token");
  assert.equal(transientStorage.getItem("smart_thapho_access_token"), null);
  assert.equal(transientStorage.getItem("smart_thapho_active_system"), null);
});

test("SystemApplicationController coordinates logout and navigation", () => {
  const windowObject = createWindow();
  const session = new SessionStore({ storage: new MemoryStorage(), windowObject });
  const navigation = new NavigationService({ windowObject });
  session.setAccessToken("token");
  const controller = new SystemApplicationController({ session, navigation, windowObject });
  controller.logout();
  assert.equal(session.getAccessToken(), "");
  assert.equal(windowObject.navigation.assigned, "http://localhost:5173/");
});
