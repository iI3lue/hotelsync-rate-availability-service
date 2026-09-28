import { z } from "zod";

export const ratesQuerySchema = z.object({
  room_type_id: z.string().uuid(),
});

export type RatesQuery = z.infer<typeof ratesQuerySchema>;
