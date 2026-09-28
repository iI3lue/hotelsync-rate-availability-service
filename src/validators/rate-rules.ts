import { z } from "zod";

export const rateRuleSchema = z.object({
  room_type_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  multiplier: z.number().positive(),
  min_stay: z.number().int().min(1),
});

export type RateRuleInput = z.infer<typeof rateRuleSchema>;
