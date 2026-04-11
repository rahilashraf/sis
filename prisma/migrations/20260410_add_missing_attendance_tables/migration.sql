DO $$
BEGIN
    CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "AttendanceScopeType" AS ENUM (
        'CLASS',
        'MULTI_CLASS',
        'GRADE',
        'HOMEROOM',
        'CUSTOM'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AttendanceSession" (
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

CREATE TABLE IF NOT EXISTS "AttendanceSessionClass" (
    "id" TEXT NOT NULL,
    "attendanceSessionId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceSessionClass_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AttendanceRecord" (
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

CREATE INDEX IF NOT EXISTS "AttendanceSession_schoolId_date_idx"
ON "AttendanceSession"("schoolId", "date");

CREATE INDEX IF NOT EXISTS "AttendanceSession_takenById_date_idx"
ON "AttendanceSession"("takenById", "date");

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceSessionClass_attendanceSessionId_classId_key"
ON "AttendanceSessionClass"("attendanceSessionId", "classId");

CREATE INDEX IF NOT EXISTS "AttendanceRecord_date_idx"
ON "AttendanceRecord"("date");

CREATE INDEX IF NOT EXISTS "AttendanceRecord_studentId_date_idx"
ON "AttendanceRecord"("studentId", "date");

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_studentId_date_key"
ON "AttendanceRecord"("studentId", "date");

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_attendanceSessionId_studentId_key"
ON "AttendanceRecord"("attendanceSessionId", "studentId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'AttendanceSession_schoolId_fkey'
    ) THEN
        ALTER TABLE "AttendanceSession"
        ADD CONSTRAINT "AttendanceSession_schoolId_fkey"
        FOREIGN KEY ("schoolId") REFERENCES "School"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'AttendanceSession_schoolYearId_fkey'
    ) THEN
        ALTER TABLE "AttendanceSession"
        ADD CONSTRAINT "AttendanceSession_schoolYearId_fkey"
        FOREIGN KEY ("schoolYearId") REFERENCES "SchoolYear"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'AttendanceSession_takenById_fkey'
    ) THEN
        ALTER TABLE "AttendanceSession"
        ADD CONSTRAINT "AttendanceSession_takenById_fkey"
        FOREIGN KEY ("takenById") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'AttendanceSessionClass_attendanceSessionId_fkey'
    ) THEN
        ALTER TABLE "AttendanceSessionClass"
        ADD CONSTRAINT "AttendanceSessionClass_attendanceSessionId_fkey"
        FOREIGN KEY ("attendanceSessionId") REFERENCES "AttendanceSession"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'AttendanceSessionClass_classId_fkey'
    ) THEN
        ALTER TABLE "AttendanceSessionClass"
        ADD CONSTRAINT "AttendanceSessionClass_classId_fkey"
        FOREIGN KEY ("classId") REFERENCES "Class"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'AttendanceRecord_attendanceSessionId_fkey'
    ) THEN
        ALTER TABLE "AttendanceRecord"
        ADD CONSTRAINT "AttendanceRecord_attendanceSessionId_fkey"
        FOREIGN KEY ("attendanceSessionId") REFERENCES "AttendanceSession"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'AttendanceRecord_studentId_fkey'
    ) THEN
        ALTER TABLE "AttendanceRecord"
        ADD CONSTRAINT "AttendanceRecord_studentId_fkey"
        FOREIGN KEY ("studentId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
