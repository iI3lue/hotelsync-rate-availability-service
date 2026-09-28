import { z } from "zod";

export const blockSchema = z.object({
  room_type_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
  count: z.number().int().positive(),
  action: z.enum(["block", "unblock"]),
});

export type BlockInput = z.infer<typeof blockSchema>;
