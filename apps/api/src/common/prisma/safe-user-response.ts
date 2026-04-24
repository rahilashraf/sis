import { Prisma } from '@prisma/client';

export const schoolSummarySelect = Prisma.validator<Prisma.SchoolSelect>()({
  id: true,
  name: true,
  shortName: true,
  isActive: true,
});

export const schoolYearSummarySelect =
  Prisma.validator<Prisma.SchoolYearSelect>()({
    id: true,
    schoolId: true,
    name: true,
    startDate: true,
    endDate: true,
    isActive: true,
  });

export const safeUserSchoolMembershipSelect =
  Prisma.validator<Prisma.UserSchoolMembershipSelect>()({
    id: true,
    schoolId: true,
    isActive: true,
    createdAt: true,
    school: {
      select: schoolSummarySelect,
    },
  });

export const safeUserSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  schoolId: true,
  username: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  memberships: {
    select: safeUserSchoolMembershipSelect,
    orderBy: {
      createdAt: 'asc',
    },
  },
});

export type SafeUser = Prisma.UserGetPayload<{
  select: typeof safeUserSelect;
}>;

type SensitiveRecord = Record<string, unknown>;

function isPrismaDecimal(value: unknown): value is Prisma.Decimal {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (value instanceof Prisma.Decimal) {
    return true;
  }

  const record = value as {
    constructor?: { name?: string };
    toFixed?: unknown;
    toString?: unknown;
  };

  if (
    typeof record.toFixed !== 'function' ||
    typeof record.toString !== 'function'
  ) {
    return false;
  }

  const constructorName = record.constructor?.name ?? '';
  return constructorName.startsWith('Decimal');
}

function stripPasswordHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripPasswordHash(entry));
  }

  if (isPrismaDecimal(value)) {
    return value.toString();
  }

  if (value instanceof Date) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as SensitiveRecord;
  const sanitizedEntries = Object.entries(record)
    .filter(([key]) => key !== 'passwordHash')
    .map(([key, entry]) => [key, stripPasswordHash(entry)]);

  return Object.fromEntries(sanitizedEntries);
}

export function sanitizeResponse<T>(value: T): T {
  return stripPasswordHash(value) as T;
}
