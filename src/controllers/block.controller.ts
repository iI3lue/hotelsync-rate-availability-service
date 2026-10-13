import { Request, Response, NextFunction } from "express";
import { blockService } from "../services/block.service.js";
import { AuthRequest } from "../lib/auth.js";

export class BlockController {
  async handle(req: Request, res: Response, next: NextFunction) {
    try {
      const { action, room_type_id, date, count } = req.body;
      const auth = (req as AuthRequest).auth;
      const actor = auth ?? {
        sub: "",
        email: "",
        email_verified: false,
        role: "",
        hotel_id: null,
        scope: "global",
        iss: "",
        aud: "",
        iat: 0,
        exp: 0,
      };
      const result =
        action === "block"
          ? await blockService.block({ room_type_id, date, count, action }, actor)
          : await blockService.unblock({ room_type_id, date, count, action }, actor);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

export const blockController = new BlockController();
