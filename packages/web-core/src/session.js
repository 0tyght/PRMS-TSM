import { SessionStore } from "./application/SessionStore.js";

export { SessionStore };
export const sessionStore = new SessionStore();

export function getAccessToken() {
  return sessionStore.getAccessToken();
}

export function setAccessToken(token) {
  sessionStore.setAccessToken(token);
}

export function setActiveSystem(systemId) {
  sessionStore.setActiveSystem(systemId);
}

export function getActiveSystem() {
  return sessionStore.getActiveSystem();
}

export function clearSession() {
  sessionStore.clear();
}

export function readSessionUser(token) {
  return sessionStore.readUser(token);
}
