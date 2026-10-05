-- CreateTable
CREATE TABLE "applied_keys" (
    "key" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applied_keys_pkey" PRIMARY KEY ("key")
);
