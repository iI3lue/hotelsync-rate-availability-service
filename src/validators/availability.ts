import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format");

export const availabilityQuerySchema = z.object({
  room_type_id: z.string().uuid(),
  date: isoDate,
});

export const availabilityRangeQuerySchema = z.object({
  room_type_id: z.string().uuid(),
  from: isoDate,
  to: isoDate,
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type AvailabilityRangeQuery = z.infer<
  typeof availabilityRangeQuerySchema
>;
