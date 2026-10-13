import { Request, Response, NextFunction } from "express";
import { rateRuleService } from "../services/rate-rule.service.js";
import { AuthRequest } from "../lib/auth.js";

export class RateRuleController {
  async upsert(req: Request, res: Response, next: NextFunction) {
    try {
      const auth = (req as AuthRequest).auth;
      const rule = await rateRuleService.upsert(
        req.body,
        auth ?? {
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
        }
      );
      res.status(201).json(rule);
    } catch (err) {
      next(err);
    }
  }

  async getByRoomType(req: Request, res: Response, next: NextFunction) {
    try {
      const { room_type_id } = req.query as { room_type_id: string };
      const rules = await rateRuleService.findByRoomType(room_type_id);
      res.json(rules);
    } catch (err) {
      next(err);
    }
  }
}

export const rateRuleController = new RateRuleController();
