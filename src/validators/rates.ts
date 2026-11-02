import { z } from "zod";

export const ratesQuerySchema = z.object({
  room_type_id: z.string().uuid(),
});

export type RatesQuery = z.infer<typeof ratesQuerySchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "report_date must be YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "report_date is not a valid calendar date");

/** Decimal(10,2): positivo, máximo 99,999,999.99 y a lo sumo 2 decimales. */
export const createRateSchema = z.object({
  room_type_id: z.string().uuid(),
  report_date: isoDate,
  price: z
    .number()
    .positive()
    .max(99_999_999.99)
    .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, "price allows up to 2 decimals"),
});

export type CreateRateInput = z.infer<typeof createRateSchema>;
