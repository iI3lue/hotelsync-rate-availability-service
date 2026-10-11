import { rateService } from "../../src/services/rate.service.js";

jest.mock("../../src/lib/prisma.js", () => ({
  __esModule: true,
  default: {
    rate: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    eventOutbox: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import prisma from "../../src/lib/prisma.js";

const mockPrisma = prisma as any;

describe("RateService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: any) => Promise<unknown>) => callback(mockPrisma)
    );
  });

  describe("findByRoomType", () => {
    it("should return rates for a room type", async () => {
      const rates = [{ rate_id: "r1", room_type_id: "rt1", price: 100 }];
      mockPrisma.rate.findMany.mockResolvedValue(rates);

      const result = await rateService.findByRoomType("rt1");

      expect(result).toEqual(rates);
      expect(mockPrisma.rate.findMany).toHaveBeenCalledWith({
        where: { room_type_id: "rt1" },
        orderBy: { report_date: "asc" },
      });
    });
  });

  describe("create", () => {
    it("should create a rate", async () => {
      const rate = { rate_id: "r1", room_type_id: "rt1", report_date: new Date(), price: 100 };
      mockPrisma.rate.create.mockResolvedValue(rate);

      const result = await rateService.create("rt1", "2026-01-15", 100);

      expect(result).toEqual(rate);
      expect(mockPrisma.eventOutbox.create).toHaveBeenCalledWith({
        data: {
          event_type: "rate.updated",
          payload: {
            room_type_id: "rt1",
            kind: "base_rate",
            rate_id: "r1",
            report_date: "2026-01-15",
            price: 100,
            occurred_at: expect.any(String),
          },
        },
      });
    });
  });
});
