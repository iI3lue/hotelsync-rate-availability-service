-- CreateTable
CREATE TABLE "inventory" (
    "inventory_id" UUID NOT NULL,
    "room_type_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "available_count" INTEGER NOT NULL,
    "blocked_count" INTEGER NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("inventory_id")
);

-- CreateTable
CREATE TABLE "rates" (
    "rate_id" UUID NOT NULL,
    "room_type_id" UUID NOT NULL,
    "report_date" DATE NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "rates_pkey" PRIMARY KEY ("rate_id")
);

-- CreateTable
CREATE TABLE "rate_rules" (
    "rule_id" UUID NOT NULL,
    "room_type_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "multiplier" DECIMAL(5,2) NOT NULL,
    "min_stay" INTEGER NOT NULL,

    CONSTRAINT "rate_rules_pkey" PRIMARY KEY ("rule_id")
);

-- CreateIndex
CREATE INDEX "inventory_room_type_id_date_idx" ON "inventory"("room_type_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_room_type_id_date_key" ON "inventory"("room_type_id", "date");
