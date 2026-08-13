import { LineBotService } from "../../application/line/LineBotService.js";
import { handleCitizenLineWebhook, handleDriverLineWebhook, verifyLineWebhookSignature } from "../../modules/line/lineBot.js";

export class LineBotAdapter extends LineBotService {
  verifySignature(rawBody, signature, channelSecret) { return verifyLineWebhookSignature(rawBody, signature, channelSecret); }
  handleCitizenWebhook(req, res) { return handleCitizenLineWebhook(req, res); }
  handleDriverWebhook(req, res) { return handleDriverLineWebhook(req, res); }
}

