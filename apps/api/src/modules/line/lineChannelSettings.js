import crypto from "node:crypto";

import { LineChannelProfile } from "../../application/line/LineChannelProfile.js";
import { config } from "../../core/config.js";

const CHANNEL_KINDS = new Set(["CITIZEN", "DRIVER"]);
const CACHE_TTL_MS = 15_000;
const LINE_API_BASE = "https://api.line.me";
const CIPHER_VERSION = "v1";

function normalizeKind(value) {
  const kind = String(value || "").trim().toUpperCase();
  if (!CHANNEL_KINDS.has(kind)) throw new TypeError(`Unsupported LINE channel kind: ${value}`);
  return kind;
}

function trimText(value) {
  return String(value ?? "").trim();
}

function defaultsFor(kind) {
  if (kind === "DRIVER") {
    return {
      channelSecret: config.lineDriverChannelSecret,
      channelAccessToken: config.lineDriverChannelAccessToken,
      channelId: config.lineDriverChannelId,
    };
  }

  return {
    channelSecret: config.lineChannelSecret,
    channelAccessToken: config.lineChannelAccessToken,
    channelId: config.lineChannelId,
  };
}

function webhookPathFor(kind) {
  return kind === "DRIVER" ? "/api/line/driver-webhook" : "/api/line/webhook";
}

function makeCipherKey() {
  const source = trimText(config.lineSettingsEncryptionKey);
  if (!source) throw new Error("ยังไม่ได้ตั้งค่า LINE_SETTINGS_ENCRYPTION_KEY หรือคีย์สำรองของระบบ");
  return crypto.createHash("sha256").update(source).digest();
}

