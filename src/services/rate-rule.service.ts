import prisma from "../lib/prisma.js";
import { RateRuleInput } from "../validators/rate-rules.js";

export class RateRuleService {
  async upsert(data: RateRuleInput) {
    const existing = await prisma.rateRule.findFirst({
      where: {
        room_type_id: data.room_type_id,
        start_date: new Date(data.start_date),
        end_date: new Date(data.end_date),
      },
    });

    if (existing) {
      return prisma.rateRule.update({
        where: { rule_id: existing.rule_id },
        data: {
          multiplier: data.multiplier,
          min_stay: data.min_stay,
        },
      });
    }

    return prisma.rateRule.create({
      data: {
        room_type_id: data.room_type_id,
        start_date: new Date(data.start_date),
        end_date: new Date(data.end_date),
        multiplier: data.multiplier,
        min_stay: data.min_stay,
      },
    });
  }

  async findByRoomType(roomTypeId: string) {
    return prisma.rateRule.findMany({
      where: { room_type_id: roomTypeId },
    });
  }
}

export const rateRuleService = new RateRuleService();
