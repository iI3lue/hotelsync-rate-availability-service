import { inventoryService } from "./inventory.service.js";
import { AppError } from "../middleware/error-handler.js";
import { BlockInput } from "../validators/blocks.js";

export class BlockService {
  async block(data: BlockInput) {
    return inventoryService.block(data.room_type_id, data.date, data.count);
  }

  async unblock(data: BlockInput) {
    return inventoryService.unblock(data.room_type_id, data.date, data.count);
  }
}

export const blockService = new BlockService();
