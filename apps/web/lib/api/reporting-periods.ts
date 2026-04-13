import { apiFetch } from "./client";
import type { School, SchoolYear } from "./schools";

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

  return apiFetch<ReportingPeriod[]>(`/reporting-periods?${query.toString()}`);
}

export function createReportingPeriod(input: CreateReportingPeriodInput) {
  return apiFetch<ReportingPeriod>("/reporting-periods", {
    method: "POST",
    json: input,
  });
}

export function updateReportingPeriod(periodId: string, input: UpdateReportingPeriodInput) {
  return apiFetch<ReportingPeriod>(`/reporting-periods/${periodId}`, {
    method: "PATCH",
    json: input,
  });
}

export function archiveReportingPeriod(periodId: string) {
  return apiFetch<ReportingPeriod>(`/reporting-periods/${periodId}/archive`, {
    method: "PATCH",
  });
}

export function activateReportingPeriod(periodId: string) {
  return apiFetch<ReportingPeriod>(`/reporting-periods/${periodId}/activate`, {
    method: "PATCH",
  });
}

export function lockReportingPeriod(periodId: string) {
  return apiFetch<ReportingPeriod>(`/reporting-periods/${periodId}/lock`, {
    method: "PATCH",
  });
}

export function unlockReportingPeriod(periodId: string) {
  return apiFetch<ReportingPeriod>(`/reporting-periods/${periodId}/unlock`, {
    method: "PATCH",
  });
}

