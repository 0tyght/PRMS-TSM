export class MfaService {
  createSecret() { throw new Error("MfaService.createSecret must be implemented"); }
  createOtpAuthUrl() { throw new Error("MfaService.createOtpAuthUrl must be implemented"); }
  encryptSecret() { throw new Error("MfaService.encryptSecret must be implemented"); }
  decryptSecret() { throw new Error("MfaService.decryptSecret must be implemented"); }
  verify() { throw new Error("MfaService.verify must be implemented"); }
}
