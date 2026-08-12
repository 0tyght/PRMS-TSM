import { NativeCitizenService } from "../../application/line/NativeCitizenService.js";
import { applyNativeOwnerTransfer, cleanupNativeLineState, findNativeAttachmentForAdmin, listNativeAttachments } from "../../modules/line/lineNativeCitizen.js";

export class NativeCitizenAdapter extends NativeCitizenService {
  applyOwnerTransfer(database, submission, reviewerId) { return applyNativeOwnerTransfer(database, submission, reviewerId); }
  listAttachments(entityType, entityId) { return listNativeAttachments(entityType, entityId); }
  findAttachmentForAdmin(attachmentId, villageId = null) { return findNativeAttachmentForAdmin(attachmentId, villageId); }
  cleanupState() { return cleanupNativeLineState(); }
}

