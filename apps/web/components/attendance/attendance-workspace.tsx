"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth/auth-context";
import {
  formatAttendanceStatusLabel,
  formatDateLabel,
  formatDateTimeLabel,
  formatRoleLabel,
  formatTimeLabel,
  getDisplayText,
  getLocalDateInputValue,
} from "@/lib/utils";
import {
  createAttendanceCustomStatus,
  getAttendanceClassSummary,
  createAttendanceSession,
  getAttendanceClassRecordsByDateRange,
  getAttendanceCustomStatuses,
  getAttendanceSessions,
  getAttendanceStatusRules,
  getAttendanceStudents,
  updateAttendanceCustomStatus,
  updateAttendanceStatusRule,
  updateAttendanceSession,
  type AttendanceClassRecordRange,
  type AttendanceClassSummary,
  type AttendanceCustomStatus,
  type AttendanceStatusCountBehavior,
  type AttendanceStatusRule,
  type AttendanceSession,
  type AttendanceStatus,
  type AttendanceStudent,
} from "@/lib/api/attendance";
import {
  listClasses,
  listMyClasses,
  type SchoolClass,
} from "@/lib/api/classes";

type BuiltInAttendanceStatus = "PRESENT" | "ABSENT" | "LATE";

const attendanceStatusOptions: BuiltInAttendanceStatus[] = [
  "PRESENT",
  "ABSENT",
  "LATE",
];
const defaultAttendanceStatus: BuiltInAttendanceStatus = "PRESENT";
const attendanceStatusBehaviorOptions: Array<{
  value: AttendanceStatusCountBehavior;
  label: string;
}> = [
  { value: "PRESENT", label: "Counts as present" },
  { value: "LATE", label: "Counts as late" },
  { value: "ABSENT", label: "Counts as absent" },
  { value: "INFORMATIONAL", label: "Informational / neutral" },
];

function getStatusForBehavior(
  behavior: AttendanceStatusCountBehavior,
): AttendanceStatus {
  if (behavior === "ABSENT") {
    return "ABSENT";
  }

  if (behavior === "PRESENT") {
    return "PRESENT";
  }

  if (behavior === "LATE") {
    return "LATE";
  }

  return "EXCUSED";
}

function buildBuiltInStatusOptionValue(status: AttendanceStatus) {
  return `STATUS:${status}`;
}

function buildCustomStatusOptionValue(customStatusId: string) {
  return `CUSTOM:${customStatusId}`;
}

function parseStatusOptionValue(value: string): {
  type: "status" | "custom";
  value: string;
} {
  if (value.startsWith("CUSTOM:")) {
    return {
      type: "custom",
      value: value.slice("CUSTOM:".length),
    };
  }

  return {
    type: "status",
    value: value.slice("STATUS:".length),
  };
}

function buildSessionLabel(session: AttendanceSession) {
  const scopeLabel = getDisplayText(session.scopeLabel, "");

  if (scopeLabel) {
    return scopeLabel;
  }

  const candidateDates = [session.updatedAt, session.createdAt, session.date];
  const scopeTypeLabel = formatRoleLabel(
    getDisplayText(session.scopeType, "Session"),
  );

  for (const candidateDate of candidateDates) {
    const formattedTime = formatTimeLabel(candidateDate, undefined, "");

    if (formattedTime) {
      return `${scopeTypeLabel} • ${formattedTime}`;
    }
  }

  return `${scopeTypeLabel} entry`;
}

function buildDefaultStatuses(students: AttendanceStudent[]) {
  return Object.fromEntries(
    students.map((student) => [student.id, defaultAttendanceStatus]),
  ) as Record<string, AttendanceStatus>;
}

function buildDefaultRemarks(students: AttendanceStudent[]) {
  return Object.fromEntries(
    students.map((student) => [student.id, ""]),
  ) as Record<string, string>;
}

function getFriendlyAttendanceError(
  message: string,
  mode: "teacher" | "admin",
) {
  const normalized = message.trim().toLowerCase();

  if (mode === "teacher" && normalized.includes("class not found")) {
    return "No classes assigned to you right now.";
  }

  if (mode === "admin" && normalized.includes("class not found")) {
    return "The selected class could not be found.";
  }

  return message;
}

function getStatusBadgeVariant(status: AttendanceStatus) {
  if (status === "PRESENT") {
    return "success" as const;
  }

  if (status === "LATE") {
    return "warning" as const;
  }

  if (status === "ABSENT") {
    return "danger" as const;
  }

  return "neutral" as const;
}

function getStatusSelectClassName(status: AttendanceStatus) {
  if (status === "PRESENT") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status === "LATE") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (status === "ABSENT") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  return "border-slate-300 bg-white text-slate-900";
}

function getFullName(firstName: unknown, lastName: unknown, fallback = "—") {
  const first = getDisplayText(firstName, "");
  const last = getDisplayText(lastName, "");
  const fullName = `${first} ${last}`.trim();

  return fullName || fallback;
}

function getClassOptionLabel(schoolClass: SchoolClass) {
  const className = getDisplayText(schoolClass.name);
  const subject = getDisplayText(schoolClass.subject, "");

  return `${className}${subject ? ` • ${subject}` : ""}${schoolClass.takesAttendance ? "" : " • Attendance disabled"}${schoolClass.isActive ? "" : " • Inactive"}`;
}

function getTakenByLabel(session: AttendanceSession) {
  if (!session.takenBy) {
    return "Unknown";
  }

  return getFullName(
    session.takenBy.firstName,
    session.takenBy.lastName,
    "Unknown",
  );
}

function getSessionClassesLabel(session: AttendanceSession) {
  const labels = session.classes
    .map((sessionClass) => getDisplayText(sessionClass.class?.name, ""))
    .filter(Boolean);

  return labels.length > 0 ? labels.join(", ") : "—";
}

function getDateWithOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return getLocalDateInputValue(date);
}

