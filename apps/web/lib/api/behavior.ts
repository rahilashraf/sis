import { apiConfig } from "./config";
import { apiFetch } from "./client";
import { getStoredSessionSnapshot } from "../auth/storage";
import { normalizeDateOnlyPayload } from "../date";

export type BehaviorRecordType = "INCIDENT";
export type BehaviorRecordStatus = "OPEN" | "RESOLVED";
export type BehaviorSeverity = "LOW" | "MEDIUM" | "HIGH";
export type IncidentLevel = "MINOR" | "MAJOR";
export type IncidentAffectedPersonType = "STUDENT" | "STAFF" | "OTHER";
export type IncidentWitnessRole = "STAFF" | "STUDENT" | "OTHER";
export type IncidentFirstAidStatus = "YES" | "NO" | "NOT_APPLICABLE";
export type IncidentPostDestination =
  | "RETURNED_TO_CLASS_OR_WORK"
  | "HOME"
  | "HOSPITAL"
  | "OTHER";
export type IncidentJhscNotificationStatus = "YES" | "NO" | "NOT_APPLICABLE";

export type BehaviorCategoryOption = {
  id: string;
  schoolId: string | null;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type BehaviorAttachment = {
  id: string;
  behaviorRecordId: string;
  uploadedById: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  createdAt: string;
  updatedAt: string;
  uploadedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
};

export type IncidentWitness = {
  id: string;
  behaviorIncidentReportId: string;
  name: string;
  phoneNumber: string | null;
  role: IncidentWitnessRole | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type IncidentReport = {
  id: string;
  behaviorRecordId: string;
  program: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  reporterRole: string | null;
  affectedPersonType: IncidentAffectedPersonType | null;
  affectedPersonName: string | null;
  affectedPersonAddress: string | null;
  affectedPersonDateOfBirth: string | null;
  affectedPersonPhone: string | null;
  firstAidStatus: IncidentFirstAidStatus | null;
  firstAidAdministeredBy: string | null;
  firstAidAdministeredByPhone: string | null;
  firstAidDetails: string | null;
  isIncidentTimeApproximate: boolean;
  postIncidentDestination: IncidentPostDestination | null;
  postIncidentDestinationOther: string | null;
  jhscNotificationStatus: IncidentJhscNotificationStatus | null;
  additionalNotes: string | null;
  witnesses: IncidentWitness[];
  createdAt: string;
  updatedAt: string;
};

export type BehaviorRecord = {
  id: string;
  studentId: string;
  schoolId: string;
  recordedById: string;
  incidentAt: string;
  categoryOptionId: string | null;
  categoryName: string;
  severity: BehaviorSeverity;
  incidentLevel: IncidentLevel;
  type: BehaviorRecordType;
  title: string;
  description: string;
  actionTaken: string | null;
  followUpRequired: boolean;
  parentContacted: boolean;
  status: BehaviorRecordStatus;
  createdAt: string;
  updatedAt: string;
  recordedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  categoryOption?: {
    id: string;
    name: string;
    schoolId: string | null;
  } | null;
  incidentReport?: IncidentReport | null;
  attachments?: BehaviorAttachment[];
};

export type IncidentWitnessInput = {
  name: string;
  phoneNumber?: string | null;
  role?: IncidentWitnessRole;
  notes?: string | null;
};

export type IncidentReportInput = {
  program?: string | null;
  affectedPersonType?: IncidentAffectedPersonType;
  affectedPersonName?: string | null;
  affectedPersonAddress?: string | null;
  affectedPersonDateOfBirth?: string | null;
  affectedPersonPhone?: string | null;
  firstAidStatus?: IncidentFirstAidStatus;
  firstAidAdministeredBy?: string | null;
  firstAidAdministeredByPhone?: string | null;
  firstAidDetails?: string | null;
  isIncidentTimeApproximate?: boolean;
  postIncidentDestination?: IncidentPostDestination;
  postIncidentDestinationOther?: string | null;
  jhscNotificationStatus?: IncidentJhscNotificationStatus;
  additionalNotes?: string | null;
  witnesses?: IncidentWitnessInput[];
};

export type CreateBehaviorRecordInput = {
  studentId: string;
  incidentAt: string;
  categoryOptionId: string;
  incidentLevel: IncidentLevel;
  title: string;
  description: string;
  actionTaken?: string | null;
  followUpRequired?: boolean;
  parentContacted?: boolean;
  status?: BehaviorRecordStatus;
  incidentReport?: IncidentReportInput;
};

export type UpdateBehaviorRecordInput = {
  incidentAt?: string;
  categoryOptionId?: string | null;
  incidentLevel?: IncidentLevel;
  title?: string;
  description?: string;
  actionTaken?: string | null;
  followUpRequired?: boolean;
  parentContacted?: boolean;
  status?: BehaviorRecordStatus;
  incidentReport?: IncidentReportInput;
};

export type BehaviorStudentLookup = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: string | null;
  gradeLevel: {
    id: string;
    name: string;
  } | null;
  schools: Array<{
    id: string;
    name: string;
    shortName: string | null;
  }>;
};

export type BehaviorStudentPrefill = {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    dateOfBirth: string | null;
    address: string | null;
    phone: string | null;
    schools: Array<{
      id: string;
      name: string;
      shortName: string | null;
    }>;
  };
  reporter: {
    name: string | null;
    role: string | null;
    email: string | null;
  };
};

function normalizeIncidentReport(report: IncidentReport | null | undefined) {
  if (!report) {
    return report ?? null;
  }

  return {
    ...report,
    affectedPersonDateOfBirth:
      normalizeDateOnlyPayload(report.affectedPersonDateOfBirth) || null,
  };
}

