ALTER TABLE "BehaviorIncidentReport"
ADD COLUMN "reporterEmail" TEXT;

UPDATE "BehaviorIncidentReport" AS "report"
SET
  "reporterEmail" = "actor"."email",
  "reporterRole" = COALESCE("report"."reporterRole", "actor"."role"::TEXT),
  "reporterName" = COALESCE(
    NULLIF(BTRIM("report"."reporterName"), ''),
    NULLIF(BTRIM(CONCAT_WS(' ', "actor"."firstName", "actor"."lastName")), '')
  )
FROM "BehaviorRecord" AS "record"
JOIN "User" AS "actor"
  ON "actor"."id" = "record"."recordedById"
WHERE "record"."id" = "report"."behaviorRecordId";
