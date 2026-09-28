import { inventoryService } from "../../src/services/inventory.service.js";

jest.mock("../../src/lib/prisma.js", () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    inventory: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock("../../src/lib/cache.js", () => ({
  __esModule: true,
  AVAIL_TTL_SECONDS: 60,
  availKey: (roomTypeId: string, date: string) =>
    `ra:avail:${roomTypeId}:${date}`,
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
}));

import prisma from "../../src/lib/prisma.js";
import {
  availKey,
  cacheDel,
  cacheGet,
  cacheSet,
} from "../../src/lib/cache.js";

const mockPrisma = prisma as any;
const mockCacheGet = cacheGet as jest.Mock;
const mockCacheSet = cacheSet as jest.Mock;
const mockCacheDel = cacheDel as jest.Mock;

describe("InventoryService cache + range", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  describe("getAvailability cache-aside", () => {
    it("should return the cached value without hitting the DB", async () => {
      mockCacheGet.mockResolvedValue({ available: 7, blocked: 1 });

      const result = await inventoryService.getAvailability(
        "rt1",
        "2026-01-15"
      );

      expect(result).toEqual({ available: 7, blocked: 1 });
      expect(mockPrisma.inventory.findUnique).not.toHaveBeenCalled();
    });

    it("should populate the cache on miss", async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue({
        available_count: 10,
        blocked_count: 2,
      });

      const result = await inventoryService.getAvailability(
        "rt1",
        "2026-01-15"
      );

      expect(result).toEqual({ available: 10, blocked: 2 });
      expect(mockCacheSet).toHaveBeenCalledWith(
        "ra:avail:rt1:2026-01-15",
        { available: 10, blocked: 2 },
        60
      );
    });

    it("should invalidate the day key on block (invalidación inmediata)", async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue({
        available_count: 10,
        blocked_count: 0,
      });
      mockPrisma.inventory.update.mockResolvedValue({
        available_count: 8,
        blocked_count: 2,
      });

      await inventoryService.block("rt1", "2026-01-15", 2);

      expect(mockCacheDel).toHaveBeenCalledWith("ra:avail:rt1:2026-01-15");
      expect(availKey("rt1", "2026-01-15")).toBe("ra:avail:rt1:2026-01-15");
    });
  });

  describe("getAvailabilityRange", () => {
    it("should return one entry per night, filling gaps with 0,0", async () => {
      mockPrisma.inventory.findMany.mockResolvedValue([
        {
          date: new Date("2026-03-02T00:00:00Z"),
          available_count: 5,
          blocked_count: 1,
        },
      ]);

      const result = await inventoryService.getAvailabilityRange(
        "rt1",
        "2026-03-01",
        "2026-03-03"
      );

      expect(result).toEqual({
        "2026-03-01": { available: 0, blocked: 0 },
        "2026-03-02": { available: 5, blocked: 1 },
        "2026-03-03": { available: 0, blocked: 0 },
      });
      expect(mockPrisma.inventory.findMany).toHaveBeenCalledTimes(1);
    });

    it("should reject ranges over 62 nights", async () => {
      await expect(
        inventoryService.getAvailabilityRange("rt1", "2026-01-01", "2026-04-01")
      ).rejects.toThrow("62 nights or fewer");
    });

    it("should reject an inverted range", async () => {
      await expect(
        inventoryService.getAvailabilityRange("rt1", "2026-03-05", "2026-03-01")
      ).rejects.toThrow("on or after from");
    });
  });
});
