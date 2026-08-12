import { LineBotService } from "../../application/line/LineBotService.js";
import { handleLineWebhook, verifyLineWebhookSignature } from "../../modules/line/lineBot.js";

export class LineBotAdapter extends LineBotService {
  verifySignature(rawBody, signature, channelSecret) { return verifyLineWebhookSignature(rawBody, signature, channelSecret); }
  handleWebhook(req, res) { return handleLineWebhook(req, res); }
}

