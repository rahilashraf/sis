-- CreateEnum
CREATE TYPE "AuditLogSeverity" AS ENUM ('INFO', 'WARNING', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AuditArchiveAction" AS ENUM ('EXPORT', 'PURGE', 'RETENTION_PURGE');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorNameSnapshot" TEXT,
    "actorRoleSnapshot" "UserRole",
    "schoolId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "severity" "AuditLogSeverity" NOT NULL DEFAULT 'INFO',
    "summary" TEXT NOT NULL,
    "targetDisplay" TEXT,
    "changesJson" JSONB,
    "metadataJson" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditArchiveHistory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" "AuditArchiveAction" NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "exportedAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "exportedByUserId" TEXT,
    "exportedByNameSnapshot" TEXT,
    "exportedByRoleSnapshot" "UserRole",
    "purgedByUserId" TEXT,
    "purgedByNameSnapshot" TEXT,
    "purgedByRoleSnapshot" "UserRole",
    "notes" TEXT,
    "metadataJson" JSONB,

    CONSTRAINT "AuditArchiveHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_createdAt_idx" ON "AuditLog"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_action_createdAt_idx" ON "AuditLog"("entityType", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_severity_createdAt_idx" ON "AuditLog"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "AuditArchiveHistory_createdAt_idx" ON "AuditArchiveHistory"("createdAt");

-- CreateIndex
CREATE INDEX "AuditArchiveHistory_action_createdAt_idx" ON "AuditArchiveHistory"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditArchiveHistory_fromDate_toDate_idx" ON "AuditArchiveHistory"("fromDate", "toDate");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditArchiveHistory" ADD CONSTRAINT "AuditArchiveHistory_exportedByUserId_fkey" FOREIGN KEY ("exportedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditArchiveHistory" ADD CONSTRAINT "AuditArchiveHistory_purgedByUserId_fkey" FOREIGN KEY ("purgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
