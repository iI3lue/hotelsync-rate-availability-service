import { z } from "zod";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

export const setInventorySchema = z.object({
  room_type_id: z.string().uuid(),
  date: dateSchema,
  available_count: z.number().int().nonnegative(),
});

export type SetInventoryInput = z.infer<typeof setInventorySchema>;