export function encryptLineSecret(value) {
  const text = trimText(value);
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", makeCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [CIPHER_VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptLineSecret(value) {
  const text = trimText(value);
  if (!text) return "";
  const [version, ivText, tagText, payloadText] = text.split(":");
  if (version !== CIPHER_VERSION || !ivText || !tagText || !payloadText) {
    throw new Error("รูปแบบข้อมูลลับ LINE ในฐานข้อมูลไม่ถูกต้อง");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    makeCipherKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payloadText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function safeErrorMessage(error) {
  const message = trimText(error?.message || error);
  if (/Bearer|token|secret/i.test(message)) return "LINE ปฏิเสธข้อมูลยืนยันตัวตนที่ส่งไป";
  return message.slice(0, 500) || "ไม่สามารถเชื่อมต่อ LINE ได้";
}

export class LineChannelSettingsRegistry {
  constructor({ database = null, fetchImplementation = fetch, cacheTtlMs = CACHE_TTL_MS } = {}) {
    this.database = database;
    this.fetchImplementation = fetchImplementation;
    this.cacheTtlMs = cacheTtlMs;
    this.cache = new Map();
    this.loadedAt = 0;
    this.refreshPromise = null;
  }

  async databaseConnection() {
    if (this.database) return this.database;
    const { pool } = await import("../../core/db.js");
    this.database = pool;
    return this.database;
  }

  envEntry(kindValue) {
    const kind = normalizeKind(kindValue);
    const fallback = defaultsFor(kind);
    return {
      kind,
      source: fallback.channelSecret || fallback.channelAccessToken || fallback.channelId ? "ENV" : "UNCONFIGURED",
      enabled: true,
      displayName: "",
      basicId: "",
      channelId: trimText(fallback.channelId),
      channelSecret: trimText(fallback.channelSecret),
      channelAccessToken: trimText(fallback.channelAccessToken),
      lastTestedAt: null,
      lastTestStatus: null,
      lastTestMessage: null,
      updatedAt: null,
    };
  }

  async refresh({ force = false } = {}) {
    const fresh = Date.now() - this.loadedAt < this.cacheTtlMs;
    if (!force && this.loadedAt && fresh) return this.cache;
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const next = new Map([
        ["CITIZEN", this.envEntry("CITIZEN")],
        ["DRIVER", this.envEntry("DRIVER")],
      ]);

      try {
        const [rows] = await (await this.databaseConnection()).execute(
          `SELECT channel_kind AS kind,
                  display_name AS displayName,
                  basic_id AS basicId,
                  channel_id AS channelId,
                  channel_secret_encrypted AS channelSecretEncrypted,
                  access_token_encrypted AS accessTokenEncrypted,
                  enabled,
                  last_tested_at AS lastTestedAt,
                  last_test_status AS lastTestStatus,
                  last_test_message AS lastTestMessage,
                  updated_at AS updatedAt
           FROM system_line_channels`,
        );

        for (const row of rows) {
          const kind = normalizeKind(row.kind);
          next.set(kind, {
            kind,
            source: "DATABASE",
            enabled: Boolean(Number(row.enabled)),
            displayName: trimText(row.displayName),
            basicId: trimText(row.basicId),
            channelId: trimText(row.channelId),
            channelSecret: decryptLineSecret(row.channelSecretEncrypted),
            channelAccessToken: decryptLineSecret(row.accessTokenEncrypted),
            lastTestedAt: row.lastTestedAt || null,
            lastTestStatus: row.lastTestStatus || null,
            lastTestMessage: row.lastTestMessage || null,
            updatedAt: row.updatedAt || null,
          });
        }
      } catch (error) {
        if (error?.code !== "ER_NO_SUCH_TABLE") throw error;
      }

      this.cache = next;
      this.loadedAt = Date.now();
      return this.cache;
    })();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  getCached(kindValue) {
    const kind = normalizeKind(kindValue);
    const entry = this.cache.get(kind) || this.envEntry(kind);
    return this.profileFromEntry(entry);
  }

  profileFromEntry(entry) {
    const enabled = entry.enabled !== false;
    return new LineChannelProfile({
      kind: entry.kind,
      channelSecret: enabled ? entry.channelSecret : "",
      channelAccessToken: enabled ? entry.channelAccessToken : "",
      channelId: enabled ? entry.channelId : null,
    });
  }

  async get(kindValue) {
    const kind = normalizeKind(kindValue);
    await this.refresh();
    return this.profileFromEntry(this.cache.get(kind) || this.envEntry(kind));
  }

  safeEntry(entry) {
    const profile = this.profileFromEntry(entry);
    return {
      kind: entry.kind,
      source: entry.source,
      enabled: entry.enabled !== false,
      configured: profile.configured,
      displayName: entry.displayName || "",
      basicId: entry.basicId || "",
      channelId: entry.channelId || "",
      hasChannelSecret: Boolean(entry.channelSecret),
      hasAccessToken: Boolean(entry.channelAccessToken),
      webhookPath: webhookPathFor(entry.kind),
      lastTestedAt: entry.lastTestedAt || null,
      lastTestStatus: entry.lastTestStatus || null,
      lastTestMessage: entry.lastTestMessage || null,
      updatedAt: entry.updatedAt || null,
    };
  }

  async listSafe() {
    await this.refresh();
    return ["CITIZEN", "DRIVER"].map((kind) =>
      this.safeEntry(this.cache.get(kind) || this.envEntry(kind)),
    );
  }

  async test(kindValue, overrides = {}) {
    const kind = normalizeKind(kindValue);
    await this.refresh();
    const current = this.cache.get(kind) || this.envEntry(kind);
    const candidate = {
      ...current,
      channelId: Object.prototype.hasOwnProperty.call(overrides, "channelId")
        ? trimText(overrides.channelId)
        : current.channelId,
      channelSecret: trimText(overrides.channelSecret) || current.channelSecret,
      channelAccessToken: trimText(overrides.channelAccessToken) || current.channelAccessToken,
      enabled: Object.prototype.hasOwnProperty.call(overrides, "enabled")
        ? Boolean(overrides.enabled)
        : current.enabled,
    };

    if (!candidate.channelAccessToken) {
      throw new Error("กรุณาระบุ Channel Access Token ก่อนทดสอบ");
    }

    const response = await this.fetchImplementation(`${LINE_API_BASE}/v2/bot/info`, {
      method: "GET",
      headers: { Authorization: `Bearer ${candidate.channelAccessToken}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const error = new Error(`ไม่สามารถยืนยัน Channel Access Token กับ LINE ได้ (HTTP ${response.status})`);
      error.status = response.status;
      throw error;
    }

    const bot = await response.json();
    return {
      ok: true,
      kind,
      displayName: trimText(bot.displayName),
      basicId: trimText(bot.basicId || bot.premiumId),
      premiumId: trimText(bot.premiumId),
      botUserId: trimText(bot.userId),
      channelId: candidate.channelId,
      channelSecretConfigured: Boolean(candidate.channelSecret),
      accessTokenConfigured: true,
      webhookPath: webhookPathFor(kind),
      checkedAt: new Date().toISOString(),
    };
  }

  async save(kindValue, input, actor = {}) {
    const kind = normalizeKind(kindValue);
    await this.refresh({ force: true });
    const current = this.cache.get(kind) || this.envEntry(kind);
    const enabled = input.enabled !== false;
    const channelId = Object.prototype.hasOwnProperty.call(input, "channelId")
      ? trimText(input.channelId)
      : current.channelId;
    const channelSecret = trimText(input.channelSecret) || current.channelSecret;
    const channelAccessToken = trimText(input.channelAccessToken) || current.channelAccessToken;

    if (enabled && !channelSecret) throw new Error("กรุณาระบุ Channel Secret");
    if (enabled && !channelAccessToken) throw new Error("กรุณาระบุ Channel Access Token");

    let testResult = null;
    if (enabled) {
      testResult = await this.test(kind, { channelId, channelSecret, channelAccessToken, enabled });
    }

    const safeTestMessage = enabled
      ? `เชื่อมต่อสำเร็จ: ${testResult.displayName || testResult.basicId || kind}`
      : "ปิดการใช้งานช่องทางนี้";

    await (await this.databaseConnection()).execute(
      `INSERT INTO system_line_channels
        (channel_kind, display_name, basic_id, channel_id,
         channel_secret_encrypted, access_token_encrypted, enabled,
         last_tested_at, last_test_status, last_test_message, updated_by)
       VALUES (?, NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''), ?, ?, ?, NOW(), ?, ?, NULLIF(?, ''))
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         basic_id = VALUES(basic_id),
         channel_id = VALUES(channel_id),
         channel_secret_encrypted = VALUES(channel_secret_encrypted),
         access_token_encrypted = VALUES(access_token_encrypted),
         enabled = VALUES(enabled),
         last_tested_at = VALUES(last_tested_at),
         last_test_status = VALUES(last_test_status),
         last_test_message = VALUES(last_test_message),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [
        kind,
        testResult?.displayName || current.displayName || "",
        testResult?.basicId || current.basicId || "",
        channelId,
        encryptLineSecret(channelSecret),
        encryptLineSecret(channelAccessToken),
        enabled ? 1 : 0,
        enabled ? "SUCCESS" : "DISABLED",
        safeTestMessage,
        trimText(actor.userId),
      ],
    );

    await (await this.databaseConnection()).execute(
      `INSERT INTO audit_logs
        (id, user_id, action, entity_type, entity_id, new_value, ip_address)
       VALUES (?, NULLIF(?, ''), 'UPDATE_LINE_CHANNEL_SETTINGS', 'SYSTEM_LINE_CHANNEL', NULL, ?, NULLIF(?, ''))`,
      [
        crypto.randomUUID(),
        trimText(actor.userId),
        JSON.stringify({
          kind,
          enabled,
          channelId: channelId || null,
          basicId: testResult?.basicId || current.basicId || null,
          displayName: testResult?.displayName || current.displayName || null,
          rotatedChannelSecret: Boolean(trimText(input.channelSecret)),
          rotatedAccessToken: Boolean(trimText(input.channelAccessToken)),
        }),
        trimText(actor.ipAddress),
      ],
    );

    await this.refresh({ force: true });
    return this.safeEntry(this.cache.get(kind) || this.envEntry(kind));
  }

  async configureWebhook(kindValue, baseUrl, actor = {}) {
    const kind = normalizeKind(kindValue);
    const channel = await this.get(kind);
    const token = channel.requireAccessToken();
    const normalizedBase = trimText(baseUrl).replace(/\/+$/, "");
    if (!/^https:\/\//i.test(normalizedBase) && !/^http:\/\/localhost(?::\d+)?$/i.test(normalizedBase)) {
      throw new Error("Webhook ต้องใช้ HTTPS หรือ localhost สำหรับการทดสอบในเครื่อง");
    }
    const endpoint = `${normalizedBase}${webhookPathFor(kind)}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const updateResponse = await this.fetchImplementation(`${LINE_API_BASE}/v2/bot/channel/webhook/endpoint`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ endpoint }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!updateResponse.ok) {
      throw new Error(`ไม่สามารถอัปเดต LINE Webhook ได้ (HTTP ${updateResponse.status})`);
    }

    const testResponse = await this.fetchImplementation(`${LINE_API_BASE}/v2/bot/channel/webhook/test`, {
      method: "POST",
      headers,
      body: JSON.stringify({ endpoint }),
      signal: AbortSignal.timeout(30_000),
    });
    const testPayload = await testResponse.json().catch(() => ({}));
    if (!testResponse.ok || testPayload.success !== true) {
      throw new Error(`LINE_WEBHOOK_TEST_${testResponse.status}: ${safeErrorMessage(testPayload.reason || testPayload.detail || "ทดสอบ webhook ไม่ผ่าน")}`);
    }

    const infoResponse = await this.fetchImplementation(`${LINE_API_BASE}/v2/bot/channel/webhook/endpoint`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    const info = infoResponse.ok ? await infoResponse.json().catch(() => ({})) : {};
    const active = info.active === true;

    if (actor.audit !== false) {
      await (await this.databaseConnection()).execute(
        `INSERT INTO audit_logs
          (id, user_id, action, entity_type, entity_id, new_value, ip_address)
         VALUES (?, NULLIF(?, ''), 'CONFIGURE_LINE_WEBHOOK', 'SYSTEM_LINE_CHANNEL', NULL, ?, NULLIF(?, ''))`,
        [
          crypto.randomUUID(),
          trimText(actor.userId),
          JSON.stringify({ kind, endpoint, success: true, active }),
          trimText(actor.ipAddress),
        ],
      );
    }

    return {
      ok: true,
      kind,
      endpoint,
      tested: true,
      active,
      warning: active
        ? null
        : "Webhook URL ใช้งานได้ แต่ Use webhook ยังปิดอยู่ใน LINE Developers กรุณาเปิด Use webhook หนึ่งครั้ง",
    };
  }
}

export const lineChannelSettings = new LineChannelSettingsRegistry();
export { webhookPathFor };
