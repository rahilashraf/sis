import { apiFetch } from "./client";

export type StudentGradeSummary = {
  classId: string;
  studentId: string;
  assessmentCount: number;
  gradedCount: number;
  averagePercent: number | null;
  averageLetterGrade: string | null;
  calculatedAveragePercent?: number | null;
  calculatedAverageLetterGrade?: string | null;
  usesWeights: boolean;
  weightingMode?: "UNWEIGHTED" | "ASSESSMENT_WEIGHTED" | "CATEGORY_WEIGHTED";
  override?: {
    id: string;
    overridePercent: number | null;
    overrideLetterGrade: string | null;
    overrideReason: string | null;
    overriddenByUserId: string;
    updatedAt: string;
  } | null;
  assessments: Array<{
    id: string;
    title: string;
    maxScore: number;
    weight: number;
    categoryId?: string | null;
    dueAt: string | null;
    reportingPeriod: {
      id: string;
      name: string;
      order: number;
      startsAt: string;
      endsAt: string;
    } | null;
    isPublishedToParents: boolean;
    assessmentType: { id: string; key: string; name: string };
    percent: number | null;
    score: number | null;
    rawScore?: number | null;
    statusLabelId?: string | null;
    statusLabel?: {
      key: string;
      label: string;
      behavior: "COUNT_AS_ZERO" | "EXCLUDE_FROM_CALCULATION" | "INFORMATION_ONLY";
    } | null;
    comment: string | null;
  }>;
};

export type ClassGradeSummary = {
  classId: string;
  schoolId: string;
  schoolYearId: string;
  assessmentCount: number;
  studentCount: number;
  overallAveragePercent: number | null;
  overallLetterGrade: string | null;
  weightingMode?: "UNWEIGHTED" | "ASSESSMENT_WEIGHTED" | "CATEGORY_WEIGHTED";
  assessments: Array<{
    id: string;
    title: string;
    maxScore: number;
    weight: number;
    categoryId?: string | null;
    dueAt: string | null;
    reportingPeriod: {
      id: string;
      name: string;
      order: number;
      startsAt: string;
      endsAt: string;
    } | null;
    isPublishedToParents: boolean;
    assessmentType: { id: string; key: string; name: string };
    gradedCount: number;
    averagePercent: number | null;
  }>;
  students: Array<{
    student: { id: string; firstName: string; lastName: string };
    assessmentCount: number;
    gradedCount: number;
    averagePercent: number | null;
    averageLetterGrade: string | null;
    calculatedAveragePercent?: number | null;
    calculatedAverageLetterGrade?: string | null;
    usesWeights: boolean;
    weightingMode?: "UNWEIGHTED" | "ASSESSMENT_WEIGHTED" | "CATEGORY_WEIGHTED";
    override?: {
      id: string;
      overridePercent: number | null;
      overrideLetterGrade: string | null;
      overrideReason: string | null;
      overriddenByUserId: string;
      updatedAt: string;
    } | null;
  }>;
};

export type ClassGradebookGrid = {
  classId: string;
  schoolId: string;
  schoolYearId: string;
  weightingMode?: "UNWEIGHTED" | "ASSESSMENT_WEIGHTED" | "CATEGORY_WEIGHTED";
  assessmentCount: number;
  studentCount: number;
  assessments: Array<{
    id: string;
    title: string;
    maxScore: number;
    weight: number;
    categoryId?: string | null;
    dueAt: string | null;
    isPublishedToParents: boolean;
    assessmentType: { id: string; key: string; name: string };
    reportingPeriod: {
      id: string;
      name: string;
      order: number;
      isLocked: boolean;
      startsAt: string;
      endsAt: string;
    } | null;
    results: Array<{
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
      updatedAt: string;
    }>;
  }>;
  students: Array<{
    id: string;
    username: string;
    firstName: string;
    lastName: string;
  }>;
};

export function getStudentGradeSummary(studentId: string, classId: string) {
  const query = new URLSearchParams({ classId });
  return apiFetch<StudentGradeSummary>(
    `/students/${studentId}/grade-summary?${query.toString()}`,
  );
}

export function getStudentGrades(studentId: string, classId: string) {
  const query = new URLSearchParams({ classId });
  return apiFetch<unknown[]>(
    `/students/${studentId}/grades?${query.toString()}`,
  );
}

export function getClassGradeSummary(classId: string) {
  return apiFetch<ClassGradeSummary>(`/classes/${classId}/grade-summary`);
}

export function getClassGradebookGrid(classId: string) {
  return apiFetch<ClassGradebookGrid>(`/classes/${classId}/gradebook-grid`);
}

export type StudentInClassSummary = {
  classId: string;
  studentId: string;
  schoolId: string;
  schoolYearId: string;
  assessmentCount: number;
  gradedCount: number;
  averagePercent: number | null;
  averageLetterGrade: string | null;
  calculatedAveragePercent?: number | null;
  calculatedAverageLetterGrade?: string | null;
  usesWeights: boolean;
  weightingMode?: "UNWEIGHTED" | "ASSESSMENT_WEIGHTED" | "CATEGORY_WEIGHTED";
  override?: {
    id: string;
    overridePercent: number | null;
    overrideLetterGrade: string | null;
    overrideReason: string | null;
    overriddenByUserId: string;
    updatedAt: string;
  } | null;
  groups: Array<{
    reportingPeriod: {
      id: string;
      name: string;
      order: number;
      isLocked: boolean;
      startsAt: string;
      endsAt: string;
    } | null;
    assessments: Array<{
      id: string;
      title: string;
      maxScore: number;
      weight: number;
      categoryId?: string | null;
      dueAt: string | null;
      reportingPeriod: {
        id: string;
        name: string;
        order: number;
        isLocked: boolean;
        startsAt: string;
        endsAt: string;
      } | null;
      isPublishedToParents: boolean;
      assessmentType: { id: string; key: string; name: string };
      percent: number | null;
      score: number | null;
      rawScore?: number | null;
      statusLabelId?: string | null;
      statusLabel?: {
        key: string;
        label: string;
        behavior: "COUNT_AS_ZERO" | "EXCLUDE_FROM_CALCULATION" | "INFORMATION_ONLY";
      } | null;
      comment: string | null;
    }>;
  }>;
};

