import { apiFetch } from "./client";

export type ReRegistrationWindow = {
  id: string;
  schoolId: string;
  schoolYearId: string;
  opensAt: string;
  closesAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReRegistrationWindowStatus = {
  now: string;
  window: ReRegistrationWindow | null;
  isOpen: boolean;
  status: "OPEN" | "UPCOMING" | "CLOSED" | "NOT_CONFIGURED";
};

export type ReRegistrationTrackingFilters = {
  submissionStatus?: "ALL" | "SUBMITTED" | "PENDING";
  returningIntent?: "ALL" | "RETURNING" | "NOT_RETURNING";
  reason?:
    | "MOVING"
    | "TRANSFERRING_SCHOOLS"
    | "HOMESCHOOLING"
    | "GRADUATING"
    | "FINANCIAL"
    | "OTHER"
    | "";
  gradeLevelId?: string;
  classId?: string;
  query?: string;
};

export type ReRegistrationTrackingResponse = {
  window: ReRegistrationWindow;
  summary: {
    totalStudents: number;
    submittedCount: number;
    pendingCount: number;
    returningCount: number;
    nonReturningCount: number;
  };
  availableFilters: {
    classes: Array<{ id: string; name: string }>;
    gradeLevels: Array<{ id: string; name: string }>;
    reasons: Array<
      "MOVING" | "TRANSFERRING_SCHOOLS" | "HOMESCHOOLING" | "GRADUATING" | "FINANCIAL" | "OTHER"
    >;
  };
  filtersApplied: {
    submissionStatus: "ALL" | "SUBMITTED" | "PENDING";
    returningIntent: "ALL" | "RETURNING" | "NOT_RETURNING";
    reason: string | null;
    gradeLevelId: string | null;
    classId: string | null;
    query: string | null;
  };
  rows: Array<{
    studentId: string;
    firstName: string;
    lastName: string;
    gradeLevelId: string | null;
    gradeLevelName: string | null;
    classNames: string[];
    isSubmitted: boolean;
    submittedAt: string | null;
    lastRemindedAt: string | null;
    returningNextYear: boolean | null;
    nonReturningReason:
      | "MOVING"
      | "TRANSFERRING_SCHOOLS"
      | "HOMESCHOOLING"
      | "GRADUATING"
      | "FINANCIAL"
      | "OTHER"
      | null;
    nonReturningComment: string | null;
  }>;
};

export type ReRegistrationBulkReminderResult = {
  windowId: string;
  eligibleStudents: number;
  pendingStudents: number;
  studentsReminded: number;
  notificationsSent: number;
  skippedNoLinkedParent: number;
  skippedAlreadySubmitted: number;
  skippedRecentlyReminded: number;
  throttleMinutes: number;
};

export type ReRegistrationStudentReminderResult = {
  windowId: string;
  studentId: string;
  status:
    | "REMINDER_SENT"
    | "SKIPPED_ALREADY_SUBMITTED"
    | "SKIPPED_NO_LINKED_PARENT"
    | "SKIPPED_RECENTLY_REMINDED";
  notificationsSent: number;
  throttleMinutes?: number;
};

export function getReRegistrationWindowStatus(options: { schoolId: string; schoolYearId: string }) {
  const query = new URLSearchParams({ schoolId: options.schoolId, schoolYearId: options.schoolYearId });
  return apiFetch<ReRegistrationWindowStatus>(`/re-registration/window?${query.toString()}`);
}

export type ReRegistrationWindowStatusForStudent = {
  studentId: string;
  schoolId: string | null;
  schoolYearId: string | null;
  now: string;
  window: ReRegistrationWindow | null;
  existingSubmission: {
    submittedAt: string;
    returningNextYear: boolean;
    nonReturningReason:
      | "MOVING"
      | "TRANSFERRING_SCHOOLS"
      | "HOMESCHOOLING"
      | "GRADUATING"
      | "FINANCIAL"
      | "OTHER"
      | null;
    nonReturningComment: string | null;
  } | null;
  submittedAt: string | null;
  canEdit: boolean;
  isOpen: boolean;
  status: "OPEN" | "UPCOMING" | "CLOSED" | "NOT_CONFIGURED";
};

export function getReRegistrationWindowStatusForStudent(studentId: string) {
  return apiFetch<ReRegistrationWindowStatusForStudent>(
    `/re-registration/window/for-student/${encodeURIComponent(studentId)}`,
  );
}

export function createReRegistrationWindow(input: {
  schoolId: string;
  schoolYearId: string;
  opensAt: string;
  closesAt: string;
  isActive?: boolean;
}) {
  return apiFetch<ReRegistrationWindow>("/re-registration/window", {
    method: "POST",
    json: input,
  });
}

export function updateReRegistrationWindow(
  id: string,
  input: Partial<Pick<ReRegistrationWindow, "opensAt" | "closesAt" | "isActive">>,
) {
  return apiFetch<ReRegistrationWindow>(`/re-registration/window/${id}`, {
    method: "PATCH",
    json: input,
  });
}

export function listReRegistrationWindows(options: { schoolId: string; schoolYearId: string }) {
  const query = new URLSearchParams({
    schoolId: options.schoolId,
    schoolYearId: options.schoolYearId,
  });
  return apiFetch<ReRegistrationWindow[]>(`/re-registration/windows?${query.toString()}`);
}

export function getReRegistrationWindowTracking(
  windowId: string,
  filters?: ReRegistrationTrackingFilters,
) {
  const query = new URLSearchParams();

  if (filters?.submissionStatus) {
    query.set("submissionStatus", filters.submissionStatus);
  }

  if (filters?.returningIntent) {
    query.set("returningIntent", filters.returningIntent);
  }

  if (filters?.reason) {
    query.set("reason", filters.reason);
  }

  if (filters?.gradeLevelId) {
    query.set("gradeLevelId", filters.gradeLevelId);
  }

  if (filters?.classId) {
    query.set("classId", filters.classId);
  }

  if (filters?.query?.trim()) {
    query.set("query", filters.query.trim());
  }

  return apiFetch<ReRegistrationTrackingResponse>(
    `/re-registration/window/${windowId}/tracking${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function remindAllPendingForWindow(windowId: string) {
  return apiFetch<ReRegistrationBulkReminderResult>(
    `/re-registration/window/${windowId}/remind-all`,
    {
      method: "POST",
    },
  );
}

export function remindPendingForStudent(windowId: string, studentId: string) {
  return apiFetch<ReRegistrationStudentReminderResult>(
    `/re-registration/window/${windowId}/remind-student/${encodeURIComponent(studentId)}`,
    {
      method: "POST",
    },
  );
}
