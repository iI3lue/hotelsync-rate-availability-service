import prisma from "../lib/prisma.js";
import { enqueueOutboxEvent } from "../lib/outbox.js";
import { RateRuleInput } from "../validators/rate-rules.js";

export class RateRuleService {
  async upsert(data: RateRuleInput) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.rateRule.findFirst({
        where: {
          room_type_id: data.room_type_id,
          start_date: new Date(data.start_date),
          end_date: new Date(data.end_date),
        },
      });

      const rule = existing
        ? await tx.rateRule.update({
            where: { rule_id: existing.rule_id },
            data: {
              multiplier: data.multiplier,
              min_stay: data.min_stay,
            },
          })
        : await tx.rateRule.create({
            data: {
              room_type_id: data.room_type_id,
              start_date: new Date(data.start_date),
              end_date: new Date(data.end_date),
              multiplier: data.multiplier,
              min_stay: data.min_stay,
            },
          });

      await enqueueOutboxEvent(tx, "rate.updated", {
        room_type_id: data.room_type_id,
        kind: "rate_rule",
        rule_id: rule.rule_id,
        start_date: data.start_date,
        end_date: data.end_date,
        multiplier: Number(rule.multiplier),
        min_stay: rule.min_stay,
        occurred_at: new Date().toISOString(),
      });
      return rule;
    });
  }

  async findByRoomType(roomTypeId: string) {
    return prisma.rateRule.findMany({
      where: { room_type_id: roomTypeId },
    });
  }
}

export const rateRuleService = new RateRuleService();
