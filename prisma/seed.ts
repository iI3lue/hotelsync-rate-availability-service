import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mismos IDs que en Property Service para garantizar alineación absoluta
const ROOM_TYPES = [
  { room_type_id: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1", units: 10, price: 8500.0 },
  { room_type_id: "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2", units: 8, price: 15000.0 },
  { room_type_id: "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4", units: 6, price: 18500.0 },
  { room_type_id: "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3", units: 8, price: 12000.0 },
  { room_type_id: "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5", units: 5, price: 22000.0 },
  { room_type_id: "f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6", units: 6, price: 16500.0 },
  { room_type_id: "a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7", units: 4, price: 28000.0 },
  { room_type_id: "b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8", units: 6, price: 17500.0 },
  { room_type_id: "c9c9c9c9-c9c9-4c9c-8c9c-c9c9c9c9c9c9", units: 4, price: 26000.0 },
  { room_type_id: "da1da1da-1da1-4da1-8da1-da1da1da1da1", units: 10, price: 14000.0 },
  { room_type_id: "eb2eb2eb-2eb2-4eb2-8eb2-eb2eb2eb2eb2", units: 6, price: 24500.0 },
  { room_type_id: "fc3fc3fc-3fc3-4fc3-8fc3-fc3fc3fc3fc3", units: 8, price: 19000.0 },
  { room_type_id: "ad4ad4ad-4ad4-4ad4-8ad4-ad4ad4ad4ad4", units: 4, price: 35000.0 },
];

const HORIZON_DAYS = 365;

async function main() {
  console.log("Seeding rate & availability database (non-destructive upsert)...");

  // Nunca borramos: el inventario existente refleja reservas reales
  // (available_count ya descontado). Solo completamos lo faltante.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inventoryRows: Array<{
    room_type_id: string;
    date: Date;
    available_count: number;
    blocked_count: number;
  }> = [];

  let createdRates = 0;
  let createdRules = 0;

  for (const roomType of ROOM_TYPES) {
    for (let i = 0; i < HORIZON_DAYS; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      inventoryRows.push({
        room_type_id: roomType.room_type_id,
        date,
        available_count: roomType.units,
        blocked_count: 0,
      });
    }

    const existingRate = await prisma.rate.findFirst({
      where: { room_type_id: roomType.room_type_id, report_date: today },
      select: { rate_id: true },
    });
    if (!existingRate) {
      await prisma.rate.create({
        data: {
          room_type_id: roomType.room_type_id,
          report_date: today,
          price: roomType.price,
        },
      });
      createdRates++;
    }

    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 30);
    const existingRule = await prisma.rateRule.findFirst({
      where: { room_type_id: roomType.room_type_id, start_date: today },
      select: { rule_id: true },
    });
    if (!existingRule) {
      await prisma.rateRule.create({
        data: {
          room_type_id: roomType.room_type_id,
          start_date: today,
          end_date: endDate,
          multiplier: 1.15,
          min_stay: 1,
        },
      });
      createdRules++;
    }
  }

  // skipDuplicates: las fechas ya existentes (con stock real) no se tocan.
  // NOTA: no usamos upsert aquí a propósito — un upsert pisaría
  // available_count y regeneraría cupos ya vendidos (sobreventa).
  let createdInventory = 0;
  const BATCH_SIZE = 1000;
  for (let i = 0; i < inventoryRows.length; i += BATCH_SIZE) {
    const chunk = inventoryRows.slice(i, i + BATCH_SIZE);
    const res = await prisma.inventory.createMany({
      data: chunk,
      skipDuplicates: true,
    });
    createdInventory += res.count;
  }

  console.log(
    `R&A seed completed (upsert): ${ROOM_TYPES.length} room types x ${HORIZON_DAYS} days — ${createdInventory} new inventory rows, ${createdRates} rates, ${createdRules} rules (existing stock preserved).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
