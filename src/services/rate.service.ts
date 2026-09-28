import prisma from "../lib/prisma.js";
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

  async create(roomTypeId: string, reportDate: string, price: number) {
    const rate = await prisma.rate.create({
      data: {
        room_type_id: roomTypeId,
        report_date: new Date(reportDate),
        price,
      },
    });
    // Invalidación inmediata: la próxima lectura repuebla.
    await cacheDel(ratesKey(roomTypeId));
    return rate;
  }
}

export const rateService = new RateService();
