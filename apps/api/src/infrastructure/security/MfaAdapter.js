import { MfaService } from "../../application/security/MfaService.js";
import { createMfaSecret, createOtpAuthUrl, decryptMfaSecret, encryptMfaSecret, verifyTotp } from "../../modules/security/mfa.js";

export class MfaAdapter extends MfaService {
  createSecret() { return createMfaSecret(); }
  createOtpAuthUrl(input) { return createOtpAuthUrl(input); }
  encryptSecret(secret) { return encryptMfaSecret(secret); }
  decryptSecret(encrypted) { return decryptMfaSecret(encrypted); }
  verify(secret, code, options) { return verifyTotp(secret, code, options); }
}

