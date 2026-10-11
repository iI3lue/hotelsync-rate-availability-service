import {
  handlePhysicalRoomCreated,
  handlePropertyEvent,
} from "../../src/lib/physical-room-consumer.js";

jest.mock("../../src/lib/prisma.js", () => ({ __esModule: true, default: {} }));
jest.mock("../../src/lib/cache.js", () => ({
  availKey: (roomTypeId: string, date: string) => `ra:avail:${roomTypeId}:${date}`,
  cacheDel: jest.fn().mockResolvedValue(undefined),
}));

import { cacheDel } from "../../src/lib/cache.js";

const EVENT = {
  event_id: "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
  physical_room_id: "b1b2c3d4-e5f6-4890-abcd-ef1234567890",
  hotel_id: "c1b2c3d4-e5f6-4890-abcd-ef1234567890",
  room_type_id: "d1b2c3d4-e5f6-4890-abcd-ef1234567890",
  available_from: "2025-12-20",
};

function makeDb() {
  const transaction = {
    processedEvent: { create: jest.fn().mockResolvedValue({}) },
    inventory: {
      upsert: jest.fn().mockResolvedValue({ available_count: 1, blocked_count: 0 }),
    },
    eventOutbox: { create: jest.fn().mockResolvedValue({}) },
  };
  const db = {
    processedEvent: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
      callback(transaction)
    ),
  };
  return { db: db as any, tx: transaction };
}

describe("physical-room.created consumer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("adds one available room for each day in the next 365-day horizon", async () => {
    const { db, tx } = makeDb();

    await handlePhysicalRoomCreated(
      db,
      EVENT,
      new Date("2026-01-01T12:00:00.000Z")
    );

    expect(tx.processedEvent.create).toHaveBeenCalledWith({
      data: { event_id: EVENT.event_id, event_type: "physical-room.created" },
    });
    expect(tx.inventory.upsert).toHaveBeenCalledTimes(365);
    expect(tx.eventOutbox.create).toHaveBeenCalledTimes(365);
    expect(tx.eventOutbox.create).toHaveBeenNthCalledWith(1, {
      data: {
        event_type: "availability.updated",
        payload: {
          room_type_id: EVENT.room_type_id,
          date: "2026-01-01",
          available_count: 1,
          blocked_count: 0,
          reason: "physical_room_created",
          source_event_id: EVENT.event_id,
          occurred_at: "2026-01-01T12:00:00.000Z",
        },
      },
    });
    expect(tx.inventory.upsert).toHaveBeenNthCalledWith(1, {
      where: {
        room_type_id_date: {
          room_type_id: EVENT.room_type_id,
          date: new Date("2026-01-01T00:00:00.000Z"),
        },
      },
      create: {
        room_type_id: EVENT.room_type_id,
        date: new Date("2026-01-01T00:00:00.000Z"),
        available_count: 1,
        blocked_count: 0,
      },
      update: { available_count: { increment: 1 } },
    });
    expect(cacheDel).toHaveBeenCalledTimes(1);
    expect((cacheDel as jest.Mock).mock.calls[0]).toHaveLength(365);
    expect((cacheDel as jest.Mock).mock.calls[0][0]).toBe(
      `ra:avail:${EVENT.room_type_id}:2026-01-01`
    );
    expect((cacheDel as jest.Mock).mock.calls[0][364]).toBe(
      `ra:avail:${EVENT.room_type_id}:2026-12-31`
    );
  });

  it("starts a full 365-day inventory window on a future available_from", async () => {
    const { db, tx } = makeDb();

    await handlePhysicalRoomCreated(
      db,
      { ...EVENT, available_from: "2026-01-03" },
      new Date("2026-01-01T12:00:00.000Z")
    );

    expect(tx.inventory.upsert).toHaveBeenCalledTimes(365);
    expect(tx.inventory.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          room_type_id_date: {
            room_type_id: EVENT.room_type_id,
            date: new Date("2026-01-03T00:00:00.000Z"),
          },
        },
      })
    );
    expect(tx.inventory.upsert).toHaveBeenNthCalledWith(
      365,
      expect.objectContaining({
        where: {
          room_type_id_date: {
            room_type_id: EVENT.room_type_id,
            date: new Date("2027-01-02T00:00:00.000Z"),
          },
        },
      })
    );
  });

  it("does not add inventory or invalidate cache for a redelivered event", async () => {
    const { db, tx } = makeDb();
    db.processedEvent.findUnique.mockResolvedValue({ event_id: EVENT.event_id });

    await handlePhysicalRoomCreated(
      db,
      EVENT,
      new Date("2026-01-01T12:00:00.000Z")
    );

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.inventory.upsert).not.toHaveBeenCalled();
    expect(cacheDel).not.toHaveBeenCalled();
  });

  it("acknowledges a concurrent duplicate after the winning transaction commits", async () => {
    const { db, tx } = makeDb();
    db.processedEvent.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ event_id: EVENT.event_id });
    db.$transaction.mockRejectedValue({ code: "P2002" });

    await expect(
      handlePhysicalRoomCreated(db, EVENT, new Date("2026-01-01T12:00:00.000Z"))
    ).resolves.toBeUndefined();

    expect(tx.inventory.upsert).not.toHaveBeenCalled();
    expect(cacheDel).not.toHaveBeenCalled();
  });

  it("ignores unrelated property events", async () => {
    const { db } = makeDb();

    await handlePropertyEvent(db, "booking.created", {}, new Date("2026-01-01"));

    expect(db.processedEvent.findUnique).not.toHaveBeenCalled();
  });
});
