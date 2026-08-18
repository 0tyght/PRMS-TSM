export class LineBotService {
  verifySignature() { throw new Error("LineBotService.verifySignature must be implemented"); }
  handleCitizenWebhook() { throw new Error("LineBotService.handleCitizenWebhook must be implemented"); }
  handleDriverWebhook() { throw new Error("LineBotService.handleDriverWebhook must be implemented"); }
  listChannelSettings() { throw new Error("LineBotService.listChannelSettings must be implemented"); }
  testChannelSettings() { throw new Error("LineBotService.testChannelSettings must be implemented"); }
  saveChannelSettings() { throw new Error("LineBotService.saveChannelSettings must be implemented"); }
  configureChannelWebhook() { throw new Error("LineBotService.configureChannelWebhook must be implemented"); }
  handleWebhook(req, res) { return this.handleCitizenWebhook(req, res); }
}
