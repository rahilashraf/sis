import type { AuthenticatedUser } from "../auth/types";
import { apiFetch } from "./client";

export type AssessmentType = {
  id: string;
  key: string;
  schoolId: string | null;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Assessment = {
  id: string;
  classId: string;
  schoolId: string;
  schoolYearId: string;
  reportingPeriodId: string | null;
  categoryId: string | null;
  title: string;
  assessmentTypeId: string;
  maxScore: number;
  weight: number;
  dueAt: string | null;
  isPublishedToParents: boolean;
  isActive: boolean;
  createdByUserId: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assessmentType: Pick<AssessmentType, "id" | "key" | "name">;
};

export type AssessmentResult = {
  id: string;
  studentId: string;
  score: number | null;
  statusLabelId?: string | null;
  statusLabel?: {
    id: string;
    key: string;
    label: string;
    behavior: "COUNT_AS_ZERO" | "EXCLUDE_FROM_CALCULATION" | "INFORMATION_ONLY";
  } | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssessmentGradeRow = {
  student: AuthenticatedUser;
  result: AssessmentResult | null;
};

export type AssessmentGradesResponse = {
  assessment: Assessment;
  grades: AssessmentGradeRow[];
};

export type CreateAssessmentInput = {
  classId: string;
  categoryId?: string;
  title: string;
  assessmentTypeId: string;
  maxScore: number;
  weight?: number;
  dueAt?: string;
  reportingPeriodId?: string;
  isPublishedToParents?: boolean;
};

export type UpdateAssessmentInput = {
  categoryId?: string | null;
  title?: string;
  assessmentTypeId?: string;
  maxScore?: number;
  weight?: number;
  dueAt?: string | null;
  reportingPeriodId?: string | null;
  isPublishedToParents?: boolean;
};

export type AssessmentRemovalResult = {
  success: boolean;
  removalMode: "deleted" | "archived";
};

export type UpsertAssessmentGradeInput = {
  studentId: string;
  score?: number | null;
  statusLabelId?: string | null;
  statusLabelKey?: string | null;
  comment?: string | null;
  clear?: boolean;
};

export function listAssessmentTypes(options?: {
  includeInactive?: boolean;
  schoolId?: string;
}) {
  const query = new URLSearchParams();

  if (options?.includeInactive) {
    query.set("includeInactive", "true");
  }

  if (options?.schoolId) {
    query.set("schoolId", options.schoolId);
  }

  return apiFetch<AssessmentType[]>(
    `/assessment-types${query.size ? `?${query.toString()}` : ""}`,
  );
}

export type CreateAssessmentTypeInput = {
  schoolId?: string | null;
  name: string;
  sortOrder?: number;
};

export type UpdateAssessmentTypeInput = {
  name?: string;
  sortOrder?: number;
};

export function createAssessmentType(input: CreateAssessmentTypeInput) {
  return apiFetch<AssessmentType>("/assessment-types", {
    method: "POST",
    json: input,
  });
}

export function updateAssessmentType(
  typeId: string,
  input: UpdateAssessmentTypeInput,
) {
  return apiFetch<AssessmentType>(`/assessment-types/${typeId}`, {
    method: "PATCH",
    json: input,
  });
}

export function archiveAssessmentType(typeId: string) {
  return apiFetch<AssessmentType>(`/assessment-types/${typeId}/archive`, {
    method: "PATCH",
  });
}

export function activateAssessmentType(typeId: string) {
  return apiFetch<AssessmentType>(`/assessment-types/${typeId}/activate`, {
    method: "PATCH",
  });
}

export function listAssessments(
  classId: string,
  options?: { includeInactive?: boolean },
) {
  const query = new URLSearchParams({ classId });
  if (options?.includeInactive) {
    query.set("includeInactive", "true");
  }
  return apiFetch<Assessment[]>(`/assessments?${query.toString()}`);
}

export function createAssessment(input: CreateAssessmentInput) {
  return apiFetch<Assessment>("/assessments", {
    method: "POST",
    json: input,
  });
}

export function updateAssessment(
  assessmentId: string,
  input: UpdateAssessmentInput,
) {
  return apiFetch<Assessment>(`/assessments/${assessmentId}`, {
    method: "PATCH",
    json: input,
  });
}

export function archiveAssessment(assessmentId: string) {
  return apiFetch<Assessment>(`/assessments/${assessmentId}/archive`, {
    method: "PATCH",
  });
}

export function activateAssessment(assessmentId: string) {
  return apiFetch<Assessment>(`/assessments/${assessmentId}/activate`, {
    method: "PATCH",
  });
}

export function deleteAssessment(assessmentId: string) {
  return apiFetch<AssessmentRemovalResult>(`/assessments/${assessmentId}`, {
    method: "DELETE",
  });
}

export function getAssessmentGrades(assessmentId: string) {
  return apiFetch<AssessmentGradesResponse>(
    `/assessments/${assessmentId}/grades`,
  );
}

export function upsertAssessmentGrades(
  assessmentId: string,
  grades: UpsertAssessmentGradeInput[],
) {
  return apiFetch<AssessmentResult[]>(`/assessments/${assessmentId}/grades`, {
    method: "POST",
    json: { grades },
  });
}

export type AssessmentResultStatusLabel = {
  id: string;
  schoolId: string;
  key: string;
  label: string;
  behavior: "COUNT_AS_ZERO" | "EXCLUDE_FROM_CALCULATION" | "INFORMATION_ONLY";
  sortOrder: number;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function listAssessmentResultStatusLabels(options: {
  schoolId: string;
  includeInactive?: boolean;
}) {
  const query = new URLSearchParams({ schoolId: options.schoolId });
  if (options.includeInactive) {
    query.set("includeInactive", "true");
  }
  return apiFetch<AssessmentResultStatusLabel[]>(
    `/assessment-result-status-labels?${query.toString()}`,
  );
}

export function createAssessmentResultStatusLabel(input: {
  schoolId: string;
  key?: string;
  label: string;
  behavior?: AssessmentResultStatusLabel["behavior"];
  sortOrder?: number;
}) {
  return apiFetch<AssessmentResultStatusLabel>(
    "/assessment-result-status-labels",
    {
      method: "POST",
      json: input,
    },
  );
}

export function updateAssessmentResultStatusLabel(
  id: string,
  input: Partial<
    Pick<
      AssessmentResultStatusLabel,
      "label" | "behavior" | "sortOrder" | "isActive"
    >
  >,
) {
  return apiFetch<AssessmentResultStatusLabel>(
    `/assessment-result-status-labels/${id}`,
    {
      method: "PATCH",
      json: input,
    },
  );
}
