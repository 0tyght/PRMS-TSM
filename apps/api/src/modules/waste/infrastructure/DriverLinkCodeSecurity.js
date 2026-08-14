import crypto from "node:crypto";

export class DriverLinkCodeSecurity {
  generateCode() {
    return String(
      crypto.randomInt(
        100000,
        1000000,
      ),
    );
  }

  hash(code) {
    return crypto
      .createHash("sha256")
      .update(String(code))
      .digest("hex");
  }
}
