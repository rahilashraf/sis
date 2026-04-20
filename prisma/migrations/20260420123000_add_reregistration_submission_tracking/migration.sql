-- Add re-registration submission tracking and return intent fields.

CREATE TYPE "ReRegistrationNonReturnReason" AS ENUM (
  'MOVING',
  'TRANSFERRING_SCHOOLS',
  'HOMESCHOOLING',
  'GRADUATING',
  'FINANCIAL',
  'OTHER'
);

CREATE TABLE "ReRegistrationSubmission" (
  "id" TEXT NOT NULL,
  "windowId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "submittedByUserId" TEXT,
  "returningNextYear" BOOLEAN NOT NULL,
  "nonReturningReason" "ReRegistrationNonReturnReason",
  "nonReturningComment" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReRegistrationSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReRegistrationSubmission_windowId_studentId_key"
  ON "ReRegistrationSubmission"("windowId", "studentId");

CREATE INDEX "ReRegistrationSubmission_windowId_submittedAt_idx"
  ON "ReRegistrationSubmission"("windowId", "submittedAt");

CREATE INDEX "ReRegistrationSubmission_studentId_submittedAt_idx"
  ON "ReRegistrationSubmission"("studentId", "submittedAt");

ALTER TABLE "ReRegistrationSubmission"
  ADD CONSTRAINT "ReRegistrationSubmission_windowId_fkey"
  FOREIGN KEY ("windowId") REFERENCES "ReRegistrationWindow"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReRegistrationSubmission"
  ADD CONSTRAINT "ReRegistrationSubmission_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReRegistrationSubmission"
  ADD CONSTRAINT "ReRegistrationSubmission_submittedByUserId_fkey"
  FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
