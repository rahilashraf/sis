-- CreateEnum
CREATE TYPE "BehaviorRecordType" AS ENUM ('POSITIVE', 'INCIDENT');

-- CreateEnum
CREATE TYPE "BehaviorRecordStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "BehaviorSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "BehaviorCategoryOption" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BehaviorCategoryOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BehaviorRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "incidentAt" TIMESTAMP(3) NOT NULL,
    "categoryOptionId" TEXT,
    "categoryName" TEXT NOT NULL,
    "severity" "BehaviorSeverity" NOT NULL,
    "type" "BehaviorRecordType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actionTaken" TEXT,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "parentContacted" BOOLEAN NOT NULL DEFAULT false,
    "status" "BehaviorRecordStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BehaviorRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BehaviorRecordAttachment" (
    "id" TEXT NOT NULL,
    "behaviorRecordId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BehaviorRecordAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BehaviorCategoryOption_schoolId_name_key" ON "BehaviorCategoryOption"("schoolId", "name");

-- CreateIndex
CREATE INDEX "BehaviorCategoryOption_schoolId_isActive_sortOrder_name_idx" ON "BehaviorCategoryOption"("schoolId", "isActive", "sortOrder", "name");

-- CreateIndex
CREATE INDEX "BehaviorRecord_studentId_incidentAt_idx" ON "BehaviorRecord"("studentId", "incidentAt");

-- CreateIndex
CREATE INDEX "BehaviorRecord_schoolId_incidentAt_idx" ON "BehaviorRecord"("schoolId", "incidentAt");

-- CreateIndex
CREATE INDEX "BehaviorRecord_status_incidentAt_idx" ON "BehaviorRecord"("status", "incidentAt");

-- CreateIndex
CREATE INDEX "BehaviorRecord_severity_incidentAt_idx" ON "BehaviorRecord"("severity", "incidentAt");

-- CreateIndex
CREATE INDEX "BehaviorRecord_type_incidentAt_idx" ON "BehaviorRecord"("type", "incidentAt");

-- CreateIndex
CREATE INDEX "BehaviorRecord_categoryName_idx" ON "BehaviorRecord"("categoryName");

-- CreateIndex
CREATE INDEX "BehaviorRecordAttachment_behaviorRecordId_createdAt_idx" ON "BehaviorRecordAttachment"("behaviorRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "BehaviorRecordAttachment_uploadedById_createdAt_idx" ON "BehaviorRecordAttachment"("uploadedById", "createdAt");

-- AddForeignKey
ALTER TABLE "BehaviorCategoryOption" ADD CONSTRAINT "BehaviorCategoryOption_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviorRecord" ADD CONSTRAINT "BehaviorRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviorRecord" ADD CONSTRAINT "BehaviorRecord_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviorRecord" ADD CONSTRAINT "BehaviorRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviorRecord" ADD CONSTRAINT "BehaviorRecord_categoryOptionId_fkey" FOREIGN KEY ("categoryOptionId") REFERENCES "BehaviorCategoryOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviorRecordAttachment" ADD CONSTRAINT "BehaviorRecordAttachment_behaviorRecordId_fkey" FOREIGN KEY ("behaviorRecordId") REFERENCES "BehaviorRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviorRecordAttachment" ADD CONSTRAINT "BehaviorRecordAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
