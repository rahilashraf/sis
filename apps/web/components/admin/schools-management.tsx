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
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GradeLevelsManagement } from "@/components/admin/grade-levels-management";
import { useAuth } from "@/lib/auth/auth-context";
import {
  activateSchool,
  activateSchoolYear,
  archiveSchool,
  archiveSchoolYear,
  createSchool,
  createSchoolYear,
  deleteSchool,
  deleteSchoolYear,
  listSchools,
  listSchoolYears,
  updateSchool,
  updateSchoolYear,
  type School,
  type SchoolYear,
} from "@/lib/api/schools";
import { normalizeDateOnlyPayload, parseDateOnly } from "@/lib/date";
import { formatDateLabel } from "@/lib/utils";

const schoolViewRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);
const schoolManageRoles = new Set(["OWNER", "SUPER_ADMIN"]);

type CreateSchoolFormState = {
  name: string;
  shortName: string;
};

type EditSchoolFormState = {
  name: string;
  shortName: string;
};

type CreateSchoolYearFormState = {
  endDate: string;
  name: string;
  schoolId: string;
  startDate: string;
};

type EditSchoolYearFormState = {
  endDate: string;
  name: string;
  startDate: string;
};

type ActionTarget =
  | {
      action: "activate" | "archive" | "delete";
      id: string;
      kind: "school";
      label: string;
    }
  | {
      action: "activate" | "archive" | "delete";
      id: string;
      kind: "schoolYear";
      label: string;
    };

function buildSchoolForm(school: School): EditSchoolFormState {
  return {
    name: school.name,
    shortName: school.shortName ?? "",
  };
}

function buildCreateSchoolForm(): CreateSchoolFormState {
  return {
    name: "",
    shortName: "",
  };
}

function toDateInputValue(value: string) {
  return normalizeDateOnlyPayload(value);
}

function buildSchoolYearForm(schoolYear: SchoolYear): EditSchoolYearFormState {
  return {
    name: schoolYear.name,
    startDate: toDateInputValue(schoolYear.startDate),
    endDate: toDateInputValue(schoolYear.endDate),
  };
}

function buildCreateSchoolYearForm(
  schoolId: string,
): CreateSchoolYearFormState {
  return {
    schoolId,
    name: "",
    startDate: "",
    endDate: "",
  };
}

function parseDateInputValue(value: string) {
  return parseDateOnly(value);
}

function validateSchoolName(name: string) {
  if (!name.trim()) {
    throw new Error("School name is required.");
  }
}

function validateSchoolYearForm(
  form: Pick<
    CreateSchoolYearFormState,
    "endDate" | "name" | "schoolId" | "startDate"
  >,
) {
  if (!form.schoolId) {
    throw new Error("Select a school before creating a school year.");
  }

  if (!form.name.trim()) {
    throw new Error("School year name is required.");
  }

  if (!form.startDate || !form.endDate) {
    throw new Error("Start date and end date are required.");
  }

  const startDate = parseDateInputValue(form.startDate);
  const endDate = parseDateInputValue(form.endDate);

  if (!startDate || !endDate) {
    throw new Error("Enter valid start and end dates.");
  }

  if (endDate.getTime() <= startDate.getTime()) {
    throw new Error("End date must be after start date.");
  }
}

function formatSchoolYearDateRange(schoolYear: SchoolYear) {
  const startLabel = formatDateLabel(schoolYear.startDate, undefined, "");
  const endLabel = formatDateLabel(schoolYear.endDate, undefined, "");

  if (!startLabel || !endLabel) {
    return "Dates not set";
  }

  return `${startLabel} – ${endLabel}`;
}

function getActionTitle(actionTarget: ActionTarget | null) {
  if (!actionTarget) {
    return "";
  }

  if (actionTarget.kind === "school") {
    if (actionTarget.action === "delete") {
      return "Remove school";
    }

    return actionTarget.action === "archive"
      ? "Archive school"
      : "Unarchive school";
  }

  if (actionTarget.action === "delete") {
    return "Remove school year";
  }

  return actionTarget.action === "archive"
    ? "Archive school year"
    : "Unarchive school year";
}

