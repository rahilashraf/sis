require("dotenv/config");
const bcrypt = require("bcrypt");
const { PrismaClient, UserRole } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function getEnv(name, fallback) {
  const value = process.env[name];

  if (value) {
    return value;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`${name} is required`);
}

function getOwnerPassword() {
  const configuredPassword = process.env.SEED_OWNER_PASSWORD;

  if (configuredPassword) {
    return configuredPassword;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SEED_OWNER_PASSWORD is required in production");
  }

  return "ChangeMe123!";
}

async function main() {
  const schoolName = getEnv("SEED_SCHOOL_NAME", "Demo School");
  const schoolShortName = process.env.SEED_SCHOOL_SHORT_NAME || "DEMO";
  const ownerUsername = getEnv("SEED_OWNER_USERNAME", "owner");
  const ownerEmail = getEnv("SEED_OWNER_EMAIL", "owner@example.com");
  const ownerFirstName = getEnv("SEED_OWNER_FIRST_NAME", "System");
  const ownerLastName = getEnv("SEED_OWNER_LAST_NAME", "Owner");
  const schoolYearName = getEnv("SEED_SCHOOL_YEAR_NAME", "2025-2026");
  const schoolYearStartDate = new Date(
    getEnv("SEED_SCHOOL_YEAR_START_DATE", "2025-09-01"),
  );
  const schoolYearEndDate = new Date(
    getEnv("SEED_SCHOOL_YEAR_END_DATE", "2026-06-30"),
  );
  const ownerPasswordHash = await bcrypt.hash(getOwnerPassword(), 10);

  const school =
    (await prisma.school.findFirst({
      where: schoolShortName
        ? {
            shortName: schoolShortName,
          }
        : {
            name: schoolName,
          },
      select: {
        id: true,
      },
    })) ||
    (await prisma.school.create({
      data: {
        name: schoolName,
        shortName: schoolShortName || null,
      },
      select: {
        id: true,
      },
    }));

  const owner = await prisma.user.upsert({
    where: {
      username: ownerUsername,
    },
    update: {
      email: ownerEmail,
      firstName: ownerFirstName,
      lastName: ownerLastName,
      role: UserRole.OWNER,
      isActive: true,
      passwordHash: ownerPasswordHash,
    },
    create: {
      username: ownerUsername,
      email: ownerEmail,
      passwordHash: ownerPasswordHash,
      firstName: ownerFirstName,
      lastName: ownerLastName,
      role: UserRole.OWNER,
    },
    select: {
      id: true,
    },
  });

  await prisma.userSchoolMembership.upsert({
    where: {
      userId_schoolId: {
        userId: owner.id,
        schoolId: school.id,
      },
    },
    update: {
      isActive: true,
    },
    create: {
      userId: owner.id,
      schoolId: school.id,
    },
  });

  await prisma.schoolYear.upsert({
    where: {
      schoolId_name: {
        schoolId: school.id,
        name: schoolYearName,
      },
    },
    update: {
      startDate: schoolYearStartDate,
      endDate: schoolYearEndDate,
      isActive: true,
    },
    create: {
      schoolId: school.id,
      name: schoolYearName,
      startDate: schoolYearStartDate,
      endDate: schoolYearEndDate,
      isActive: true,
    },
  });
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });