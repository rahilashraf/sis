import { apiFetch } from "./client";
import type { School } from "./schools";

export type GradeScaleRule = {
  id: string;
  gradeScaleId: string;
  minPercent: number;
  maxPercent: number;
  letterGrade: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type GradeScale = {
  id: string;
  schoolId: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  school: School;
  rules: GradeScaleRule[];
};

export type CreateGradeScaleInput = {
  schoolId: string;
  name: string;
  isDefault?: boolean;
};

export type UpdateGradeScaleInput = {
  name?: string;
};

export type CreateGradeScaleRuleInput = {
  minPercent: number;
  maxPercent: number;
  letterGrade: string;
  sortOrder?: number;
};

export type UpdateGradeScaleRuleInput = {
  minPercent?: number;
  maxPercent?: number;
  letterGrade?: string;
  sortOrder?: number;
};

export type ApplyGradeScaleMultiSchoolInput = {
  targetSchoolIds: string[];
  sourceGradeScaleId?: string;
  name?: string;
  isDefault?: boolean;
  copyRules?: boolean;
};

export type ApplyGradeScaleMultiSchoolResponse = {
  name: string;
  sourceGradeScaleId: string | null;
  copiedRules: boolean;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  results: Array<{
    schoolId: string;
    schoolName: string;
    status: "created" | "skipped" | "failed";
    gradeScaleId?: string;
    message: string;
  }>;
};

export function listGradeScales(
  schoolId: string,
  options?: { includeInactive?: boolean },
) {
  const query = new URLSearchParams({ schoolId });

  if (options?.includeInactive) {
    query.set("includeInactive", "true");
  }

  return apiFetch<GradeScale[]>(`/grade-scales?${query.toString()}`);
}

export function createGradeScale(input: CreateGradeScaleInput) {
  return apiFetch<GradeScale>("/grade-scales", {
    method: "POST",
    json: input,
  });
}

export function updateGradeScale(
  gradeScaleId: string,
  input: UpdateGradeScaleInput,
) {
  return apiFetch<GradeScale>(`/grade-scales/${gradeScaleId}`, {
    method: "PATCH",
    json: input,
  });
}

export function setDefaultGradeScale(gradeScaleId: string) {
  return apiFetch<GradeScale>(`/grade-scales/${gradeScaleId}/set-default`, {
    method: "PATCH",
  });
}

export function archiveGradeScale(gradeScaleId: string) {
  return apiFetch<GradeScale>(`/grade-scales/${gradeScaleId}/archive`, {
    method: "PATCH",
  });
}

export function activateGradeScale(gradeScaleId: string) {
  return apiFetch<GradeScale>(`/grade-scales/${gradeScaleId}/activate`, {
    method: "PATCH",
  });
}

export function addGradeScaleRule(
  gradeScaleId: string,
  input: CreateGradeScaleRuleInput,
) {
  return apiFetch<GradeScaleRule>(`/grade-scales/${gradeScaleId}/rules`, {
    method: "POST",
    json: input,
  });
}

export function updateGradeScaleRule(
  ruleId: string,
  input: UpdateGradeScaleRuleInput,
) {
  return apiFetch<GradeScaleRule>(`/grade-scale-rules/${ruleId}`, {
    method: "PATCH",
    json: input,
  });
}

export function applyGradeScaleMultiSchool(
  input: ApplyGradeScaleMultiSchoolInput,
) {
  return apiFetch<ApplyGradeScaleMultiSchoolResponse>(
    "/grade-scales/multi-school",
    {
      method: "POST",
      json: input,
    },
  );
}
