-- CreateTable
CREATE TABLE "processed_events" (
    "event_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id")
);
