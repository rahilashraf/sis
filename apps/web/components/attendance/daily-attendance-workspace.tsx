"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import {
  createAttendanceSession,
  getAttendanceCustomStatuses,
  getAttendanceSessions,
  getAttendanceStatusRules,
  getAttendanceStudents,
  updateAttendanceSession,
  type AttendanceCustomStatus,
  type AttendanceSession,
  type AttendanceStatus,
  type AttendanceStatusCountBehavior,
  type AttendanceStatusRule,
  type AttendanceStudent,
} from "@/lib/api/attendance";
import { listClasses, listMyClasses, type SchoolClass } from "@/lib/api/classes";
import {
  formatAttendanceStatusLabel,
  formatDateLabel,
  formatDateTimeLabel,
  getDisplayText,
  getLocalDateInputValue,
} from "@/lib/utils";

type DailyAttendanceWorkspaceProps = {
  mode: "teacher" | "admin";
};

type DraftSelection = {
  status: AttendanceStatus;
  customStatusId: string;
};

const defaultBehaviorByStatus: Record<
  AttendanceStatus,
  AttendanceStatusCountBehavior
> = {
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  LATE: "LATE",
  EXCUSED: "INFORMATIONAL",
};

function getFullName(student: AttendanceStudent) {
  return `${getDisplayText(student.firstName, "")} ${getDisplayText(student.lastName, "")}`.trim() || "Unnamed student";
}

function getStatusForBehavior(
  behavior: AttendanceStatusCountBehavior,
): AttendanceStatus {
  if (behavior === "ABSENT") return "ABSENT";
  if (behavior === "LATE") return "LATE";
  if (behavior === "PRESENT") return "PRESENT";
  return "EXCUSED";
}

function getStatusSelectClass(status?: AttendanceStatus) {
  const statusClass =
    status === "PRESENT"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : status === "ABSENT"
        ? "border-rose-300 bg-rose-50 text-rose-900"
        : status === "LATE"
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-slate-300 bg-white text-slate-950";

  return `min-w-44 sm:min-w-52 ${statusClass}`;
}

function getClassLabel(schoolClass: SchoolClass) {
  const subject = getDisplayText(schoolClass.subject, "");
  return `${schoolClass.name}${subject ? ` • ${subject}` : ""}${schoolClass.takesAttendance ? "" : " • Attendance disabled"}`;
}

