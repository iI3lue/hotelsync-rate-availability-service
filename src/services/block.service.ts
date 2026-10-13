import { inventoryService } from "./inventory.service.js";
import { AppError } from "../middleware/error-handler.js";
import { BlockInput } from "../validators/blocks.js";
import type { AuthClaims } from "../lib/auth.js";

export class BlockService {
  async block(data: BlockInput, actor: AuthClaims) {
    return inventoryService.block(data.room_type_id, data.date, data.count, actor);
  }

  async unblock(data: BlockInput, actor: AuthClaims) {
    return inventoryService.unblock(data.room_type_id, data.date, data.count, actor);
  }
}

export const blockService = new BlockService();
