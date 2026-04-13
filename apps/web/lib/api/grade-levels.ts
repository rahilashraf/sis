import { apiFetch } from "./client";
import type { School } from "./schools";

export type GradeLevel = {
  id: string;
  schoolId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  school: School;
  _count: {
    students: number;
  };
};

export type CreateGradeLevelInput = {
  schoolId: string;
  name: string;
  sortOrder?: number;
};

export type UpdateGradeLevelInput = {
  name?: string;
  sortOrder?: number;
};

export type GradeLevelRemovalResult = {
  success: boolean;
  removalMode: "deleted" | "archived";
};

export function listGradeLevels(
  schoolId: string,
  options?: { includeInactive?: boolean },
) {
  const query = new URLSearchParams({ schoolId });

  if (options?.includeInactive) {
    query.set("includeInactive", "true");
  }

  return apiFetch<GradeLevel[]>(`/grade-levels?${query.toString()}`);
}

export function createGradeLevel(input: CreateGradeLevelInput) {
  return apiFetch<GradeLevel>("/grade-levels", {
    method: "POST",
    json: input,
  });
}

export function updateGradeLevel(gradeLevelId: string, input: UpdateGradeLevelInput) {
  return apiFetch<GradeLevel>(`/grade-levels/${gradeLevelId}`, {
    method: "PATCH",
    json: input,
  });
}

export function archiveGradeLevel(gradeLevelId: string) {
  return apiFetch<GradeLevel>(`/grade-levels/${gradeLevelId}/archive`, {
    method: "PATCH",
  });
}

export function activateGradeLevel(gradeLevelId: string) {
  return apiFetch<GradeLevel>(`/grade-levels/${gradeLevelId}/activate`, {
    method: "PATCH",
  });
}

export function deleteGradeLevel(gradeLevelId: string) {
  return apiFetch<GradeLevelRemovalResult>(`/grade-levels/${gradeLevelId}`, {
    method: "DELETE",
  });
}
