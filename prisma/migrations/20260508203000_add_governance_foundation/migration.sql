-- CreateEnum
CREATE TYPE "GovernanceSettingKey" AS ENUM (
  'PARENT_CAN_VIEW_GRADES',
  'PARENT_CAN_VIEW_ATTENDANCE',
  'STUDENT_CAN_VIEW_GRADES',
  'STUDENT_CAN_VIEW_ATTENDANCE'
);

-- CreateTable
CREATE TABLE "SchoolGovernanceSetting" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "key" "GovernanceSettingKey" NOT NULL,
  "valueJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolGovernanceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemporaryPermissionGrant" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "role" "UserRole",
  "userId" TEXT,
  "resource" "PermissionResource" NOT NULL,
  "action" "PermissionAction" NOT NULL,
  "allowed" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TemporaryPermissionGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TemporaryPermissionGrant_role_or_user_required" CHECK ("role" IS NOT NULL OR "userId" IS NOT NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolGovernanceSetting_schoolId_key_key" ON "SchoolGovernanceSetting"("schoolId", "key");

-- CreateIndex
CREATE INDEX "SchoolGovernanceSetting_schoolId_key_idx" ON "SchoolGovernanceSetting"("schoolId", "key");

-- CreateIndex
CREATE INDEX "TemporaryPermissionGrant_schoolId_resource_action_idx" ON "TemporaryPermissionGrant"("schoolId", "resource", "action");

-- CreateIndex
CREATE INDEX "TemporaryPermissionGrant_schoolId_role_startsAt_endsAt_idx" ON "TemporaryPermissionGrant"("schoolId", "role", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "TemporaryPermissionGrant_schoolId_userId_startsAt_endsAt_idx" ON "TemporaryPermissionGrant"("schoolId", "userId", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "SchoolGovernanceSetting" ADD CONSTRAINT "SchoolGovernanceSetting_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryPermissionGrant" ADD CONSTRAINT "TemporaryPermissionGrant_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryPermissionGrant" ADD CONSTRAINT "TemporaryPermissionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemporaryPermissionGrant" ADD CONSTRAINT "TemporaryPermissionGrant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
