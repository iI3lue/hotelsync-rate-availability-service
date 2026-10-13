import { AppError } from "../middleware/error-handler.js";
import type { AuthClaims } from "./auth.js";
import { fetchRoomType } from "./property-client.js";

/**
 * Alcance por hotel para escrituras sobre room types (inventario, tarifas,
 * reglas, bloqueos): SUPER_ADMIN en cualquiera, MANAGER solo en los room
 * types de su hotel. R&A no guarda hotel_id, así que se resuelve vía
 * Property Service. Fail-closed: si Property no responde, la escritura se
 * rechaza en vez de operar a ciegas.
 */
export async function requireRoomTypeScope(
  actor: AuthClaims,
  roomTypeId: string
): Promise<void> {
  if (actor.role === "SUPER_ADMIN") return;
  if (actor.role !== "MANAGER" || !actor.hotel_id) {
    throw new AppError(403, "Manager of this hotel required", "Forbidden");
  }
  const roomType = await fetchRoomType(roomTypeId);
  if (!roomType) {
    throw new AppError(
      404,
      `Room type with id ${roomTypeId} not found`,
      "Not Found"
    );
  }
  if (roomType.hotel_id !== actor.hotel_id) {
    throw new AppError(403, "Not allowed for this hotel", "Forbidden");
  }
}
