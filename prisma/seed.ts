import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  await prisma.user.upsert({
    where: { email: "admin@test.com" },
    update: {
      username: "admin1",
      passwordHash,
      role: UserRole.ADMIN,
    },
    create: {
      username: "admin1",
      email: "admin@test.com",
      passwordHash,
      role: UserRole.ADMIN,
      firstName: "Admin",
      lastName: "User",
    },
  });

  console.log("✅ Test user ready");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });