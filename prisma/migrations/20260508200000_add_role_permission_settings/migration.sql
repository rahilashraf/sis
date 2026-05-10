-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM (
    'VIEW',
    'CREATE',
    'UPDATE',
    'DELETE',
    'EXPORT',
    'APPROVE',
    'MANAGE'
);

-- CreateEnum
CREATE TYPE "PermissionResource" AS ENUM (
    'INCIDENT_REPORTS',
    'ATTENDANCE',
    'GRADEBOOK',
    'FORMS',
    'RE_REGISTRATION',
    'BILLING',
    'LIBRARY',
    'UNIFORM_ORDERS',
    'NOTIFICATIONS',
    'USERS',
    'CLASSES',
    'SCHOOLS',
    'REPORTING_PERIODS'
);

-- CreateTable
CREATE TABLE "RolePermissionSetting" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "resource" "PermissionResource" NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermissionSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RolePermissionSetting_schoolId_role_resource_action_key"
ON "RolePermissionSetting"("schoolId", "role", "resource", "action");

-- CreateIndex
CREATE INDEX "RolePermissionSetting_schoolId_role_idx"
ON "RolePermissionSetting"("schoolId", "role");

-- CreateIndex
CREATE INDEX "RolePermissionSetting_schoolId_resource_action_idx"
ON "RolePermissionSetting"("schoolId", "resource", "action");

-- AddForeignKey
ALTER TABLE "RolePermissionSetting"
ADD CONSTRAINT "RolePermissionSetting_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
