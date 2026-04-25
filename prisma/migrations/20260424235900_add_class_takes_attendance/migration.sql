-- Add per-class attendance toggle
ALTER TABLE "Class"
ADD COLUMN "takesAttendance" BOOLEAN NOT NULL DEFAULT true;
