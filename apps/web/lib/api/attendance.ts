import type { AuthenticatedUser } from "../auth/types";
import type { SchoolClass } from "./classes";
import type { School, SchoolYear } from "./schools";
import { apiFetch } from "./client";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
export type AttendanceStatusCountBehavior =
  | "PRESENT"
  | "LATE"
  | "ABSENT"
  | "INFORMATIONAL";

export type AttendanceCustomStatus = {
  id: string;
  schoolId: string;
  label: string;
  behavior: AttendanceStatusCountBehavior;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceStudent = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string | null;
  classIds: string[];
  classNames: string[];
};

export type AttendanceStudentLookup = {
  classes: Pick<SchoolClass, "id" | "name" | "subject" | "isHomeroom">[];
  students: AttendanceStudent[];
};

export type AttendanceSessionClass = {
  id: string;
  attendanceSessionId: string;
  classId: string;
  createdAt: string;
  class: Pick<
    SchoolClass,
    | "id"
    | "schoolId"
    | "schoolYearId"
    | "name"
    | "subject"
    | "isHomeroom"
    | "isActive"
    | "createdAt"
    | "updatedAt"
  >;
};

export type AttendanceRecord = {
  id: string;
  attendanceSessionId: string;
  studentId: string;
  date: string;
  status: AttendanceStatus;
  customStatusId: string | null;
  customStatus: AttendanceCustomStatus | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
  student: AuthenticatedUser;
};

export type AttendanceSession = {
  id: string;
  schoolId: string;
  schoolYearId: string | null;
  takenById: string | null;
  date: string;
  scopeType: string;
  scopeLabel: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  school: School;
  schoolYear: SchoolYear | null;
  takenBy: AuthenticatedUser | null;
  classes: AttendanceSessionClass[];
  records: AttendanceRecord[];
};

export type AttendanceStatusRule = {
  schoolId: string;
  status: AttendanceStatus;
  behavior: AttendanceStatusCountBehavior;
};

export type AttendanceClassRecordRange = {
  classId: string;
  schoolId: string;
  schoolYearId: string | null;
  className: string;
  startDate: string;
  endDate: string;
  totalSessions: number;
  totalRecords: number;
  sessions: Array<{
    id: string;
    schoolId: string;
    schoolYearId: string | null;
    date: string;
    scopeType: string;
    scopeLabel: string | null;
    createdAt: string;
    updatedAt: string;
    takenBy: AuthenticatedUser | null;
    records: Array<{
      id: string;
      attendanceSessionId: string;
      studentId: string;
      status: AttendanceStatus;
      customStatusId: string | null;
      customStatus: AttendanceCustomStatus | null;
      remark: string | null;
      date: string;
      updatedAt: string;
      student: AuthenticatedUser;
    }>;
  }>;
};

export type CreateAttendanceSessionInput = {
  schoolId: string;
  schoolYearId?: string;
  date: string;
  classIds: string[];
  scopeType?: string;
  scopeLabel?: string;
  notes?: string;
  records: {
    studentId: string;
    status: AttendanceStatus;
    customStatusId?: string;
    remark?: string;
  }[];
};

export function getAttendanceStudents(classIds: string[]) {
  const query = new URLSearchParams({
    classIds: classIds.join(","),
  });

  return apiFetch<AttendanceStudentLookup>(
    `/attendance/students?${query.toString()}`,
  );
}

export function getAttendanceSessions(schoolId: string, date: string) {
  const query = new URLSearchParams({
    schoolId,
    date,
  });

  return apiFetch<AttendanceSession[]>(
    `/attendance/sessions?${query.toString()}`,
  );
}

export function getAttendanceSession(sessionId: string) {
  return apiFetch<AttendanceSession>(`/attendance/sessions/${sessionId}`);
}

export function getAttendanceClassRecordsByDateRange(options: {
  classId: string;
  startDate: string;
  endDate: string;
}) {
  const query = new URLSearchParams({
    startDate: options.startDate,
    endDate: options.endDate,
  });

  return apiFetch<AttendanceClassRecordRange>(
    `/attendance/classes/${options.classId}/records?${query.toString()}`,
  );
}

