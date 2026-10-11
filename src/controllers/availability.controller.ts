import { Request, Response, NextFunction } from "express";
import { inventoryService } from "../services/inventory.service.js";

export class AvailabilityController {
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const { room_type_id, date } = req.query as { room_type_id: string; date: string };
      const availability = await inventoryService.getAvailability(room_type_id, date);
      res.json(availability);
    } catch (err) {
      next(err);
    }
  }

  async getRange(req: Request, res: Response, next: NextFunction) {
    try {
      const { room_type_id, from, to } = req.query as {
        room_type_id: string;
        from: string;
        to: string;
      };
      const range = await inventoryService.getAvailabilityRange(
        room_type_id,
        from,
        to
      );
      res.json(range);
    } catch (err) {
      next(err);
    }
  }

  async reserve(req: Request, res: Response, next: NextFunction) {
    try {
      const { room_type_id, check_in, check_out, count, idempotency_key } =
        req.body as {
          room_type_id: string;
          check_in: string;
          check_out: string;
          count?: number;
          idempotency_key?: string;
        };
      const result = await inventoryService.reserve(
        room_type_id,
        check_in,
        check_out,
        count,
        idempotency_key
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async release(req: Request, res: Response, next: NextFunction) {
    try {
      const { room_type_id, check_in, check_out, count, idempotency_key } =
        req.body as {
          room_type_id: string;
          check_in: string;
          check_out: string;
          count?: number;
          idempotency_key?: string;
        };
      const result = await inventoryService.release(
        room_type_id,
        check_in,
        check_out,
        count,
        idempotency_key
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async setInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const { room_type_id, date, available_count } = req.body as {
        room_type_id: string;
        date: string;
        available_count: number;
      };
      const result = await inventoryService.setInventory(
        room_type_id,
        date,
        available_count
      );
      res.json({
        available: result.available_count,
        blocked: result.blocked_count,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const availabilityController = new AvailabilityController();
