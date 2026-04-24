-- Library fines settings + fine tracking linked to billing charges

-- CreateEnum
CREATE TYPE "LibraryFineReason" AS ENUM ('LATE', 'LOST', 'UNCLAIMED_HOLD', 'MANUAL');

-- CreateEnum
CREATE TYPE "LibraryFineStatus" AS ENUM ('OPEN', 'WAIVED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "LibraryLateFineFrequency" AS ENUM ('PER_DAY', 'FLAT');

-- CreateTable
CREATE TABLE "LibraryFineSettings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "lateFineAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lostItemFineAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unclaimedHoldFineAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lateFineGraceDays" INTEGER NOT NULL DEFAULT 0,
    "lateFineFrequency" "LibraryLateFineFrequency" NOT NULL DEFAULT 'PER_DAY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryFineSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryFine" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "libraryItemId" TEXT,
    "checkoutId" TEXT,
    "holdReference" TEXT,
    "reason" "LibraryFineReason" NOT NULL,
    "status" "LibraryFineStatus" NOT NULL DEFAULT 'OPEN',
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waivedAt" TIMESTAMP(3),
    "waivedById" TEXT,
    "billingChargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryFine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LibraryFineSettings_schoolId_key" ON "LibraryFineSettings"("schoolId");

-- CreateIndex
CREATE INDEX "LibraryFineSettings_schoolId_idx" ON "LibraryFineSettings"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryFine_billingChargeId_key" ON "LibraryFine"("billingChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryFine_checkoutId_reason_key" ON "LibraryFine"("checkoutId", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryFine_schoolId_holdReference_reason_key" ON "LibraryFine"("schoolId", "holdReference", "reason");

-- CreateIndex
CREATE INDEX "LibraryFine_schoolId_status_assessedAt_idx" ON "LibraryFine"("schoolId", "status", "assessedAt");

-- CreateIndex
CREATE INDEX "LibraryFine_studentId_status_assessedAt_idx" ON "LibraryFine"("studentId", "status", "assessedAt");

-- CreateIndex
CREATE INDEX "LibraryFine_libraryItemId_idx" ON "LibraryFine"("libraryItemId");

-- CreateIndex
CREATE INDEX "LibraryFine_checkoutId_idx" ON "LibraryFine"("checkoutId");

-- AddForeignKey
ALTER TABLE "LibraryFineSettings" ADD CONSTRAINT "LibraryFineSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryFine" ADD CONSTRAINT "LibraryFine_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryFine" ADD CONSTRAINT "LibraryFine_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryFine" ADD CONSTRAINT "LibraryFine_libraryItemId_fkey" FOREIGN KEY ("libraryItemId") REFERENCES "LibraryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryFine" ADD CONSTRAINT "LibraryFine_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "LibraryLoan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryFine" ADD CONSTRAINT "LibraryFine_waivedById_fkey" FOREIGN KEY ("waivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryFine" ADD CONSTRAINT "LibraryFine_billingChargeId_fkey" FOREIGN KEY ("billingChargeId") REFERENCES "BillingCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
