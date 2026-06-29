-- Announcements v1

CREATE TYPE "AnnouncementTargetType" AS ENUM (
  'SCHOOL',
  'GRADE_LEVEL',
  'CLASS',
  'STUDENT'
);

CREATE TYPE "AnnouncementAudience" AS ENUM (
  'PARENTS',
  'STUDENTS',
  'PARENTS_AND_STUDENTS'
);

CREATE TABLE "Announcement" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "audience" "AnnouncementAudience" NOT NULL,
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnnouncementTarget" (
  "id" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "targetType" "AnnouncementTargetType" NOT NULL,
  "gradeLevelId" TEXT,
  "classId" TEXT,
  "studentId" TEXT,

  CONSTRAINT "AnnouncementTarget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Announcement_schoolId_publishedAt_idx"
  ON "Announcement"("schoolId", "publishedAt" DESC);

CREATE INDEX "Announcement_authorId_createdAt_idx"
  ON "Announcement"("authorId", "createdAt" DESC);

CREATE INDEX "Announcement_schoolId_audience_isPinned_publishedAt_idx"
  ON "Announcement"("schoolId", "audience", "isPinned", "publishedAt" DESC);

CREATE INDEX "Announcement_expiresAt_idx"
  ON "Announcement"("expiresAt");

CREATE INDEX "AnnouncementTarget_announcementId_idx"
  ON "AnnouncementTarget"("announcementId");

CREATE INDEX "AnnouncementTarget_targetType_idx"
  ON "AnnouncementTarget"("targetType");

CREATE INDEX "AnnouncementTarget_gradeLevelId_idx"
  ON "AnnouncementTarget"("gradeLevelId");

CREATE INDEX "AnnouncementTarget_classId_idx"
  ON "AnnouncementTarget"("classId");

CREATE INDEX "AnnouncementTarget_studentId_idx"
  ON "AnnouncementTarget"("studentId");

ALTER TABLE "Announcement"
  ADD CONSTRAINT "Announcement_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Announcement"
  ADD CONSTRAINT "Announcement_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AnnouncementTarget"
  ADD CONSTRAINT "AnnouncementTarget_announcementId_fkey"
  FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
