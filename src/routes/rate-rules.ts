import { Router } from "express";
import { rateRuleController } from "../controllers/rate-rule.controller.js";
import { validate } from "../middleware/validate.js";
import { rateRuleSchema } from "../validators/rate-rules.js";

const router = Router();

router.put(
  "/",
  validate(rateRuleSchema),
  rateRuleController.upsert.bind(rateRuleController)
);

router.get("/", rateRuleController.getByRoomType.bind(rateRuleController));

export default router;
