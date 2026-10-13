import { requireRoomTypeScope } from "../../src/lib/room-scope.js";
import { fetchRoomType } from "../../src/lib/property-client.js";
import type { AuthClaims } from "../../src/lib/auth.js";
import { AppError } from "../../src/middleware/error-handler.js";

jest.mock("../../src/lib/property-client.js", () => ({
  __esModule: true,
  fetchRoomType: jest.fn(),
}));

const mockFetchRoomType = fetchRoomType as jest.Mock;

function actor(overrides: Partial<AuthClaims> = {}): AuthClaims {
  return {
    sub: "user-1",
    email: "manager@example.com",
    email_verified: true,
    role: "MANAGER",
    hotel_id: "hotel-a",
    scope: "hotel",
    iss: "hotelsync",
    aud: "hotelsync-api",
    iat: 0,
    exp: 9999999999,
    ...overrides,
  };
}

describe("requireRoomTypeScope", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("SUPER_ADMIN passes without calling Property", async () => {
    await expect(
      requireRoomTypeScope(actor({ role: "SUPER_ADMIN", hotel_id: null }), "rt-1")
    ).resolves.toBeUndefined();
    expect(mockFetchRoomType).not.toHaveBeenCalled();
  });

  it("MANAGER of the same hotel passes", async () => {
    mockFetchRoomType.mockResolvedValue({
      room_type_id: "rt-1",
      hotel_id: "hotel-a",
      name: "Doble",
      capacity: 2,
      base_rate: 100,
    });

    await expect(requireRoomTypeScope(actor(), "rt-1")).resolves.toBeUndefined();
    expect(mockFetchRoomType).toHaveBeenCalledWith("rt-1");
  });

  it("MANAGER of another hotel gets 403", async () => {
    mockFetchRoomType.mockResolvedValue({
      room_type_id: "rt-1",
      hotel_id: "hotel-b",
      name: "Doble",
      capacity: 2,
      base_rate: 100,
    });

    const err: AppError = await requireRoomTypeScope(actor(), "rt-1").catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });

  it("missing room type gets 404", async () => {
    mockFetchRoomType.mockResolvedValue(null);

    const err: AppError = await requireRoomTypeScope(actor(), "rt-missing").catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
  });

  it("Property outage fails closed (no silent allow)", async () => {
    mockFetchRoomType.mockRejectedValue(
      new AppError(502, "Property Service unavailable", "Bad Gateway")
    );

    const err: AppError = await requireRoomTypeScope(actor(), "rt-1").catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(502);
  });

  it("non-manager roles get 403", async () => {
    const err: AppError = await requireRoomTypeScope(
      actor({ role: "RECEPTIONIST" }),
      "rt-1"
    ).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(mockFetchRoomType).not.toHaveBeenCalled();
  });
});
