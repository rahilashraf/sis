-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM (
    'OWNER',
    'SUPER_ADMIN',
    'ADMIN',
    'TEACHER',
    'STAFF',
    'SUPPLY_TEACHER',
    'PARENT',
    'STUDENT'
);

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "AttendanceScopeType" AS ENUM (
    'CLASS',
    'MULTI_CLASS',
    'GRADE',
    'HOMEROOM',
    'CUSTOM'
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSchoolMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSchoolMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolYear" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentParentLink" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentParentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "schoolYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "isHomeroom" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherClassAssignment" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherClassAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentClassEnrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentClassEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceSession" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "schoolYearId" TEXT,
    "takenById" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "scopeType" "AttendanceScopeType" NOT NULL DEFAULT 'CLASS',
    "scopeLabel" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceSessionClass" (
    "id" TEXT NOT NULL,
    "attendanceSessionId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceSessionClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "attendanceSessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSchoolMembership_userId_schoolId_key"
ON "UserSchoolMembership"("userId", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolYear_schoolId_name_key"
ON "SchoolYear"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StudentParentLink_parentId_studentId_key"
ON "StudentParentLink"("parentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Class_schoolId_schoolYearId_name_key"
ON "Class"("schoolId", "schoolYearId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherClassAssignment_teacherId_classId_key"
ON "TeacherClassAssignment"("teacherId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentClassEnrollment_studentId_classId_key"
ON "StudentClassEnrollment"("studentId", "classId");

-- CreateIndex
CREATE INDEX "AttendanceSession_schoolId_date_idx"
ON "AttendanceSession"("schoolId", "date");

-- CreateIndex
CREATE INDEX "AttendanceSession_takenById_date_idx"
ON "AttendanceSession"("takenById", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSessionClass_attendanceSessionId_classId_key"
ON "AttendanceSessionClass"("attendanceSessionId", "classId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_date_idx"
ON "AttendanceRecord"("date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_studentId_date_idx"
ON "AttendanceRecord"("studentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_studentId_date_key"
ON "AttendanceRecord"("studentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_attendanceSessionId_studentId_key"
ON "AttendanceRecord"("attendanceSessionId", "studentId");

-- AddForeignKey
ALTER TABLE "UserSchoolMembership"
ADD CONSTRAINT "UserSchoolMembership_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSchoolMembership"
ADD CONSTRAINT "UserSchoolMembership_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolYear"
ADD CONSTRAINT "SchoolYear_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentParentLink"
ADD CONSTRAINT "StudentParentLink_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentParentLink"
ADD CONSTRAINT "StudentParentLink_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class"
ADD CONSTRAINT "Class_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class"
ADD CONSTRAINT "Class_schoolYearId_fkey"
FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClassAssignment"
ADD CONSTRAINT "TeacherClassAssignment_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClassAssignment"
ADD CONSTRAINT "TeacherClassAssignment_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "Class"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentClassEnrollment"
ADD CONSTRAINT "StudentClassEnrollment_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentClassEnrollment"
ADD CONSTRAINT "StudentClassEnrollment_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "Class"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession"
ADD CONSTRAINT "AttendanceSession_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession"
ADD CONSTRAINT "AttendanceSession_schoolYearId_fkey"
FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession"
ADD CONSTRAINT "AttendanceSession_takenById_fkey"
FOREIGN KEY ("takenById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSessionClass"
ADD CONSTRAINT "AttendanceSessionClass_attendanceSessionId_fkey"
FOREIGN KEY ("attendanceSessionId") REFERENCES "AttendanceSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSessionClass"
ADD CONSTRAINT "AttendanceSessionClass_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "Class"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord"
ADD CONSTRAINT "AttendanceRecord_attendanceSessionId_fkey"
FOREIGN KEY ("attendanceSessionId") REFERENCES "AttendanceSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord"
ADD CONSTRAINT "AttendanceRecord_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
