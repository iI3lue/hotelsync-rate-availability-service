import request from "supertest";
import express from "express";
import availabilityRouter from "../../src/routes/availability.js";
import ratesRouter from "../../src/routes/rates.js";
import blocksRouter from "../../src/routes/blocks.js";
import { errorHandler } from "../../src/middleware/error-handler.js";

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
    rate: {
      findMany: jest.fn(),
    },
    eventOutbox: { create: jest.fn() },
  },
}));

import prisma from "../../src/lib/prisma.js";
import { signAccessToken } from "../../../user-service/src/lib/tokens.js";
const mockPrisma = prisma as any;

process.env.SERVICE_API_KEY = "test-service-key";
const SERVICE_HEADERS = { "x-service-key": "test-service-key" };

const MANAGER_TOKEN = signAccessToken({
  sub: "manager",
  email: "manager@example.com",
  role: "MANAGER",
  hotel_id: "c1b2c3d4-e5f6-4890-abcd-ef1234567890",
});

const app = express();
app.use(express.json());

// Health check route (mirrors index.ts)
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "rate-availability-service",
  });
});

app.use("/v1/availability", availabilityRouter);
app.use("/v1/rates", ratesRouter);
app.use("/v1/blocks", blocksRouter);
app.use(errorHandler);

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("Rate & Availability Service API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: any) => Promise<unknown>) => callback(mockPrisma)
    );
  });

  describe("GET /health", () => {
    it("should return health status", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });
  });

  describe("GET /v1/availability", () => {
    it("should return availability for a room type and date", async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue({
        available_count: 10,
        blocked_count: 2,
      });

      const res = await request(app)
        .get("/v1/availability")
        .query({ room_type_id: VALID_UUID, date: "2026-01-15" });

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(10);
      expect(res.body.blocked).toBe(2);
    });

    it("should return 400 with missing params", async () => {
      const res = await request(app).get("/v1/availability");
      expect(res.status).toBe(400);
    });
  });

  describe("GET /v1/availability/range", () => {
    it("should return one entry per night in a single query", async () => {
      mockPrisma.inventory.findMany.mockResolvedValue([
        {
          date: new Date("2026-01-16T00:00:00Z"),
          available_count: 4,
          blocked_count: 0,
        },
      ]);

      const res = await request(app)
        .get("/v1/availability/range")
        .query({
          room_type_id: VALID_UUID,
          from: "2026-01-15",
          to: "2026-01-17",
        });

      expect(res.status).toBe(200);
      expect(res.body["2026-01-15"]).toEqual({ available: 0, blocked: 0 });
      expect(res.body["2026-01-16"]).toEqual({ available: 4, blocked: 0 });
      expect(res.body["2026-01-17"]).toEqual({ available: 0, blocked: 0 });
      expect(mockPrisma.inventory.findMany).toHaveBeenCalledTimes(1);
    });

    it("should return 400 with missing params", async () => {
      const res = await request(app)
        .get("/v1/availability/range")
        .query({ room_type_id: VALID_UUID });
      expect(res.status).toBe(400);
    });

    it("should return 400 for a range over 62 nights", async () => {
      const res = await request(app)
        .get("/v1/availability/range")
        .query({
          room_type_id: VALID_UUID,
          from: "2026-01-01",
          to: "2026-04-01",
        });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /v1/rates", () => {
    it("should return rates for a room type", async () => {
      mockPrisma.rate.findMany.mockResolvedValue([
        { rate_id: "r1", room_type_id: "rt1", price: 100 },
      ]);

      const res = await request(app)
        .get("/v1/rates")
        .query({ room_type_id: VALID_UUID });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("POST /v1/blocks", () => {
    it("should block rooms successfully with manager session", async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue({
        available_count: 10,
        blocked_count: 0,
      });
      mockPrisma.inventory.update.mockResolvedValue({
        available_count: 8,
        blocked_count: 2,
      });

      const res = await request(app)
        .post("/v1/blocks")
        .set("Authorization", `Bearer ${MANAGER_TOKEN}`)
        .send({
          room_type_id: VALID_UUID,
          date: "2026-01-15",
          count: 2,
          action: "block",
        });

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(8);
      expect(res.body.blocked).toBe(2);
    });

    it("should return 401 without a session", async () => {
      const res = await request(app)
        .post("/v1/blocks")
        .send({
          room_type_id: VALID_UUID,
          date: "2026-01-15",
          count: 2,
          action: "block",
        });

      expect(res.status).toBe(401);
    });

    it("should return 400 with invalid action", async () => {
      const res = await request(app)
        .post("/v1/blocks")
        .set("Authorization", `Bearer ${MANAGER_TOKEN}`)
        .send({
          room_type_id: VALID_UUID,
          date: "2026-01-15",
          count: 2,
          action: "invalid",
        });

      expect(res.status).toBe(400);
    });
  });

  describe("PUT /v1/availability/inventory", () => {
    it("allows a manager to set manual inventory and returns the projected counts", async () => {
      mockPrisma.inventory.findUnique.mockResolvedValue(null);
      mockPrisma.inventory.create.mockResolvedValue({
        available_count: 6,
        blocked_count: 0,
      });

      const res = await request(app)
        .put("/v1/availability/inventory")
        .set("Authorization", `Bearer ${MANAGER_TOKEN}`)
        .send({
          room_type_id: VALID_UUID,
          date: "2026-01-15",
          available_count: 6,
        });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: 6, blocked: 0 });
      expect(mockPrisma.eventOutbox.create).toHaveBeenCalledWith({
        data: {
          event_type: "availability.updated",
          payload: expect.objectContaining({
            room_type_id: VALID_UUID,
            date: "2026-01-15",
            available_count: 6,
            reason: "manual_adjustment",
          }),
        },
      });
    });
  });

  describe("POST /v1/availability/reserve", () => {
    const txMock = { inventory: { updateMany: jest.fn() } };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock)
      );
    });

    it("should reserve inventory across the stay dates", async () => {
      txMock.inventory.updateMany.mockResolvedValue({ count: 1 });

      const res = await request(app)
        .post("/v1/availability/reserve")
        .set(SERVICE_HEADERS)
        .send({
          room_type_id: VALID_UUID,
          check_in: "2026-10-01",
          check_out: "2026-10-04",
        });

      expect(res.status).toBe(200);
      expect(res.body.reserved).toBe(true);
      expect(txMock.inventory.updateMany).toHaveBeenCalledTimes(3);
    });

    it("should return 401 without service credentials", async () => {
      const res = await request(app).post("/v1/availability/reserve").send({
        room_type_id: VALID_UUID,
        check_in: "2026-10-01",
        check_out: "2026-10-02",
      });

      expect(res.status).toBe(401);
    });

    it("should return 409 when there is no availability", async () => {
      txMock.inventory.updateMany.mockResolvedValue({ count: 0 });

      const res = await request(app)
        .post("/v1/availability/reserve")
        .set(SERVICE_HEADERS)
        .send({
          room_type_id: VALID_UUID,
          check_in: "2026-10-01",
          check_out: "2026-10-02",
        });

      expect(res.status).toBe(409);
    });

    it("should return 400 with invalid body", async () => {
      const res = await request(app)
        .post("/v1/availability/reserve")
        .set(SERVICE_HEADERS)
        .send({ room_type_id: VALID_UUID, check_in: "2026-10-01" });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /v1/availability/release", () => {
    const txMock = { inventory: { updateMany: jest.fn() } };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(
        async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock)
      );
    });

    it("should release inventory across the stay dates", async () => {
      txMock.inventory.updateMany.mockResolvedValue({ count: 1 });

      const res = await request(app)
        .post("/v1/availability/release")
        .set(SERVICE_HEADERS)
        .send({
          room_type_id: VALID_UUID,
          check_in: "2026-10-01",
          check_out: "2026-10-04",
        });

      expect(res.status).toBe(200);
      expect(res.body.released).toBe(true);
      expect(txMock.inventory.updateMany).toHaveBeenCalledTimes(3);
    });

    it("should return 401 without service credentials", async () => {
      const res = await request(app).post("/v1/availability/release").send({
        room_type_id: VALID_UUID,
        check_in: "2026-10-01",
        check_out: "2026-10-04",
      });

      expect(res.status).toBe(401);
    });
  });
});
