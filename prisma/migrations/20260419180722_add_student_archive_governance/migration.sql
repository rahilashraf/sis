-- AlterTable
ALTER TABLE "User"
ADD COLUMN "archiveReason" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3);