function getActionDescription(actionTarget: ActionTarget | null) {
  if (!actionTarget) {
    return "";
  }

  if (actionTarget.kind === "school") {
    if (actionTarget.action === "delete") {
      return `Remove ${actionTarget.label} from active admin workflows? Empty schools are deleted permanently. Schools with memberships, school years, classes, attendance, or reporting periods are archived instead.`;
    }

    return actionTarget.action === "archive"
      ? `Archive ${actionTarget.label}? This hides the school from active use without deleting linked records.`
      : `Unarchive ${actionTarget.label}? This makes the school active again.`;
  }

  if (actionTarget.action === "delete") {
    return `Remove ${actionTarget.label} from active admin workflows? Empty school years are deleted permanently. Years with linked classes, attendance, or reporting periods are archived instead.`;
  }

  return actionTarget.action === "archive"
    ? `Archive ${actionTarget.label}? This sets the school year inactive without deleting linked records.`
    : `Unarchive ${actionTarget.label}? This makes the school year active again and deactivates any other active year for the same school.`;
}

function getActionConfirmLabel(actionTarget: ActionTarget | null) {
  if (!actionTarget) {
    return "Confirm";
  }

  if (actionTarget.action === "delete") {
    return actionTarget.kind === "school"
      ? "Remove school"
      : "Remove school year";
  }

  return actionTarget.action === "archive"
    ? actionTarget.kind === "school"
      ? "Archive school"
      : "Archive school year"
    : actionTarget.kind === "school"
      ? "Unarchive school"
      : "Unarchive school year";
}

function getActionPendingLabel(actionTarget: ActionTarget | null) {
  if (!actionTarget) {
    return "Working...";
  }

  if (actionTarget.action === "delete") {
    return "Deleting...";
  }

  return actionTarget.action === "archive" ? "Archiving..." : "Unarchiving...";
}

function getActionConfirmVariant(actionTarget: ActionTarget | null) {
  if (!actionTarget) {
    return "primary" as const;
  }

  return actionTarget.action === "delete" || actionTarget.action === "archive"
    ? ("danger" as const)
    : ("primary" as const);
}

