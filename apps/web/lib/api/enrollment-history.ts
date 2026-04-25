import { apiFetch } from "./client";
import { normalizeDateOnlyPayload } from "../date";

export type EnrollmentHistoryStatus =
  | "ACTIVE"
  | "WITHDRAWN"
  | "TRANSFERRED"
  | "GRADUATED";

export type EnrollmentHistorySubject = {
  id: string;
  enrollmentHistoryId: string;
  subjectName: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type EnrollmentHistoryRecord = {
  id: string;
  studentId: string;
  dateOfEnrollment: string;
  dateOfDeparture: string | null;
  previousSchoolName: string | null;
  status: EnrollmentHistoryStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  subjects: EnrollmentHistorySubject[];
  selectedSubjects: string[];
};

export type EnrollmentSubjectOption = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type RawEnrollmentHistoryRecord = Omit<
  EnrollmentHistoryRecord,
  "dateOfEnrollment" | "dateOfDeparture"
> & {
  dateOfEnrollment: string;
  dateOfDeparture: string | null;
};

export type CreateEnrollmentHistoryInput = {
  dateOfEnrollment: string;
  dateOfDeparture?: string | null;
  previousSchoolName?: string | null;
  status: EnrollmentHistoryStatus;
  notes?: string | null;
  subjectOptionIds?: string[];
};

export type UpdateEnrollmentHistoryInput = {
  dateOfEnrollment?: string;
  dateOfDeparture?: string | null;
  previousSchoolName?: string | null;
  status?: EnrollmentHistoryStatus;
  notes?: string | null;
};

export type ReplaceEnrollmentSubjectsInput = {
  subjectOptionIds: string[];
};

export type CreateEnrollmentSubjectOptionInput = {
  name: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type UpdateEnrollmentSubjectOptionInput = {
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
};

function normalizeEnrollmentHistoryRecord(
  record: RawEnrollmentHistoryRecord,
): EnrollmentHistoryRecord {
  return {
    ...record,
    dateOfEnrollment: normalizeDateOnlyPayload(record.dateOfEnrollment),
    dateOfDeparture: normalizeDateOnlyPayload(record.dateOfDeparture) || null,
  };
}

export function getEnrollmentHistory(studentId: string) {
  return apiFetch<RawEnrollmentHistoryRecord | null>(
    `/enrollment-history/students/${studentId}`,
  ).then((record) =>
    record ? normalizeEnrollmentHistoryRecord(record) : null,
  );
}

export function createEnrollmentHistory(
  studentId: string,
  input: CreateEnrollmentHistoryInput,
) {
  return apiFetch<RawEnrollmentHistoryRecord>(
    `/enrollment-history/students/${studentId}`,
    {
      method: "POST",
      json: {
        ...input,
        dateOfEnrollment: normalizeDateOnlyPayload(input.dateOfEnrollment),
        dateOfDeparture:
          normalizeDateOnlyPayload(input.dateOfDeparture) || null,
      },
    },
  ).then(normalizeEnrollmentHistoryRecord);
}

export function updateEnrollmentHistory(
  studentId: string,
  input: UpdateEnrollmentHistoryInput,
) {
  return apiFetch<RawEnrollmentHistoryRecord>(
    `/enrollment-history/students/${studentId}`,
    {
      method: "PATCH",
      json: {
        ...input,
        ...(input.dateOfEnrollment !== undefined
          ? {
              dateOfEnrollment: normalizeDateOnlyPayload(
                input.dateOfEnrollment,
              ),
            }
          : {}),
        ...(input.dateOfDeparture !== undefined
          ? {
              dateOfDeparture:
                normalizeDateOnlyPayload(input.dateOfDeparture) || null,
            }
          : {}),
      },
    },
  ).then(normalizeEnrollmentHistoryRecord);
}

export function replaceEnrollmentSubjects(
  studentId: string,
  input: ReplaceEnrollmentSubjectsInput,
) {
  return apiFetch<RawEnrollmentHistoryRecord>(
    `/enrollment-history/students/${studentId}/subjects`,
    {
      method: "PATCH",
      json: input,
    },
  ).then(normalizeEnrollmentHistoryRecord);
}

export function listEnrollmentSubjectOptions(options?: {
  includeInactive?: boolean;
}) {
  const params = new URLSearchParams();

  if (options?.includeInactive) {
    params.set("includeInactive", "true");
  }

  return apiFetch<EnrollmentSubjectOption[]>(
    `/enrollment-history/subject-options${params.size > 0 ? `?${params.toString()}` : ""}`,
  );
}

export function createEnrollmentSubjectOption(
  input: CreateEnrollmentSubjectOptionInput,
) {
  return apiFetch<EnrollmentSubjectOption>(
    "/enrollment-history/subject-options",
    {
      method: "POST",
      json: input,
    },
  );
}

export function updateEnrollmentSubjectOption(
  id: string,
  input: UpdateEnrollmentSubjectOptionInput,
) {
  return apiFetch<EnrollmentSubjectOption>(
    `/enrollment-history/subject-options/${id}`,
    {
      method: "PATCH",
      json: input,
    },
  );
}

export function activateEnrollmentSubjectOption(id: string) {
  return apiFetch<EnrollmentSubjectOption>(
    `/enrollment-history/subject-options/${id}/activate`,
    { method: "PATCH" },
  );
}

export function deactivateEnrollmentSubjectOption(id: string) {
  return apiFetch<EnrollmentSubjectOption>(
    `/enrollment-history/subject-options/${id}/deactivate`,
    { method: "PATCH" },
  );
}
