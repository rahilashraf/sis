import { apiFetch } from "./client";

export type StudentDocumentVisibility = "STAFF_ONLY" | "PARENT_PORTAL";

export type StudentDocument = {
  id: string;
  studentId: string;
  schoolId: string | null;
  type: string;
  visibility: StudentDocumentVisibility;
  label: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedByUserId: string;
  uploadedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function listStudentDocuments(studentId: string) {
  return apiFetch<StudentDocument[]>(`/students/${studentId}/documents`);
}

export function getStudentDocument(studentId: string, documentId: string) {
  return apiFetch<StudentDocument>(
    `/students/${studentId}/documents/${documentId}`,
  );
}

export function createStudentDocument(
  studentId: string,
  input: {
    type: "HEALTH_CARD" | "IMMUNIZATION_RECORD" | "REGISTRATION_FORM" | "OTHER";
    visibility?: StudentDocumentVisibility;
    label?: string | null;
    fileName: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
  },
) {
  return apiFetch<StudentDocument>(`/students/${studentId}/documents`, {
    method: "POST",
    json: input,
  });
}

export function archiveStudentDocument(studentId: string, documentId: string) {
  return apiFetch<StudentDocument>(
    `/students/${studentId}/documents/${documentId}/archive`,
    {
      method: "PATCH",
    },
  );
}

export function deleteStudentDocument(studentId: string, documentId: string) {
  return apiFetch<{ success: boolean; storagePath: string }>(
    `/students/${studentId}/documents/${documentId}`,
    {
      method: "DELETE",
    },
  );
}
