import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeConfigRepository } from "../src/infrastructure/RuntimeConfigRepository.js";
import { ApiClient } from "../src/api.js";

const publicLocation = Object.freeze({ hostname: "0tyght.github.io" });

test("RuntimeConfigRepository prefers the API URL embedded during deployment", async () => {
  let fetchCount = 0;
  const repository = new RuntimeConfigRepository({
    buildTimeApiBase: "https://tunnel.example.com/api/",
    locationObject: publicLocation,
    sources: [() => "https://example.com/runtime-config.json"],
    fetchImplementation: async () => {
      fetchCount += 1;
      throw new Error("The runtime file should not be requested");
    },
  });

  assert.equal(await repository.getApiBase(), "https://tunnel.example.com/api");
  assert.equal(fetchCount, 0);
});

test("RuntimeConfigRepository falls back to the deployed runtime file", async () => {
  const repository = new RuntimeConfigRepository({
    buildTimeApiBase: "",
    locationObject: publicLocation,
    sources: [() => "https://example.com/runtime-config.json"],
    fetchImplementation: async () => ({
      ok: true,
      async json() {
        return { apiBaseUrl: "https://fallback.example.com" };
      },
    }),
  });

  assert.equal(await repository.getApiBase(), "https://fallback.example.com/api");
});

test("RuntimeConfigRepository uses the local portal API without changing the public webhook API", async () => {
  const repository = new RuntimeConfigRepository({
    buildTimeApiBase: "",
    locationObject: publicLocation,
    sources: [() => "https://example.com/runtime-config.json"],
    fetchImplementation: async () => ({
      ok: true,
      async json() {
        return {
          apiBaseUrl: "https://line-webhook.example.com/api",
          portalApiBaseUrl: "http://127.0.0.1:4100/api",
        };
      },
    }),
  });

  assert.equal(await repository.getApiBase(), "http://127.0.0.1:4100/api");
});

test("RuntimeConfigRepository rejects insecure public API URLs", async () => {
  const repository = new RuntimeConfigRepository({
    buildTimeApiBase: "http://public.example.com/api",
    locationObject: publicLocation,
    sources: [],
    fetchImplementation: async () => { throw new Error("unused"); },
  });

  assert.equal(await repository.getApiBase(), "");
});

test("ApiClient bypasses the ngrok browser interstitial for API requests", async () => {
  const originalWindow = globalThis.window;
  let requestedHeaders;
  globalThis.window = { setTimeout, clearTimeout };

  try {
    const client = new ApiClient({
      fetchImplementation: async (_url, options) => {
        requestedHeaders = options.headers;
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    await client.fetchOnce("https://smart-tha-pho.ngrok-free.dev/api", "/health");
    assert.equal(requestedHeaders.get("ngrok-skip-browser-warning"), "true");
  } finally {
    globalThis.window = originalWindow;
  }
});

test("ApiClient identifies loopback requests for Chrome Local Network Access", async () => {
  const originalWindow = globalThis.window;
  let requestedOptions;
  globalThis.window = { setTimeout, clearTimeout };

  try {
    const client = new ApiClient({
      fetchImplementation: async (_url, options) => {
        requestedOptions = options;
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    await client.fetchOnce("http://127.0.0.1:4100/api", "/health");
    assert.equal(requestedOptions.targetAddressSpace, "loopback");
  } finally {
    globalThis.window = originalWindow;
  }
});
