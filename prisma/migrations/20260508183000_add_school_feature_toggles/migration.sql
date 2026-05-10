-- CreateEnum
CREATE TYPE "FeatureModule" AS ENUM (
    'INCIDENT_REPORTS',
    'ATTENDANCE',
    'GRADEBOOK',
    'FORMS',
    'RE_REGISTRATION',
    'BILLING',
    'LIBRARY',
    'UNIFORM_ORDERS',
    'NOTIFICATIONS'
);

-- CreateTable
CREATE TABLE "SchoolFeatureToggle" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "module" "FeatureModule" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolFeatureToggle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolFeatureToggle_schoolId_module_key" ON "SchoolFeatureToggle"("schoolId", "module");

-- CreateIndex
CREATE INDEX "SchoolFeatureToggle_schoolId_module_enabled_idx" ON "SchoolFeatureToggle"("schoolId", "module", "enabled");

-- AddForeignKey
ALTER TABLE "SchoolFeatureToggle"
ADD CONSTRAINT "SchoolFeatureToggle_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
