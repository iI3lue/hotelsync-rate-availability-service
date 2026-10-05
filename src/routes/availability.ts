import { Router } from "express";
import { availabilityController } from "../controllers/availability.controller.js";
import { requireServiceKey } from "../lib/auth.js";
import { validate } from "../middleware/validate.js";
import { availabilityQuerySchema, availabilityRangeQuerySchema } from "../validators/availability.js";
import { reserveSchema, releaseSchema } from "../validators/reserve.js";

const router = Router();

router.get(
  "/range",
  validate(availabilityRangeQuerySchema, "query"),
  availabilityController.getRange.bind(availabilityController)
);
router.get(
  "/",
  validate(availabilityQuerySchema, "query"),
  availabilityController.get.bind(availabilityController)
);
router.post(
  "/reserve",
  requireServiceKey,
  validate(reserveSchema),
  availabilityController.reserve.bind(availabilityController)
);
router.post(
  "/release",
  requireServiceKey,
  validate(releaseSchema),
  availabilityController.release.bind(availabilityController)
);

export default router;
