-- CreateEnum
CREATE TYPE "IncidentLevel" AS ENUM ('MINOR', 'MAJOR');

-- CreateEnum
CREATE TYPE "IncidentAffectedPersonType" AS ENUM ('STUDENT', 'STAFF', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentWitnessRole" AS ENUM ('STAFF', 'STUDENT', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentFirstAidStatus" AS ENUM ('YES', 'NO', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "IncidentPostDestination" AS ENUM ('RETURNED_TO_CLASS_OR_WORK', 'HOME', 'HOSPITAL', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentJhscNotificationStatus" AS ENUM ('YES', 'NO', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "BehaviorRecord"
ADD COLUMN "incidentLevel" "IncidentLevel" NOT NULL DEFAULT 'MINOR';

-- Data backfill: all records are now incidents
UPDATE "BehaviorRecord"
SET "type" = 'INCIDENT'
WHERE "type" <> 'INCIDENT';

-- Data backfill: map legacy severity to incident level
UPDATE "BehaviorRecord"
SET "incidentLevel" = (
  CASE
    WHEN "severity" = 'HIGH' THEN 'MAJOR'
    ELSE 'MINOR'
  END
)::"IncidentLevel";

-- CreateTable
CREATE TABLE "BehaviorIncidentReport" (
    "id" TEXT NOT NULL,
    "behaviorRecordId" TEXT NOT NULL,
    "program" TEXT,
    "reporterName" TEXT,
    "reporterPhone" TEXT,
    "reporterRole" TEXT,
    "affectedPersonType" "IncidentAffectedPersonType",
    "affectedPersonName" TEXT,
    "affectedPersonAddress" TEXT,
    "affectedPersonDateOfBirth" TIMESTAMP(3),
    "affectedPersonPhone" TEXT,
    "firstAidStatus" "IncidentFirstAidStatus",
    "firstAidAdministeredBy" TEXT,
    "firstAidAdministeredByPhone" TEXT,
    "firstAidDetails" TEXT,
    "isIncidentTimeApproximate" BOOLEAN NOT NULL DEFAULT false,
    "postIncidentDestination" "IncidentPostDestination",
    "postIncidentDestinationOther" TEXT,
    "jhscNotificationStatus" "IncidentJhscNotificationStatus",
    "additionalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BehaviorIncidentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BehaviorIncidentWitness" (
    "id" TEXT NOT NULL,
    "behaviorIncidentReportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "role" "IncidentWitnessRole",
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BehaviorIncidentWitness_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BehaviorRecord_incidentLevel_incidentAt_idx" ON "BehaviorRecord"("incidentLevel", "incidentAt");

-- CreateIndex
CREATE UNIQUE INDEX "BehaviorIncidentReport_behaviorRecordId_key" ON "BehaviorIncidentReport"("behaviorRecordId");

-- CreateIndex
CREATE INDEX "BehaviorIncidentReport_behaviorRecordId_createdAt_idx" ON "BehaviorIncidentReport"("behaviorRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "BehaviorIncidentWitness_behaviorIncidentReportId_sortOrder_createdAt_idx" ON "BehaviorIncidentWitness"("behaviorIncidentReportId", "sortOrder", "createdAt");

-- AddForeignKey
ALTER TABLE "BehaviorIncidentReport" ADD CONSTRAINT "BehaviorIncidentReport_behaviorRecordId_fkey" FOREIGN KEY ("behaviorRecordId") REFERENCES "BehaviorRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviorIncidentWitness" ADD CONSTRAINT "BehaviorIncidentWitness_behaviorIncidentReportId_fkey" FOREIGN KEY ("behaviorIncidentReportId") REFERENCES "BehaviorIncidentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;