export function SchoolsManagement() {
  const { session } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [isCreateSchoolOpen, setIsCreateSchoolOpen] = useState(false);
  const [createSchoolForm, setCreateSchoolForm] =
    useState<CreateSchoolFormState>(buildCreateSchoolForm());
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [schoolForm, setSchoolForm] = useState<EditSchoolFormState | null>(
    null,
  );
  const [isCreateSchoolYearOpen, setIsCreateSchoolYearOpen] = useState(false);
  const [createSchoolYearForm, setCreateSchoolYearForm] =
    useState<CreateSchoolYearFormState>(buildCreateSchoolYearForm(""));
  const [editingSchoolYear, setEditingSchoolYear] = useState<SchoolYear | null>(
    null,
  );
  const [schoolYearForm, setSchoolYearForm] =
    useState<EditSchoolYearFormState | null>(null);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingYears, setIsLoadingYears] = useState(false);
  const [isCreatingSchool, setIsCreatingSchool] = useState(false);
  const [isSavingSchool, setIsSavingSchool] = useState(false);
  const [isCreatingSchoolYear, setIsCreatingSchoolYear] = useState(false);
  const [isSavingSchoolYear, setIsSavingSchoolYear] = useState(false);
  const [isRunningAction, setIsRunningAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canViewSchools = session?.user.role
    ? schoolViewRoles.has(session.user.role)
    : false;
  const canManageSchools = session?.user.role
    ? schoolManageRoles.has(session.user.role)
    : false;
  const canCreateSchools = canManageSchools;
  const selectedSchool =
    schools.find((school) => school.id === selectedSchoolId) ?? null;

  const activeSchoolsCount = useMemo(
    () => schools.filter((school) => school.isActive).length,
    [schools],
  );

  useEffect(() => {
    async function loadSchools() {
      setIsLoading(true);
      setError(null);

      try {
        const schoolResponse = await listSchools({
          includeInactive: showArchived,
        });
        setSchools(schoolResponse);
        setSelectedSchoolId((current) =>
          schoolResponse.some((school) => school.id === current)
            ? current
            : (schoolResponse[0]?.id ?? ""),
        );
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
  }, [showArchived]);

  useEffect(() => {
    async function loadSchoolYearsForSelectedSchool() {
      if (!selectedSchoolId) {
        setSchoolYears([]);
        return;
      }

      setIsLoadingYears(true);

      try {
        const schoolYearResponse = await listSchoolYears(selectedSchoolId, {
          includeInactive: showArchived,
        });
        setSchoolYears(schoolYearResponse);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load school years.",
        );
      } finally {
        setIsLoadingYears(false);
      }
    }

    void loadSchoolYearsForSelectedSchool();
  }, [selectedSchoolId, showArchived]);

  useEffect(() => {
    setCreateSchoolYearForm((current) => ({
      ...current,
      schoolId: selectedSchoolId,
    }));
  }, [selectedSchoolId]);

  async function refreshSchools() {
    const schoolResponse = await listSchools({ includeInactive: showArchived });
    setSchools(schoolResponse);
    setSelectedSchoolId((current) =>
      schoolResponse.some((school) => school.id === current)
        ? current
        : (schoolResponse[0]?.id ?? ""),
    );
    return schoolResponse;
  }

  async function refreshSchoolYears(schoolId: string) {
    if (!schoolId) {
      setSchoolYears([]);
      return [];
    }

    const schoolYearResponse = await listSchoolYears(schoolId, {
      includeInactive: showArchived,
    });
    setSchoolYears(schoolYearResponse);
    return schoolYearResponse;
  }

  function syncEditingSchoolState(updatedSchools: School[]) {
    if (!editingSchool) {
      return;
    }

    const updatedSchool = updatedSchools.find(
      (school) => school.id === editingSchool.id,
    );

    if (!updatedSchool) {
      setEditingSchool(null);
      setSchoolForm(null);
      return;
    }

    setEditingSchool(updatedSchool);
    setSchoolForm(buildSchoolForm(updatedSchool));
  }

  function syncEditingSchoolYearState(updatedSchoolYears: SchoolYear[]) {
    if (!editingSchoolYear) {
      return;
    }

    const updatedSchoolYear = updatedSchoolYears.find(
      (schoolYear) => schoolYear.id === editingSchoolYear.id,
    );

    if (!updatedSchoolYear) {
      setEditingSchoolYear(null);
      setSchoolYearForm(null);
      return;
    }

    setEditingSchoolYear(updatedSchoolYear);
    setSchoolYearForm(buildSchoolYearForm(updatedSchoolYear));
  }

  function handleStartEditSchool(school: School) {
    setEditingSchool(school);
    setSchoolForm(buildSchoolForm(school));
    setSuccessMessage(null);
    setError(null);
  }

  function handleStartEditSchoolYear(schoolYear: SchoolYear) {
    setEditingSchoolYear(schoolYear);
    setSchoolYearForm(buildSchoolYearForm(schoolYear));
    setSuccessMessage(null);
    setError(null);
  }

  async function handleCreateSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreateSchools) {
      return;
    }

    setIsCreatingSchool(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const trimmedName = createSchoolForm.name.trim();
      validateSchoolName(trimmedName);

      const createdSchool = await createSchool({
        name: trimmedName,
        shortName: createSchoolForm.shortName.trim() || undefined,
      });

      const updatedSchools = await refreshSchools();
      syncEditingSchoolState(updatedSchools);
      setCreateSchoolForm(buildCreateSchoolForm());
      setIsCreateSchoolOpen(false);
      setSelectedSchoolId(createdSchool.id);
      await refreshSchoolYears(createdSchool.id);
      setSuccessMessage("School created successfully.");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create school.",
      );
    } finally {
      setIsCreatingSchool(false);
    }
  }

  async function handleSaveSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingSchool || !schoolForm || !canManageSchools) {
      return;
    }

    setIsSavingSchool(true);
    setError(null);
    setSuccessMessage(null);

    try {
      validateSchoolName(schoolForm.name);

      await updateSchool(editingSchool.id, {
        name: schoolForm.name.trim(),
        shortName: schoolForm.shortName.trim() || undefined,
      });

      const updatedSchools = await refreshSchools();
      syncEditingSchoolState(updatedSchools);

      setSuccessMessage("School updated successfully.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update school.",
      );
    } finally {
      setIsSavingSchool(false);
    }
  }

  async function handleCreateSchoolYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageSchools) {
      return;
    }

    setIsCreatingSchoolYear(true);
    setError(null);
    setSuccessMessage(null);

    try {
      validateSchoolYearForm(createSchoolYearForm);

      await createSchoolYear({
        schoolId: createSchoolYearForm.schoolId,
        name: createSchoolYearForm.name.trim(),
        startDate: createSchoolYearForm.startDate,
        endDate: createSchoolYearForm.endDate,
      });

      const updatedSchoolYears = await refreshSchoolYears(
        createSchoolYearForm.schoolId,
      );
      syncEditingSchoolYearState(updatedSchoolYears);
      setCreateSchoolYearForm(
        buildCreateSchoolYearForm(createSchoolYearForm.schoolId),
      );
      setIsCreateSchoolYearOpen(false);
      setSuccessMessage("School year created successfully.");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create school year.",
      );
    } finally {
      setIsCreatingSchoolYear(false);
    }
  }

  async function handleSaveSchoolYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingSchoolYear || !schoolYearForm || !canManageSchools) {
      return;
    }

    setIsSavingSchoolYear(true);
    setError(null);
    setSuccessMessage(null);

    try {
      validateSchoolYearForm({
        schoolId: editingSchoolYear.schoolId,
        name: schoolYearForm.name,
        startDate: schoolYearForm.startDate,
        endDate: schoolYearForm.endDate,
      });

      await updateSchoolYear(editingSchoolYear.id, {
        name: schoolYearForm.name.trim(),
        startDate: schoolYearForm.startDate,
        endDate: schoolYearForm.endDate,
      });

      const updatedSchoolYears = await refreshSchoolYears(selectedSchoolId);
      syncEditingSchoolYearState(updatedSchoolYears);

      setSuccessMessage("School year updated successfully.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update school year.",
      );
    } finally {
      setIsSavingSchoolYear(false);
    }
  }

  async function handleConfirmAction() {
    if (!actionTarget || !canManageSchools) {
      return;
    }

    setIsRunningAction(true);
    setActionError(null);
    setError(null);
    setSuccessMessage(null);

    try {
      if (actionTarget.kind === "school") {
        if (actionTarget.action === "archive") {
          await archiveSchool(actionTarget.id);
        } else if (actionTarget.action === "activate") {
          await activateSchool(actionTarget.id);
        } else {
          const result = await deleteSchool(actionTarget.id);
          const updatedSchools = await refreshSchools();
          const nextSchoolId =
            updatedSchools.find((school) => school.id === selectedSchoolId)
              ?.id ??
            updatedSchools[0]?.id ??
            "";

          syncEditingSchoolState(updatedSchools);
          const updatedSchoolYears = await refreshSchoolYears(nextSchoolId);
          syncEditingSchoolYearState(updatedSchoolYears);
          setSuccessMessage(
            result.removalMode === "deleted"
              ? "School deleted permanently."
              : "School removed from active admin workflows.",
          );
          setActionTarget(null);
          return;
        }

        const updatedSchools = await refreshSchools();
        const nextSchoolId =
          updatedSchools.find((school) => school.id === selectedSchoolId)?.id ??
          updatedSchools[0]?.id ??
          "";

        syncEditingSchoolState(updatedSchools);
        const updatedSchoolYears = await refreshSchoolYears(nextSchoolId);
        syncEditingSchoolYearState(updatedSchoolYears);
        setSuccessMessage(
          actionTarget.action === "archive"
            ? "School archived successfully."
            : "School unarchived successfully.",
        );
      } else {
        if (actionTarget.action === "archive") {
          await archiveSchoolYear(actionTarget.id);
        } else if (actionTarget.action === "activate") {
          await activateSchoolYear(actionTarget.id);
        } else {
          const result = await deleteSchoolYear(actionTarget.id);
          const updatedSchoolYears = await refreshSchoolYears(selectedSchoolId);
          syncEditingSchoolYearState(updatedSchoolYears);
          setSuccessMessage(
            result.removalMode === "deleted"
              ? "School year deleted permanently."
              : "School year removed from active admin workflows.",
          );
          setActionTarget(null);
          return;
        }

        const updatedSchoolYears = await refreshSchoolYears(selectedSchoolId);
        syncEditingSchoolYearState(updatedSchoolYears);
        setSuccessMessage(
          actionTarget.action === "archive"
            ? "School year archived successfully."
            : "School year unarchived successfully.",
        );
      }

      setActionTarget(null);
    } catch (nextActionError) {
      setActionError(
        nextActionError instanceof Error
          ? nextActionError.message
          : "Unable to complete the requested action.",
      );
    } finally {
      setIsRunningAction(false);
    }
  }

  if (!canViewSchools) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Schools"
          description="School access is limited to owner, super admin, and admin roles."
        />
        <EmptyState
          description="Your current role can work within assigned schools, but it cannot access school records in this area."
          title="School management is not available"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schools"
        description="Review school records, manage school-year setup, and prefer archiving over deletion for normal lifecycle changes."
        meta={
          <>
            <Badge variant="neutral">
              {showArchived
                ? `${schools.length} visible schools`
                : `${schools.length} active schools`}
            </Badge>
            <Badge variant="neutral">{activeSchoolsCount} active</Badge>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}
      {!canManageSchools ? (
        <Notice tone="info">
          Your role is read-only on this page. Contact an owner or super admin
          to make school, school year, or grade-level changes.
        </Notice>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        {canManageSchools && editingSchool && schoolForm ? (
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Edit School</CardTitle>
                <CardDescription>
                  Updating {editingSchool.name}.
                </CardDescription>
              </div>
              <Button
                onClick={() => {
                  setEditingSchool(null);
                  setSchoolForm(null);
                }}
                type="button"
                variant="secondary"
              >
                Close
              </Button>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={handleSaveSchool}
              >
                <Field htmlFor="edit-school-name" label="School name">
                  <Input
                    id="edit-school-name"
                    onChange={(event) =>
                      setSchoolForm((current) =>
                        current
                          ? {
                              ...current,
                              name: event.target.value,
                            }
                          : current,
                      )
                    }
                    required
                    value={schoolForm.name}
                  />
                </Field>

                <Field htmlFor="edit-school-short-name" label="Short name">
                  <Input
                    id="edit-school-short-name"
                    onChange={(event) =>
                      setSchoolForm((current) =>
                        current
                          ? {
                              ...current,
                              shortName: event.target.value,
                            }
                          : current,
                      )
                    }
                    placeholder="Optional"
                    value={schoolForm.shortName}
                  />
                </Field>

                <div className="md:col-span-2 flex justify-end">
                  <Button disabled={isSavingSchool} type="submit">
                    {isSavingSchool ? "Saving..." : "Save school"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Edit School</CardTitle>
              <CardDescription>
                Select a school from the directory to rename it or update its
                short name.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyState
                compact
                description="Choose a school from the list below when you need to edit its details."
                title="No school selected"
              />
            </CardContent>
          </Card>
        )}

        {canManageSchools && editingSchoolYear && schoolYearForm ? (
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Edit School Year</CardTitle>
                <CardDescription>
                  Updating {editingSchoolYear.name}.
                </CardDescription>
              </div>
              <Button
                onClick={() => {
                  setEditingSchoolYear(null);
                  setSchoolYearForm(null);
                }}
                type="button"
                variant="secondary"
              >
                Close
              </Button>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={handleSaveSchoolYear}
              >
                <Field htmlFor="edit-school-year-name" label="School year name">
                  <Input
                    id="edit-school-year-name"
                    onChange={(event) =>
                      setSchoolYearForm((current) =>
                        current
                          ? {
                              ...current,
                              name: event.target.value,
                            }
                          : current,
                      )
                    }
                    required
                    value={schoolYearForm.name}
                  />
                </Field>

                <div />

                <Field htmlFor="edit-school-year-start-date" label="Start date">
                  <Input
                    id="edit-school-year-start-date"
                    onChange={(event) =>
                      setSchoolYearForm((current) =>
                        current
                          ? {
                              ...current,
                              startDate: event.target.value,
                            }
                          : current,
                      )
                    }
                    required
                    type="date"
                    value={schoolYearForm.startDate}
                  />
                </Field>

                <Field htmlFor="edit-school-year-end-date" label="End date">
                  <Input
                    id="edit-school-year-end-date"
                    onChange={(event) =>
                      setSchoolYearForm((current) =>
                        current
                          ? {
                              ...current,
                              endDate: event.target.value,
                            }
                          : current,
                      )
                    }
                    required
                    type="date"
                    value={schoolYearForm.endDate}
                  />
                </Field>

                <div className="md:col-span-2 flex justify-end">
                  <Button disabled={isSavingSchoolYear} type="submit">
                    {isSavingSchoolYear ? "Saving..." : "Save school year"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Edit School Year</CardTitle>
              <CardDescription>
                Select a school year from the table to update its name or date
                range.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyState
                compact
                description="Choose a school year from the list below when you need to edit it."
                title="No school year selected"
              />
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>School Directory</CardTitle>
            <CardDescription>
              Active schools are shown by default. Removed schools are archived
              safely when related records still exist.
            </CardDescription>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
            <CheckboxField
              checked={showArchived}
              className="rounded-xl border border-slate-200 px-3 py-2 sm:max-w-xs"
              description="Include archived schools and school years in these tables."
              label="Show removed records"
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            {canCreateSchools ? (
              <Button
                onClick={() => {
                  setIsCreateSchoolOpen((current) => !current);
                  setCreateSchoolForm(buildCreateSchoolForm());
                  setError(null);
                  setSuccessMessage(null);
                }}
                type="button"
                variant={isCreateSchoolOpen ? "secondary" : "primary"}
              >
                {isCreateSchoolOpen ? "Close" : "Create School"}
              </Button>
            ) : null}

            <div className="w-full max-w-sm">
              <Field
                htmlFor="school-years-filter-school"
                label="School year context"
              >
                <Select
                  id="school-years-filter-school"
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
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isCreateSchoolOpen ? (
            <form
              className="mb-6 grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2"
              onSubmit={handleCreateSchool}
            >
              <Field htmlFor="create-school-name" label="School name">
                <Input
                  id="create-school-name"
                  onChange={(event) =>
                    setCreateSchoolForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                  value={createSchoolForm.name}
                />
              </Field>

              <Field htmlFor="create-school-short-name" label="Short name">
                <Input
                  id="create-school-short-name"
                  onChange={(event) =>
                    setCreateSchoolForm((current) => ({
                      ...current,
                      shortName: event.target.value,
                    }))
                  }
                  placeholder="Optional"
                  value={createSchoolForm.shortName}
                />
              </Field>

              <div className="md:col-span-2 flex justify-end">
                <Button disabled={isCreatingSchool} type="submit">
                  {isCreatingSchool ? "Creating..." : "Create school"}
                </Button>
              </div>
            </form>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      School
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Short name
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Status
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {schools.map((school) => (
                    <tr className="align-top hover:bg-slate-50" key={school.id}>
                      <td className="px-4 py-4 font-medium text-slate-900">
                        {school.name}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {school.shortName ?? "Not set"}
                      </td>
                      <td className="px-4 py-4">
                        <Badge
                          variant={school.isActive ? "success" : "neutral"}
                        >
                          {school.isActive ? "Active" : "Archived"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        {canManageSchools ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              disabled={isSavingSchool || isRunningAction}
                              onClick={() => handleStartEditSchool(school)}
                              type="button"
                              variant="secondary"
                            >
                              Edit
                            </Button>
                            <Button
                              disabled={isSavingSchool || isRunningAction}
                              onClick={() => {
                                setActionTarget({
                                  id: school.id,
                                  kind: "school",
                                  action: school.isActive
                                    ? "archive"
                                    : "activate",
                                  label: school.name,
                                });
                                setActionError(null);
                                setError(null);
                                setSuccessMessage(null);
                              }}
                              type="button"
                              variant={school.isActive ? "danger" : "primary"}
                            >
                              {school.isActive ? "Archive" : "Unarchive"}
                            </Button>
                            <Button
                              disabled={isSavingSchool || isRunningAction}
                              onClick={() => {
                                setActionTarget({
                                  id: school.id,
                                  kind: "school",
                                  action: "delete",
                                  label: school.name,
                                });
                                setActionError(null);
                                setError(null);
                                setSuccessMessage(null);
                              }}
                              type="button"
                              variant="danger"
                            >
                              Remove
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">
                            Read-only
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!isLoading && schools.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8" colSpan={4}>
                        <EmptyState
                          compact
                          description="No schools are available in this environment."
                          title="No schools found"
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

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>School Years</CardTitle>
            <CardDescription>
              Active school years are shown by default. Removed school years are
              archived safely when linked academic records still exist.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <Badge variant="neutral">
              {isLoadingYears
                ? "Loading school years..."
                : `${schoolYears.length} records`}
            </Badge>
            {canManageSchools ? (
              <Button
                disabled={!selectedSchoolId}
                onClick={() => {
                  setIsCreateSchoolYearOpen((current) => !current);
                  setCreateSchoolYearForm(
                    buildCreateSchoolYearForm(selectedSchoolId),
                  );
                  setError(null);
                  setSuccessMessage(null);
                }}
                type="button"
                variant={isCreateSchoolYearOpen ? "secondary" : "primary"}
              >
                {isCreateSchoolYearOpen ? "Close" : "Create School Year"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {isCreateSchoolYearOpen ? (
            <form
              className="mb-6 grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2"
              onSubmit={handleCreateSchoolYear}
            >
              <Field htmlFor="create-school-year-school" label="School">
                <Input
                  disabled
                  id="create-school-year-school"
                  value={selectedSchool?.name ?? "Select a school above"}
                />
              </Field>

              <div />

              <Field htmlFor="create-school-year-name" label="School year name">
                <Input
                  id="create-school-year-name"
                  onChange={(event) =>
                    setCreateSchoolYearForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                  value={createSchoolYearForm.name}
                />
              </Field>

              <div />

              <Field htmlFor="create-school-year-start-date" label="Start date">
                <Input
                  id="create-school-year-start-date"
                  onChange={(event) =>
                    setCreateSchoolYearForm((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                  required
                  type="date"
                  value={createSchoolYearForm.startDate}
                />
              </Field>

              <Field htmlFor="create-school-year-end-date" label="End date">
                <Input
                  id="create-school-year-end-date"
                  onChange={(event) =>
                    setCreateSchoolYearForm((current) => ({
                      ...current,
                      endDate: event.target.value,
                    }))
                  }
                  required
                  type="date"
                  value={createSchoolYearForm.endDate}
                />
              </Field>

              <div className="md:col-span-2 flex justify-end">
                <Button
                  disabled={isCreatingSchoolYear || !selectedSchoolId}
                  type="submit"
                >
                  {isCreatingSchoolYear ? "Creating..." : "Create school year"}
                </Button>
              </div>
            </form>
          ) : null}

          {selectedSchoolId ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Name
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Dates
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Status
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {schoolYears.map((schoolYear) => (
                      <tr
                        className="align-top hover:bg-slate-50"
                        key={schoolYear.id}
                      >
                        <td className="px-4 py-4 font-medium text-slate-900">
                          {schoolYear.name}
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {formatSchoolYearDateRange(schoolYear)}
                        </td>
                        <td className="px-4 py-4">
                          <Badge
                            variant={
                              schoolYear.isActive ? "success" : "neutral"
                            }
                          >
                            {schoolYear.isActive ? "Active" : "Archived"}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          {canManageSchools ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                disabled={isSavingSchoolYear || isRunningAction}
                                onClick={() =>
                                  handleStartEditSchoolYear(schoolYear)
                                }
                                type="button"
                                variant="secondary"
                              >
                                Edit
                              </Button>
                              <Button
                                disabled={isSavingSchoolYear || isRunningAction}
                                onClick={() => {
                                  setActionTarget({
                                    id: schoolYear.id,
                                    kind: "schoolYear",
                                    action: schoolYear.isActive
                                      ? "archive"
                                      : "activate",
                                    label: schoolYear.name,
                                  });
                                  setActionError(null);
                                  setError(null);
                                  setSuccessMessage(null);
                                }}
                                type="button"
                                variant={
                                  schoolYear.isActive ? "danger" : "primary"
                                }
                              >
                                {schoolYear.isActive ? "Archive" : "Unarchive"}
                              </Button>
                              <Button
                                disabled={isSavingSchoolYear || isRunningAction}
                                onClick={() => {
                                  setActionTarget({
                                    id: schoolYear.id,
                                    kind: "schoolYear",
                                    action: "delete",
                                    label: schoolYear.name,
                                  });
                                  setActionError(null);
                                  setError(null);
                                  setSuccessMessage(null);
                                }}
                                type="button"
                                variant="danger"
                              >
                                Remove
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">
                              Read-only
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!isLoadingYears && schoolYears.length === 0 ? (
                      <tr>
                        <td className="px-4 py-8" colSpan={4}>
                          <EmptyState
                            compact
                            description="This school does not have any school years yet."
                            title="No school years found"
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
              description="Select a school above to review and manage school years."
              title="No school selected"
            />
          )}
        </CardContent>
      </Card>

      <GradeLevelsManagement
        canManage={canManageSchools}
        selectedSchoolId={selectedSchoolId}
        selectedSchoolName={selectedSchool?.name ?? null}
      />

      <ConfirmDialog
        confirmLabel={getActionConfirmLabel(actionTarget)}
        confirmVariant={getActionConfirmVariant(actionTarget)}
        description={getActionDescription(actionTarget)}
        errorMessage={actionError}
        isOpen={actionTarget !== null}
        isPending={isRunningAction}
        key={
          actionTarget
            ? `${actionTarget.kind}:${actionTarget.action}:${actionTarget.id}`
            : "closed"
        }
        onCancel={() => {
          if (!isRunningAction) {
            setActionTarget(null);
            setActionError(null);
          }
        }}
        onConfirm={handleConfirmAction}
        pendingLabel={getActionPendingLabel(actionTarget)}
        title={getActionTitle(actionTarget)}
      />
    </div>
  );
}
