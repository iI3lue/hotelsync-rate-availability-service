import { inventoryService } from "../../src/services/inventory.service.js";
import { AppError } from "../../src/middleware/error-handler.js";

jest.mock("../../src/lib/prisma.js", () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    inventory: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

import prisma from "../../src/lib/prisma.js";

const mockPrisma = prisma as any;

describe("InventoryService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAvailability", () => {
    it("should return available and blocked counts", async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue({
        available_count: 10,
        blocked_count: 2,
      });

      const result = await inventoryService.getAvailability("rt1", "2026-01-15");

      expect(result).toEqual({ available: 10, blocked: 2 });
    });

    it("should return 0,0 when no inventory exists", async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(null);

      const result = await inventoryService.getAvailability("rt1", "2026-01-15");

      expect(result).toEqual({ available: 0, blocked: 0 });
    });
  });

  describe("block", () => {
    it("should block rooms successfully", async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue({
        available_count: 10,
        blocked_count: 0,
      });
      mockPrisma.inventory.update.mockResolvedValue({
        available_count: 7,
        blocked_count: 3,
      });

      const result = await inventoryService.block("rt1", "2026-01-15", 3);

      expect(result).toEqual({ available: 7, blocked: 3 });
    });

    it("should throw when blocking more than available", async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue({
        available_count: 2,
        blocked_count: 0,
      });

      await expect(
        inventoryService.block("rt1", "2026-01-15", 5)
      ).rejects.toThrow(AppError);
    });

    it("should throw when inventory not found", async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(null);

      await expect(
        inventoryService.block("rt1", "2026-01-15", 1)
      ).rejects.toThrow(AppError);
    });
  });

  describe("unblock", () => {
    it("should unblock rooms successfully", async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue({
        available_count: 7,
        blocked_count: 3,
      });
      mockPrisma.inventory.update.mockResolvedValue({
        available_count: 10,
        blocked_count: 0,
      });

      const result = await inventoryService.unblock("rt1", "2026-01-15", 3);

      expect(result).toEqual({ available: 10, blocked: 0 });
    });

    it("should throw when unblocking more than blocked", async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue({
        available_count: 7,
        blocked_count: 2,
      });

      await expect(
        inventoryService.unblock("rt1", "2026-01-15", 5)
      ).rejects.toThrow(AppError);
    });
  });

  describe("reserve", () => {
    const txMock = { inventory: { updateMany: jest.fn() } };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock)
      );
    });

    it("should decrement inventory for each date of the stay", async () => {
      txMock.inventory.updateMany.mockResolvedValue({ count: 1 });

      const result = await inventoryService.reserve(
        "rt1",
        "2026-10-01",
        "2026-10-05",
        1
      );

      expect(result.reserved).toBe(true);
      expect(txMock.inventory.updateMany).toHaveBeenCalledTimes(4);
      expect(txMock.inventory.updateMany).toHaveBeenLastCalledWith({
        where: {
          room_type_id: "rt1",
          date: new Date("2026-10-04"),
          available_count: { gte: 1 },
        },
        data: { available_count: { decrement: 1 } },
      });
    });

    it("should throw 409 when a date has no availability", async () => {
      txMock.inventory.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await expect(
        inventoryService.reserve("rt1", "2026-10-01", "2026-10-03", 1)
      ).rejects.toThrow(AppError);
    });

    it("should throw 400 when check_out is not after check_in", async () => {
      await expect(
        inventoryService.reserve("rt1", "2026-10-05", "2026-10-05", 1)
      ).rejects.toThrow(AppError);
    });
  });

  describe("release", () => {
    const txMock = { inventory: { updateMany: jest.fn() } };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock)
      );
    });

    it("should increment inventory for each date of the stay", async () => {
      txMock.inventory.updateMany.mockResolvedValue({ count: 1 });

      const result = await inventoryService.release(
        "rt1",
        "2026-10-01",
        "2026-10-05",
        1
      );

      expect(result.released).toBe(true);
      expect(txMock.inventory.updateMany).toHaveBeenCalledTimes(4);
      expect(txMock.inventory.updateMany).toHaveBeenLastCalledWith({
        where: { room_type_id: "rt1", date: new Date("2026-10-04") },
        data: { available_count: { increment: 1 } },
      });
    });

    it("should throw 400 when check_out is not after check_in", async () => {
      await expect(
        inventoryService.release("rt1", "2026-10-05", "2026-10-05", 1)
      ).rejects.toThrow(AppError);
    });
  });
});
