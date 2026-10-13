import prisma from "../lib/prisma.js";
import { enqueueOutboxEvent } from "../lib/outbox.js";
import type { AuthClaims } from "../lib/auth.js";
import { requireRoomTypeScope } from "../lib/room-scope.js";
import {
  RATES_TTL_SECONDS,
  cacheDel,
  cacheGet,
  cacheSet,
  ratesKey,
} from "../lib/cache.js";

export class RateService {
  async findByRoomType(roomTypeId: string) {
    const key = ratesKey(roomTypeId);
    const hit = await cacheGet<unknown[]>(key);
    if (hit) return hit;

    const rates = await prisma.rate.findMany({
      where: { room_type_id: roomTypeId },
      orderBy: { report_date: "asc" },
    });
    await cacheSet(key, rates, RATES_TTL_SECONDS);
    return rates;
  }

  async create(roomTypeId: string, reportDate: string, price: number, actor: AuthClaims) {
    await requireRoomTypeScope(actor, roomTypeId);
    const rate = await prisma.$transaction(async (tx) => {
      const created = await tx.rate.create({
        data: {
          room_type_id: roomTypeId,
          report_date: new Date(reportDate),
          price,
        },
      });
      await enqueueOutboxEvent(tx, "rate.updated", {
        room_type_id: roomTypeId,
        kind: "base_rate",
        rate_id: created.rate_id,
        report_date: reportDate,
        price: Number(created.price),
        occurred_at: new Date().toISOString(),
      });
      return created;
    });
    // Invalidación inmediata: la próxima lectura repuebla.
    await cacheDel(ratesKey(roomTypeId));
    return rate;
  }
}

export const rateService = new RateService();
