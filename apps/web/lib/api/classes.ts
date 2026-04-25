import type { AuthenticatedUser } from "../auth/types";
import type { School, SchoolYear } from "./schools";
import { apiFetch } from "./client";

export type TeacherAssignmentType = "REGULAR" | "SUPPLY";

export type TeacherAssignment = {
  id: string;
  classId: string;
  teacherId: string;
  assignmentType: TeacherAssignmentType;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
  teacher: AuthenticatedUser;
};

export type StudentEnrollment = {
  id: string;
  classId: string;
  studentId: string;
  createdAt: string;
  student: AuthenticatedUser;
};

export type SchoolClass = {
  id: string;
  schoolId: string;
  schoolYearId: string;
  gradeLevelId: string | null;
  subjectOptionId: string | null;
  name: string;
  subject: string | null;
  isHomeroom: boolean;
  takesAttendance: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  school: School;
  schoolYear: SchoolYear;
  gradeLevel?: {
    id: string;
    name: string;
  } | null;
  subjectOption?: {
    id: string;
    name: string;
    isActive: boolean;
  } | null;
  teachers: TeacherAssignment[];
  students?: StudentEnrollment[];
  _count?: {
    students: number;
  };
};
export type ClassRemovalResult = {
  success: boolean;
  removalMode: "deleted" | "archived";
  reason?: string;
};

export type BulkEnrollmentIssue = {
  studentId: string;
  classId: string;
  reason: string;
};

export type BulkEnrollmentWarning = {
  studentId: string;
  classId: string;
  message: string;
};

export type BulkEnrollmentResult = {
  success: StudentEnrollment[];
  skipped: BulkEnrollmentIssue[];
  failed: BulkEnrollmentIssue[];
  warnings: BulkEnrollmentWarning[];
};

export type DuplicateClassInput = {
  targetSchoolId: string;
  targetSchoolYearId: string;
  targetName?: string;
  targetGradeLevelId?: string;
  targetSubjectOptionId?: string;
  targetTeacherId?: string;
  isHomeroom?: boolean;
  takesAttendance?: boolean;
  copyAssessmentCategories?: boolean;
  copyAssessments?: boolean;
};

export type CopyGradebookSettingsInput = {
  targetClassId: string;
  copyAssessmentCategories?: boolean;
};

export type CreateClassInput = {
  schoolId: string;
  schoolYearId: string;
  gradeLevelId: string;
  subjectOptionId: string;
  name: string;
  isHomeroom?: boolean;
  takesAttendance?: boolean;
};

export type UpdateClassInput = {
  name?: string;
  gradeLevelId?: string;
  subjectOptionId?: string;
  isHomeroom?: boolean;
  takesAttendance?: boolean;
  isActive?: boolean;
};

export function listClasses(options?: {
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

  return apiFetch<SchoolClass[]>(
    `/classes${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function getClassById(classId: string) {
  return apiFetch<SchoolClass>(`/classes/${classId}`);
}

export function listMyClasses() {
  return apiFetch<SchoolClass[]>("/classes/my");
}

export function createClass(input: CreateClassInput) {
  return apiFetch<SchoolClass>("/classes", {
    method: "POST",
    json: input,
  });
}

export function updateClass(classId: string, input: UpdateClassInput) {
  return apiFetch<SchoolClass>(`/classes/${classId}`, {
    method: "PATCH",
    json: input,
  });
}

export function assignTeacher(
  classId: string,
  input: {
    teacherId: string;
    assignmentType?: TeacherAssignmentType;
    startsAt?: string | null;
    endsAt?: string | null;
  },
) {
  return apiFetch<TeacherAssignment>(`/classes/${classId}/assign-teacher`, {
    method: "POST",
    json: input,
  });
}

export function updateTeacherAssignment(
  classId: string,
  teacherId: string,
  input: {
    assignmentType?: TeacherAssignmentType;
    startsAt?: string | null;
    endsAt?: string | null;
  },
) {
  return apiFetch<TeacherAssignment>(
    `/classes/${classId}/teachers/${teacherId}`,
    {
      method: "PATCH",
      json: input,
    },
  );
}

export function removeTeacher(classId: string, teacherId: string) {
  return apiFetch<TeacherAssignment>(
    `/classes/${classId}/teachers/${teacherId}`,
    {
      method: "DELETE",
    },
  );
}

export function enrollStudent(classId: string, studentId: string) {
  return apiFetch<StudentEnrollment>(`/classes/${classId}/enroll-student`, {
    method: "POST",
    json: { studentId },
  });
}

export function bulkEnrollStudentAcrossClasses(input: {
  studentId: string;
  classIds: string[];
}) {
  return apiFetch<BulkEnrollmentResult>("/classes/bulk-enroll", {
    method: "POST",
    json: input,
  });
}

export function bulkEnrollStudentsIntoClass(
  classId: string,
  input: { studentIds: string[] },
) {
  return apiFetch<BulkEnrollmentResult>(
    `/classes/${classId}/bulk-enroll-students`,
    {
      method: "POST",
      json: input,
    },
  );
}

export function removeStudent(classId: string, studentId: string) {
  return apiFetch<StudentEnrollment>(
    `/classes/${classId}/students/${studentId}`,
    {
      method: "DELETE",
    },
  );
}

export function deleteClass(classId: string) {
  return apiFetch<ClassRemovalResult>(`/classes/${classId}`, {
    method: "DELETE",
  });
}

export function duplicateClass(classId: string, input: DuplicateClassInput) {
  return apiFetch<{
    class: SchoolClass;
    copiedFromClassId: string;
    copiedWeightingMode: boolean;
    copiedAssessmentCategories: {
      copied: boolean;
      createdCount: number;
      updatedCount: number;
      sourceCount: number;
    };
    copiedAssessments: boolean;
    copiedEnrollments: boolean;
    copiedGrades: boolean;
    copiedTeacherAssignments?: number;
    skippedTeacherAssignments?: number;
  }>(`/classes/${classId}/duplicate`, {
    method: "POST",
    json: input,
  });
}

export function copyGradebookSettings(
  sourceClassId: string,
  input: CopyGradebookSettingsInput,
) {
  return apiFetch<{
    sourceClassId: string;
    targetClassId: string;
    weightingMode: "UNWEIGHTED" | "ASSESSMENT_WEIGHTED" | "CATEGORY_WEIGHTED";
    copiedAssessmentCategories: {
      copied: boolean;
      createdCount: number;
      updatedCount: number;
      sourceCount: number;
    };
    copiedAssessments: boolean;
    copiedGrades: boolean;
    copiedEnrollments: boolean;
  }>(`/classes/${sourceClassId}/copy-gradebook-settings`, {
    method: "POST",
    json: input,
  });
}

export function listClassesForStudent(studentId: string) {
  return apiFetch<
    Array<{
      id: string;
      classId: string;
      studentId: string;
      createdAt: string;
      class: SchoolClass;
    }>
  >(`/classes/student/${studentId}`).then((enrollments) =>
    enrollments.map((enrollment) => enrollment.class),
  );
}
