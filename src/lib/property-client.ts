import { AppError } from "../middleware/error-handler.js";

const PROPERTY_API =
  process.env.PROPERTY_SERVICE_URL || "http://localhost:3001/v1";

export interface RoomTypeRef {
  room_type_id: string;
  hotel_id: string;
  name: string;
  capacity: number;
  base_rate: number;
}

/**
 * Cliente HTTP hacia Property Service: resuelve a qué hotel pertenece un
 * room_type (R&A no guarda hotel_id por database-per-service).
 * Timeout de 3s por llamada (documento de arquitectura §6.5).
 */
export async function fetchRoomType(id: string): Promise<RoomTypeRef | null> {
  let res: Response;
  try {
    res = await fetch(
      `${PROPERTY_API}/room-types/${encodeURIComponent(id)}`,
      {
        signal: AbortSignal.timeout(3000),
      }
    );
  } catch {
    throw new AppError(
      502,
      "Property Service unavailable",
      "Bad Gateway"
    );
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new AppError(
      502,
      `Property Service error: ${res.status}`,
      "Bad Gateway"
    );
  }

  return (await res.json()) as RoomTypeRef;
}