function normalizeBehaviorRecord(record: BehaviorRecord): BehaviorRecord {
  return {
    ...record,
    incidentReport: normalizeIncidentReport(record.incidentReport),
  };
}

export function createBehaviorRecord(input: CreateBehaviorRecordInput) {
  return apiFetch<BehaviorRecord>(
    `/students/${input.studentId}/behavior-records`,
    {
      method: "POST",
      json: {
        incidentAt: input.incidentAt,
        categoryOptionId: input.categoryOptionId,
        incidentLevel: input.incidentLevel,
        title: input.title,
        description: input.description,
        actionTaken: input.actionTaken,
        followUpRequired: input.followUpRequired,
        parentContacted: input.parentContacted,
        status: input.status,
        incidentReport: input.incidentReport,
      },
    },
  ).then(normalizeBehaviorRecord);
}

export function listBehaviorRecordsForStudent(studentId: string) {
  return apiFetch<BehaviorRecord[]>(
    `/students/${studentId}/behavior-records`,
  ).then((records) => records.map(normalizeBehaviorRecord));
}

export function listBehaviorRecords(filters?: {
  studentId?: string;
  status?: BehaviorRecordStatus;
  incidentLevel?: IncidentLevel;
  category?: string;
  startDate?: string;
  endDate?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.studentId) params.set("studentId", filters.studentId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.incidentLevel)
    params.set("incidentLevel", filters.incidentLevel);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.startDate) params.set("startDate", filters.startDate);
  if (filters?.endDate) params.set("endDate", filters.endDate);

  return apiFetch<BehaviorRecord[]>(
    `/behavior-records${params.size ? `?${params.toString()}` : ""}`,
  ).then((records) => records.map(normalizeBehaviorRecord));
}

export function getBehaviorRecord(recordId: string) {
  return apiFetch<BehaviorRecord>(`/behavior-records/${recordId}`).then(
    normalizeBehaviorRecord,
  );
}

export function updateBehaviorRecord(
  recordId: string,
  input: UpdateBehaviorRecordInput,
) {
  return apiFetch<BehaviorRecord>(`/behavior-records/${recordId}`, {
    method: "PATCH",
    json: input,
  }).then(normalizeBehaviorRecord);
}

export function listBehaviorStudents(options?: {
  query?: string;
  schoolId?: string;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (options?.query) params.set("query", options.query);
  if (options?.schoolId) params.set("schoolId", options.schoolId);
  if (typeof options?.limit === "number")
    params.set("limit", `${options.limit}`);

  return apiFetch<BehaviorStudentLookup[]>(
    `/behavior/students${params.size ? `?${params.toString()}` : ""}`,
  );
}

export function getBehaviorStudentPrefill(studentId: string) {
  return apiFetch<BehaviorStudentPrefill>(
    `/behavior/students/${encodeURIComponent(studentId)}/prefill`,
  ).then((prefill) => ({
    ...prefill,
    student: {
      ...prefill.student,
      dateOfBirth:
        normalizeDateOnlyPayload(prefill.student.dateOfBirth) || null,
    },
  }));
}

export function listBehaviorCategories(options?: {
  includeInactive?: boolean;
  schoolId?: string;
}) {
  const params = new URLSearchParams();
  if (options?.includeInactive) {
    params.set("includeInactive", "true");
  }
  if (options?.schoolId) {
    params.set("schoolId", options.schoolId);
  }
  return apiFetch<BehaviorCategoryOption[]>(
    `/behavior-categories${params.size ? `?${params.toString()}` : ""}`,
  );
}

export function createBehaviorCategory(input: {
  name: string;
  schoolId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}) {
  return apiFetch<BehaviorCategoryOption>("/behavior-categories", {
    method: "POST",
    json: input,
  });
}

export function updateBehaviorCategory(
  id: string,
  input: {
    name?: string;
    schoolId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  return apiFetch<BehaviorCategoryOption>(`/behavior-categories/${id}`, {
    method: "PATCH",
    json: input,
  });
}

export function activateBehaviorCategory(id: string) {
  return apiFetch<BehaviorCategoryOption>(
    `/behavior-categories/${id}/activate`,
    {
      method: "PATCH",
    },
  );
}

export function deactivateBehaviorCategory(id: string) {
  return apiFetch<BehaviorCategoryOption>(
    `/behavior-categories/${id}/deactivate`,
    {
      method: "PATCH",
    },
  );
}

export function uploadBehaviorAttachment(recordId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch<BehaviorAttachment>(
    `/behavior-records/${recordId}/attachments`,
    {
      method: "POST",
      body: formData,
    },
  );
}

export function listBehaviorAttachments(recordId: string) {
  return apiFetch<BehaviorAttachment[]>(
    `/behavior-records/${recordId}/attachments`,
  );
}

export function deleteBehaviorAttachment(
  recordId: string,
  attachmentId: string,
) {
  return apiFetch<{ success: boolean; id: string }>(
    `/behavior-records/${recordId}/attachments/${attachmentId}`,
    {
      method: "DELETE",
    },
  );
}

export async function downloadBehaviorAttachment(
  recordId: string,
  attachmentId: string,
) {
  const token = getStoredSessionSnapshot()?.accessToken;
  if (!token) {
    throw new Error("Unauthorized");
  }

  const response = await fetch(
    `${apiConfig.baseUrl}/behavior-records/${recordId}/attachments/${attachmentId}/download`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error("Unable to download attachment.");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i);

  return {
    blob,
    fileName: fileNameMatch?.[1] ?? "attachment.pdf",
  };
}
