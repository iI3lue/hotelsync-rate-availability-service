import prisma from "./prisma.js";
import { createDispatcher, startDispatcher } from "./broker.js";

export type RateOutboxEvent = "availability.updated" | "rate.updated";

export interface RateOutboxPayload {
  room_type_id: string;
  [key: string]: unknown;
}

/** Enqueue inside the same DB transaction as the inventory/rate mutation. */
export async function enqueueOutboxEvent(
  tx: {
    eventOutbox: {
      create: (args: {
        data: { event_type: string; payload: object };
      }) => Promise<unknown>;
    };
  },
  eventType: RateOutboxEvent,
  payload: RateOutboxPayload
): Promise<void> {
  await tx.eventOutbox.create({
    data: { event_type: eventType, payload },
  });
}

export function createOutboxDispatcher() {
  return createDispatcher(
    async () => {
      const rows = await prisma.eventOutbox.findMany({
        where: { status: "pending" },
        orderBy: { created_at: "asc" },
        take: 100,
      });
      return rows.map((row) => ({
        event_id: row.event_id,
        event_type: row.event_type,
        payload: row.payload as unknown,
      }));
    },
    async (eventId) => {
      await prisma.eventOutbox.update({
        where: { event_id: eventId },
        data: { status: "sent", sent_at: new Date() },
      });
    }
  );
}

export function startOutboxDispatcher(intervalMs = 10_000): NodeJS.Timeout {
  const dispatcher = createOutboxDispatcher();
  return startDispatcher(() => dispatcher.flush(), intervalMs);
}
