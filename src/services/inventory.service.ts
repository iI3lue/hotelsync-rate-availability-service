import prisma from "../lib/prisma.js";
import { AppError } from "../middleware/error-handler.js";
import { enqueueOutboxEvent } from "../lib/outbox.js";
import {
  AVAIL_TTL_SECONDS,
  availKey,
  cacheDel,
  cacheGet,
  cacheSet,
} from "../lib/cache.js";

function enumerateDates(startDate: string, endDate: string): Date[] {
  const dates: Date[] = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (current < end) {
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface DayAvailability {
  available: number;
  blocked: number;
}

export class InventoryService {
  async getAvailability(roomTypeId: string, date: string): Promise<DayAvailability> {
    const key = availKey(roomTypeId, date);
    const hit = await cacheGet<DayAvailability>(key);
    if (hit) return hit;

    const inventory = await prisma.inventory.findUnique({
      where: {
        room_type_id_date: {
          room_type_id: roomTypeId,
          date: new Date(date),
        },
      },
    });

    const result: DayAvailability = !inventory
      ? { available: 0, blocked: 0 }
      : {
          available: inventory.available_count,
          blocked: inventory.blocked_count,
        };
    await cacheSet(key, result, AVAIL_TTL_SECONDS);
    return result;
  }

  /**
   * Disponibilidad de un rango en UNA sola query (el calendario pide el mes
   * entero en vez de un GET por día). Máximo 62 noches por llamada.
   * Los días sin fila de inventario se reportan {0, 0}. Lee la DB (fuente
   * de verdad, siempre fresco) y calienta las claves por día de la caché.
   */
  async getAvailabilityRange(
    roomTypeId: string,
    from: string,
    to: string
  ): Promise<Record<string, DayAvailability>> {
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new AppError(400, "to must be on or after from", "Bad Request");
    }
    const nights = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (nights > 62) {
      throw new AppError(400, "range must be 62 nights or fewer", "Bad Request");
    }

    const rows = await prisma.inventory.findMany({
      where: {
        room_type_id: roomTypeId,
        date: { gte: start, lte: end },
      },
      select: { date: true, available_count: true, blocked_count: true },
    });
    const byDate = new Map(
      rows.map((r) => [
        r.date.toISOString().slice(0, 10),
        { available: r.available_count, blocked: r.blocked_count },
      ])
    );

    const result: Record<string, DayAvailability> = {};
    const cursor = new Date(start);
    while (cursor <= end) {
      const iso = cursor.toISOString().slice(0, 10);
      result[iso] = byDate.get(iso) ?? { available: 0, blocked: 0 };
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    // Calienta la caché por día para las lecturas unitarias.
    await Promise.all(
      Object.entries(result).map(([iso, day]) =>
        cacheSet(availKey(roomTypeId, iso), day, AVAIL_TTL_SECONDS)
      )
    );
    return result;
  }

  async block(roomTypeId: string, date: string, count: number) {
    const updated = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: {
          room_type_id_date: {
            room_type_id: roomTypeId,
            date: new Date(date),
          },
        },
      });

      if (!inventory) {
        throw new AppError(
          404,
          `No inventory found for room type ${roomTypeId} on ${date}`,
          "Not Found"
        );
      }

      if (count > inventory.available_count) {
        throw new AppError(
          400,
          `Cannot block ${count} rooms: only ${inventory.available_count} available`,
          "Bad Request"
        );
      }

      const changed = await tx.inventory.update({
        where: {
          room_type_id_date: {
            room_type_id: roomTypeId,
            date: new Date(date),
          },
        },
        data: {
          available_count: inventory.available_count - count,
          blocked_count: inventory.blocked_count + count,
        },
      });
      await enqueueOutboxEvent(tx, "availability.updated", {
        room_type_id: roomTypeId,
        date,
        available_count: changed.available_count,
        blocked_count: changed.blocked_count,
        reason: "blocked",
        occurred_at: new Date().toISOString(),
      });
      return changed;
    });

    // Invalidación inmediata (PRD): el próximo GET pega a la DB.
    await cacheDel(availKey(roomTypeId, date));

    return {
      available: updated.available_count,
      blocked: updated.blocked_count,
    };
  }

  async unblock(roomTypeId: string, date: string, count: number) {
    const updated = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: {
          room_type_id_date: {
            room_type_id: roomTypeId,
            date: new Date(date),
          },
        },
      });

      if (!inventory) {
        throw new AppError(
          404,
          `No inventory found for room type ${roomTypeId} on ${date}`,
          "Not Found"
        );
      }

      if (count > inventory.blocked_count) {
        throw new AppError(
          400,
          `Cannot unblock ${count} rooms: only ${inventory.blocked_count} blocked`,
          "Bad Request"
        );
      }

      const changed = await tx.inventory.update({
        where: {
          room_type_id_date: {
            room_type_id: roomTypeId,
            date: new Date(date),
          },
        },
        data: {
          available_count: inventory.available_count + count,
          blocked_count: inventory.blocked_count - count,
        },
      });
      await enqueueOutboxEvent(tx, "availability.updated", {
        room_type_id: roomTypeId,
        date,
        available_count: changed.available_count,
        blocked_count: changed.blocked_count,
        reason: "unblocked",
        occurred_at: new Date().toISOString(),
      });
      return changed;
    });

    // Invalidación inmediata (PRD): el próximo GET pega a la DB.
    await cacheDel(availKey(roomTypeId, date));

    return {
      available: updated.available_count,
      blocked: updated.blocked_count,
    };
  }

  async setInventory(roomTypeId: string, date: string, availableCount: number) {
    const inventory = await prisma.$transaction(async (tx) => {
      const existing = await tx.inventory.findUnique({
        where: {
          room_type_id_date: {
            room_type_id: roomTypeId,
            date: new Date(date),
          },
        },
      });

      const updated = existing
        ? await tx.inventory.update({
            where: {
              room_type_id_date: {
                room_type_id: roomTypeId,
                date: new Date(date),
              },
            },
            data: { available_count: availableCount },
          })
        : await tx.inventory.create({
            data: {
              room_type_id: roomTypeId,
              date: new Date(date),
              available_count: availableCount,
              blocked_count: 0,
            },
          });

      await enqueueOutboxEvent(tx, "availability.updated", {
        room_type_id: roomTypeId,
        date,
        available_count: updated.available_count,
        blocked_count: updated.blocked_count,
        reason: "manual_adjustment",
        occurred_at: new Date().toISOString(),
      });
      return updated;
    });

    // Invalidación inmediata (PRD): el próximo GET pega a la DB.
    await cacheDel(availKey(roomTypeId, date));
    return inventory;
  }

  /**
   * Reserva inventario para un rango de fechas (RN-1).
   * Decrementa `available_count` con bloqueo optimista (CAS): si en alguna
   * fecha no hay stock, la transacción se aborta y no queda decremento parcial.
   * Con `idempotencyKey`, el movimiento se registra en la misma transacción:
   * un reintento con la misma clave no descuenta dos veces.
   */
  async reserve(
    roomTypeId: string,
    checkIn: string,
    checkOut: string,
    count = 1,
    idempotencyKey?: string
  ) {
    const dates = enumerateDates(checkIn, checkOut);

    if (dates.length === 0) {
      throw new AppError(400, "check_out must be after check_in", "Bad Request");
    }

    const applied = await prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.appliedKey.findUnique({
          where: { key: idempotencyKey },
        });
        if (existing) return false;
        await tx.appliedKey.create({ data: { key: idempotencyKey } });
      }
      for (const date of dates) {
        const result = await tx.inventory.updateMany({
          where: {
            room_type_id: roomTypeId,
            date,
            available_count: { gte: count },
          },
          data: { available_count: { decrement: count } },
        });

        if (result.count === 0) {
          throw new AppError(
            409,
            `Insufficient availability on ${formatDate(date)} for room type ${roomTypeId}`,
            "Conflict"
          );
        }
      }
      return true;
    });

    // Invalidación inmediata de cada noche del rango (PRD).
    await cacheDel(
      ...dates.map((d) => availKey(roomTypeId, formatDate(d)))
    );

    return {
      reserved: true,
      start_date: checkIn,
      end_date: checkOut,
      count,
      deduplicated: !applied,
    };
  }

  /**
   * Libera inventario reservado para un rango de fechas (RN-2).
   * Incrementa `available_count` por cada fecha de la estancia.
   * Acepta la misma clave de idempotencia que la reserva que compensa.
   */
  async release(
    roomTypeId: string,
    checkIn: string,
    checkOut: string,
    count = 1,
    idempotencyKey?: string
  ) {
    const dates = enumerateDates(checkIn, checkOut);

    if (dates.length === 0) {
      throw new AppError(400, "check_out must be after check_in", "Bad Request");
    }

    const applied = await prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.appliedKey.findUnique({
          where: { key: idempotencyKey },
        });
        if (existing) return false;
        await tx.appliedKey.create({ data: { key: idempotencyKey } });
      }
      for (const date of dates) {
        await tx.inventory.updateMany({
          where: { room_type_id: roomTypeId, date },
          data: { available_count: { increment: count } },
        });
      }
      return true;
    });

    // Invalidación inmediata de cada noche del rango (PRD).
    await cacheDel(
      ...dates.map((d) => availKey(roomTypeId, formatDate(d)))
    );

    return {
      released: true,
      start_date: checkIn,
      end_date: checkOut,
      count,
      deduplicated: !applied,
    };
  }
}

export const inventoryService = new InventoryService();
