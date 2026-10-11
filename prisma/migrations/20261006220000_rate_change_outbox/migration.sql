-- Durable events for inventory/tariff changes that do not originate in Booking.
CREATE TABLE "event_outbox" (
    "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_type" VARCHAR(50) NOT NULL,
    "payload" JSON NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "event_outbox_status_created_at_idx"
    ON "event_outbox"("status", "created_at");
