# SIS Phase 4 Production Readiness

Last updated: 2026-04-28

## 1) Database backup strategy

### Baseline objectives
- Backup cadence: daily automated backups.
- Recovery point objective (RPO): <= 24 hours for baseline backups.
- Recovery time objective (RTO): <= 2 hours for first full service restore.
- Keep backups encrypted at rest and in transit.

### Recommended retention
- Daily backups: retain 14 days.
- Weekly backups: retain 8 weeks.
- Monthly backups: retain 6 months.
- Keep at least one off-platform logical export copy (S3/R2/secure object storage).

### Provider-specific guidance

#### Render Postgres
- Enable built-in recovery/backups for paid instances.
- Use point-in-time recovery (PITR) for recent incidents.
- Create recurring logical exports for longer retention beyond default dashboard retention.
- For manual logical backup:
  - `pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > sis-$(date +%F).dump`
- For restore into a clean target:
  - `pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$TARGET_DATABASE_URL" sis-YYYY-MM-DD.dump`

#### Railway Postgres
- Enable volume backup schedules in service settings:
  - Daily schedule (enabled)
  - Weekly schedule (enabled)
  - Monthly schedule (enabled)
- Use platform restore to stage and validate before final deploy/swap.
- For external/off-platform backup copy:
  - `pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > sis-$(date +%F).dump`

#### Generic managed PostgreSQL
- Use managed snapshots + PITR where available.
- Add cron/CI job for encrypted logical backup export:
  - `pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" | gzip > sis-$(date +%F).dump.gz`
- Upload to private object storage with lifecycle retention rules.

### Environment variable safety
- Never print `DATABASE_URL` in logs.
- Keep backup credentials in secrets manager/platform secret vars only.
- Separate backup-role credentials from app-role credentials when possible.
- Restrict backup storage bucket access to least privilege.

## 2) Restore process and restore drill checklist

### Standard restore process
1. Declare incident and freeze risky writes if needed.
2. Identify restore point (timestamp or backup artifact).
3. Restore into a new/staging database first.
4. Validate schema migration level matches deployed API build.
5. Run sanity queries (user counts, latest attendance, latest grades, billing totals).
6. Point API to restored DB in staging and run smoke tests.
7. Promote restored DB for production traffic.
8. Monitor errors, latency, and auth failures for 30-60 minutes.
9. Record incident timeline and remediation.

### Restore validation checklist
- Login works for OWNER and a standard role.
- Attendance create/update/delete works.
- Grade create/update/delete works.
- Billing reports load and export.
- Audit logs still readable.
- Background jobs (if any) reconnect cleanly.

### Drill schedule
- Monthly tabletop drill (checklist walkthrough).
- Quarterly live restore drill into staging using latest backup.

## 3) Monitoring and alerting

### Lightweight stack (recommended)
- Error tracking: Sentry (API + Next.js) for unhandled exceptions.
- Log aggregation: provider log drain (Datadog/Logtail/ELK/OpenSearch).
- Uptime checks: probe `GET /healthz`.

### Signals now emitted by API code
- `API_REQUEST_ERROR` for 5xx responses.
- `API_AUTH_ACCESS_EVENT` for 401/403 responses.
- `API_SLOW_REQUEST` for slow requests (`API_SLOW_REQUEST_THRESHOLD_MS`, default `1200`).
- `API_EXPORT_FAILURE` for failed `/export` requests.
- `AUTH_LOGIN_FAILED_EVENT` for login 401.
- `AUTH_LOGIN_THROTTLED_EVENT` for login 429.

### Suggested alerts
- 5xx rate > 2% over 5 minutes.
- 401/403 spike above normal baseline.
- login 401/429 spikes.
- p95 latency above SLO (for example > 1.5s).
- repeated export failures.

## 4) Audit dashboard readiness

Current implementation:
- Audit page: `/admin/audit`.
- Roles:
  - View/search/filter: `OWNER`, `SUPER_ADMIN`, `ADMIN`.
  - Export/Purge: `OWNER` only.
- Filters already available:
  - Date range
  - Actor
  - Entity type
  - Action/event
  - Severity

## 5) Disaster recovery response checklist

### A) Accidental deletion
1. Stop further destructive operations.
2. Identify affected records and time window.
3. Use PITR or logical restore into staging.
4. Validate recovered records.
5. Backfill only missing entities into prod.

### B) Compromised admin account
1. Disable affected account immediately.
2. Rotate JWT secret and force re-authentication window if needed.
3. Rotate database and third-party credentials if exposure suspected.
4. Audit logs review for high-risk actions.
5. Re-enable access with reset credentials + policy review.

### C) Server outage
1. Confirm health endpoint failure and provider status.
2. Roll/restart service on last known good release.
3. Fail over to backup region/service if configured.
4. Validate auth + critical write flows.

### D) Bad deployment
1. Roll back application to previous release.
2. If migration was applied, assess whether rollback migration is safe.
3. Keep DB unchanged unless data corruption is proven.
4. Re-run smoke tests and monitor error rate.

### E) Database corruption
1. Isolate affected DB from writers.
2. Restore nearest valid snapshot/PITR target to staging.
3. Verify data integrity and migration compatibility.
4. Promote recovered DB and rotate credentials.

## 6) Production security configuration checklist

- Cookies:
  - `AUTH_COOKIE_SECURE=true` in production.
  - `AUTH_COOKIE_SAME_SITE=lax` (or `none` + secure for cross-site needs).
- CORS:
  - Explicit `CORS_ORIGIN` allowlist only; no wildcard.
  - `CORS_CREDENTIALS=true` when cookie auth is used.
- JWT:
  - `JWT_SECRET` strong and rotated periodically.
  - Reasonable `JWT_EXPIRES_IN` (for example 12h to 24h).
- TLS:
  - HTTPS termination enabled at edge/platform.
  - Redirect all HTTP to HTTPS.
- Secrets hygiene:
  - No dev/test secrets in production env.
  - Remove or disable seed/test accounts.
- Environment review:
  - No wildcard origins.
  - No debug flags or verbose internal stack traces exposed publicly.

## 7) Recommended backup schedule (final)

- Daily: 02:00 local time.
- Weekly: Sunday 03:00 local time.
- Monthly: first day of month 04:00 local time.
- Quarterly: full restore drill to staging.
