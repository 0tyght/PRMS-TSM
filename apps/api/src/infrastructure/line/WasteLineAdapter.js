import { WasteLineService } from "../../application/line/WasteLineService.js";
import { cleanupWasteLineState } from "../../modules/line/wasteLine.js";

export class WasteLineAdapter extends WasteLineService {
  cleanupState() { return cleanupWasteLineState(); }
}