export function getStudentInClassSummary(classId: string, studentId: string) {
  return apiFetch<StudentInClassSummary>(
    `/classes/${classId}/students/${studentId}/summary`,
  );
}

export type StudentAcademicOverview = {
  studentId: string;
  classes: Array<{
    class: {
      id: string;
      name: string;
      subject: string | null;
      schoolId: string;
      schoolYearId: string;
      school: { id: string; name: string; shortName: string | null; isActive: boolean };
      schoolYear: {
        id: string;
        schoolId: string;
        name: string;
        startDate: string;
        endDate: string;
        isActive: boolean;
      };
    };
    assessmentCount: number;
    gradedCount: number;
    averagePercent: number | null;
    averageLetterGrade: string | null;
    calculatedAveragePercent?: number | null;
    calculatedAverageLetterGrade?: string | null;
    usesWeights: boolean;
    weightingMode?: "UNWEIGHTED" | "ASSESSMENT_WEIGHTED" | "CATEGORY_WEIGHTED";
    override?: {
      id: string;
      overridePercent: number | null;
      overrideLetterGrade: string | null;
      overrideReason: string | null;
      overriddenByUserId: string;
      updatedAt: string;
    } | null;
  }>;
};

export function getStudentAcademicOverview(studentId: string) {
  return apiFetch<StudentAcademicOverview>(`/students/${studentId}/academic-overview`);
}

export type GradebookSettings = {
  classId: string;
  schoolId: string;
  schoolYearId: string;
  weightingMode: "UNWEIGHTED" | "ASSESSMENT_WEIGHTED" | "CATEGORY_WEIGHTED";
};

export function getGradebookSettings(classId: string) {
  return apiFetch<GradebookSettings>(`/classes/${classId}/gradebook-settings`);
}

export function updateGradebookSettings(
  classId: string,
  input: { weightingMode: GradebookSettings["weightingMode"] },
) {
  return apiFetch<{ classId: string; weightingMode: GradebookSettings["weightingMode"] }>(
    `/classes/${classId}/gradebook-settings`,
    { method: "PATCH", json: input },
  );
}

export type AssessmentCategory = {
  id: string;
  classId: string;
  name: string;
  sortOrder: number;
  weight: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export function listAssessmentCategories(classId: string, options?: { includeInactive?: boolean }) {
  const query = new URLSearchParams();
  if (options?.includeInactive) {
    query.set("includeInactive", "true");
  }
  return apiFetch<AssessmentCategory[]>(
    `/classes/${classId}/assessment-categories${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function createAssessmentCategory(
  classId: string,
  input: { name: string; sortOrder?: number; weight?: number | null },
) {
  return apiFetch<AssessmentCategory>(`/classes/${classId}/assessment-categories`, {
    method: "POST",
    json: input,
  });
}

export function updateAssessmentCategory(
  categoryId: string,
  input: Partial<Pick<AssessmentCategory, "name" | "sortOrder" | "weight" | "isActive">>,
) {
  return apiFetch<AssessmentCategory>(`/assessment-categories/${categoryId}`, {
    method: "PATCH",
    json: input,
  });
}

export type GradeOverride = {
  id: string;
  classId: string;
  studentId: string;
  reportingPeriodId: string | null;
  overridePercent: number | null;
  overrideLetterGrade: string | null;
  overrideReason: string | null;
  overriddenByUserId: string;
  createdAt?: string;
  updatedAt: string;
};

export function getGradeOverride(options: { classId: string; studentId: string; reportingPeriodId?: string | null }) {
  const query = new URLSearchParams();
  if (options.reportingPeriodId) {
    query.set("reportingPeriodId", options.reportingPeriodId);
  }
  return apiFetch<GradeOverride | null>(
    `/classes/${options.classId}/students/${options.studentId}/grade-override${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function upsertGradeOverride(
  options: { classId: string; studentId: string },
  input: {
    reportingPeriodId?: string | null;
    overridePercent?: number | null;
    overrideReason?: string | null;
  },
) {
  return apiFetch<GradeOverride>(`/classes/${options.classId}/students/${options.studentId}/grade-override`, {
    method: "PUT",
    json: input,
  });
}

export function deleteGradeOverride(options: { classId: string; studentId: string; reportingPeriodId?: string | null }) {
  const query = new URLSearchParams();
  if (options.reportingPeriodId) {
    query.set("reportingPeriodId", options.reportingPeriodId);
  }
  return apiFetch<{ success: boolean }>(
    `/classes/${options.classId}/students/${options.studentId}/grade-override${query.size ? `?${query.toString()}` : ""}`,
    { method: "DELETE" },
  );
}
