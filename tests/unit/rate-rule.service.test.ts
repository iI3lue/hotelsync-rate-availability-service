import { rateRuleService } from "../../src/services/rate-rule.service.js";

jest.mock("../../src/lib/prisma.js", () => ({
  __esModule: true,
  default: {
    rateRule: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    eventOutbox: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import prisma from "../../src/lib/prisma.js";

const db = prisma as any;

describe("RateRuleService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.$transaction.mockImplementation(
      async (callback: (tx: any) => Promise<unknown>) => callback(db)
    );
  });

  it("persists the upsert and rate.updated event in one transaction", async () => {
    db.rateRule.findFirst.mockResolvedValue(null);
    db.rateRule.create.mockResolvedValue({
      rule_id: "rule-1",
      multiplier: 1.25,
      min_stay: 2,
    });

    const result = await rateRuleService.upsert({
      room_type_id: "room-type-1",
      start_date: "2026-11-01",
      end_date: "2026-11-30",
      multiplier: 1.25,
      min_stay: 2,
    });

    expect(result.rule_id).toBe("rule-1");
    expect(db.eventOutbox.create).toHaveBeenCalledWith({
      data: {
        event_type: "rate.updated",
        payload: {
          room_type_id: "room-type-1",
          kind: "rate_rule",
          rule_id: "rule-1",
          start_date: "2026-11-01",
          end_date: "2026-11-30",
          multiplier: 1.25,
          min_stay: 2,
          occurred_at: expect.any(String),
        },
      },
    });
  });
});
