import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "";
export const AVAIL_TTL_SECONDS = Number(
  process.env.RATE_CACHE_AVAIL_TTL || 60
);
export const RATES_TTL_SECONDS = Number(
  process.env.RATE_CACHE_RATES_TTL || 300
);

export const availKey = (roomTypeId: string, date: string): string =>
  `ra:avail:${roomTypeId}:${date}`;

export const ratesKey = (roomTypeId: string): string =>
  `ra:rates:${roomTypeId}`;

let client: Redis | null = null;
let warned = false;

function warnOnce(message: string): void {
  if (!warned) {
    warned = true;
    console.warn(`[cache] ${message}`);
  }
}

/**
 * Cliente Redis perezoso. Sin REDIS_URL el servicio opera igual
 * (caché deshabilitada, mismo patrón que el broker `not_configured`).
 * Cualquier fallo de Redis degrada a DB: la caché nunca rompe un request.
 */
function getClient(): Redis | null {
  if (!REDIS_URL) return null;
  if (!client) {
    client = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });
    client.on("error", (err) => warnOnce(`redis no disponible: ${err.message}`));
  }
  return client;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    warnOnce(`get falló (${key}): ${(err as Error).message}`);
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    warnOnce(`set falló (${key}): ${(err as Error).message}`);
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const redis = getClient();
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    warnOnce(`del falló: ${(err as Error).message}`);
  }
}

export async function cachePing(): Promise<"up" | "down" | "not_configured"> {
  const redis = getClient();
  if (!redis) return "not_configured";
  try {
    const pong = await redis.ping();
    return pong === "PONG" ? "up" : "down";
  } catch {
    return "down";
  }
}
