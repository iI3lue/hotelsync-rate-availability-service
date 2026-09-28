import { Request, Response, NextFunction } from "express";
import { rateService } from "../services/rate.service.js";

export class RateController {
  async getByRoomType(req: Request, res: Response, next: NextFunction) {
    try {
      const { room_type_id } = req.query as { room_type_id: string };
      const rates = await rateService.findByRoomType(room_type_id);
      res.json(rates);
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { room_type_id, report_date, price } = req.body;
      const rate = await rateService.create(room_type_id, report_date, price);
      res.status(201).json(rate);
    } catch (err) {
      next(err);
    }
  }
}

export const rateController = new RateController();