export function getAttendanceStatusRules(schoolId: string) {
  const query = new URLSearchParams({ schoolId });
  return apiFetch<AttendanceStatusRule[]>(
    `/attendance/status-rules?${query.toString()}`,
  );
}

export function getAttendanceCustomStatuses(options: {
  schoolId: string;
  includeInactive?: boolean;
}) {
  const query = new URLSearchParams({ schoolId: options.schoolId });
  if (options.includeInactive !== undefined) {
    query.set("includeInactive", options.includeInactive ? "true" : "false");
  }

  return apiFetch<AttendanceCustomStatus[]>(
    `/attendance/custom-statuses?${query.toString()}`,
  );
}

export function createAttendanceCustomStatus(input: {
  schoolId: string;
  label: string;
  behavior: AttendanceStatusCountBehavior;
  isActive?: boolean;
}) {
  return apiFetch<AttendanceCustomStatus>("/attendance/custom-statuses", {
    method: "POST",
    json: input,
  });
}

export function updateAttendanceCustomStatus(
  statusId: string,
  input: {
    label?: string;
    behavior?: AttendanceStatusCountBehavior;
    isActive?: boolean;
  },
) {
  return apiFetch<AttendanceCustomStatus>(
    `/attendance/custom-statuses/${statusId}`,
    {
      method: "PATCH",
      json: input,
    },
  );
}

export function updateAttendanceStatusRule(options: {
  schoolId: string;
  status: AttendanceStatus;
  behavior: AttendanceStatusCountBehavior;
}) {
  const query = new URLSearchParams({ schoolId: options.schoolId });
  return apiFetch<AttendanceStatusRule>(
    `/attendance/status-rules/${options.status}?${query.toString()}`,
    {
      method: "PATCH",
      json: {
        behavior: options.behavior,
      },
    },
  );
}

export function createAttendanceSession(input: CreateAttendanceSessionInput) {
  return apiFetch<AttendanceSession>("/attendance/sessions", {
    method: "POST",
    json: input,
  });
}

export function updateAttendanceSession(
  sessionId: string,
  input: {
    records: {
      studentId: string;
      status: AttendanceStatus;
      customStatusId?: string;
      remark?: string;
    }[];
  },
) {
  return apiFetch<AttendanceSession>(`/attendance/sessions/${sessionId}`, {
    method: "PATCH",
    json: input,
  });
}

export function updateAttendanceRecord(
  recordId: string,
  status: AttendanceStatus,
  customStatusId?: string,
  remark?: string,
) {
  return apiFetch<AttendanceRecord>(`/attendance/records/${recordId}`, {
    method: "PATCH",
    json: {
      status,
      customStatusId,
      remark,
    },
  });
}

export type AttendanceStudentSummary = {
  studentId: string;
  startDate: string | null;
  endDate: string | null;
  totalDays?: number;
  totalSessions?: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount?: number;
  attendancePercentage?: number;
};

export type AttendanceClassSummary = {
  classId: string;
  startDate?: string;
  endDate?: string;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  attendanceRate: number | null;
};

export function getAttendanceClassSummary(options: {
  classId: string;
  startDate?: string;
  endDate?: string;
}) {
  const query = new URLSearchParams();

  if (options.startDate) {
    query.set("startDate", options.startDate);
  }

  if (options.endDate) {
    query.set("endDate", options.endDate);
  }

  return apiFetch<AttendanceClassSummary>(
    `/attendance/classes/${options.classId}/summary${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function getAttendanceStudentSummary(options: {
  studentId: string;
  startDate?: string;
  endDate?: string;
}) {
  const query = new URLSearchParams();

  if (options.startDate) {
    query.set("startDate", options.startDate);
  }

  if (options.endDate) {
    query.set("endDate", options.endDate);
  }

  return apiFetch<AttendanceStudentSummary>(
    `/attendance/students/${options.studentId}/summary${query.size ? `?${query.toString()}` : ""}`,
  );
}
