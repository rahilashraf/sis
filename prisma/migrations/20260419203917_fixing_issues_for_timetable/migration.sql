-- CreateEnum
CREATE TYPE "TimetableDayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "TimetableBlock" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "dayOfWeek" "TimetableDayOfWeek" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "roomLabel" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableBlockClass" (
    "id" TEXT NOT NULL,
    "timetableBlockId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimetableBlockClass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimetableBlock_schoolId_schoolYearId_dayOfWeek_startTime_en_idx" ON "TimetableBlock"("schoolId", "schoolYearId", "dayOfWeek", "startTime", "endTime", "isActive");

-- CreateIndex
CREATE INDEX "TimetableBlock_teacherId_dayOfWeek_startTime_endTime_isActi_idx" ON "TimetableBlock"("teacherId", "dayOfWeek", "startTime", "endTime", "isActive");

-- CreateIndex
CREATE INDEX "TimetableBlock_roomLabel_dayOfWeek_startTime_endTime_isActi_idx" ON "TimetableBlock"("roomLabel", "dayOfWeek", "startTime", "endTime", "isActive");

-- CreateIndex
CREATE INDEX "TimetableBlockClass_classId_idx" ON "TimetableBlockClass"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableBlockClass_timetableBlockId_classId_key" ON "TimetableBlockClass"("timetableBlockId", "classId");

-- AddForeignKey
ALTER TABLE "TimetableBlock" ADD CONSTRAINT "TimetableBlock_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableBlock" ADD CONSTRAINT "TimetableBlock_schoolYearId_fkey" FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableBlock" ADD CONSTRAINT "TimetableBlock_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableBlockClass" ADD CONSTRAINT "TimetableBlockClass_timetableBlockId_fkey" FOREIGN KEY ("timetableBlockId") REFERENCES "TimetableBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableBlockClass" ADD CONSTRAINT "TimetableBlockClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
