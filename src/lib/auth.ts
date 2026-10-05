import { createHmac, timingSafeEqual } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { AppError } from "../middleware/error-handler.js";

export interface AuthClaims {
  sub: string;
  email: string;
  email_verified: boolean;
  role: string;
  hotel_id: string | null;
  scope: "global" | "hotel";
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export const TOKEN_ISSUER = "hotelsync";
export const TOKEN_AUDIENCE = "hotelsync-api";

/**
 * Verificacion local de access tokens HS256 (misma firma que user-service).
 * Duplicado intencional por database-per-service: la implementacion canonica
 * vive en `services/user-service/src/lib/tokens.ts`.
 */
function getSecret(): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "test") {
    return "test-secret-for-unit-tests-only-32b!";
  }
  throw new Error("AUTH_JWT_SECRET must be set (min 32 chars)");
}

export function verifyAccessToken(token: string): AuthClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AppError(401, "Invalid token", "Unauthorized");
  }
  const [header, payload, signature] = parts;
  let decodedHeader: { alg?: string };
  try {
    decodedHeader = JSON.parse(
      Buffer.from(header, "base64url").toString("utf8")
    );
  } catch {
    throw new AppError(401, "Invalid token", "Unauthorized");
  }
  if (decodedHeader.alg !== "HS256") {
    throw new AppError(401, "Invalid token", "Unauthorized");
  }
  const expected = createHmac("sha256", getSecret())
    .update(`${header}.${payload}`)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AppError(401, "Invalid token", "Unauthorized");
  }
  const claims = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8")
  ) as AuthClaims;
  if (
    !claims.sub ||
    !claims.exp ||
    claims.iss !== TOKEN_ISSUER ||
    claims.aud !== TOKEN_AUDIENCE ||
    Date.now() / 1000 > claims.exp
  ) {
    throw new AppError(401, "Token expired", "Unauthorized");
  }
  return claims;
}

/**
 * Autenticación servicio-a-servicio: clave compartida solo entre backends.
 * Nunca reutiliza el JWT de usuario ni viaja al navegador.
 */
export function verifyServiceKey(req: Request): boolean {
  const expected = process.env.SERVICE_API_KEY;
  if (!expected) return false;
  const header = req.headers["x-service-key"];
  const provided = Array.isArray(header) ? header[0] : header;
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Solo permite el caller backend configurado; nunca acepta JWT de usuario. */
export function requireServiceKey(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!verifyServiceKey(req)) {
    next(new AppError(401, "Invalid service credentials", "Unauthorized"));
    return;
  }
  try {
    next();
  } catch (err) {
    next(err);
  }
}

export interface AuthRequest extends Request {
  auth?: AuthClaims;
}

/** Exige un access token valido y lo deja en `req.auth`. */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new AppError(401, "Missing bearer token", "Unauthorized");
    }
    (req as AuthRequest).auth = verifyAccessToken(
      header.slice("Bearer ".length).trim()
    );
    next();
  } catch (err) {
    next(err);
  }
}

/** Exige uno de los roles indicados (requiere `requireAuth` antes). */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = (req as AuthRequest).auth;
    if (!auth) {
      next(new AppError(401, "Missing bearer token", "Unauthorized"));
      return;
    }
    if (!roles.includes(auth.role)) {
      next(new AppError(403, "Insufficient role", "Forbidden"));
      return;
    }
    next();
  };
}
