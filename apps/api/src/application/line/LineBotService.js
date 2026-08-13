export class LineBotService {
  verifySignature() { throw new Error("LineBotService.verifySignature must be implemented"); }
  handleCitizenWebhook() { throw new Error("LineBotService.handleCitizenWebhook must be implemented"); }
  handleDriverWebhook() { throw new Error("LineBotService.handleDriverWebhook must be implemented"); }
  handleWebhook(req, res) { return this.handleCitizenWebhook(req, res); }
}
