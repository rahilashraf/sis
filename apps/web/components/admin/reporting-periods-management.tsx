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
import { listSchools, listSchoolYears, type SchoolYear, type School } from "@/lib/api/schools";
import {
  activateReportingPeriod,
  archiveReportingPeriod,
  createReportingPeriod,
  listReportingPeriods,
  lockReportingPeriod,
  unlockReportingPeriod,
  updateReportingPeriod,
  type ReportingPeriod,
} from "@/lib/api/reporting-periods";
import { formatDateLabel } from "@/lib/utils";

const allowedRoles = new Set(["OWNER", "SUPER_ADMIN"]);

type PeriodFormState = {
  name: string;
  key: string;
  order: string;
  startsAt: string;
  endsAt: string;
};

function buildPeriodForm(): PeriodFormState {
  return { name: "", key: "", order: "1", startsAt: "", endsAt: "" };
}

function buildEditForm(period: ReportingPeriod): PeriodFormState {
  return {
    name: period.name,
    key: period.key,
    order: String(period.order),
    startsAt: period.startsAt.slice(0, 10),
    endsAt: period.endsAt.slice(0, 10),
  };
}

function parseIntField(value: string, label: string) {
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${label} must be a whole number.`);
  }
  return Number(value);
}

function requireDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new Error(`${label} must be a valid date.`);
  }
  return value.trim();
}

export function ReportingPeriodsManagement() {
  const { session } = useAuth();
  const role = session?.user.role;
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState("");
  const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
  const [createForm, setCreateForm] = useState<PeriodFormState>(buildPeriodForm());
  const [editingPeriod, setEditingPeriod] = useState<ReportingPeriod | null>(null);
  const [editForm, setEditForm] = useState<PeriodFormState | null>(null);
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
      if (!role || !allowedRoles.has(role)) {
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
  }, [role]);

  useEffect(() => {
    async function loadSchoolYearsForSchool() {
      if (!role || !allowedRoles.has(role)) {
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
        setSelectedSchoolYearId((current) => current || response[0]?.id || "");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load school years.");
        setSchoolYears([]);
        setSelectedSchoolYearId("");
      }
    }

    void loadSchoolYearsForSchool();
  }, [role, selectedSchoolId]);

  useEffect(() => {
    async function loadPeriods() {
      if (!role || !allowedRoles.has(role)) {
        return;
      }

      if (!selectedSchoolId || !selectedSchoolYearId) {
        setPeriods([]);
        return;
      }

      setError(null);

      try {
        const response = await listReportingPeriods({
          schoolId: selectedSchoolId,
          schoolYearId: selectedSchoolYearId,
          includeInactive: true,
        });
        setPeriods(response);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load reporting periods.");
        setPeriods([]);
      }
    }

    void loadPeriods();
  }, [role, selectedSchoolId, selectedSchoolYearId]);

  async function refreshPeriods() {
    if (!selectedSchoolId || !selectedSchoolYearId) {
      setPeriods([]);
      return [];
    }

    const response = await listReportingPeriods({
      schoolId: selectedSchoolId,
      schoolYearId: selectedSchoolYearId,
      includeInactive: true,
    });
    setPeriods(response);
    return response;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSchoolId || !selectedSchoolYearId) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!createForm.name.trim()) {
        throw new Error("Name is required.");
      }
      if (!createForm.key.trim()) {
        throw new Error("Key is required.");
      }

      await createReportingPeriod({
        schoolId: selectedSchoolId,
        schoolYearId: selectedSchoolYearId,
        name: createForm.name.trim(),
        key: createForm.key.trim(),
        order: parseIntField(createForm.order, "Order"),
        startsAt: requireDate(createForm.startsAt, "Start date"),
        endsAt: requireDate(createForm.endsAt, "End date"),
      });

      await refreshPeriods();
      setCreateForm(buildPeriodForm());
      setSuccessMessage("Reporting period created.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create reporting period.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingPeriod || !editForm) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await updateReportingPeriod(editingPeriod.id, {
        name: editForm.name.trim(),
        key: editForm.key.trim(),
        order: parseIntField(editForm.order, "Order"),
        startsAt: requireDate(editForm.startsAt, "Start date"),
        endsAt: requireDate(editForm.endsAt, "End date"),
      });

      const next = await refreshPeriods();
      const updated = next.find((period) => period.id === editingPeriod.id) ?? null;
      setEditingPeriod(updated);
      setEditForm(updated ? buildEditForm(updated) : null);
      setSuccessMessage("Reporting period updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update reporting period.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(period: ReportingPeriod) {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (period.isActive) {
        await archiveReportingPeriod(period.id);
      } else {
        await activateReportingPeriod(period.id);
      }

      await refreshPeriods();
      setSuccessMessage(period.isActive ? "Reporting period archived." : "Reporting period activated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update reporting period.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleLocked(period: ReportingPeriod) {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (period.isLocked) {
        await unlockReportingPeriod(period.id);
      } else {
        await lockReportingPeriod(period.id);
      }

      await refreshPeriods();
      setSuccessMessage(period.isLocked ? "Reporting period unlocked." : "Reporting period locked.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update reporting period.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!role || !allowedRoles.has(role)) {
    return (
      <EmptyState
        title="Not authorized"
        description="Only owners and super admins can manage reporting periods."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading reporting periods...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reporting Periods"
        description="Configure reporting period date ranges per school year."
        meta={
          selectedSchool && selectedSchoolYear ? (
            <>
              <Badge variant="neutral">{selectedSchool.name}</Badge>
              <Badge variant="neutral">{selectedSchoolYear.name}</Badge>
              <Badge variant="neutral">{periods.length} periods</Badge>
            </>
          ) : null
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Context</CardTitle>
          <CardDescription>Select a school year to manage its periods.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field htmlFor="reporting-school" label="School">
            <Select
              id="reporting-school"
              onChange={(event) => setSelectedSchoolId(event.target.value)}
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

          <Field htmlFor="reporting-school-year" label="School year">
            <Select
              disabled={!selectedSchoolId}
              id="reporting-school-year"
              onChange={(event) => setSelectedSchoolYearId(event.target.value)}
              value={selectedSchoolYearId}
            >
              <option value="">Select year</option>
              {schoolYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create Period</CardTitle>
            <CardDescription>Add a reporting period for the selected school year.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedSchoolId || !selectedSchoolYearId ? (
              <EmptyState
                compact
                title="Missing context"
                description="Select a school and school year before creating a reporting period."
              />
            ) : (
              <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreate}>
                <Field htmlFor="create-period-name" label="Name">
                  <Input
                    id="create-period-name"
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Term 1"
                    value={createForm.name}
                  />
                </Field>
                <Field htmlFor="create-period-key" label="Key">
                  <Input
                    id="create-period-key"
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, key: event.target.value }))
                    }
                    placeholder="term-1"
                    value={createForm.key}
                  />
                </Field>
                <Field htmlFor="create-period-order" label="Order">
                  <Input
                    id="create-period-order"
                    inputMode="numeric"
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, order: event.target.value }))
                    }
                    value={createForm.order}
                  />
                </Field>
                <Field htmlFor="create-period-start" label="Start date">
                  <Input
                    id="create-period-start"
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, startsAt: event.target.value }))
                    }
                    type="date"
                    value={createForm.startsAt}
                  />
                </Field>
                <Field htmlFor="create-period-end" label="End date">
                  <Input
                    id="create-period-end"
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, endsAt: event.target.value }))
                    }
                    type="date"
                    value={createForm.endsAt}
                  />
                </Field>
                <div className="md:col-span-2 flex justify-end">
                  <Button disabled={isSaving} type="submit">
                    {isSaving ? "Saving..." : "Create period"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Periods</CardTitle>
            <CardDescription>Lock/activate periods to control edits.</CardDescription>
          </CardHeader>
          <CardContent>
            {periods.length === 0 ? (
              <EmptyState
                compact
                title="No reporting periods"
                description="Create the first reporting period for this school year."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate-700">Period</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Dates</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {periods.map((period) => (
                        <tr className="align-top hover:bg-slate-50" key={period.id}>
                          <td className="px-4 py-4">
                            <p className="font-medium text-slate-900">
                              {period.order}. {period.name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">{period.key}</p>
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {formatDateLabel(period.startsAt)} – {formatDateLabel(period.endsAt)}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Badge variant={period.isActive ? "success" : "neutral"}>
                                {period.isActive ? "Active" : "Archived"}
                              </Badge>
                              <Badge variant={period.isLocked ? "neutral" : "success"}>
                                {period.isLocked ? "Locked" : "Unlocked"}
                              </Badge>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                onClick={() => {
                                  setEditingPeriod(period);
                                  setEditForm(buildEditForm(period));
                                }}
                                size="sm"
                                type="button"
                                variant="secondary"
                              >
                                Edit
                              </Button>
                              <Button
                                disabled={isSaving}
                                onClick={() => void handleToggleLocked(period)}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                {period.isLocked ? "Unlock" : "Lock"}
                              </Button>
                              <Button
                                disabled={isSaving}
                                onClick={() => void handleToggleActive(period)}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                {period.isActive ? "Archive" : "Activate"}
                              </Button>
                            </div>
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
      </div>

      {editingPeriod && editForm ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Edit Period</CardTitle>
              <CardDescription>Locked periods cannot be edited until unlocked.</CardDescription>
            </div>
            <Button
              onClick={() => {
                setEditingPeriod(null);
                setEditForm(null);
              }}
              type="button"
              variant="secondary"
            >
              Close
            </Button>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSaveEdit}>
              <Field htmlFor="edit-period-name" label="Name">
                <Input
                  id="edit-period-name"
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  value={editForm.name}
                />
              </Field>
              <Field htmlFor="edit-period-key" label="Key">
                <Input
                  id="edit-period-key"
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, key: event.target.value } : current,
                    )
                  }
                  value={editForm.key}
                />
              </Field>
              <Field htmlFor="edit-period-order" label="Order">
                <Input
                  id="edit-period-order"
                  inputMode="numeric"
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, order: event.target.value } : current,
                    )
                  }
                  value={editForm.order}
                />
              </Field>
              <Field htmlFor="edit-period-start" label="Start date">
                <Input
                  id="edit-period-start"
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, startsAt: event.target.value } : current,
                    )
                  }
                  type="date"
                  value={editForm.startsAt}
                />
              </Field>
              <Field htmlFor="edit-period-end" label="End date">
                <Input
                  id="edit-period-end"
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, endsAt: event.target.value } : current,
                    )
                  }
                  type="date"
                  value={editForm.endsAt}
                />
              </Field>
              <div className="md:col-span-2 flex justify-end">
                <Button disabled={isSaving} type="submit">
                  {isSaving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
