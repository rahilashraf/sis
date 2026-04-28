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

export type SchoolYearRolloverInput = {
  schoolId: string;
  sourceSchoolYearId: string;
  targetSchoolYearName: string;
  targetStartDate: string;
  targetEndDate: string;
  copyGradeLevels?: boolean;
  copyClassTemplates?: boolean;
  promoteStudents?: boolean;
  graduateFinalGradeStudents?: boolean;
  archivePriorYearLeftovers?: boolean;
  activateTargetSchoolYear?: boolean;
};

export type SchoolYearRolloverPreview = {
  sourceSchoolYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  };
  targetSchoolYear: {
    mode: "create" | "reuse";
    id: string | null;
    name: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  };
  options: Required<
    Pick<
      SchoolYearRolloverInput,
      | "copyGradeLevels"
      | "copyClassTemplates"
      | "promoteStudents"
      | "graduateFinalGradeStudents"
      | "archivePriorYearLeftovers"
      | "activateTargetSchoolYear"
    >
  >;
  summary: {
    gradeLevelsToReactivate: number;
    classTemplatesToCreate: number;
    classTemplatesAlreadyPresent: number;
    promotableStudents: number;
    graduatingStudents: number;
    studentsWithoutGradeLevel: number;
    studentsWithoutNextGradeLevel: number;
    activeStudentsInSchool: number;
    activeClassesToArchiveFromSource: number;
  };
  warnings: string[];
  highestGradeLevelName: string | null;
  reversibleNotes: string[];
};

export type SchoolYearRolloverExecuteResult = {
  success: boolean;
  sourceSchoolYearId: string;
  targetSchoolYearId: string;
  targetSchoolYearName: string;
  summary: {
    reactivatedGradeLevels: number;
    createdClassTemplates: number;
    skippedExistingClassTemplates: number;
    promotedStudentCount: number;
    graduatedStudentCount: number;
    archivedSourceClassCount: number;
  };
  warnings: string[];
  reversibleNotes: string[];
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

  return apiFetch<School[]>(
    `/schools${query.size ? `?${query.toString()}` : ""}`,
  );
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

  const response = await apiFetch<RawSchoolYear[]>(
    `/school-years?${query.toString()}`,
  );
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
  const response = await apiFetch<RawSchoolYear>(
    `/school-years/${schoolYearId}`,
    {
      method: "PATCH",
      json: {
        ...input,
        ...(input.startDate !== undefined
          ? { startDate: toDateOnly(input.startDate) }
          : {}),
        ...(input.endDate !== undefined
          ? { endDate: toDateOnly(input.endDate) }
          : {}),
      },
    },
  );

  return normalizeSchoolYear(response);
}

export async function endSchoolYear(schoolYearId: string) {
  const response = await apiFetch<RawSchoolYear>(
    `/school-years/${schoolYearId}/end`,
    {
      method: "PATCH",
    },
  );

  return normalizeSchoolYear(response);
}

export const archiveSchoolYear = endSchoolYear;

function buildSchoolYearRolloverPayload(input: SchoolYearRolloverInput) {
  return {
    ...input,
    targetStartDate: toDateOnly(input.targetStartDate),
    targetEndDate: toDateOnly(input.targetEndDate),
  };
}

export async function previewSchoolYearRollover(input: SchoolYearRolloverInput) {
  const response = await apiFetch<SchoolYearRolloverPreview>(
    "/school-years/rollover/preview",
    {
      method: "POST",
      json: buildSchoolYearRolloverPayload(input),
    },
  );

  return {
    ...response,
    sourceSchoolYear: {
      ...response.sourceSchoolYear,
      startDate: toDateOnly(response.sourceSchoolYear.startDate),
      endDate: toDateOnly(response.sourceSchoolYear.endDate),
    },
    targetSchoolYear: {
      ...response.targetSchoolYear,
      startDate: toDateOnly(response.targetSchoolYear.startDate),
      endDate: toDateOnly(response.targetSchoolYear.endDate),
    },
  };
}

export function executeSchoolYearRollover(input: SchoolYearRolloverInput) {
  return apiFetch<SchoolYearRolloverExecuteResult>(
    "/school-years/rollover/execute",
    {
      method: "POST",
      json: buildSchoolYearRolloverPayload(input),
    },
  );
}

export async function activateSchoolYear(schoolYearId: string) {
  const response = await apiFetch<RawSchoolYear>(
    `/school-years/${schoolYearId}/activate`,
    {
      method: "PATCH",
    },
  );

  return normalizeSchoolYear(response);
}

export function deleteSchoolYear(schoolYearId: string) {
  return apiFetch<SchoolRemovalResult>(`/school-years/${schoolYearId}`, {
    method: "DELETE",
  });
}
