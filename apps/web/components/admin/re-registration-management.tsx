"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { listSchools, listSchoolYears, type School, type SchoolYear } from "@/lib/api/schools";
import {
  createReRegistrationWindow,
  getReRegistrationWindowStatus,
  listReRegistrationWindows,
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

function buildFormFromWindow(window: ReRegistrationWindow | null): WindowFormState {
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

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
        setError(loadError instanceof Error ? loadError.message : "Unable to load schools.");
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
        const response = await listSchoolYears(selectedSchoolId, { includeInactive: true });
        setSchoolYears(response);
        setSelectedSchoolYearId((current) => current || response.find((year) => year.isActive)?.id || response[0]?.id || "");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load school years.");
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
        getReRegistrationWindowStatus({ schoolId: selectedSchoolId, schoolYearId: selectedSchoolYearId }),
        listReRegistrationWindows({ schoolId: selectedSchoolId, schoolYearId: selectedSchoolYearId }),
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
        setForm(buildFormFromWindow(primary));
      } else {
        setWindows([]);
        setEditingWindowId(null);
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
      getReRegistrationWindowStatus({ schoolId: selectedSchoolId, schoolYearId: selectedSchoolYearId }),
      listReRegistrationWindows({ schoolId: selectedSchoolId, schoolYearId: selectedSchoolYearId }),
    ]);

    setStatus(statusResponse);
    setWindows(windowsResponse);
    const primary = windowsResponse[0] ?? null;
    setEditingWindowId(primary?.id ?? null);
    setForm(buildFormFromWindow(primary));
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
      setError(saveError instanceof Error ? saveError.message : "Unable to save re-registration window.");
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
          <p className="text-sm text-slate-500">Loading re-registration settings...</p>
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
            <Badge variant="neutral">{selectedSchool?.name ?? "Select a school"}</Badge>
            {status?.status ? <Badge variant="neutral">{status.status}</Badge> : null}
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Context</CardTitle>
          <CardDescription>Select the school and school year to configure.</CardDescription>
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
                Parents see the re-registration form only while the window is open.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-3" onSubmit={handleSubmit}>
                <Field htmlFor="rr-opens-at" label="Opens at">
                  <Input
                    id="rr-opens-at"
                    onChange={(event) => setForm((current) => ({ ...current, opensAt: event.target.value }))}
                    type="datetime-local"
                    value={form.opensAt}
                  />
                </Field>
                <Field htmlFor="rr-closes-at" label="Closes at">
                  <Input
                    id="rr-closes-at"
                    onChange={(event) => setForm((current) => ({ ...current, closesAt: event.target.value }))}
                    type="datetime-local"
                    value={form.closesAt}
                  />
                </Field>
                <Field htmlFor="rr-active" label="Status">
                  <Select
                    id="rr-active"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, isActive: event.target.value === "true" }))
                    }
                    value={form.isActive ? "true" : "false"}
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </Select>
                </Field>
                <div className="md:col-span-3 flex justify-end">
                  <Button disabled={isSaving} type="submit">
                    {isSaving ? "Saving..." : editingWindowId ? "Update window" : "Create window"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
              <CardDescription>All configured windows for this school year.</CardDescription>
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
                          <th className="px-4 py-3 font-semibold text-slate-700">Opens</th>
                          <th className="px-4 py-3 font-semibold text-slate-700">Closes</th>
                          <th className="px-4 py-3 font-semibold text-slate-700">Active</th>
                          <th className="px-4 py-3 font-semibold text-slate-700">Updated</th>
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
                              <Badge variant={window.isActive ? "success" : "neutral"}>
                                {window.isActive ? "Active" : "Inactive"}
                              </Badge>
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
        </>
      )}
    </div>
  );
}

