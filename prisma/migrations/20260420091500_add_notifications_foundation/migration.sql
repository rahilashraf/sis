-- Notifications v1 foundation

CREATE TYPE "NotificationType" AS ENUM (
  'BILLING_CHARGE_CREATED',
  'BILLING_PAYMENT_RECORDED',
  'BILLING_PAYMENT_VOIDED',
  'FORM_ASSIGNED',
  'FORM_SUBMITTED',
  'REREGISTRATION_OPENED',
  'ATTENDANCE_MARKED',
  'INCIDENT_CREATED',
  'SYSTEM_ANNOUNCEMENT'
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT,
  "recipientUserId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_recipientUserId_createdAt_idx"
  ON "Notification"("recipientUserId", "createdAt" DESC);

CREATE INDEX "Notification_recipientUserId_isRead_idx"
  ON "Notification"("recipientUserId", "isRead");

CREATE INDEX "Notification_schoolId_createdAt_idx"
  ON "Notification"("schoolId", "createdAt" DESC);

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
