# hotelsync-rate-availability-service

Microservicio Rate & Availability de HotelSync: inventario por día, tarifas y caché Redis.

Extraído del monorepo HotelSync como repo autocontenido (un repo por microservicio).

## Stack

Node 20 · Express 4 · Prisma 6 (PostgreSQL) · Redis (ioredis, cache-aside) · TypeScript · Jest + ts-jest

## Variables de entorno

| Variable               | Uso                                             |
| ---------------------- | ----------------------------------------------- |
| `PORT`                 | Puerto HTTP (Render inyecta el suyo, ej. 10000) |
| `DATABASE_URL`         | Conexión **con pooling** para runtime           |
| `DIRECT_URL`           | Conexión **directa** solo para `migrate deploy` |
| `REDIS_URL`            | Redis (Render Key Value); vacío = sin caché     |
| `RATE_CACHE_AVAIL_TTL` | TTL caché disponibilidad en segundos (60)       |
| `RATE_CACHE_RATES_TTL` | TTL caché tarifas en segundos (300)             |
| `NODE_ENV`             | `development` / `production`                    |

Ver `.env.example`. Sin `REDIS_URL` el servicio opera igual (caché deshabilitada);
cualquier fallo de Redis degrada a DB: la caché nunca rompe un request.

## Endpoints destacados

- `GET /v1/availability?room_type_id=&date=` — disponibilidad de un día
- `GET /v1/availability/range?room_type_id=&from=&to=` — rango en un solo request (máx. 62 noches)

## Scripts

- `npm run dev` — desarrollo con recarga
- `npm run build` / `npm start` — compilación y arranque
- `npm run lint` — `tsc --noEmit`
- `npm test` — Jest (unit + integration; integración requiere DB)
- `npm run seed` — datos de ejemplo

## Health

`GET /health` → `{ status, checks: { database, cache } }`. Solo la DB marca degraded;
la caché se reporta pero nunca voltea el servicio.

## Despliegue (Render, plan free)

Build: `npm ci && npx prisma generate && npm run build`
Start: `npx prisma migrate deploy && npm start`
