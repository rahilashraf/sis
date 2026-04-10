-- CreateTable
CREATE TABLE "ReportingPeriod" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportingPeriod_schoolId_schoolYearId_key_key" ON "ReportingPeriod"("schoolId", "schoolYearId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ReportingPeriod_schoolId_schoolYearId_order_key" ON "ReportingPeriod"("schoolId", "schoolYearId", "order");

-- AddForeignKey
ALTER TABLE "ReportingPeriod"
ADD CONSTRAINT "ReportingPeriod_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingPeriod"
ADD CONSTRAINT "ReportingPeriod_schoolYearId_fkey"
FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
