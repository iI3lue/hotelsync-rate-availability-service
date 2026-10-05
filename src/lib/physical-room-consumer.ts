import { z } from "zod";
import prisma from "./prisma.js";
import { consume } from "./broker.js";
import { availKey, cacheDel } from "./cache.js";

const EVENT_TYPE = "physical-room.created";
const QUEUE = "rate-availability.physical-rooms";
const DAY_MS = 24 * 60 * 60 * 1000;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

const physicalRoomCreatedSchema = z.object({
  event_id: z.string().uuid(),
  physical_room_id: z.string().uuid(),
  hotel_id: z.string().uuid(),
  room_type_id: z.string().uuid(),
  available_from: dateSchema,
});

type PrismaLike = typeof prisma;
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function inventoryDates(availableFrom: string, now: Date): Date[] {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const start = new Date(`${availableFrom}T00:00:00.000Z`);
  if (start < today) start.setTime(today.getTime());

  const end = new Date(start.getTime() + 365 * DAY_MS);
  const dates: Date[] = [];
  while (start < end) {
    dates.push(new Date(start));
    start.setUTCDate(start.getUTCDate() + 1);
  }
  return dates;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function handlePhysicalRoomCreated(
  db: PrismaLike,
  payload: unknown,
  now = new Date()
): Promise<void> {
  const event = physicalRoomCreatedSchema.parse(payload);
  const existing = await db.processedEvent.findUnique({
    where: { event_id: event.event_id },
  });
  if (existing) return;

  const dates = inventoryDates(event.available_from, now);

  try {
    await db.$transaction(async (tx) => {
      await tx.processedEvent.create({
        data: { event_id: event.event_id, event_type: EVENT_TYPE },
      });

      for (const date of dates) {
        await tx.inventory.upsert({
          where: {
            room_type_id_date: {
              room_type_id: event.room_type_id,
              date,
            },
          },
          create: {
            room_type_id: event.room_type_id,
            date,
            available_count: 1,
            blocked_count: 0,
          },
          update: { available_count: { increment: 1 } },
        });
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const duplicate = await db.processedEvent.findUnique({
        where: { event_id: event.event_id },
      });
      if (duplicate) return;
    }
    throw error;
  }

  await cacheDel(
    ...dates.map((date) => availKey(event.room_type_id, formatDate(date)))
  );
}

export async function handlePropertyEvent(
  db: PrismaLike,
  routingKey: string,
  payload: unknown,
  now = new Date()
): Promise<void> {
  if (routingKey !== EVENT_TYPE) {
    console.warn(`[consumer] routing key ignorada: ${routingKey}`);
    return;
  }

  await handlePhysicalRoomCreated(db, payload, now);
}

export async function startPhysicalRoomConsumer(): Promise<void> {
  await consume(QUEUE, [EVENT_TYPE], (routingKey, payload) =>
    handlePropertyEvent(prisma, routingKey, payload)
  );
}
