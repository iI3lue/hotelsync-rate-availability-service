import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding rate & availability database...");

  // Sample room type IDs (matching property service UUIDs)
  const roomTypeId1 = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const roomTypeId2 = "b2c3d4e5-f6a7-8901-bcde-f12345678901";

  // Create inventory for the next 7 days
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    await prisma.inventory.upsert({
      where: { room_type_id_date: { room_type_id: roomTypeId1, date } },
      update: {},
      create: {
        room_type_id: roomTypeId1,
        date,
        available_count: 10,
        blocked_count: 0,
      },
    });

    await prisma.inventory.upsert({
      where: { room_type_id_date: { room_type_id: roomTypeId2, date } },
      update: {},
      create: {
        room_type_id: roomTypeId2,
        date,
        available_count: 5,
        blocked_count: 0,
      },
    });
  }

  // Create rates
  await prisma.rate.createMany({
    data: [
      { room_type_id: roomTypeId1, report_date: today, price: 8500.0 },
      { room_type_id: roomTypeId2, report_date: today, price: 15000.0 },
    ],
  });

  // Create a sample rate rule
  const startDate = new Date(today);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 30);

  await prisma.rateRule.create({
    data: {
      room_type_id: roomTypeId1,
      start_date: startDate,
      end_date: endDate,
      multiplier: 1.2,
      min_stay: 2,
    },
  });

  console.log("Seed data created successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
