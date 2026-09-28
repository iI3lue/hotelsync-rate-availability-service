import { Request, Response, NextFunction } from "express";
import { rateRuleService } from "../services/rate-rule.service.js";

export class RateRuleController {
  async upsert(req: Request, res: Response, next: NextFunction) {
    try {
      const rule = await rateRuleService.upsert(req.body);
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
