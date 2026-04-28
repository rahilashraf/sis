# SIS API Backend

NestJS backend for the SIS monorepo. This app uses Prisma with PostgreSQL and the root `prisma/` directory for schema, migrations, and seed data.

## Scope

Implemented backend areas currently covered:

- auth and role-based access
- users, parents, students, and school memberships
- classes, teacher assignment, and student enrollment
- attendance and attendance summaries
- school years
- reporting periods
- grades, summaries, period-aware summaries, and locking

## Prerequisites

- Node.js 20+
- npm
- PostgreSQL

## Environment

Required for normal startup:

```bash
DATABASE_URL=postgresql://...
JWT_SECRET=replace-with-a-real-secret
```

Optional but recommended:

```bash
JWT_EXPIRES_IN=1d
CORS_ORIGIN=http://localhost:3001
CORS_CREDENTIALS=true
THROTTLE_TTL_MS=60000
THROTTLE_LIMIT=120
THROTTLE_BLOCK_DURATION_MS=60000
LOGIN_THROTTLE_LIMIT=8
LOGIN_THROTTLE_TTL_MS=60000
LOGIN_THROTTLE_BLOCK_DURATION_MS=300000
LOGIN_FAILURE_DELAY_MS=200
LOGIN_FAILURE_DELAY_JITTER_MS=150
BILLING_REPORT_MAX_ROWS=5000
AUTH_COOKIE_NAME=sis_access_token
AUTH_COOKIE_SAME_SITE=lax
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_MAX_AGE_MS=86400000
API_SLOW_REQUEST_THRESHOLD_MS=1200
# AUTH_COOKIE_DOMAIN=.yourdomain.com
SHADOW_DATABASE_URL=postgresql://... # only needed for prisma migrate dev
```

Optional seed configuration:

```bash
SEED_SCHOOL_NAME=Demo School
SEED_SCHOOL_SHORT_NAME=DEMO
SEED_OWNER_USERNAME=owner
SEED_OWNER_EMAIL=owner@example.com
SEED_OWNER_FIRST_NAME=System
SEED_OWNER_LAST_NAME=Owner
SEED_OWNER_PASSWORD=ChangeMe123!
SEED_SCHOOL_YEAR_NAME=2025-2026
SEED_SCHOOL_YEAR_START_DATE=2025-09-01
SEED_SCHOOL_YEAR_END_DATE=2026-06-30
```

## Install

From the repo root:

```bash
npm install
cd apps/api && npm install
```

## Bootstrap Flow

Fresh database bootstrap:

```bash
npm run prisma:migrate:deploy
npm --prefix apps/api run prisma:generate
npm --prefix apps/api run prisma:seed
```

Run the API:

```bash
npm --prefix apps/api run start:dev
```

Build:

```bash
npm --prefix apps/api run build
```

## Prisma Commands

From the repo root:

```bash
npm run prisma:migrate:deploy
npm run prisma:migrate:dev
npm run prisma:generate
npm run prisma:seed
```

From `apps/api`:

```bash
npm run prisma:migrate:deploy
npm run prisma:migrate:dev
npm run prisma:generate
npm run prisma:seed
```

## Notes

- `prisma migrate deploy` is the production-safe path and is expected to work from the checked-in migration history alone.
- The seed is intended for local and demo setup and is idempotent enough to rerun.
- In production, `CORS_ORIGIN` must be set to one or more explicit origins (comma-separated). Wildcard `*` is rejected.
- In local development, CORS defaults to `http://localhost:3001,http://localhost:3000` when `CORS_ORIGIN` is not set.
- `JWT_SECRET` is required outside tests.
- `GET /health` and `GET /healthz` provide lightweight health probes for load balancers and uptime checks.
- Slow, failed, auth-denied, throttled login, and export-failure API events are emitted as structured logs and can be wired to your log drain/alerting stack.
