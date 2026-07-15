import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

test("creates the API application", () => {
  const app = createApp();
  assert.equal(typeof app.listen, "function");
});
