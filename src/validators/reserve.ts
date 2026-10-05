import { z } from "zod";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format");

export const reserveSchema = z
  .object({
    room_type_id: z.string().uuid(),
    check_in: dateSchema,
    check_out: dateSchema,
    count: z.number().int().positive().default(1),
    // Clave de idempotencia (ej. booking_id:confirm). Reintentos con la
    // misma clave no aplican el movimiento dos veces.
    idempotency_key: z.string().min(1).max(100).optional(),
  })
  .refine((data) => data.check_out > data.check_in, {
    message: "check_out must be after check_in",
    path: ["check_out"],
  });

export const releaseSchema = reserveSchema;

export type ReserveInput = z.infer<typeof reserveSchema>;
export type ReleaseInput = z.infer<typeof releaseSchema>;