export function AttendanceWorkspace({ mode }: { mode: "teacher" | "admin" }) {
  const {
    selectedSchoolId: schoolContextId,
    setSelectedSchoolId: setSchoolContextId,
  } = useAuth();
  const searchParams = useSearchParams();
  const requestedClassId = searchParams.get("classId") ?? "";
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedDate, setSelectedDate] = useState(getLocalDateInputValue());
  const [rangeStartDate, setRangeStartDate] = useState(getDateWithOffset(-6));
  const [rangeEndDate, setRangeEndDate] = useState(getLocalDateInputValue());
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [schoolSessions, setSchoolSessions] = useState<AttendanceSession[]>([]);
  const [recordRange, setRecordRange] =
    useState<AttendanceClassRecordRange | null>(null);
  const [classSummary, setClassSummary] =
    useState<AttendanceClassSummary | null>(null);
  const [statusRules, setStatusRules] = useState<AttendanceStatusRule[]>([]);
  const [customStatuses, setCustomStatuses] = useState<
    AttendanceCustomStatus[]
  >([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [statusByStudentId, setStatusByStudentId] = useState<
    Record<string, AttendanceStatus>
  >({});
  const [customStatusByStudentId, setCustomStatusByStudentId] = useState<
    Record<string, string>
  >({});
  const [remarkByStudentId, setRemarkByStudentId] = useState<
    Record<string, string>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingRange, setIsLoadingRange] = useState(false);
  const [isLoadingClassSummary, setIsLoadingClassSummary] = useState(false);
  const [isLoadingStatusRules, setIsLoadingStatusRules] = useState(false);
  const [isLoadingCustomStatuses, setIsLoadingCustomStatuses] = useState(false);
  const [savingRuleStatus, setSavingRuleStatus] =
    useState<AttendanceStatus | null>(null);
  const [isSavingCustomStatus, setIsSavingCustomStatus] = useState(false);
  const [savingCustomStatusId, setSavingCustomStatusId] = useState<
    string | null
  >(null);
  const [createCustomStatusLabel, setCreateCustomStatusLabel] = useState("");
  const [createCustomStatusBehavior, setCreateCustomStatusBehavior] =
    useState<AttendanceStatusCountBehavior>("INFORMATIONAL");
  const [createCustomStatusIsActive, setCreateCustomStatusIsActive] =
    useState(true);
  const [customStatusDraftById, setCustomStatusDraftById] = useState<
    Record<
      string,
      {
        label: string;
        behavior: AttendanceStatusCountBehavior;
        isActive: boolean;
      }
    >
  >({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [classSummaryError, setClassSummaryError] = useState<string | null>(
    null,
  );
  const [statusRulesError, setStatusRulesError] = useState<string | null>(null);
  const [customStatusesError, setCustomStatusesError] = useState<string | null>(
    null,
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const availableSchoolOptions = useMemo(() => {
    const schoolMap = new Map<string, { id: string; name: string }>();

    for (const schoolClass of classes) {
      schoolMap.set(schoolClass.schoolId, {
        id: schoolClass.schoolId,
        name: schoolClass.school.name,
      });
    }

    return Array.from(schoolMap.values());
  }, [classes]);

  const visibleClasses = useMemo(() => {
    if (mode === "teacher") {
      return classes;
    }

    return selectedSchoolId
      ? classes.filter(
          (schoolClass) => schoolClass.schoolId === selectedSchoolId,
        )
      : classes;
  }, [classes, mode, selectedSchoolId]);

  const selectedClass = useMemo(
    () =>
      visibleClasses.find(
        (schoolClass) => schoolClass.id === selectedClassId,
      ) ?? null,
    [selectedClassId, visibleClasses],
  );

  const firstEnabledVisibleClassId = useMemo(
    () =>
      visibleClasses.find((schoolClass) => schoolClass.takesAttendance)?.id ??
      "",
    [visibleClasses],
  );

  const hasEnabledVisibleClasses = useMemo(
    () => visibleClasses.some((schoolClass) => schoolClass.takesAttendance),
    [visibleClasses],
  );

  const effectiveSchoolId =
    mode === "teacher" ? (selectedClass?.schoolId ?? "") : selectedSchoolId;

  const matchingSessions = useMemo(() => {
    if (!selectedClassId) {
      return [];
    }

    return schoolSessions.filter((session) =>
      session.classes.some(
        (sessionClass) => sessionClass.classId === selectedClassId,
      ),
    );
  }, [schoolSessions, selectedClassId]);

  const selectedSession = useMemo(
    () =>
      matchingSessions.find((session) => session.id === selectedSessionId) ??
      matchingSessions[0] ??
      null,
    [matchingSessions, selectedSessionId],
  );

  const rangeRows = useMemo(() => {
    if (!recordRange) {
      return [];
    }

    return recordRange.sessions.flatMap((session) =>
      session.records.map((record) => ({
        sessionId: session.id,
        sessionDate: session.date,
        sessionScopeLabel: session.scopeLabel,
        sessionTakenBy: session.takenBy,
        sessionUpdatedAt: session.updatedAt,
        record,
      })),
    );
  }, [recordRange]);

  const statusRuleByStatus = useMemo(() => {
    return new Map(statusRules.map((rule) => [rule.status, rule]));
  }, [statusRules]);

  const customStatusById = useMemo(() => {
    return new Map(customStatuses.map((status) => [status.id, status]));
  }, [customStatuses]);

  const hasExistingSession = Boolean(selectedSession);

  const rosterSummary = useMemo(() => {
    return students.reduce(
      (summary, student) => {
        const status = statusByStudentId[student.id] ?? defaultAttendanceStatus;

        if (status === "EXCUSED") {
          return summary;
        }

        summary[status] += 1;
        return summary;
      },
      {
        PRESENT: 0,
        ABSENT: 0,
        LATE: 0,
      } as Record<"PRESENT" | "ABSENT" | "LATE", number>,
    );
  }, [statusByStudentId, students]);

  const customStatusSummary = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();

    for (const student of students) {
      const customStatusId = customStatusByStudentId[student.id];
      if (!customStatusId) {
        continue;
      }

      const customStatus = customStatusById.get(customStatusId);
      const label = customStatus?.label ?? "Custom";
      const current = counts.get(customStatusId);

      if (current) {
        current.count += 1;
        continue;
      }

      counts.set(customStatusId, { label, count: 1 });
    }

    return Array.from(counts.entries()).map(([customStatusId, value]) => ({
      customStatusId,
      label: value.label,
      count: value.count,
    }));
  }, [customStatusById, customStatusByStudentId, students]);

  const attendanceRate = useMemo(() => {
    const defaultBehaviorByStatus: Record<
      AttendanceStatus,
      AttendanceStatusCountBehavior
    > = {
      PRESENT: "PRESENT",
      ABSENT: "ABSENT",
      LATE: "LATE",
      EXCUSED: "INFORMATIONAL",
    };

    let countAsPresent = 0;
    let countAsAbsent = 0;
    let countAsLate = 0;

    for (const student of students) {
      const selectedCustomStatusId = customStatusByStudentId[student.id];
      if (selectedCustomStatusId) {
        const customBehavior =
          customStatusById.get(selectedCustomStatusId)?.behavior ??
          "INFORMATIONAL";

        if (customBehavior === "PRESENT") {
          countAsPresent += 1;
          continue;
        }

        if (customBehavior === "LATE") {
          countAsLate += 1;
          continue;
        }

        if (customBehavior === "ABSENT") {
          countAsAbsent += 1;
        }
        continue;
      }

      const status = statusByStudentId[student.id] ?? defaultAttendanceStatus;
      const behavior =
        statusRuleByStatus.get(status)?.behavior ??
        defaultBehaviorByStatus[status];

      if (behavior === "PRESENT") {
        countAsPresent += 1;
        continue;
      }

      if (behavior === "LATE") {
        countAsLate += 1;
        continue;
      }

      if (behavior === "ABSENT") {
        countAsAbsent += 1;
      }
    }

    const denominator = countAsPresent + countAsLate + countAsAbsent;
    if (denominator === 0) {
      return null;
    }

    return Number(
      (((countAsPresent + countAsLate) / denominator) * 100).toFixed(1),
    );
  }, [
    customStatusByStudentId,
    customStatusById,
    statusByStudentId,
    statusRuleByStatus,
    students,
  ]);

  const hasAnyClasses = classes.length > 0;
  const showNoAssignedClasses =
    !isLoading && mode === "teacher" && !hasAnyClasses && !error;
  const showNoAvailableClasses =
    !isLoading && mode === "admin" && !hasAnyClasses && !error;
  const showNoAttendanceEnabledClasses =
    !isLoading &&
    !error &&
    hasAnyClasses &&
    !hasEnabledVisibleClasses &&
    Boolean(visibleClasses.length);

  useEffect(() => {
    async function loadClasses() {
      setIsLoading(true);
      setError(null);

      try {
        const classResponse =
          mode === "teacher" ? await listMyClasses() : await listClasses();

        setClasses(classResponse);

        const requested =
          requestedClassId &&
          classResponse.some(
            (entry) => entry.id === requestedClassId && entry.takesAttendance,
          )
            ? requestedClassId
            : "";
        const initialClassId =
          requested ||
          classResponse.find((entry) => entry.takesAttendance)?.id ||
          classResponse[0]?.id ||
          "";
        const contextSchoolId =
          mode === "admin" &&
          schoolContextId &&
          classResponse.some((entry) => entry.schoolId === schoolContextId)
            ? schoolContextId
            : "";
        const initialSchoolId =
          mode === "admin"
            ? (classResponse.find((entry) => entry.id === initialClassId)
                ?.schoolId ??
              contextSchoolId ??
              classResponse[0]?.schoolId ??
              "")
            : "";

        setSelectedSchoolId((current) => {
          if (mode !== "admin") {
            return current;
          }

          if (requested) {
            return initialSchoolId;
          }

          return current || initialSchoolId;
        });
        setSelectedClassId((current) => {
          if (requested) {
            return requested;
          }

          return current || initialClassId;
        });
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? getFriendlyAttendanceError(loadError.message, mode)
            : "Unable to load classes for attendance.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadClasses();
  }, [mode, requestedClassId, schoolContextId]);

  useEffect(() => {
    if (mode !== "admin") {
      return;
    }

    setSchoolContextId(selectedSchoolId || null);
  }, [mode, selectedSchoolId, setSchoolContextId]);

  useEffect(() => {
    if (!selectedClassId && visibleClasses[0]) {
      setSelectedClassId(firstEnabledVisibleClassId || visibleClasses[0].id);
      return;
    }

    if (
      selectedClassId &&
      !visibleClasses.some((schoolClass) => schoolClass.id === selectedClassId)
    ) {
      setSelectedClassId(
        (firstEnabledVisibleClassId || visibleClasses[0]?.id) ?? "",
      );
    }
  }, [firstEnabledVisibleClassId, selectedClassId, visibleClasses]);

  useEffect(() => {
    async function loadSessions() {
      if (!effectiveSchoolId || !selectedDate) {
        setSchoolSessions([]);
        setSelectedSessionId("");
        setIsLoadingSessions(false);
        return;
      }

      setIsLoadingSessions(true);
      setIsRefreshing(true);
      setError(null);
      setSchoolSessions([]);
      setSelectedSessionId("");

      try {
        const sessionResponse = await getAttendanceSessions(
          effectiveSchoolId,
          selectedDate,
        );
        setSchoolSessions(sessionResponse);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load attendance sessions.",
        );
      } finally {
        setIsLoadingSessions(false);
        setIsRefreshing(false);
      }
    }

    void loadSessions();
  }, [effectiveSchoolId, selectedDate]);

  useEffect(() => {
    async function loadStudents() {
      if (!selectedClassId) {
        setStudents([]);
        return;
      }

      if (selectedClass && !selectedClass.takesAttendance) {
        setStudents([]);
        return;
      }

      setIsRefreshing(true);
      setError(null);

      try {
        const response = await getAttendanceStudents([selectedClassId]);
        setStudents(response.students);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? getFriendlyAttendanceError(loadError.message, mode)
            : "Unable to load students for attendance.",
        );
      } finally {
        setIsRefreshing(false);
      }
    }

    void loadStudents();
  }, [mode, selectedClass, selectedClassId]);

  useEffect(() => {
    if (matchingSessions.length === 0) {
      setSelectedSessionId("");
      return;
    }

    if (selectedSession && selectedSession.id !== selectedSessionId) {
      setSelectedSessionId(selectedSession.id);
    }
  }, [matchingSessions, selectedSession, selectedSessionId]);

  useEffect(() => {
    const nextStatuses = buildDefaultStatuses(students);
    const nextRemarks = buildDefaultRemarks(students);
    const nextCustomStatuses = Object.fromEntries(
      students.map((student) => [student.id, ""]),
    ) as Record<string, string>;

    const missingCustomStatuses: AttendanceCustomStatus[] = [];

    if (selectedSession) {
      for (const record of selectedSession.records) {
        if (nextStatuses[record.studentId]) {
          nextStatuses[record.studentId] = record.status;
          nextRemarks[record.studentId] = getDisplayText(record.remark, "");
          if (record.customStatusId) {
            nextCustomStatuses[record.studentId] = record.customStatusId;

            if (
              record.customStatus &&
              !customStatusById.has(record.customStatus.id)
            ) {
              missingCustomStatuses.push(record.customStatus);
            }
          }
        }
      }
    }

    if (missingCustomStatuses.length > 0) {
      setCustomStatuses((current) => {
        const map = new Map(current.map((status) => [status.id, status]));
        for (const status of missingCustomStatuses) {
          map.set(status.id, status);
        }
        return Array.from(map.values());
      });
    }

    setStatusByStudentId(nextStatuses);
    setCustomStatusByStudentId(nextCustomStatuses);
    setRemarkByStudentId(nextRemarks);
  }, [customStatusById, selectedSession, students]);

  useEffect(() => {
    async function loadStatusRules() {
      if (!effectiveSchoolId) {
        setStatusRules([]);
        setStatusRulesError(null);
        return;
      }

      setIsLoadingStatusRules(true);
      setStatusRulesError(null);

      try {
        const rules = await getAttendanceStatusRules(effectiveSchoolId);
        setStatusRules(rules);
      } catch (loadError) {
        setStatusRules([]);
        setStatusRulesError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load attendance status rules.",
        );
      } finally {
        setIsLoadingStatusRules(false);
      }
    }

    void loadStatusRules();
  }, [effectiveSchoolId]);

  useEffect(() => {
    async function loadCustomStatuses() {
      if (!effectiveSchoolId) {
        setCustomStatuses([]);
        setCustomStatusDraftById({});
        setCustomStatusesError(null);
        return;
      }

      setIsLoadingCustomStatuses(true);
      setCustomStatusesError(null);

      try {
        const statuses = await getAttendanceCustomStatuses({
          schoolId: effectiveSchoolId,
          includeInactive: mode === "admin",
        });
        setCustomStatuses(statuses);
        setCustomStatusDraftById(
          Object.fromEntries(
            statuses.map((status) => [
              status.id,
              {
                label: status.label,
                behavior: status.behavior,
                isActive: status.isActive,
              },
            ]),
          ),
        );
      } catch (loadError) {
        setCustomStatuses([]);
        setCustomStatusDraftById({});
        setCustomStatusesError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load custom attendance statuses.",
        );
      } finally {
        setIsLoadingCustomStatuses(false);
      }
    }

    void loadCustomStatuses();
  }, [effectiveSchoolId, mode]);

  async function loadRangeRecords() {
    if (!selectedClassId || !rangeStartDate || !rangeEndDate) {
      setRecordRange(null);
      setRangeError(null);
      return;
    }

    if (selectedClass && !selectedClass.takesAttendance) {
      setRecordRange(null);
      setRangeError(null);
      return;
    }

    setIsLoadingRange(true);
    setRangeError(null);

    try {
      const response = await getAttendanceClassRecordsByDateRange({
        classId: selectedClassId,
        startDate: rangeStartDate,
        endDate: rangeEndDate,
      });
      setRecordRange(response);
    } catch (loadError) {
      setRecordRange(null);
      setRangeError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load attendance records for date range.",
      );
    } finally {
      setIsLoadingRange(false);
    }
  }

  async function loadClassSummary() {
    if (!selectedClassId || !rangeStartDate || !rangeEndDate) {
      setClassSummary(null);
      setClassSummaryError(null);
      return;
    }

    if (selectedClass && !selectedClass.takesAttendance) {
      setClassSummary(null);
      setClassSummaryError(null);
      return;
    }

    setIsLoadingClassSummary(true);
    setClassSummaryError(null);

    try {
      const response = await getAttendanceClassSummary({
        classId: selectedClassId,
        startDate: rangeStartDate,
        endDate: rangeEndDate,
      });
      setClassSummary(response);
    } catch (loadError) {
      setClassSummary(null);
      setClassSummaryError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load class attendance summary.",
      );
    } finally {
      setIsLoadingClassSummary(false);
    }
  }

  useEffect(() => {
    void loadRangeRecords();
  }, [selectedClass, selectedClassId, rangeStartDate, rangeEndDate]);

  useEffect(() => {
    void loadClassSummary();
  }, [rangeEndDate, rangeStartDate, selectedClass, selectedClassId]);

  function handleMarkAllPresent() {
    setStatusByStudentId(buildDefaultStatuses(students));
    setCustomStatusByStudentId(
      Object.fromEntries(students.map((student) => [student.id, ""])) as Record<
        string,
        string
      >,
    );
  }

  async function handleStatusRuleUpdate(
    status: AttendanceStatus,
    behavior: AttendanceStatusCountBehavior,
  ) {
    if (!effectiveSchoolId || mode !== "admin") {
      return;
    }

    setSavingRuleStatus(status);
    setStatusRulesError(null);

    try {
      const updated = await updateAttendanceStatusRule({
        schoolId: effectiveSchoolId,
        status,
        behavior,
      });

      setStatusRules((current) => {
        const existing = current.find((rule) => rule.status === updated.status);
        if (!existing) {
          return [...current, updated];
        }

        return current.map((rule) =>
          rule.status === updated.status ? updated : rule,
        );
      });
    } catch (updateError) {
      setStatusRulesError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update status behavior.",
      );
    } finally {
      setSavingRuleStatus(null);
    }
  }

  async function refreshCustomStatusesForSchool() {
    if (!effectiveSchoolId) {
      setCustomStatuses([]);
      setCustomStatusDraftById({});
      return;
    }

    const statuses = await getAttendanceCustomStatuses({
      schoolId: effectiveSchoolId,
      includeInactive: mode === "admin",
    });

    setCustomStatuses(statuses);
    setCustomStatusDraftById(
      Object.fromEntries(
        statuses.map((status) => [
          status.id,
          {
            label: status.label,
            behavior: status.behavior,
            isActive: status.isActive,
          },
        ]),
      ),
    );
  }

  async function handleCreateCustomStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode !== "admin" || !effectiveSchoolId) {
      return;
    }

    setIsSavingCustomStatus(true);
    setCustomStatusesError(null);

    try {
      const label = createCustomStatusLabel.trim();
      if (!label) {
        throw new Error("Custom status label is required.");
      }

      await createAttendanceCustomStatus({
        schoolId: effectiveSchoolId,
        label,
        behavior: createCustomStatusBehavior,
        isActive: createCustomStatusIsActive,
      });

      await refreshCustomStatusesForSchool();
      setCreateCustomStatusLabel("");
      setCreateCustomStatusBehavior("INFORMATIONAL");
      setCreateCustomStatusIsActive(true);
      setSuccessMessage("Custom attendance status created.");
    } catch (saveError) {
      setCustomStatusesError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to create custom attendance status.",
      );
    } finally {
      setIsSavingCustomStatus(false);
    }
  }

  async function handleSaveCustomStatus(statusId: string) {
    if (mode !== "admin") {
      return;
    }

    const draft = customStatusDraftById[statusId];
    if (!draft) {
      return;
    }

    setSavingCustomStatusId(statusId);
    setCustomStatusesError(null);

    try {
      await updateAttendanceCustomStatus(statusId, {
        label: draft.label.trim(),
        behavior: draft.behavior,
        isActive: draft.isActive,
      });
      await refreshCustomStatusesForSchool();
      setSuccessMessage("Custom attendance status updated.");
    } catch (saveError) {
      setCustomStatusesError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update custom attendance status.",
      );
    } finally {
      setSavingCustomStatusId(null);
    }
  }

  function handleStudentStatusSelection(studentId: string, value: string) {
    const parsed = parseStatusOptionValue(value);

    if (parsed.type === "status") {
      const status = parsed.value as AttendanceStatus;
      setStatusByStudentId((current) => ({
        ...current,
        [studentId]: status,
      }));
      setCustomStatusByStudentId((current) => ({
        ...current,
        [studentId]: "",
      }));
      return;
    }

    const customStatus = customStatusById.get(parsed.value);
    if (!customStatus) {
      return;
    }

    setStatusByStudentId((current) => ({
      ...current,
      [studentId]: getStatusForBehavior(customStatus.behavior),
    }));
    setCustomStatusByStudentId((current) => ({
      ...current,
      [studentId]: customStatus.id,
    }));
  }

  async function reloadCurrentState() {
    if (effectiveSchoolId && selectedDate) {
      const sessionResponse = await getAttendanceSessions(
        effectiveSchoolId,
        selectedDate,
      );
      setSchoolSessions(sessionResponse);
    }

    if (selectedClassId) {
      const studentResponse = await getAttendanceStudents([selectedClassId]);
      setStudents(studentResponse.students);
    }

    await loadRangeRecords();
    await loadClassSummary();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClass || students.length === 0) {
      return;
    }

    if (!selectedClass.takesAttendance) {
      setError("Attendance is not enabled for this class.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (hasExistingSession && selectedSession) {
        await updateAttendanceSession(selectedSession.id, {
          records: students.map((student) => ({
            studentId: student.id,
            status: statusByStudentId[student.id] ?? defaultAttendanceStatus,
            customStatusId: customStatusByStudentId[student.id] || undefined,
            remark: remarkByStudentId[student.id]?.trim() || undefined,
          })),
        });
        setSuccessMessage("Attendance submitted successfully.");
      } else {
        await createAttendanceSession({
          schoolId: selectedClass.schoolId,
          schoolYearId: selectedClass.schoolYearId,
          date: selectedDate,
          classIds: [selectedClass.id],
          records: students.map((student) => ({
            studentId: student.id,
            status: statusByStudentId[student.id] ?? defaultAttendanceStatus,
            customStatusId: customStatusByStudentId[student.id] || undefined,
            remark: remarkByStudentId[student.id]?.trim() || undefined,
          })),
        });
        setSuccessMessage("Attendance submitted successfully.");
      }

      await reloadCurrentState();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to save attendance.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const headerTitle = mode === "teacher" ? "Attendance" : "Attendance Overview";
  const headerDescription =
    mode === "teacher"
      ? "Select one of your classes, review the roster, and submit attendance for the day."
      : "Review attendance by school and date, then update class attendance when corrections are needed.";

  const sessionStateLabel = isLoadingSessions
    ? "Checking attendance"
    : hasExistingSession
      ? "Attendance loaded"
      : "Ready to submit";

  return (
    <div className="space-y-6">
      <PageHeader
        description={headerDescription}
        meta={
          <>
            <Badge variant="neutral">{formatDateLabel(selectedDate)}</Badge>
            <Badge
              variant={
                isLoadingSessions
                  ? "warning"
                  : hasExistingSession
                    ? "primary"
                    : "neutral"
              }
            >
              {sessionStateLabel}
            </Badge>
          </>
        }
        title={headerTitle}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {rangeError ? <Notice tone="danger">{rangeError}</Notice> : null}
      {classSummaryError ? (
        <Notice tone="danger">{classSummaryError}</Notice>
      ) : null}
      {statusRulesError ? (
        <Notice tone="danger">{statusRulesError}</Notice>
      ) : null}
      {customStatusesError ? (
        <Notice tone="danger">{customStatusesError}</Notice>
      ) : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Attendance Controls</CardTitle>
          <CardDescription>
            Choose the school context, class roster, and attendance date before
            making updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {mode === "admin" ? (
              <Field htmlFor="attendance-school" label="School">
                <Select
                  id="attendance-school"
                  onChange={(event) => setSelectedSchoolId(event.target.value)}
                  value={selectedSchoolId}
                >
                  <option value="">Select school</option>
                  {availableSchoolOptions.map((school) => (
                    <option key={school.id} value={school.id}>
                      {getDisplayText(school.name)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field htmlFor="attendance-class" label="Class">
              <Select
                id="attendance-class"
                onChange={(event) => setSelectedClassId(event.target.value)}
                value={selectedClassId}
              >
                <option value="">Select class</option>
                {visibleClasses.map((schoolClass) => (
                  <option
                    disabled={!schoolClass.takesAttendance}
                    key={schoolClass.id}
                    value={schoolClass.id}
                  >
                    {getClassOptionLabel(schoolClass)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="attendance-date" label="Date">
              <Input
                id="attendance-date"
                onChange={(event) => setSelectedDate(event.target.value)}
                type="date"
                value={selectedDate}
              />
            </Field>
          </div>

          {matchingSessions.length > 1 ? (
            <div className="max-w-sm">
              <Field
                description="Multiple saved attendance entries were found for this class and date."
                htmlFor="attendance-session"
                label="Saved attendance"
              >
                <Select
                  id="attendance-session"
                  onChange={(event) => setSelectedSessionId(event.target.value)}
                  value={selectedSessionId}
                >
                  {matchingSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {buildSessionLabel(session)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          {isLoading || isRefreshing ? (
            <p className="text-sm text-slate-500">Loading attendance data...</p>
          ) : null}

          {selectedClass && !selectedClass.takesAttendance ? (
            <Notice tone="warning">
              Attendance is not enabled for this class.
            </Notice>
          ) : null}
        </CardContent>
      </Card>

      {showNoAssignedClasses ? (
        <EmptyState
          description="Once a class is assigned to you, the full roster will appear here with attendance defaulted to Present."
          title="No classes assigned to you"
        />
      ) : null}

      {showNoAvailableClasses ? (
        <EmptyState
          description="Create a class first, then return here to take or review attendance."
          title="No classes available"
        />
      ) : null}

      {showNoAttendanceEnabledClasses ? (
        <EmptyState
          description="Classes are assigned, but attendance is currently disabled for all visible classes."
          title="No attendance-enabled classes"
        />
      ) : null}

      {!showNoAssignedClasses &&
      !showNoAvailableClasses &&
      !showNoAttendanceEnabledClasses ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Summary Date Range</CardTitle>
              <CardDescription>
                These dates affect summary cards only. Daily attendance entry
                still uses the single attendance date above.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Field
                htmlFor="attendance-range-start"
                label="Summary start date"
              >
                <Input
                  id="attendance-range-start"
                  onChange={(event) => setRangeStartDate(event.target.value)}
                  type="date"
                  value={rangeStartDate}
                />
              </Field>
              <Field htmlFor="attendance-range-end" label="Summary end date">
                <Input
                  id="attendance-range-end"
                  onChange={(event) => setRangeEndDate(event.target.value)}
                  type="date"
                  value={rangeEndDate}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  disabled={
                    isLoadingRange ||
                    !selectedClassId ||
                    !selectedClass?.takesAttendance
                  }
                  onClick={() => {
                    void loadRangeRecords();
                    void loadClassSummary();
                  }}
                  type="button"
                  variant="secondary"
                >
                  {isLoadingRange ? "Refreshing..." : "Refresh range records"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Students
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {students.length}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Present
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {isLoadingClassSummary
                    ? "…"
                    : (classSummary?.presentCount ?? "—")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Late
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {isLoadingClassSummary
                    ? "…"
                    : (classSummary?.lateCount ?? "—")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Absent
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {isLoadingClassSummary
                    ? "…"
                    : (classSummary?.absentCount ?? "—")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Attendance Rate
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {isLoadingClassSummary
                    ? "…"
                    : classSummary?.attendanceRate === null ||
                        classSummary?.attendanceRate === undefined
                      ? attendanceRate === null
                        ? "—"
                        : `${attendanceRate}%`
                      : `${classSummary.attendanceRate}%`}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Daily Attendance</CardTitle>
                <CardDescription>
                  {isLoadingSessions
                    ? "Checking for saved attendance before submission."
                    : hasExistingSession
                      ? "Saved statuses load automatically. Submitting will update the saved attendance for this class and date."
                      : "Attendance starts with every student marked Present. Change only the students who need a different status before submitting."}
                </CardDescription>
                <div className="mt-4 flex flex-wrap gap-2">
                  {attendanceStatusOptions.map((status) => (
                    <Badge key={status} variant={getStatusBadgeVariant(status)}>
                      {formatAttendanceStatusLabel(status)}:{" "}
                      {rosterSummary[status]}
                    </Badge>
                  ))}
                  {customStatusSummary.map((status) => (
                    <Badge key={status.customStatusId} variant="neutral">
                      {status.label}: {status.count}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={students.length === 0}
                  onClick={handleMarkAllPresent}
                  type="button"
                  variant="secondary"
                >
                  Mark all present
                </Button>
                <Button
                  disabled={
                    isSaving ||
                    isLoadingSessions ||
                    !selectedClass ||
                    !selectedClass.takesAttendance ||
                    students.length === 0
                  }
                  form="attendance-form"
                  type="submit"
                >
                  {isLoadingSessions
                    ? "Checking attendance..."
                    : isSaving
                      ? "Submitting..."
                      : "Submit attendance"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                id="attendance-form"
                onSubmit={handleSubmit}
              >
                {students.length === 0 ? (
                  <EmptyState
                    compact
                    description={
                      selectedClass
                        ? "Enroll students in this class before recording attendance."
                        : "Select a class to load the attendance roster."
                    }
                    title={
                      selectedClass
                        ? "No students enrolled in this class"
                        : "Select a class to load attendance"
                    }
                  />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                        <thead className="bg-slate-50/80">
                          <tr>
                            <th className="px-4 py-3 font-semibold text-slate-700">
                              Student
                            </th>
                            <th className="px-4 py-3 font-semibold text-slate-700">
                              Status
                            </th>
                            <th className="px-4 py-3 font-semibold text-slate-700">
                              Remark
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {students.map((student) => {
                            const status =
                              statusByStudentId[student.id] ??
                              defaultAttendanceStatus;
                            const selectedCustomStatusId =
                              customStatusByStudentId[student.id] ?? "";
                            const statusOptionValue = selectedCustomStatusId
                              ? buildCustomStatusOptionValue(
                                  selectedCustomStatusId,
                                )
                              : buildBuiltInStatusOptionValue(status);

                            return (
                              <tr
                                className="align-top hover:bg-slate-50"
                                key={student.id}
                              >
                                <td className="px-4 py-4">
                                  <p className="font-medium text-slate-900">
                                    {getFullName(
                                      student.firstName,
                                      student.lastName,
                                    )}
                                  </p>
                                  <p className="mt-1 text-sm text-slate-500">
                                    @{getDisplayText(student.username)}
                                  </p>
                                </td>
                                <td className="px-4 py-4">
                                  <Select
                                    className={`min-w-[150px] ${getStatusSelectClassName(status)}`}
                                    onChange={(event) =>
                                      handleStudentStatusSelection(
                                        student.id,
                                        event.target.value,
                                      )
                                    }
                                    value={statusOptionValue}
                                  >
                                    {attendanceStatusOptions.map((option) => (
                                      <option
                                        key={option}
                                        value={buildBuiltInStatusOptionValue(
                                          option,
                                        )}
                                      >
                                        {formatAttendanceStatusLabel(option)}
                                      </option>
                                    ))}
                                    {customStatuses
                                      .filter(
                                        (customStatus) =>
                                          customStatus.isActive ||
                                          customStatus.id ===
                                            selectedCustomStatusId,
                                      )
                                      .map((customStatus) => (
                                        <option
                                          key={customStatus.id}
                                          value={buildCustomStatusOptionValue(
                                            customStatus.id,
                                          )}
                                        >
                                          {customStatus.label}
                                          {customStatus.isActive
                                            ? ""
                                            : " (Inactive)"}
                                        </option>
                                      ))}
                                  </Select>
                                </td>
                                <td className="px-4 py-4">
                                  <Textarea
                                    className="min-h-[48px]"
                                    onChange={(event) =>
                                      setRemarkByStudentId((current) => ({
                                        ...current,
                                        [student.id]: event.target.value,
                                      }))
                                    }
                                    placeholder="Optional remark"
                                    rows={2}
                                    value={remarkByStudentId[student.id] ?? ""}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attendance Status Counting</CardTitle>
              <CardDescription>
                Configure how each status contributes to attendance rate
                calculations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoadingStatusRules ? (
                <p className="text-sm text-slate-500">
                  Loading status rules...
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {attendanceStatusOptions.map((status) => {
                    const currentBehavior =
                      statusRuleByStatus.get(status)?.behavior ??
                      (status === "ABSENT"
                        ? "ABSENT"
                        : status === "LATE"
                          ? "LATE"
                          : "PRESENT");
                    const canManage = mode === "admin";

                    return (
                      <div
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3"
                        key={`status-rule-${status}`}
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {formatAttendanceStatusLabel(status)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {canManage
                            ? "Choose how this status affects attendance percentages."
                            : "Read-only in teacher mode."}
                        </p>
                        <div className="mt-3">
                          <Select
                            disabled={!canManage || savingRuleStatus === status}
                            onChange={(event) =>
                              void handleStatusRuleUpdate(
                                status,
                                event.target
                                  .value as AttendanceStatusCountBehavior,
                              )
                            }
                            value={currentBehavior}
                          >
                            {attendanceStatusBehaviorOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custom Attendance Statuses</CardTitle>
              <CardDescription>
                Add school-specific attendance labels and define how each one
                counts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingCustomStatuses ? (
                <p className="text-sm text-slate-500">
                  Loading custom statuses...
                </p>
              ) : null}

              {mode === "admin" ? (
                <form
                  className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4"
                  onSubmit={handleCreateCustomStatus}
                >
                  <Field htmlFor="create-custom-status-label" label="Label">
                    <Input
                      id="create-custom-status-label"
                      onChange={(event) =>
                        setCreateCustomStatusLabel(event.target.value)
                      }
                      placeholder="Field Trip"
                      value={createCustomStatusLabel}
                    />
                  </Field>
                  <Field
                    htmlFor="create-custom-status-behavior"
                    label="Count behavior"
                  >
                    <Select
                      id="create-custom-status-behavior"
                      onChange={(event) =>
                        setCreateCustomStatusBehavior(
                          event.target.value as AttendanceStatusCountBehavior,
                        )
                      }
                      value={createCustomStatusBehavior}
                    >
                      {attendanceStatusBehaviorOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="flex items-end">
                    <CheckboxField
                      checked={createCustomStatusIsActive}
                      label="Active"
                      onChange={(event) =>
                        setCreateCustomStatusIsActive(event.target.checked)
                      }
                    />
                  </div>
                  <div className="flex items-end justify-end">
                    <Button
                      disabled={isSavingCustomStatus}
                      type="submit"
                      variant="secondary"
                    >
                      {isSavingCustomStatus ? "Saving..." : "Add custom status"}
                    </Button>
                  </div>
                </form>
              ) : null}

              {customStatuses.length === 0 ? (
                <EmptyState
                  compact
                  title="No custom statuses"
                  description="Built-in statuses remain available for attendance entry."
                />
              ) : (
                <div className="space-y-3">
                  {customStatuses.map((customStatus) => {
                    const draft = customStatusDraftById[customStatus.id] ?? {
                      label: customStatus.label,
                      behavior: customStatus.behavior,
                      isActive: customStatus.isActive,
                    };

                    return (
                      <div
                        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-[1.5fr_1fr_auto_auto]"
                        key={customStatus.id}
                      >
                        <Field
                          htmlFor={`custom-status-label-${customStatus.id}`}
                          label="Label"
                        >
                          <Input
                            disabled={mode !== "admin"}
                            id={`custom-status-label-${customStatus.id}`}
                            onChange={(event) =>
                              setCustomStatusDraftById((current) => ({
                                ...current,
                                [customStatus.id]: {
                                  ...draft,
                                  label: event.target.value,
                                },
                              }))
                            }
                            value={draft.label}
                          />
                        </Field>
                        <Field
                          htmlFor={`custom-status-behavior-${customStatus.id}`}
                          label="Count behavior"
                        >
                          <Select
                            disabled={mode !== "admin"}
                            id={`custom-status-behavior-${customStatus.id}`}
                            onChange={(event) =>
                              setCustomStatusDraftById((current) => ({
                                ...current,
                                [customStatus.id]: {
                                  ...draft,
                                  behavior: event.target
                                    .value as AttendanceStatusCountBehavior,
                                },
                              }))
                            }
                            value={draft.behavior}
                          >
                            {attendanceStatusBehaviorOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <div className="flex items-end">
                          <CheckboxField
                            checked={draft.isActive}
                            disabled={mode !== "admin"}
                            label="Active"
                            onChange={(event) =>
                              setCustomStatusDraftById((current) => ({
                                ...current,
                                [customStatus.id]: {
                                  ...draft,
                                  isActive: event.target.checked,
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="flex items-end justify-end">
                          {mode === "admin" ? (
                            <Button
                              disabled={
                                savingCustomStatusId === customStatus.id
                              }
                              onClick={() =>
                                void handleSaveCustomStatus(customStatus.id)
                              }
                              type="button"
                              variant="secondary"
                            >
                              {savingCustomStatusId === customStatus.id
                                ? "Saving..."
                                : "Save"}
                            </Button>
                          ) : (
                            <Badge variant="neutral">
                              {customStatus.isActive ? "Active" : "Inactive"}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attendance Records By Date Range</CardTitle>
              <CardDescription>
                Review saved attendance records for a selected class and date
                range.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <p className="text-slate-600">
                  Showing records from{" "}
                  <span className="font-medium text-slate-900">
                    {formatDateLabel(rangeStartDate)}
                  </span>{" "}
                  to{" "}
                  <span className="font-medium text-slate-900">
                    {formatDateLabel(rangeEndDate)}
                  </span>
                  .
                </p>
                <Button
                  disabled={
                    isLoadingRange ||
                    !selectedClassId ||
                    !selectedClass?.takesAttendance
                  }
                  onClick={() => {
                    void loadRangeRecords();
                    void loadClassSummary();
                  }}
                  type="button"
                  variant="secondary"
                >
                  {isLoadingRange ? "Loading..." : "Refresh records"}
                </Button>
              </div>

              {isLoadingRange ? (
                <p className="text-sm text-slate-500">
                  Loading attendance records...
                </p>
              ) : recordRange ? (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50/80">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Date
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Student
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Status
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Remark
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Taken by
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Updated
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {rangeRows.map((entry) => (
                          <tr
                            className="align-top hover:bg-slate-50"
                            key={entry.record.id}
                          >
                            <td className="px-4 py-3 text-slate-700">
                              {formatDateLabel(entry.sessionDate)}
                            </td>
                            <td className="px-4 py-3 text-slate-900">
                              {getFullName(
                                entry.record.student.firstName,
                                entry.record.student.lastName,
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              <Badge
                                variant={getStatusBadgeVariant(
                                  entry.record.status,
                                )}
                              >
                                {entry.record.customStatus?.label ??
                                  formatAttendanceStatusLabel(
                                    entry.record.status,
                                  )}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {getDisplayText(entry.record.remark, "—")}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {entry.sessionTakenBy
                                ? getFullName(
                                    entry.sessionTakenBy.firstName,
                                    entry.sessionTakenBy.lastName,
                                    "Unknown",
                                  )
                                : "Unknown"}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {formatDateTimeLabel(entry.sessionUpdatedAt)}
                            </td>
                          </tr>
                        ))}
                        {rangeRows.length === 0 ? (
                          <tr>
                            <td className="px-4 py-8" colSpan={6}>
                              <EmptyState
                                compact
                                title="No attendance records"
                                description="No records found for this class and date range."
                              />
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <EmptyState
                  compact
                  title="Select class and range"
                  description="Choose a class and date range to review attendance records."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Saved Attendance For Date</CardTitle>
              <CardDescription>
                Existing saved attendance for {formatDateLabel(selectedDate)}{" "}
                within the current school context.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Scope
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Classes
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Taken by
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Updated
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Records
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {schoolSessions.map((session) => (
                        <tr
                          className="align-top hover:bg-slate-50"
                          key={session.id}
                        >
                          <td className="px-4 py-4 text-slate-900">
                            {buildSessionLabel(session)}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {getSessionClassesLabel(session)}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {getTakenByLabel(session)}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {formatDateTimeLabel(session.updatedAt)}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {session.records.length}
                          </td>
                        </tr>
                      ))}
                      {!isLoading && schoolSessions.length === 0 ? (
                        <tr>
                          <td className="px-4 py-8" colSpan={5}>
                            <EmptyState
                              compact
                              description="No saved attendance was found for the selected date."
                              title="No attendance for this date"
                            />
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
