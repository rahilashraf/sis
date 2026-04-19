import { apiFetch } from "./client";
import type { School, SchoolYear } from "./schools";
import { normalizeDateOnlyPayload } from "../date";

export type ReportingPeriod = {
  id: string;
  schoolId: string;
  schoolYearId: string;
  name: string;
  key: string;
  order: number;
  isActive: boolean;
  isLocked: boolean;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
  school: School;
  schoolYear: SchoolYear;
};

type RawReportingPeriod = Omit<ReportingPeriod, "startsAt" | "endsAt"> & {
  startsAt: string;
  endsAt: string;
};

export type CreateReportingPeriodInput = {
  schoolId: string;
  schoolYearId: string;
  name: string;
  key: string;
  order: number;
  startsAt: string;
  endsAt: string;
};

export type UpdateReportingPeriodInput = {
  name?: string;
  key?: string;
  order?: number;
  isLocked?: boolean;
  startsAt?: string;
  endsAt?: string;
};

function toDateOnly(value: string) {
  return normalizeDateOnlyPayload(value);
}

function normalizeReportingPeriod(period: RawReportingPeriod): ReportingPeriod {
  return {
    ...period,
    startsAt: toDateOnly(period.startsAt),
    endsAt: toDateOnly(period.endsAt),
  };
}

export function listReportingPeriods(options: {
  schoolId: string;
  schoolYearId: string;
  includeInactive?: boolean;
}) {
  const query = new URLSearchParams({
    schoolId: options.schoolId,
    schoolYearId: options.schoolYearId,
  });

  if (options.includeInactive) {
    query.set("includeInactive", "true");
  }

  return apiFetch<RawReportingPeriod[]>(`/reporting-periods?${query.toString()}`).then(
    (response) => response.map(normalizeReportingPeriod),
  );
}

export function createReportingPeriod(input: CreateReportingPeriodInput) {
  return apiFetch<RawReportingPeriod>("/reporting-periods", {
    method: "POST",
    json: {
      ...input,
      startsAt: toDateOnly(input.startsAt),
      endsAt: toDateOnly(input.endsAt),
    },
  }).then(normalizeReportingPeriod);
}

export function updateReportingPeriod(periodId: string, input: UpdateReportingPeriodInput) {
  return apiFetch<RawReportingPeriod>(`/reporting-periods/${periodId}`, {
    method: "PATCH",
    json: {
      ...input,
      ...(input.startsAt !== undefined ? { startsAt: toDateOnly(input.startsAt) } : {}),
      ...(input.endsAt !== undefined ? { endsAt: toDateOnly(input.endsAt) } : {}),
    },
  }).then(normalizeReportingPeriod);
}

export function archiveReportingPeriod(periodId: string) {
  return apiFetch<RawReportingPeriod>(`/reporting-periods/${periodId}/archive`, {
    method: "PATCH",
  }).then(normalizeReportingPeriod);
}

export function activateReportingPeriod(periodId: string) {
  return apiFetch<RawReportingPeriod>(`/reporting-periods/${periodId}/activate`, {
    method: "PATCH",
  }).then(normalizeReportingPeriod);
}

export function lockReportingPeriod(periodId: string) {
  return apiFetch<RawReportingPeriod>(`/reporting-periods/${periodId}/lock`, {
    method: "PATCH",
  }).then(normalizeReportingPeriod);
}

export function unlockReportingPeriod(periodId: string) {
  return apiFetch<RawReportingPeriod>(`/reporting-periods/${periodId}/unlock`, {
    method: "PATCH",
  }).then(normalizeReportingPeriod);
}
