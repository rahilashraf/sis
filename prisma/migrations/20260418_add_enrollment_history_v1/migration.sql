-- CreateEnum
CREATE TYPE "EnrollmentHistoryStatus" AS ENUM ('ACTIVE', 'WITHDRAWN', 'TRANSFERRED', 'GRADUATED');

-- CreateTable
CREATE TABLE "EnrollmentHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "dateOfEnrollment" TIMESTAMP(3) NOT NULL,
    "dateOfDeparture" TIMESTAMP(3),
    "previousSchoolName" TEXT,
    "status" "EnrollmentHistoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentHistorySubject" (
    "id" TEXT NOT NULL,
    "enrollmentHistoryId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentHistorySubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentSubjectOption" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentSubjectOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentHistory_studentId_key" ON "EnrollmentHistory"("studentId");

-- CreateIndex
CREATE INDEX "EnrollmentHistory_status_createdAt_idx" ON "EnrollmentHistory"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EnrollmentHistorySubject_enrollmentHistoryId_sortOrder_subjectName_idx" ON "EnrollmentHistorySubject"("enrollmentHistoryId", "sortOrder", "subjectName");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentSubjectOption_name_key" ON "EnrollmentSubjectOption"("name");

-- CreateIndex
CREATE INDEX "EnrollmentSubjectOption_isActive_sortOrder_name_idx" ON "EnrollmentSubjectOption"("isActive", "sortOrder", "name");

-- AddForeignKey
ALTER TABLE "EnrollmentHistory" ADD CONSTRAINT "EnrollmentHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentHistorySubject" ADD CONSTRAINT "EnrollmentHistorySubject_enrollmentHistoryId_fkey" FOREIGN KEY ("enrollmentHistoryId") REFERENCES "EnrollmentHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
