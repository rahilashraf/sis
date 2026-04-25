-- Library holds for student self-service reservation workflow

-- CreateEnum
CREATE TYPE "LibraryHoldStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'FULFILLED');

-- CreateTable
CREATE TABLE "LibraryHold" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" "LibraryHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryHold_schoolId_status_createdAt_idx" ON "LibraryHold"("schoolId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LibraryHold_studentId_status_createdAt_idx" ON "LibraryHold"("studentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "LibraryHold_itemId_status_createdAt_idx" ON "LibraryHold"("itemId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "LibraryHold" ADD CONSTRAINT "LibraryHold_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryHold" ADD CONSTRAINT "LibraryHold_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LibraryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryHold" ADD CONSTRAINT "LibraryHold_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryHold" ADD CONSTRAINT "LibraryHold_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryHold" ADD CONSTRAINT "LibraryHold_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
