# HotelSync — Rate & Availability Service

Microservicio de inventario diario, tarifas y reglas de precio. Responde consultas de disponibilidad, reserva y libera inventario de forma atómica para Booking, y mantiene una caché Redis de solo lectura.

- **Producción:** https://hotelsync-rate-availability-service.onrender.com
- **Puerto local:** 3002
- **Base de datos:** `rate_availability_db` (PostgreSQL 16) + Redis opcional

## Responsabilidad

| Hace | No hace |
| --- | --- |
| Inventario por tipo de habitación y fecha | Crear reservas ni cobrar |
| Reserva/liberación atómica de unidades | Gestionar huéspedes o check-in |
| Tarifas, reglas de precio y bloqueos | Ser dueño del catálogo de hoteles |
| Cache-aside de disponibilidad y tarifas en Redis | Conocer políticas de cancelación |

## Tecnologías

Node.js ≥20 · TypeScript · Express · Prisma · PostgreSQL 16 · Zod · Redis (cache opcional) · RabbitMQ (outbox + consumidor de eventos).

## Arquitectura interna

`Route → Controller → Service → Prisma`, con validación Zod y `AppError`. La reserva usa transacciones y claves de aplicación (`AppliedKey`) para que reintentos de Booking sean idempotentes. Los eventos de cambio (`availability.updated`, `rate.updated`) se escriben en `EventOutbox`; el consumidor de `physical-room.created` da de alta inventario cuando Property crea una habitación.

## Endpoints

| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| GET | `/health` | — | Estado del servicio |
| GET | `/v1/availability?room_type_id&date` | — | Disponibilidad de un día |
| GET | `/v1/availability/range?room_type_id&from&to` | — | Disponibilidad por rango |
| PUT | `/v1/availability/inventory` | JWT + MANAGER / SUPER_ADMIN | Fija inventario de un día |
| POST | `/v1/availability/reserve` | `x-service-key` | Reserva unidades (Booking) |
| POST | `/v1/availability/release` | `x-service-key` | Libera unidades (cancelación/compensación) |
| GET | `/v1/rates?room_type_id&from&to` | — | Tarifas del rango |
| POST | `/v1/rates` | JWT + MANAGER / SUPER_ADMIN | Crea tarifa |
| PUT | `/v1/rate-rules` | JWT + MANAGER / SUPER_ADMIN | Upsert de regla de precio |
| GET | `/v1/rate-rules?room_type_id` | — | Reglas del tipo de habitación |
| POST | `/v1/blocks` | JWT + MANAGER / SUPER_ADMIN | Bloquea/desbloquea inventario |

## Modelo de datos

Tablas: `Inventory`, `Rate`, `RateRule`, `ProcessedEvent`, `AppliedKey`, `EventOutbox`.

Migraciones en `prisma/migrations` (4). Seed: inventario inicial para 9 tipos de habitación con unidades y precios base (p. ej. 10 unidades a 8500, 8 a 15000, 6 a 18500).

## Comunicación

- **Consume:** `physical-room.created` (de Property) → crea/actualiza inventario.
- **Publica:** `availability.updated` y `rate.updated` vía outbox; los usa Channel Manager para proyectar disponibilidad y tarifas.
- **REST entrante:** Booking llama `POST /v1/availability/reserve` y `/release` con `x-service-key`.

## Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `NODE_ENV` | No | `development` / `production` |
| `PORT` | No | Puerto HTTP (default 3002) |
| `DATABASE_URL` | Sí | PostgreSQL de `rate_availability_db` |
| `DIRECT_URL` | No | Conexión directa prevista para migraciones |
| `AUTH_JWT_SECRET` | Sí | HS256 compartido con user-service |
| `SERVICE_API_KEY` | Sí | Clave interna Booking → R&A (`x-service-key`) |
| `REDIS_URL` | No | Sin ella la caché se deshabilita y el servicio opera igual |
| `RATE_CACHE_AVAIL_TTL` | No | TTL de disponibilidad en segundos (default 60) |
| `RATE_CACHE_RATES_TTL` | No | TTL de tarifas en segundos (default 300) |
| `RABBITMQ_URL` | No | Sin ella los eventos quedan `pending` |
| `PROPERTY_SERVICE_URL` | No | Base de Property si se requiere consulta directa |

Copiar `.env.example` a `.env` y completar los valores.

## Ejecución local

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run seed
npm run dev                 # http://localhost:3002
```

## Despliegue

Render (Oregon, free): build `npm ci && npx prisma generate && npm run build`; start `npx prisma migrate deploy && npm start`; Neon `rate_availability_db`. Redis es opcional (Render Key Value). El plan free duerme a los 15 minutos.

## Pruebas y verificación

```bash
npm test
npm run lint
curl "https://hotelsync-rate-availability-service.onrender.com/v1/availability?room_type_id=<uuid>&date=2026-10-20"
```

## Respaldo de base de datos

```bash
pg_dump "$DATABASE_URL" -Fc -f rate_availability_db.dump
pg_restore --clean --if-exists -d "$DATABASE_URL" rate_availability_db.dump
```

## Estructura

```
src/{routes,controllers,services,validators,middleware,lib}
prisma/{schema.prisma,seed.ts,migrations}
tests/
```
