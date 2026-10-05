import express from "express";
import { errorHandler } from "./middleware/error-handler.js";
import availabilityRouter from "./routes/availability.js";
import ratesRouter from "./routes/rates.js";
import rateRulesRouter from "./routes/rate-rules.js";
import blocksRouter from "./routes/blocks.js";
import prisma from "./lib/prisma.js";
import { cachePing } from "./lib/cache.js";
import { startPhysicalRoomConsumer } from "./lib/physical-room-consumer.js";

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

// Health check con dependencias (documento de arquitectura §11.3).
// La caché es accesoria (diagrama: conector punteado): se reporta pero
// nunca marca degraded; solo la base de datos es crítica.
app.get("/health", async (_req, res) => {
  const checks: Record<string, string> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "up";
  } catch {
    checks.database = "down";
  }
  checks.cache = await cachePing();
  const degraded = checks.database === "down";
  res.status(degraded ? 503 : 200).json({
    status: degraded ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    service: "rate-availability-service",
    checks,
  });
});

// API routes
app.use("/v1/availability", availabilityRouter);
app.use("/v1/rates", ratesRouter);
app.use("/v1/rate-rules", rateRulesRouter);
app.use("/v1/blocks", blocksRouter);

// Error handler
app.use(errorHandler);

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Rate & Availability Service running on port ${PORT}`);
  });

  if (process.env.RABBITMQ_URL) {
    startPhysicalRoomConsumer().catch((err) =>
      console.error("[consumer] no se pudo iniciar", err)
    );
    console.log("RabbitMQ consumer started (physical-room.created)");
  }
}

export default app;
