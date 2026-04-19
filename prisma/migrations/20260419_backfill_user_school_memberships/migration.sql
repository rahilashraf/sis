-- Backfill memberships for legacy users that only have User.schoolId set.
INSERT INTO "UserSchoolMembership" (
  "id",
  "userId",
  "schoolId",
  "isActive",
  "createdAt"
)
SELECT
  'usm_mig_' || substr(md5(u."id" || ':' || u."schoolId"), 1, 20) AS "id",
  u."id" AS "userId",
  u."schoolId" AS "schoolId",
  true AS "isActive",
  CURRENT_TIMESTAMP AS "createdAt"
FROM "User" u
LEFT JOIN "UserSchoolMembership" existing
  ON existing."userId" = u."id"
 AND existing."schoolId" = u."schoolId"
WHERE u."schoolId" IS NOT NULL
  AND existing."id" IS NULL;
