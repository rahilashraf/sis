const { PrismaClient, UserRole } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const connectionString =
  "postgresql://sis_user:sis_password@127.0.0.1:5433/sis_db?sslmode=disable";

const adapter = new PrismaPg({ connectionString });

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  console.log("Starting seed...");

  const school = await prisma.school.create({
    data: {
      name: "IOK Islamic School",
      shortName: "IOK",
    },
  });

  const owner = await prisma.user.create({
    data: {
      username: "owner",
      email: "owner@iok.com",
      passwordHash: "hashed_password_here",
      firstName: "System",
      lastName: "Owner",
      role: UserRole.OWNER,
    },
  });

  await prisma.userSchoolMembership.create({
    data: {
      userId: owner.id,
      schoolId: school.id,
    },
  });

  await prisma.schoolYear.create({
    data: {
      schoolId: school.id,
      name: "2025-2026",
      startDate: new Date("2025-09-01"),
      endDate: new Date("2026-06-30"),
      isActive: true,
    },
  });

  console.log("Seed complete ✅");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });