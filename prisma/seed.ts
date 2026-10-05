import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mismos IDs que el seed de Property: los cupos nacen alineados con el
// catalogo fisico (10 Standard, 5 Deluxe, 5 Beach) durante 365 dias.
const ROOM_TYPES = [
  {
    room_type_id: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1",
    units: 10,
    price: 8500.0,
  },
  {
    room_type_id: "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2",
    units: 5,
    price: 15000.0,
  },
  {
    room_type_id: "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3",
    units: 5,
    price: 12000.0,
  },
];

const HORIZON_DAYS = 365;

async function main() {
  console.log("Seeding rate & availability database...");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const roomType of ROOM_TYPES) {
    const probe = new Date(today);
    const existing = await prisma.inventory.findUnique({
      where: {
        room_type_id_date: { room_type_id: roomType.room_type_id, date: probe },
      },
      select: { inventory_id: true },
    });

    for (let i = 0; i < HORIZON_DAYS; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      await prisma.inventory.upsert({
        where: { room_type_id_date: { room_type_id: roomType.room_type_id, date } },
        update: {},
        create: {
          room_type_id: roomType.room_type_id,
          date,
          available_count: roomType.units,
          blocked_count: 0,
        },
      });
    }

    if (!existing) {
      await prisma.rate.create({
        data: {
          room_type_id: roomType.room_type_id,
          report_date: today,
          price: roomType.price,
        },
      });
    }
  }

  const ruleProbe = await prisma.rateRule.findFirst({
    where: { room_type_id: ROOM_TYPES[0].room_type_id },
    select: { rule_id: true },
  });
  if (!ruleProbe) {
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 30);
    await prisma.rateRule.create({
      data: {
        room_type_id: ROOM_TYPES[0].room_type_id,
        start_date: today,
        end_date: endDate,
        multiplier: 1.2,
        min_stay: 2,
      },
    });
  }

  console.log(
    `Seed data created: ${ROOM_TYPES.length} room types x ${HORIZON_DAYS} days.`
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
