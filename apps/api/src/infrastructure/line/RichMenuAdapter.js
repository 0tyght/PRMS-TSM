import { RichMenuService } from "../../application/line/RichMenuService.js";
import { warmWizardRichMenus } from "../../modules/line/lineRichMenuWizard.js";

export class RichMenuAdapter extends RichMenuService {
  warm() { return warmWizardRichMenus(); }
}

