import { LineBotService } from "../../application/line/LineBotService.js";
import { handleCitizenLineWebhook, handleDriverLineWebhook, verifyLineWebhookSignature } from "../../modules/line/lineBot.js";
import { lineChannelSettings } from "../../modules/line/lineChannelSettings.js";

export class LineBotAdapter extends LineBotService {
  verifySignature(rawBody, signature, channelSecret) { return verifyLineWebhookSignature(rawBody, signature, channelSecret); }
  handleCitizenWebhook(req, res) { return handleCitizenLineWebhook(req, res); }
  handleDriverWebhook(req, res) { return handleDriverLineWebhook(req, res); }
  listChannelSettings() { return lineChannelSettings.listSafe(); }
  testChannelSettings(kind, input) { return lineChannelSettings.test(kind, input); }
  saveChannelSettings(kind, input, actor) { return lineChannelSettings.save(kind, input, actor); }
  configureChannelWebhook(kind, baseUrl, actor) { return lineChannelSettings.configureWebhook(kind, baseUrl, actor); }
}

