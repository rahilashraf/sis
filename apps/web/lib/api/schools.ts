import { apiFetch } from "./client";
import { normalizeDateOnlyPayload } from "../date";

export type School = {
  id: string;
  name: string;
  shortName: string | null;
  isActive: boolean;
};

export type SchoolYear = {
  id: string;
  schoolId: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  school: School;
};
export type SchoolRemovalResult = {
  success: boolean;
  removalMode: "deleted" | "archived";
  reason?: string;
};

export type UpdateSchoolInput = {
  name?: string;
  shortName?: string;
};

export type CreateSchoolInput = {
  name: string;
  shortName?: string;
};

export type UpdateSchoolYearInput = {
  name?: string;
  startDate?: string;
  endDate?: string;
};

export type CreateSchoolYearInput = {
  schoolId: string;
  name: string;
  startDate: string;
  endDate: string;
};

type RawSchoolYear = Omit<SchoolYear, "startDate" | "endDate"> & {
  endDate?: string | null;
  endsAt?: string | null;
  startDate?: string | null;
  startsAt?: string | null;
};

function toDateOnly(value?: string | null) {
  return normalizeDateOnlyPayload(value);
}

function normalizeSchoolYear(schoolYear: RawSchoolYear): SchoolYear {
  return {
    ...schoolYear,
    startDate: toDateOnly(schoolYear.startDate ?? schoolYear.startsAt ?? ""),
    endDate: toDateOnly(schoolYear.endDate ?? schoolYear.endsAt ?? ""),
  };
}

export function listSchools(options?: { includeInactive?: boolean }) {
  const query = new URLSearchParams();

  if (options?.includeInactive) {
    query.set("includeInactive", "true");
  }

  return apiFetch<School[]>(`/schools${query.size ? `?${query.toString()}` : ""}`);
}

export function createSchool(input: CreateSchoolInput) {
  return apiFetch<School>("/schools", {
    method: "POST",
    json: input,
  });
}

export function updateSchool(schoolId: string, input: UpdateSchoolInput) {
  return apiFetch<School>(`/schools/${schoolId}`, {
    method: "PATCH",
    json: input,
  });
}

export function archiveSchool(schoolId: string) {
  return apiFetch<School>(`/schools/${schoolId}/archive`, {
    method: "PATCH",
  });
}

export function activateSchool(schoolId: string) {
  return apiFetch<School>(`/schools/${schoolId}/activate`, {
    method: "PATCH",
  });
}

export function deleteSchool(schoolId: string) {
  return apiFetch<SchoolRemovalResult>(`/schools/${schoolId}`, {
    method: "DELETE",
  });
}

export async function listSchoolYears(
  schoolId: string,
  options?: { includeInactive?: boolean },
) {
  const query = new URLSearchParams({ schoolId });

  if (options?.includeInactive) {
    query.set("includeInactive", "true");
  }

  const response = await apiFetch<RawSchoolYear[]>(`/school-years?${query.toString()}`);
  return response.map(normalizeSchoolYear);
}

export async function createSchoolYear(input: CreateSchoolYearInput) {
  const response = await apiFetch<RawSchoolYear>("/school-years", {
    method: "POST",
    json: {
      ...input,
      startDate: toDateOnly(input.startDate),
      endDate: toDateOnly(input.endDate),
    },
  });

  return normalizeSchoolYear(response);
}

export async function updateSchoolYear(
  schoolYearId: string,
  input: UpdateSchoolYearInput,
) {
  const response = await apiFetch<RawSchoolYear>(`/school-years/${schoolYearId}`, {
    method: "PATCH",
    json: {
      ...input,
      ...(input.startDate !== undefined ? { startDate: toDateOnly(input.startDate) } : {}),
      ...(input.endDate !== undefined ? { endDate: toDateOnly(input.endDate) } : {}),
    },
  });

  return normalizeSchoolYear(response);
}

export async function archiveSchoolYear(schoolYearId: string) {
  const response = await apiFetch<RawSchoolYear>(`/school-years/${schoolYearId}/archive`, {
    method: "PATCH",
  });

  return normalizeSchoolYear(response);
}

export async function activateSchoolYear(schoolYearId: string) {
  const response = await apiFetch<RawSchoolYear>(`/school-years/${schoolYearId}/activate`, {
    method: "PATCH",
  });

  return normalizeSchoolYear(response);
}

export function deleteSchoolYear(schoolYearId: string) {
  return apiFetch<SchoolRemovalResult>(`/school-years/${schoolYearId}`, {
    method: "DELETE",
  });
}
