-- Library System v1 foundation

-- CreateEnum
CREATE TYPE "LibraryItemStatus" AS ENUM ('AVAILABLE', 'CHECKED_OUT', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LibraryLoanStatus" AS ENUM ('ACTIVE', 'RETURNED', 'LOST', 'OVERDUE');

-- CreateTable
CREATE TABLE "LibraryItem" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "isbn" TEXT,
    "barcode" TEXT,
    "category" TEXT,
    "status" "LibraryItemStatus" NOT NULL DEFAULT 'AVAILABLE',
    "totalCopies" INTEGER NOT NULL DEFAULT 1,
    "availableCopies" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryLoan" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "checkedOutByUserId" TEXT NOT NULL,
    "checkoutDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "receivedByUserId" TEXT,
    "status" "LibraryLoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryLoan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LibraryItem_schoolId_barcode_key" ON "LibraryItem"("schoolId", "barcode");

-- CreateIndex
CREATE INDEX "LibraryItem_schoolId_status_idx" ON "LibraryItem"("schoolId", "status");

-- CreateIndex
CREATE INDEX "LibraryItem_schoolId_category_idx" ON "LibraryItem"("schoolId", "category");

-- CreateIndex
CREATE INDEX "LibraryLoan_schoolId_status_dueDate_idx" ON "LibraryLoan"("schoolId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "LibraryLoan_studentId_status_dueDate_idx" ON "LibraryLoan"("studentId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "LibraryLoan_itemId_status_idx" ON "LibraryLoan"("itemId", "status");

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LibraryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_checkedOutByUserId_fkey" FOREIGN KEY ("checkedOutByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
