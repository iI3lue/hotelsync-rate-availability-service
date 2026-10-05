import { Router } from "express";
import { rateController } from "../controllers/rate.controller.js";
import { requireAuth, requireRole } from "../lib/auth.js";
import { validate } from "../middleware/validate.js";
import { ratesQuerySchema } from "../validators/rates.js";

const router = Router();

router.get(
  "/",
  validate(ratesQuerySchema, "query"),
  rateController.getByRoomType.bind(rateController)
);

router.post(
  "/",
  requireAuth,
  requireRole("MANAGER", "SUPER_ADMIN"),
  rateController.create.bind(rateController)
);

export default router;
