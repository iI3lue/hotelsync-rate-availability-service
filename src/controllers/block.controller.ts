import { Request, Response, NextFunction } from "express";
import { blockService } from "../services/block.service.js";

export class BlockController {
  async handle(req: Request, res: Response, next: NextFunction) {
    try {
      const { action, room_type_id, date, count } = req.body;
      const result =
        action === "block"
          ? await blockService.block({ room_type_id, date, count, action })
          : await blockService.unblock({ room_type_id, date, count, action });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

export const blockController = new BlockController();
