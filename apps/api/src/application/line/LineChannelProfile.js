const CHANNEL_KINDS = new Set(["CITIZEN", "DRIVER"]);

export class LineChannelProfile {
  constructor({ kind, channelSecret, channelAccessToken, channelId = null }) {
    if (!CHANNEL_KINDS.has(kind)) throw new TypeError(`Unsupported LINE channel kind: ${kind}`);
    this.kind = kind;
    this.channelSecret = String(channelSecret || "").trim();
    this.channelAccessToken = String(channelAccessToken || "").trim();
    this.channelId = String(channelId || "").trim() || null;
    Object.freeze(this);
  }

  get configured() {
    return Boolean(this.channelSecret && this.channelAccessToken);
  }

  requireSecret() {
    if (!this.channelSecret) {
      const key = this.kind === "DRIVER" ? "LINE_DRIVER_CHANNEL_SECRET" : "LINE_CHANNEL_SECRET";
      throw new Error(`ยังไม่ได้ตั้งค่า ${key}`);
    }
    return this.channelSecret;
  }

  requireAccessToken() {
    if (!this.channelAccessToken) {
      const key = this.kind === "DRIVER" ? "LINE_DRIVER_CHANNEL_ACCESS_TOKEN" : "LINE_CHANNEL_ACCESS_TOKEN";
      throw new Error(`ยังไม่ได้ตั้งค่า ${key}`);
    }
    return this.channelAccessToken;
  }
}
