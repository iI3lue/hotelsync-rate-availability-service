import { Router } from "express";
import { blockController } from "../controllers/block.controller.js";
import { validate } from "../middleware/validate.js";
import { blockSchema } from "../validators/blocks.js";

const router = Router();

router.post(
  "/",
  validate(blockSchema),
  blockController.handle.bind(blockController)
);

export default router;
