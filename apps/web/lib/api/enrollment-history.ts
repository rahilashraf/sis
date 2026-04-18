import { apiFetch } from "./client";

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

export function getEnrollmentHistory(studentId: string) {
  return apiFetch<EnrollmentHistoryRecord | null>(
    `/enrollment-history/students/${studentId}`,
  );
}

export function createEnrollmentHistory(
  studentId: string,
  input: CreateEnrollmentHistoryInput,
) {
  return apiFetch<EnrollmentHistoryRecord>(
    `/enrollment-history/students/${studentId}`,
    {
      method: "POST",
      json: input,
    },
  );
}

export function updateEnrollmentHistory(
  studentId: string,
  input: UpdateEnrollmentHistoryInput,
) {
  return apiFetch<EnrollmentHistoryRecord>(
    `/enrollment-history/students/${studentId}`,
    {
      method: "PATCH",
      json: input,
    },
  );
}

export function replaceEnrollmentSubjects(
  studentId: string,
  input: ReplaceEnrollmentSubjectsInput,
) {
  return apiFetch<EnrollmentHistoryRecord>(
    `/enrollment-history/students/${studentId}/subjects`,
    {
      method: "PATCH",
      json: input,
    },
  );
}

export function listEnrollmentSubjectOptions(options?: { includeInactive?: boolean }) {
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
  return apiFetch<EnrollmentSubjectOption>("/enrollment-history/subject-options", {
    method: "POST",
    json: input,
  });
}

export function updateEnrollmentSubjectOption(
  id: string,
  input: UpdateEnrollmentSubjectOptionInput,
) {
  return apiFetch<EnrollmentSubjectOption>(`/enrollment-history/subject-options/${id}`, {
    method: "PATCH",
    json: input,
  });
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
