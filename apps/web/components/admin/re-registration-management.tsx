"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import {
  listSchools,
  listSchoolYears,
  type School,
  type SchoolYear,
} from "@/lib/api/schools";
import {
  createReRegistrationWindow,
  getReRegistrationWindowTracking,
  getReRegistrationWindowStatus,
  listReRegistrationWindows,
  remindAllPendingForWindow,
  remindPendingForStudent,
  type ReRegistrationTrackingFilters,
  type ReRegistrationTrackingResponse,
  updateReRegistrationWindow,
  type ReRegistrationWindow,
  type ReRegistrationWindowStatus,
} from "@/lib/api/re-registration";

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);

type WindowFormState = {
  opensAt: string;
  closesAt: string;
  isActive: boolean;
};

const NON_RETURNING_REASON_LABELS: Record<string, string> = {
  MOVING: "Moving",
  TRANSFERRING_SCHOOLS: "Transferring schools",
  HOMESCHOOLING: "Homeschooling",
  GRADUATING: "Graduating",
  FINANCIAL: "Financial reasons",
  OTHER: "Other",
};

function parseDateTimeLocal(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid date/time.`);
  }

  return parsed;
}

function toDateTimeLocal(value: string | Date | null | undefined) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function buildEmptyForm(): WindowFormState {
  return { opensAt: "", closesAt: "", isActive: true };
}

function buildFormFromWindow(
  window: ReRegistrationWindow | null,
): WindowFormState {
  if (!window) {
    return buildEmptyForm();
  }

  return {
    opensAt: toDateTimeLocal(window.opensAt),
    closesAt: toDateTimeLocal(window.closesAt),
    isActive: window.isActive,
  };
}

export function ReRegistrationManagement() {
  const { session } = useAuth();
  const role = session?.user.role ?? null;
  const canManage = role ? manageRoles.has(role) : false;

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState("");

  const [status, setStatus] = useState<ReRegistrationWindowStatus | null>(null);
  const [windows, setWindows] = useState<ReRegistrationWindow[]>([]);
  const [form, setForm] = useState<WindowFormState>(buildEmptyForm());
  const [editingWindowId, setEditingWindowId] = useState<string | null>(null);
  const [trackingWindowId, setTrackingWindowId] = useState<string>("");
  const [tracking, setTracking] =
    useState<ReRegistrationTrackingResponse | null>(null);
  const [trackingFilters, setTrackingFilters] =
    useState<ReRegistrationTrackingFilters>({
      submissionStatus: "ALL",
      returningIntent: "ALL",
      reason: "",
      gradeLevelId: "",
      classId: "",
      query: "",
    });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemindingAll, setIsRemindingAll] = useState(false);
  const [remindingStudentId, setRemindingStudentId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId],
  );

  const selectedSchoolYear = useMemo(
    () => schoolYears.find((year) => year.id === selectedSchoolYearId) ?? null,
    [schoolYears, selectedSchoolYearId],
  );

  useEffect(() => {
    async function loadSchools() {
      if (!canManage) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await listSchools({ includeInactive: false });
        setSchools(response);
        setSelectedSchoolId((current) => current || response[0]?.id || "");
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load schools.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadSchools();
  }, [canManage]);

  useEffect(() => {
    async function loadYears() {
      if (!canManage) {
        return;
      }

      if (!selectedSchoolId) {
        setSchoolYears([]);
        setSelectedSchoolYearId("");
        return;
      }

      setError(null);

      try {
        const response = await listSchoolYears(selectedSchoolId, {
          includeInactive: true,
        });
        setSchoolYears(response);
        setSelectedSchoolYearId(
          (current) =>
            current ||
            response.find((year) => year.isActive)?.id ||
            response[0]?.id ||
            "",
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load school years.",
        );
        setSchoolYears([]);
        setSelectedSchoolYearId("");
      }
    }

    void loadYears();
  }, [canManage, selectedSchoolId]);

  useEffect(() => {
    async function loadWindows() {
      if (!canManage) {
        return;
      }

      if (!selectedSchoolId || !selectedSchoolYearId) {
        setStatus(null);
        setWindows([]);
        setEditingWindowId(null);
        setForm(buildEmptyForm());
        return;
      }

      setError(null);
      setSuccessMessage(null);

      const [statusResult, windowsResult] = await Promise.allSettled([
        getReRegistrationWindowStatus({
          schoolId: selectedSchoolId,
          schoolYearId: selectedSchoolYearId,
        }),
        listReRegistrationWindows({
          schoolId: selectedSchoolId,
          schoolYearId: selectedSchoolYearId,
        }),
      ]);

      if (statusResult.status === "fulfilled") {
        setStatus(statusResult.value);
      } else {
        setStatus(null);
        setError(
          statusResult.reason instanceof Error
            ? statusResult.reason.message
            : "Unable to load re-registration status.",
        );
      }

      if (windowsResult.status === "fulfilled") {
        setWindows(windowsResult.value);
        const primary = windowsResult.value[0] ?? null;
        setEditingWindowId(primary?.id ?? null);
        setTrackingWindowId((current) =>
          current && windowsResult.value.some((window) => window.id === current)
            ? current
            : (primary?.id ?? ""),
        );
        setForm(buildFormFromWindow(primary));
      } else {
        setWindows([]);
        setEditingWindowId(null);
        setTrackingWindowId("");
        setTracking(null);
        setForm(buildEmptyForm());
      }
    }

    void loadWindows();
  }, [canManage, selectedSchoolId, selectedSchoolYearId]);

  async function refresh() {
    if (!selectedSchoolId || !selectedSchoolYearId) {
      return;
    }

    const [statusResponse, windowsResponse] = await Promise.all([
      getReRegistrationWindowStatus({
        schoolId: selectedSchoolId,
        schoolYearId: selectedSchoolYearId,
      }),
      listReRegistrationWindows({
        schoolId: selectedSchoolId,
        schoolYearId: selectedSchoolYearId,
      }),
    ]);

    setStatus(statusResponse);
    setWindows(windowsResponse);
    const primary = windowsResponse[0] ?? null;
    setEditingWindowId(primary?.id ?? null);
    setTrackingWindowId((current) =>
      current && windowsResponse.some((window) => window.id === current)
        ? current
        : (primary?.id ?? ""),
    );
    setForm(buildFormFromWindow(primary));
  }

  useEffect(() => {
    async function loadTracking() {
      if (!canManage || !trackingWindowId) {
        setTracking(null);
        return;
      }

      try {
        const response = await getReRegistrationWindowTracking(
          trackingWindowId,
          trackingFilters,
        );
        setTracking(response);
      } catch (loadError) {
        setTracking(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load tracking data.",
        );
      }
    }

    void loadTracking();
  }, [canManage, trackingWindowId, trackingFilters]);

  async function refreshTrackingForCurrentFilters() {
    if (!trackingWindowId) {
      return;
    }

    const response = await getReRegistrationWindowTracking(
      trackingWindowId,
      trackingFilters,
    );
    setTracking(response);
  }

  async function handleRemindAllPending() {
    if (!trackingWindowId) {
      return;
    }

    setIsRemindingAll(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await remindAllPendingForWindow(trackingWindowId);
      setSuccessMessage(
        `Reminders sent: ${result.notificationsSent}. Students reminded: ${result.studentsReminded}. Skipped (no linked parent): ${result.skippedNoLinkedParent}. Skipped (already submitted): ${result.skippedAlreadySubmitted}. Skipped (recently reminded): ${result.skippedRecentlyReminded}.`,
      );
      await refreshTrackingForCurrentFilters();
    } catch (remindError) {
      setError(
        remindError instanceof Error
          ? remindError.message
          : "Unable to send reminders.",
      );
    } finally {
      setIsRemindingAll(false);
    }
  }

  async function handleRemindStudent(studentId: string) {
    if (!trackingWindowId) {
      return;
    }

    setRemindingStudentId(studentId);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await remindPendingForStudent(trackingWindowId, studentId);

      if (result.status === "REMINDER_SENT") {
        setSuccessMessage(
          `Reminder sent (${result.notificationsSent} notification${result.notificationsSent === 1 ? "" : "s"}).`,
        );
      } else if (result.status === "SKIPPED_ALREADY_SUBMITTED") {
        setSuccessMessage(
          "Reminder skipped: student already submitted re-registration.",
        );
      } else if (result.status === "SKIPPED_NO_LINKED_PARENT") {
        setSuccessMessage("Reminder skipped: no linked parent account found.");
      } else {
        setSuccessMessage(
          `Reminder skipped: this family was reminded recently${result.throttleMinutes ? ` (within ${result.throttleMinutes} minutes)` : ""}.`,
        );
      }

      await refreshTrackingForCurrentFilters();
    } catch (remindError) {
      setError(
        remindError instanceof Error
          ? remindError.message
          : "Unable to send reminder.",
      );
    } finally {
      setRemindingStudentId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSchoolId || !selectedSchoolYearId) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const opensAt = parseDateTimeLocal(form.opensAt, "Open date/time");
      const closesAt = parseDateTimeLocal(form.closesAt, "Close date/time");

      if (opensAt >= closesAt) {
        throw new Error("Open date/time must be before close date/time.");
      }

      if (editingWindowId) {
        await updateReRegistrationWindow(editingWindowId, {
          opensAt: opensAt.toISOString(),
          closesAt: closesAt.toISOString(),
          isActive: form.isActive,
        });
        setSuccessMessage("Re-registration window updated.");
      } else {
        await createReRegistrationWindow({
          schoolId: selectedSchoolId,
          schoolYearId: selectedSchoolYearId,
          opensAt: opensAt.toISOString(),
          closesAt: closesAt.toISOString(),
          isActive: form.isActive,
        });
        setSuccessMessage("Re-registration window created.");
      }

      await refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save re-registration window.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!canManage) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, and ADMIN roles can manage re-registration windows."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">
            Loading re-registration settings...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Re-registration"
        description="Configure date-gated parent access for returning-student updates."
        meta={
          <>
            <Badge variant="neutral">
              {selectedSchool?.name ?? "Select a school"}
            </Badge>
            {status?.status === "OPEN" ? (
              <Badge variant="success">Open</Badge>
            ) : status?.status === "UPCOMING" ? (
              <Badge variant="warning">Upcoming</Badge>
            ) : status?.status === "CLOSED" ? (
              <Badge variant="neutral">Closed</Badge>
            ) : null}
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Context</CardTitle>
          <CardDescription>
            Select the school and school year to configure.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field htmlFor="rr-admin-school" label="School">
            <Select
              id="rr-admin-school"
              onChange={(event) => {
                setSelectedSchoolId(event.target.value);
                setSelectedSchoolYearId("");
                setSuccessMessage(null);
              }}
              value={selectedSchoolId}
            >
              <option value="">Select school</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field htmlFor="rr-admin-year" label="School year">
            <Select
              disabled={!selectedSchoolId || schoolYears.length === 0}
              id="rr-admin-year"
              onChange={(event) => {
                setSelectedSchoolYearId(event.target.value);
                setSuccessMessage(null);
              }}
              value={selectedSchoolYearId}
            >
              <option value="">Select school year</option>
              {schoolYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                  {year.isActive ? " (Active)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      {!selectedSchoolId || !selectedSchoolYearId ? (
        <EmptyState
          title="Choose a school year"
          description="Select a school and year to configure re-registration."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Window</CardTitle>
              <CardDescription>
                Parents see the re-registration form only while the window is
                open.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 md:grid-cols-3"
                onSubmit={handleSubmit}
              >
                <Field htmlFor="rr-opens-at" label="Opens at">
                  <Input
                    id="rr-opens-at"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        opensAt: event.target.value,
                      }))
                    }
                    type="datetime-local"
                    value={form.opensAt}
                  />
                </Field>
                <Field htmlFor="rr-closes-at" label="Closes at">
                  <Input
                    id="rr-closes-at"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        closesAt: event.target.value,
                      }))
                    }
                    type="datetime-local"
                    value={form.closesAt}
                  />
                </Field>
                <Field htmlFor="rr-active" label="Status">
                  <Select
                    id="rr-active"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        isActive: event.target.value === "true",
                      }))
                    }
                    value={form.isActive ? "true" : "false"}
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </Select>
                </Field>
                <div className="md:col-span-3 flex justify-end">
                  <Button disabled={isSaving} type="submit">
                    {isSaving
                      ? "Saving..."
                      : editingWindowId
                        ? "Update window"
                        : "Create window"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
              <CardDescription>
                All configured windows for this school year.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {windows.length === 0 ? (
                <EmptyState
                  compact
                  title="No windows configured"
                  description="Create a re-registration window to enable parent access."
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50/80">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Opens
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Closes
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Active
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Updated
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {windows.map((window) => (
                          <tr className="align-top" key={window.id}>
                            <td className="px-4 py-3 text-slate-700">
                              {new Date(window.opensAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {new Date(window.closesAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                              {(() => {
                                if (!window.isActive)
                                  return (
                                    <Badge variant="neutral">Inactive</Badge>
                                  );
                                const now = new Date();
                                const opensAt = new Date(window.opensAt);
                                const closesAt = new Date(window.closesAt);
                                if (now >= opensAt && now <= closesAt)
                                  return <Badge variant="success">Open</Badge>;
                                if (now < opensAt)
                                  return (
                                    <Badge variant="warning">Upcoming</Badge>
                                  );
                                return <Badge variant="neutral">Closed</Badge>;
                              })()}
                            </td>
                            <td className="px-4 py-3 text-slate-500">
                              {new Date(window.updatedAt).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CardTitle>Submission tracking</CardTitle>
                  <Badge variant="warning">
                    Pending: {tracking?.summary.pendingCount ?? 0}
                  </Badge>
                </div>
                <Button
                  disabled={
                    !trackingWindowId ||
                    isRemindingAll ||
                    (tracking?.summary.pendingCount ?? 0) === 0
                  }
                  onClick={() => void handleRemindAllPending()}
                  type="button"
                >
                  {isRemindingAll
                    ? "Sending reminders..."
                    : "Remind All Pending"}
                </Button>
              </div>
              <CardDescription>
                Track submitted and pending re-registration forms for each
                window.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Field htmlFor="rr-tracking-window" label="Window">
                  <Select
                    id="rr-tracking-window"
                    onChange={(event) =>
                      setTrackingWindowId(event.target.value)
                    }
                    value={trackingWindowId}
                  >
                    <option value="">Select window</option>
                    {windows.map((window) => (
                      <option key={window.id} value={window.id}>
                        {new Date(window.opensAt).toLocaleDateString()} →{" "}
                        {new Date(window.closesAt).toLocaleDateString()}
                        {window.isActive ? " (Active)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  htmlFor="rr-filter-submission-status"
                  label="Submission status"
                >
                  <Select
                    id="rr-filter-submission-status"
                    onChange={(event) =>
                      setTrackingFilters((current) => ({
                        ...current,
                        submissionStatus: event.target
                          .value as ReRegistrationTrackingFilters["submissionStatus"],
                      }))
                    }
                    value={trackingFilters.submissionStatus ?? "ALL"}
                  >
                    <option value="ALL">All</option>
                    <option value="SUBMITTED">Submitted</option>
                    <option value="PENDING">Pending</option>
                  </Select>
                </Field>

                <Field
                  htmlFor="rr-filter-returning-intent"
                  label="Returning intent"
                >
                  <Select
                    id="rr-filter-returning-intent"
                    onChange={(event) =>
                      setTrackingFilters((current) => ({
                        ...current,
                        returningIntent: event.target
                          .value as ReRegistrationTrackingFilters["returningIntent"],
                      }))
                    }
                    value={trackingFilters.returningIntent ?? "ALL"}
                  >
                    <option value="ALL">All</option>
                    <option value="RETURNING">Returning</option>
                    <option value="NOT_RETURNING">Not returning</option>
                  </Select>
                </Field>

                <Field htmlFor="rr-filter-query" label="Search student">
                  <Input
                    id="rr-filter-query"
                    onChange={(event) =>
                      setTrackingFilters((current) => ({
                        ...current,
                        query: event.target.value,
                      }))
                    }
                    placeholder="First or last name"
                    value={trackingFilters.query ?? ""}
                  />
                </Field>

                <Field htmlFor="rr-filter-grade" label="Grade">
                  <Select
                    id="rr-filter-grade"
                    onChange={(event) =>
                      setTrackingFilters((current) => ({
                        ...current,
                        gradeLevelId: event.target.value,
                      }))
                    }
                    value={trackingFilters.gradeLevelId ?? ""}
                  >
                    <option value="">All grades</option>
                    {(tracking?.availableFilters.gradeLevels ?? []).map(
                      (grade) => (
                        <option key={grade.id} value={grade.id}>
                          {grade.name}
                        </option>
                      ),
                    )}
                  </Select>
                </Field>

                <Field htmlFor="rr-filter-class" label="Class">
                  <Select
                    id="rr-filter-class"
                    onChange={(event) =>
                      setTrackingFilters((current) => ({
                        ...current,
                        classId: event.target.value,
                      }))
                    }
                    value={trackingFilters.classId ?? ""}
                  >
                    <option value="">All classes</option>
                    {(tracking?.availableFilters.classes ?? []).map((klass) => (
                      <option key={klass.id} value={klass.id}>
                        {klass.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field htmlFor="rr-filter-reason" label="Non-return reason">
                  <Select
                    id="rr-filter-reason"
                    onChange={(event) =>
                      setTrackingFilters((current) => ({
                        ...current,
                        reason: event.target
                          .value as ReRegistrationTrackingFilters["reason"],
                      }))
                    }
                    value={trackingFilters.reason ?? ""}
                  >
                    <option value="">All reasons</option>
                    {(tracking?.availableFilters.reasons ?? []).map(
                      (reason) => (
                        <option key={reason} value={reason}>
                          {NON_RETURNING_REASON_LABELS[reason] ?? reason}
                        </option>
                      ),
                    )}
                  </Select>
                </Field>

                <div className="flex items-end">
                  <Button
                    onClick={() =>
                      setTrackingFilters({
                        submissionStatus: "ALL",
                        returningIntent: "ALL",
                        reason: "",
                        gradeLevelId: "",
                        classId: "",
                        query: "",
                      })
                    }
                    type="button"
                    variant="secondary"
                  >
                    Reset filters
                  </Button>
                </div>
              </div>

              {!trackingWindowId ? (
                <EmptyState
                  compact
                  title="No tracking window selected"
                  description="Select a configured re-registration window to view submissions."
                />
              ) : tracking ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Total students
                        </p>
                        <p className="mt-1 text-2xl font-semibold text-slate-900">
                          {tracking.summary.totalStudents}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Submitted
                        </p>
                        <p className="mt-1 text-2xl font-semibold text-emerald-700">
                          {tracking.summary.submittedCount}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Pending
                        </p>
                        <p className="mt-1 text-2xl font-semibold text-amber-700">
                          {tracking.summary.pendingCount}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Returning
                        </p>
                        <p className="mt-1 text-2xl font-semibold text-sky-700">
                          {tracking.summary.returningCount}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Not returning
                        </p>
                        <p className="mt-1 text-2xl font-semibold text-rose-700">
                          {tracking.summary.nonReturningCount}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                        <thead className="bg-slate-50/80">
                          <tr>
                            <th className="px-4 py-3 font-semibold text-slate-700">
                              Student
                            </th>
                            <th className="px-4 py-3 font-semibold text-slate-700">
                              Grade
                            </th>
                            <th className="px-4 py-3 font-semibold text-slate-700">
                              Classes
                            </th>
                            <th className="px-4 py-3 font-semibold text-slate-700">
                              Status
                            </th>
                            <th className="px-4 py-3 font-semibold text-slate-700">
                              Intent
                            </th>
                            <th className="px-4 py-3 font-semibold text-slate-700">
                              Reason
                            </th>
                            <th className="px-4 py-3 font-semibold text-slate-700">
                              Submitted
                            </th>
                            <th className="px-4 py-3 font-semibold text-slate-700">
                              Last reminded
                            </th>
                            <th className="px-4 py-3 font-semibold text-slate-700">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {tracking.rows.map((row) => (
                            <tr key={row.studentId}>
                              <td className="px-4 py-3 text-slate-800">
                                {row.firstName} {row.lastName}
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {row.gradeLevelName ?? "—"}
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {row.classNames.length
                                  ? row.classNames.join(", ")
                                  : "—"}
                              </td>
                              <td className="px-4 py-3">
                                <Badge
                                  variant={
                                    row.isSubmitted ? "success" : "warning"
                                  }
                                >
                                  {row.isSubmitted ? "Submitted" : "Pending"}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                {row.returningNextYear === true
                                  ? "Returning"
                                  : row.returningNextYear === false
                                    ? "Not returning"
                                    : "—"}
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                {row.nonReturningReason
                                  ? (NON_RETURNING_REASON_LABELS[
                                      row.nonReturningReason
                                    ] ?? row.nonReturningReason)
                                  : "—"}
                                {row.nonReturningComment ? (
                                  <p className="mt-1 text-xs text-slate-500">
                                    {row.nonReturningComment}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                {row.submittedAt
                                  ? new Date(row.submittedAt).toLocaleString()
                                  : "—"}
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                {row.lastRemindedAt
                                  ? new Date(
                                      row.lastRemindedAt,
                                    ).toLocaleString()
                                  : "—"}
                              </td>
                              <td className="px-4 py-3">
                                {row.isSubmitted ? (
                                  <span className="text-xs text-slate-400">
                                    —
                                  </span>
                                ) : (
                                  <Button
                                    disabled={
                                      isRemindingAll ||
                                      remindingStudentId === row.studentId
                                    }
                                    onClick={() =>
                                      void handleRemindStudent(row.studentId)
                                    }
                                    size="sm"
                                    type="button"
                                    variant="secondary"
                                  >
                                    {remindingStudentId === row.studentId
                                      ? "Sending..."
                                      : "Remind"}
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {tracking.rows.length === 0 ? (
                    <EmptyState
                      compact
                      title="No matching students"
                      description="Adjust filters to view submitted or pending students for this window."
                    />
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  Loading tracking data...
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
