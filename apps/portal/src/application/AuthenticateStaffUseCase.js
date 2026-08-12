export class AuthenticateStaffUseCase {
  constructor({ apiClient, session } = {}) {
    if (!apiClient || !session) throw new TypeError("AuthenticateStaffUseCase requires apiClient and session");
    this.apiClient = apiClient;
    this.session = session;
  }

  async execute({ systemId, email, password, challengeToken = "", code = "" }) {
    if (!systemId) throw new Error("กรุณาเลือกเว็บระบบที่ต้องการใช้งาน");
    const data = challengeToken
      ? await this.apiClient.post("/api/auth/mfa/verify", { challengeToken, code })
      : await this.apiClient.post("/api/auth/login", { email, password });
    if (data.mfaRequired) return Object.freeze({ mfaRequired: true, challengeToken: data.challengeToken });
    this.session.setAccessToken(data.token);
    this.session.setActiveSystem(systemId);
    return Object.freeze({ mfaRequired: false, token: data.token, systemId });
  }
}
