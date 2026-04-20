-- CreateTable
CREATE TABLE "BillingCategory" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingCategory_schoolId_isActive_idx" ON "BillingCategory"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCategory_schoolId_name_key" ON "BillingCategory"("schoolId", "name");

-- AddForeignKey
ALTER TABLE "BillingCategory" ADD CONSTRAINT "BillingCategory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
