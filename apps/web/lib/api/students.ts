import type { AuthenticatedUser } from "../auth/types";
import { apiFetch } from "./client";

export type StudentGender = "MALE" | "FEMALE";

export type StudentGradeLevel = {
  id: string;
  schoolId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type StudentProfile = AuthenticatedUser & {
  gradeLevelId: string | null;
  gradeLevel: StudentGradeLevel | null;
  studentNumber: string | null;
  oen: string | null;
  dateOfBirth: string | null;
  gender: StudentGender | null;
  studentEmail: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  healthCardNumber: string | null;
  guardian1Name: string | null;
  guardian1Email: string | null;
  guardian1Phone: string | null;
  guardian1Address: string | null;
  guardian1Relationship: string | null;
  guardian1WorkPhone: string | null;
  guardian2Name: string | null;
  guardian2Email: string | null;
  guardian2Phone: string | null;
  guardian2Address: string | null;
  guardian2Relationship: string | null;
  guardian2WorkPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
};

export type StudentParentLink = {
  id: string;
  parentId: string;
  studentId: string;
  createdAt: string;
  parent: AuthenticatedUser;
};

export type ParentStudentLink = {
  id: string;
  parentId: string;
  studentId: string;
  createdAt: string;
  student: AuthenticatedUser;
};

export type UpdateStudentInput = {
  gradeLevelId?: string | null;
  studentNumber?: string | null;
  oen?: string | null;
  dateOfBirth?: string | null;
  gender?: StudentGender | null;
  studentEmail?: string | null;
  allergies?: string | null;
  medicalConditions?: string | null;
  healthCardNumber?: string | null;
  guardian1Name?: string | null;
  guardian1Email?: string | null;
  guardian1Phone?: string | null;
  guardian1Address?: string | null;
  guardian1Relationship?: string | null;
  guardian1WorkPhone?: string | null;
  guardian2Name?: string | null;
  guardian2Email?: string | null;
  guardian2Phone?: string | null;
  guardian2Address?: string | null;
  guardian2Relationship?: string | null;
  guardian2WorkPhone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
};

export type ReRegistrationInput = Omit<
  UpdateStudentInput,
  "gradeLevelId" | "studentNumber" | "oen"
>;

function normalizeStudentProfile(student: Partial<StudentProfile>): StudentProfile {
  return {
    id: student.id ?? "",
    username: student.username ?? "",
    email: student.email ?? null,
    firstName: student.firstName ?? "",
    lastName: student.lastName ?? "",
    role: student.role ?? "STUDENT",
    isActive: student.isActive ?? false,
    createdAt: student.createdAt ?? "",
    updatedAt: student.updatedAt ?? "",
    memberships: student.memberships ?? [],
    gradeLevelId: student.gradeLevelId ?? null,
    gradeLevel: student.gradeLevel ?? null,
    studentNumber: student.studentNumber ?? null,
    oen: student.oen ?? null,
    dateOfBirth: student.dateOfBirth ?? null,
    gender: student.gender ?? null,
    studentEmail: student.studentEmail ?? null,
    allergies: student.allergies ?? null,
    medicalConditions: student.medicalConditions ?? null,
    healthCardNumber: student.healthCardNumber ?? null,
    guardian1Name: student.guardian1Name ?? null,
    guardian1Email: student.guardian1Email ?? null,
    guardian1Phone: student.guardian1Phone ?? null,
    guardian1Address: student.guardian1Address ?? null,
    guardian1Relationship: student.guardian1Relationship ?? null,
    guardian1WorkPhone: student.guardian1WorkPhone ?? null,
    guardian2Name: student.guardian2Name ?? null,
    guardian2Email: student.guardian2Email ?? null,
    guardian2Phone: student.guardian2Phone ?? null,
    guardian2Address: student.guardian2Address ?? null,
    guardian2Relationship: student.guardian2Relationship ?? null,
    guardian2WorkPhone: student.guardian2WorkPhone ?? null,
    addressLine1: student.addressLine1 ?? null,
    addressLine2: student.addressLine2 ?? null,
    city: student.city ?? null,
    province: student.province ?? null,
    postalCode: student.postalCode ?? null,
    emergencyContactName: student.emergencyContactName ?? null,
    emergencyContactPhone: student.emergencyContactPhone ?? null,
    emergencyContactRelationship: student.emergencyContactRelationship ?? null,
  };
}

export async function getStudentById(studentId: string) {
  const response = await apiFetch<Partial<StudentProfile>>(`/students/${studentId}`);
  return normalizeStudentProfile(response);
}

export function updateStudent(studentId: string, input: UpdateStudentInput) {
  return apiFetch<StudentProfile>(`/students/${studentId}`, {
    method: "PATCH",
    json: input,
  });
}

export function reRegisterStudent(
  studentId: string,
  input: ReRegistrationInput,
  options?: { schoolYearId?: string | null },
) {
  const query = new URLSearchParams();
  if (options?.schoolYearId) {
    query.set("schoolYearId", options.schoolYearId);
  }

  return apiFetch<StudentProfile>(
    `/students/${studentId}/re-registration${query.size ? `?${query.toString()}` : ""}`,
    {
    method: "PATCH",
    json: input,
    },
  );
}

export function listStudentParents(studentId: string) {
  return apiFetch<StudentParentLink[]>(`/students/${studentId}/parents`);
}

export function createStudentParentLink(parentId: string, studentId: string) {
  return apiFetch<StudentParentLink>("/student-parent-links", {
    method: "POST",
    json: {
      parentId,
      studentId,
    },
  });
}

export function deleteStudentParentLink(linkId: string) {
  return apiFetch<{
    id: string;
    parentId: string;
    studentId: string;
    createdAt: string;
  }>(`/student-parent-links/${linkId}`, {
    method: "DELETE",
  });
}

export function listParentStudents(parentId: string) {
  return apiFetch<ParentStudentLink[]>(`/parents/${parentId}/students`);
}
