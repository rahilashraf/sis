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
- CORS is disabled unless `CORS_ORIGIN` is set.
- `JWT_SECRET` is required outside tests.