export function DailyAttendanceWorkspace({
  mode,
}: DailyAttendanceWorkspaceProps) {
  const { selectedSchoolId: schoolContextId } = useAuth();
  const searchParams = useSearchParams();
  const requestedClassId = searchParams.get("classId") ?? "";
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedDate, setSelectedDate] = useState(getLocalDateInputValue());
  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selections, setSelections] = useState<Record<string, DraftSelection>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [expandedRemarks, setExpandedRemarks] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusRules, setStatusRules] = useState<AttendanceStatusRule[]>([]);
  const [customStatuses, setCustomStatuses] = useState<AttendanceCustomStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const visibleClasses = useMemo(() => {
    if (mode === "teacher") return classes;
    return selectedSchoolId
      ? classes.filter((schoolClass) => schoolClass.schoolId === selectedSchoolId)
      : classes;
  }, [classes, mode, selectedSchoolId]);

  const selectedClass = useMemo(
    () => visibleClasses.find((schoolClass) => schoolClass.id === selectedClassId) ?? null,
    [selectedClassId, visibleClasses],
  );

  const matchingSessions = useMemo(
    () =>
      sessions.filter((session) =>
        session.classes.some((sessionClass) => sessionClass.classId === selectedClassId),
      ),
    [selectedClassId, sessions],
  );

  const selectedSession = useMemo(
    () =>
      matchingSessions.find((session) => session.id === selectedSessionId) ??
      matchingSessions[0] ??
      null,
    [matchingSessions, selectedSessionId],
  );

  const hasSavedAttendance = Boolean(selectedSession);
  const availableSchools = useMemo(() => {
    const schools = new Map<string, string>();
    for (const schoolClass of classes) {
      schools.set(schoolClass.schoolId, schoolClass.school.name);
    }
    return Array.from(schools, ([id, name]) => ({ id, name }));
  }, [classes]);

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) =>
      [getFullName(student), student.username]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [searchQuery, students]);

  const statusRuleByStatus = useMemo(
    () => new Map(statusRules.map((rule) => [rule.status, rule.behavior])),
    [statusRules],
  );
  const customStatusById = useMemo(
    () => new Map(customStatuses.map((status) => [status.id, status])),
    [customStatuses],
  );
  const unmarkedCount = students.filter((student) => !selections[student.id]).length;
  const hasDraftChanges = Object.keys(selections).length > 0 || Object.values(remarks).some(Boolean);

  const summary = useMemo(() => {
    if (!hasSavedAttendance && !hasDraftChanges) {
      return null;
    }

    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0 };
    let countAsPresent = 0;
    let countAsAbsent = 0;
    let countAsLate = 0;

    for (const student of students) {
      const selection = selections[student.id];
      if (!selection) continue;
      const customStatus = selection.customStatusId
        ? customStatusById.get(selection.customStatusId)
        : null;
      const behavior =
        customStatus?.behavior ??
        statusRuleByStatus.get(selection.status) ??
        defaultBehaviorByStatus[selection.status];

      if (selection.status in counts) {
        counts[selection.status as "PRESENT" | "ABSENT" | "LATE"] += 1;
      }
      if (behavior === "PRESENT") countAsPresent += 1;
      if (behavior === "ABSENT") countAsAbsent += 1;
      if (behavior === "LATE") countAsLate += 1;
    }

    const denominator = countAsPresent + countAsAbsent + countAsLate;
    return {
      counts,
      rate:
        denominator === 0
          ? null
          : Number((((countAsPresent + countAsLate) / denominator) * 100).toFixed(2)),
    };
  }, [
    customStatusById,
    hasDraftChanges,
    hasSavedAttendance,
    selections,
    statusRuleByStatus,
    students,
  ]);

  useEffect(() => {
    let cancelled = false;
    async function loadClasses() {
      setIsLoading(true);
      setError(null);
      try {
        const loaded =
          mode === "teacher"
            ? await listMyClasses()
            : await listClasses({ includeInactive: false });
        if (!cancelled) setClasses(loaded);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load attendance classes.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadClasses();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode === "teacher") {
      const requested = classes.find((schoolClass) => schoolClass.id === requestedClassId);
      setSelectedClassId(
        requested?.takesAttendance
          ? requested.id
          : classes.find((schoolClass) => schoolClass.takesAttendance)?.id ?? classes[0]?.id ?? "",
      );
      return;
    }

    if (!selectedSchoolId && schoolContextId) {
      setSelectedSchoolId(schoolContextId);
    }
  }, [classes, mode, requestedClassId, schoolContextId, selectedSchoolId]);

  useEffect(() => {
    if (!selectedClassId || !visibleClasses.some((schoolClass) => schoolClass.id === selectedClassId)) {
      setSelectedClassId(visibleClasses.find((schoolClass) => schoolClass.takesAttendance)?.id ?? visibleClasses[0]?.id ?? "");
    }
  }, [selectedClassId, visibleClasses]);

  useEffect(() => {
    let cancelled = false;
    async function loadAttendance() {
      if (!selectedClass?.schoolId || !selectedDate) {
        setSessions([]);
        setStudents([]);
        setSelections({});
        setRemarks({});
        return;
      }

      setIsLoadingAttendance(true);
      setError(null);
      try {
        const [loadedSessions, loadedStudents] = await Promise.all([
          getAttendanceSessions(selectedClass.schoolId, selectedDate),
          selectedClass.takesAttendance
            ? getAttendanceStudents([selectedClass.id])
            : Promise.resolve({ students: [] as AttendanceStudent[] }),
        ]);
        if (cancelled) return;
        setSessions(loadedSessions);
        setStudents(loadedStudents.students);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load daily attendance.");
          setSessions([]);
          setStudents([]);
        }
      } finally {
        if (!cancelled) setIsLoadingAttendance(false);
      }
    }
    void loadAttendance();
    return () => {
      cancelled = true;
    };
  }, [selectedClass, selectedDate]);

  useEffect(() => {
    if (matchingSessions.length === 0) {
      setSelectedSessionId("");
      return;
    }
    if (!matchingSessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(matchingSessions[0].id);
    }
  }, [matchingSessions, selectedSessionId]);

  useEffect(() => {
    const nextSelections: Record<string, DraftSelection> = {};
    const nextRemarks: Record<string, string> = {};
    const historicalStatuses: AttendanceCustomStatus[] = [];

    for (const record of selectedSession?.records ?? []) {
      nextSelections[record.studentId] = {
        status: record.status,
        customStatusId: record.customStatusId ?? "",
      };
      nextRemarks[record.studentId] = record.remark ?? "";
      if (record.customStatus) historicalStatuses.push(record.customStatus);
    }

    setSelections(nextSelections);
    setRemarks(nextRemarks);
    setExpandedRemarks(
      Object.fromEntries(
        Object.entries(nextRemarks)
          .filter(([, remark]) => Boolean(remark))
          .map(([studentId]) => [studentId, true]),
      ),
    );
    if (historicalStatuses.length > 0) {
      setCustomStatuses((current) => {
        const byId = new Map(current.map((status) => [status.id, status]));
        historicalStatuses.forEach((status) => byId.set(status.id, status));
        return Array.from(byId.values());
      });
    }
  }, [selectedSession, students]);

  useEffect(() => {
    let cancelled = false;
    async function loadStatusConfiguration() {
      if (!selectedClass?.schoolId) return;
      setStatusError(null);
      try {
        const [rules, statuses] = await Promise.all([
          getAttendanceStatusRules(selectedClass.schoolId),
          getAttendanceCustomStatuses({ schoolId: selectedClass.schoolId }),
        ]);
        if (!cancelled) {
          setStatusRules(rules);
          setCustomStatuses((current) => {
            const byId = new Map(current.map((status) => [status.id, status]));
            statuses.forEach((status) => byId.set(status.id, status));
            return Array.from(byId.values());
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setStatusError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load attendance statuses.",
          );
        }
      }
    }
    void loadStatusConfiguration();
    return () => {
      cancelled = true;
    };
  }, [selectedClass?.schoolId]);

  function selectStatus(studentId: string, status: AttendanceStatus, customStatusId = "") {
    setSelections((current) => ({
      ...current,
      [studentId]: { status, customStatusId },
    }));
  }

  function handleMarkAllPresent() {
    setSelections(
      Object.fromEntries(
        students.map((student) => [
          student.id,
          { status: "PRESENT" as AttendanceStatus, customStatusId: "" },
        ]),
      ),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClass || !selectedClass.takesAttendance) return;
    if (unmarkedCount > 0) {
      setError(`${unmarkedCount} ${unmarkedCount === 1 ? "student still needs" : "students still need"} an attendance status.`);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    const records = students.map((student) => ({
      studentId: student.id,
      status: selections[student.id].status,
      customStatusId: selections[student.id].customStatusId || undefined,
      remark: remarks[student.id]?.trim() || undefined,
    }));

    try {
      if (selectedSession) {
        await updateAttendanceSession(selectedSession.id, { records });
        setSuccessMessage("Attendance changes saved successfully.");
      } else {
        await createAttendanceSession({
          schoolId: selectedClass.schoolId,
          schoolYearId: selectedClass.schoolYearId,
          date: selectedDate,
          classIds: [selectedClass.id],
          records,
        });
        setSuccessMessage("Attendance submitted successfully.");
      }

      const refreshed = await getAttendanceSessions(selectedClass.schoolId, selectedDate);
      setSessions(refreshed);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save attendance.");
    } finally {
      setIsSaving(false);
    }
  }

  const statusLabel = hasSavedAttendance ? "Attendance Taken" : "Pending";
  const primaryActionLabel = hasSavedAttendance ? "Save Changes" : "Submit Attendance";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily Attendance"
        description={formatDateLabel(selectedDate)}
        meta={<Badge variant={hasSavedAttendance ? "primary" : "warning"}>{statusLabel}</Badge>}
        actions={
          hasSavedAttendance ? (
            <div className="text-right text-xs text-slate-500">
              <p>Submitted {formatDateTimeLabel(selectedSession?.createdAt, undefined, "—")}</p>
              <p>by {selectedSession?.takenBy ? `${selectedSession.takenBy.firstName} ${selectedSession.takenBy.lastName}`.trim() : "Unknown"}</p>
              <p>Last updated {formatDateTimeLabel(selectedSession?.updatedAt, undefined, "—")}</p>
            </div>
          ) : undefined
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {statusError ? <Notice tone="danger">{statusError}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-3">
          {mode === "admin" ? (
            <Field htmlFor="daily-attendance-school" label="School">
              <Select
                id="daily-attendance-school"
                value={selectedSchoolId}
                onChange={(event) => setSelectedSchoolId(event.target.value)}
              >
                <option value="">Select school</option>
                {availableSchools.map((school) => (
                  <option key={school.id} value={school.id}>{school.name}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field htmlFor="daily-attendance-class" label="Class">
            <Select
              id="daily-attendance-class"
              value={selectedClassId}
              onChange={(event) => setSelectedClassId(event.target.value)}
            >
              <option value="">Select class</option>
              {visibleClasses.map((schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id} disabled={!schoolClass.takesAttendance}>
                  {getClassLabel(schoolClass)}
                </option>
              ))}
            </Select>
          </Field>
          <Field htmlFor="daily-attendance-date" label="Date">
            <Input
              id="daily-attendance-date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </Field>
          {matchingSessions.length > 1 ? (
            <Field
              className="md:col-span-3 md:max-w-sm"
              htmlFor="daily-attendance-session"
              label="Saved attendance"
              description="Multiple legacy sessions were found for this class and date."
            >
              <Select
                id="daily-attendance-session"
                value={selectedSessionId}
                onChange={(event) => setSelectedSessionId(event.target.value)}
              >
                {matchingSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {formatDateTimeLabel(session.createdAt, undefined, "Saved attendance")}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </CardContent>
      </Card>

      {isLoading || isLoadingAttendance ? (
        <p className="text-sm text-slate-500">Loading attendance data...</p>
      ) : null}

      {!isLoading && visibleClasses.length === 0 ? (
        <EmptyState title="No classes available" description="There are no classes available for attendance." />
      ) : null}

      {selectedClass && !selectedClass.takesAttendance ? (
        <Notice tone="warning">Attendance is not enabled for this class.</Notice>
      ) : null}

      {selectedClass?.takesAttendance ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Students", students.length],
              ["Present", summary?.counts.PRESENT ?? "—"],
              ["Late", summary?.counts.LATE ?? "—"],
              ["Absent", summary?.counts.ABSENT ?? "—"],
              ["Attendance Rate", summary?.rate === null || summary?.rate === undefined ? "—" : `${summary.rate}%`],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardContent className="pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
                  <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
                  {!hasSavedAttendance && hasDraftChanges && label !== "Students" ? (
                    <p className="mt-1 text-xs text-slate-500">Draft</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Students</CardTitle>
                <p className="mt-1 text-sm text-slate-600">
                  {hasSavedAttendance
                    ? "Review the saved attendance and make corrections when needed."
                    : "Mark each student before submitting attendance."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={handleMarkAllPresent} disabled={students.length === 0}>
                  Mark All Present
                </Button>
                <Button
                  type="submit"
                  form="daily-attendance-form"
                  disabled={isSaving || students.length === 0 || isLoadingAttendance}
                >
                  {isSaving ? "Saving..." : primaryActionLabel}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form id="daily-attendance-form" onSubmit={handleSubmit} className="space-y-4">
                <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-end sm:justify-between">
                  <Field htmlFor="daily-attendance-search" label="Find student" className="w-full sm:max-w-sm">
                    <Input
                      id="daily-attendance-search"
                      placeholder="Search by name or username"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </Field>
                  <p className="text-xs text-slate-600">
                    Showing {filteredStudents.length} of {students.length} students
                    {unmarkedCount > 0 ? ` • ${unmarkedCount} unmarked` : ""}
                  </p>
                </div>

                {students.length === 0 ? (
                  <EmptyState compact title="No students enrolled" description="Enroll students in this class before recording attendance." />
                ) : (
                  <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
                    {filteredStudents.map((student) => {
                      const selection = selections[student.id];
                      const savedRemark = Boolean(remarks[student.id]?.trim());
                      const selectedStatusValue = selection
                        ? selection.customStatusId
                          ? `custom:${selection.customStatusId}`
                          : selection.status
                        : "";
                      return (
                        <div key={student.id} className="space-y-3 bg-white p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-950">{getFullName(student)}</p>
                              <p className="text-sm text-slate-500">@{student.username}</p>
                            </div>
                            <Field
                              htmlFor={`attendance-status-${student.id}`}
                              label="Attendance status"
                              className="w-full lg:w-auto lg:min-w-52"
                            >
                              <Select
                                id={`attendance-status-${student.id}`}
                                aria-label={`Attendance status for ${getFullName(student)}`}
                                className={getStatusSelectClass(selection?.status)}
                                value={selectedStatusValue}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  if (!value) return;
                                  if (value.startsWith("custom:")) {
                                    const customStatusId = value.slice("custom:".length);
                                    const customStatus = customStatusById.get(customStatusId);
                                    if (customStatus) {
                                      selectStatus(
                                        student.id,
                                        getStatusForBehavior(customStatus.behavior),
                                        customStatus.id,
                                      );
                                    }
                                    return;
                                  }
                                  selectStatus(student.id, value as AttendanceStatus);
                                }}
                              >
                                <option value="">Select status</option>
                                {(["PRESENT", "ABSENT", "LATE", "EXCUSED"] as AttendanceStatus[]).map((status) => (
                                  <option key={status} value={status}>
                                    {formatAttendanceStatusLabel(status)}
                                  </option>
                                ))}
                                {customStatuses
                                  .filter((status) => status.isActive || status.id === selection?.customStatusId)
                                  .map((status) => (
                                    <option key={status.id} value={`custom:${status.id}`}>
                                      {status.label}
                                      {!status.isActive ? " (inactive)" : ""}
                                    </option>
                                  ))}
                              </Select>
                            </Field>
                          </div>
                          <div>
                            <button
                              type="button"
                              className="text-sm font-medium text-slate-600 underline underline-offset-2 outline-none focus-visible:ring-4 focus-visible:ring-slate-950/10"
                              aria-expanded={Boolean(expandedRemarks[student.id])}
                              onClick={() => setExpandedRemarks((current) => ({ ...current, [student.id]: !current[student.id] }))}
                            >
                              {savedRemark ? "Edit remark" : "＋ Add remark"}
                            </button>
                            {expandedRemarks[student.id] ? (
                              <Input
                                className="mt-2"
                                aria-label={`Remark for ${getFullName(student)}`}
                                placeholder="Optional remark"
                                value={remarks[student.id] ?? ""}
                                onChange={(event) => setRemarks((current) => ({ ...current, [student.id]: event.target.value }))}
                              />
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {filteredStudents.length === 0 ? (
                      <p className="p-6 text-sm text-slate-500">No students match this search.</p>
                    ) : null}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
