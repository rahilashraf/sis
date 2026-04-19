-- AlterTable
ALTER TABLE "Class"
ADD COLUMN "gradeLevelId" TEXT,
ADD COLUMN "subjectOptionId" TEXT;

-- Backfill subject options from existing class free-text subjects
WITH normalized_subjects AS (
  SELECT DISTINCT btrim("subject") AS "name"
  FROM "Class"
  WHERE "subject" IS NOT NULL AND btrim("subject") <> ''
),
missing_subjects AS (
  SELECT ns."name"
  FROM normalized_subjects ns
  LEFT JOIN "EnrollmentSubjectOption" existing
    ON lower(existing."name") = lower(ns."name")
  WHERE existing."id" IS NULL
)
INSERT INTO "EnrollmentSubjectOption" (
  "id",
  "name",
  "isActive",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  'subject_mig_' || substr(md5(ms."name"), 1, 20),
  ms."name",
  true,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM missing_subjects ms;

-- Backfill class.subjectOptionId based on legacy class.subject text
WITH option_lookup AS (
  SELECT DISTINCT ON (lower("name"))
    "id",
    "name"
  FROM "EnrollmentSubjectOption"
  ORDER BY lower("name"), "isActive" DESC, "updatedAt" DESC
)
UPDATE "Class" c
SET
  "subjectOptionId" = lookup."id",
  "subject" = COALESCE(NULLIF(btrim(c."subject"), ''), lookup."name")
FROM option_lookup lookup
WHERE c."subject" IS NOT NULL
  AND btrim(c."subject") <> ''
  AND lower(lookup."name") = lower(btrim(c."subject"));

-- DropIndex
DROP INDEX "Class_schoolId_schoolYearId_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "Class_schoolId_schoolYearId_name_gradeLevelId_subjectOptionId_key"
ON "Class"("schoolId", "schoolYearId", "name", "gradeLevelId", "subjectOptionId");

-- CreateIndex
CREATE INDEX "Class_schoolId_schoolYearId_gradeLevelId_subjectOptionId_isActive_idx"
ON "Class"("schoolId", "schoolYearId", "gradeLevelId", "subjectOptionId", "isActive");

-- AddForeignKey
ALTER TABLE "Class"
ADD CONSTRAINT "Class_gradeLevelId_fkey"
FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class"
ADD CONSTRAINT "Class_subjectOptionId_fkey"
FOREIGN KEY ("subjectOptionId") REFERENCES "EnrollmentSubjectOption"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
