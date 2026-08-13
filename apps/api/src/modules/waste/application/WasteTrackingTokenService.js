import jwt from "jsonwebtoken";

const TOKEN_TYPE = "waste-driver-tracking";

export class WasteTrackingTokenService {
  constructor({ secret, expiresIn = "12h" }) {
    if (!secret) throw new TypeError("WasteTrackingTokenService requires secret");
    this.secret = secret;
    this.expiresIn = expiresIn;
  }

  issue({ planId, driverId, lineUserId }) {
    if (!planId || !driverId || !lineUserId) {
      throw new TypeError("Tracking token requires plan, driver and LINE user");
    }
    return jwt.sign(
      { type: TOKEN_TYPE, planId, driverId, lineUserId },
      this.secret,
      { algorithm: "HS256", expiresIn: this.expiresIn, issuer: "smart-tha-pho-api", audience: "waste-driver-tracking" },
    );
  }

  verify(token) {
    const payload = jwt.verify(token, this.secret, {
      algorithms: ["HS256"],
      issuer: "smart-tha-pho-api",
      audience: "waste-driver-tracking",
    });
    if (payload?.type !== TOKEN_TYPE || !payload.planId || !payload.driverId || !payload.lineUserId) {
      throw new Error("INVALID_WASTE_TRACKING_TOKEN");
    }
    return payload;
  }
}
