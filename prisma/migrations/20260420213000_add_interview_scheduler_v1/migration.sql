-- Parent-Teacher Interview Scheduler v1

-- CreateEnum
CREATE TYPE "InterviewSlotStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'CANCELLED');

-- CreateTable
CREATE TABLE "InterviewEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "bookingOpensAt" TIMESTAMP(3),
    "bookingClosesAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewSlot" (
    "id" TEXT NOT NULL,
    "interviewEventId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "meetingMode" TEXT,
    "notes" TEXT,
    "status" "InterviewSlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "bookedParentId" TEXT,
    "bookedStudentId" TEXT,
    "bookedAt" TIMESTAMP(3),
    "bookingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewEvent_schoolId_isActive_isPublished_startsAt_endsAt_idx" ON "InterviewEvent"("schoolId", "isActive", "isPublished", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "InterviewEvent_schoolId_bookingOpensAt_bookingClosesAt_idx" ON "InterviewEvent"("schoolId", "bookingOpensAt", "bookingClosesAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewSlot_interviewEventId_teacherId_startTime_endTime_key" ON "InterviewSlot"("interviewEventId", "teacherId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "InterviewSlot_interviewEventId_startTime_endTime_idx" ON "InterviewSlot"("interviewEventId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "InterviewSlot_schoolId_teacherId_startTime_idx" ON "InterviewSlot"("schoolId", "teacherId", "startTime");

-- CreateIndex
CREATE INDEX "InterviewSlot_teacherId_status_startTime_idx" ON "InterviewSlot"("teacherId", "status", "startTime");

-- CreateIndex
CREATE INDEX "InterviewSlot_bookedParentId_startTime_idx" ON "InterviewSlot"("bookedParentId", "startTime");

-- CreateIndex
CREATE INDEX "InterviewSlot_bookedStudentId_startTime_idx" ON "InterviewSlot"("bookedStudentId", "startTime");

-- AddForeignKey
ALTER TABLE "InterviewEvent" ADD CONSTRAINT "InterviewEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_interviewEventId_fkey" FOREIGN KEY ("interviewEventId") REFERENCES "InterviewEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_bookedParentId_fkey" FOREIGN KEY ("bookedParentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSlot" ADD CONSTRAINT "InterviewSlot_bookedStudentId_fkey" FOREIGN KEY ("bookedStudentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
