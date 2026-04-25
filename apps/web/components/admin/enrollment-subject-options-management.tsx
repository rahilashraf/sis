"use client";

import { useEffect, useState, type FormEvent } from "react";
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
  activateEnrollmentSubjectOption,
  createEnrollmentSubjectOption,
  deactivateEnrollmentSubjectOption,
  listEnrollmentSubjectOptions,
  updateEnrollmentSubjectOption,
  type EnrollmentSubjectOption,
} from "@/lib/api/enrollment-history";

type SubjectOptionFormState = {
  name: string;
  sortOrder: string;
};

const allowedRoles = new Set(["OWNER", "SUPER_ADMIN"]);

function buildCreateForm(): SubjectOptionFormState {
  return {
    name: "",
    sortOrder: "0",
  };
}

function buildEditForm(
  option: EnrollmentSubjectOption,
): SubjectOptionFormState {
  return {
    name: option.name,
    sortOrder: String(option.sortOrder),
  };
}

function parseSortOrder(value: string) {
  if (!/^-?\d+$/.test(value.trim())) {
    throw new Error("Sort order must be a whole number.");
  }

  return Number(value);
}

export function EnrollmentSubjectOptionsManagement() {
  const { session } = useAuth();
  const role = session?.user.role;
  const [options, setOptions] = useState<EnrollmentSubjectOption[]>([]);
  const [createForm, setCreateForm] =
    useState<SubjectOptionFormState>(buildCreateForm());
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SubjectOptionFormState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function refreshOptions() {
    const response = await listEnrollmentSubjectOptions({
      includeInactive: true,
    });
    setOptions(response);
    return response;
  }

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        await refreshOptions();
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load subject options.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    if (!role || !allowedRoles.has(role)) {
      setIsLoading(false);
      return;
    }

    void load();
  }, [role]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const name = createForm.name.trim();
      if (!name) {
        throw new Error("Subject name is required.");
      }

      await createEnrollmentSubjectOption({
        name,
        sortOrder: parseSortOrder(createForm.sortOrder),
      });

      await refreshOptions();
      setCreateForm(buildCreateForm());
      setSuccessMessage("Subject option created.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to create subject option.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingOptionId || !editForm) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const name = editForm.name.trim();
      if (!name) {
        throw new Error("Subject name is required.");
      }

      await updateEnrollmentSubjectOption(editingOptionId, {
        name,
        sortOrder: parseSortOrder(editForm.sortOrder),
      });

      const response = await refreshOptions();
      const updated = response.find((entry) => entry.id === editingOptionId);
      setEditingOptionId(updated ? updated.id : null);
      setEditForm(updated ? buildEditForm(updated) : null);
      setSuccessMessage("Subject option updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update subject option.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(option: EnrollmentSubjectOption) {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (option.isActive) {
        await deactivateEnrollmentSubjectOption(option.id);
      } else {
        await activateEnrollmentSubjectOption(option.id);
      }

      await refreshOptions();
      setSuccessMessage(
        option.isActive
          ? "Subject option deactivated."
          : "Subject option activated.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update subject option status.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!role || !allowedRoles.has(role)) {
    return (
      <EmptyState
        title="Not authorized"
        description="Only owners and super admins can manage enrollment subject options."
      />
    );
  }

  const visibleOptions = showInactive
    ? options
    : options.filter((entry) => entry.isActive);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">
            Loading enrollment subject options...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enrollment Subject Options"
        description="Manage the subject checklist used for student enrollment history records."
        meta={<Badge variant="neutral">{options.length} total options</Badge>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Create Subject Option</CardTitle>
          <CardDescription>
            Add a new checkbox option for enrollment history subject tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={handleCreate}>
            <Field htmlFor="create-subject-option-name" label="Subject name">
              <Input
                id="create-subject-option-name"
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Mathematics"
              />
            </Field>

            <Field
              htmlFor="create-subject-option-sort-order"
              label="Sort order"
            >
              <Input
                id="create-subject-option-sort-order"
                inputMode="numeric"
                value={createForm.sortOrder}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    sortOrder: event.target.value,
                  }))
                }
              />
            </Field>

            <div className="flex items-end justify-end">
              <Button disabled={isSaving} type="submit">
                {isSaving ? "Saving..." : "Create option"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subject Options</CardTitle>
          <CardDescription>
            Inactive options are hidden from enrollment-history selection but
            remain in historical records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field htmlFor="show-inactive-options" label="Visibility">
            <Select
              id="show-inactive-options"
              value={showInactive ? "all" : "active"}
              onChange={(event) =>
                setShowInactive(event.target.value === "all")
              }
            >
              <option value="all">Show active and inactive</option>
              <option value="active">Show active only</option>
            </Select>
          </Field>

          {visibleOptions.length === 0 ? (
            <EmptyState
              compact
              title="No subject options"
              description="Create a subject option to populate enrollment-history subject checklists."
            />
          ) : (
            <div className="space-y-3">
              {visibleOptions.map((option) => {
                const isEditing =
                  editingOptionId === option.id && editForm !== null;

                return (
                  <div
                    className="rounded-xl border border-slate-200 bg-white p-4"
                    key={option.id}
                  >
                    {isEditing ? (
                      <form
                        className="grid gap-3 md:grid-cols-3"
                        onSubmit={handleSaveEdit}
                      >
                        <Field
                          htmlFor={`edit-name-${option.id}`}
                          label="Subject name"
                        >
                          <Input
                            id={`edit-name-${option.id}`}
                            value={editForm.name}
                            onChange={(event) =>
                              setEditForm((current) =>
                                current
                                  ? {
                                      ...current,
                                      name: event.target.value,
                                    }
                                  : current,
                              )
                            }
                          />
                        </Field>

                        <Field
                          htmlFor={`edit-sort-order-${option.id}`}
                          label="Sort order"
                        >
                          <Input
                            id={`edit-sort-order-${option.id}`}
                            inputMode="numeric"
                            value={editForm.sortOrder}
                            onChange={(event) =>
                              setEditForm((current) =>
                                current
                                  ? {
                                      ...current,
                                      sortOrder: event.target.value,
                                    }
                                  : current,
                              )
                            }
                          />
                        </Field>

                        <div className="flex items-end justify-end gap-2">
                          <Button disabled={isSaving} type="submit">
                            {isSaving ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            disabled={isSaving}
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setEditingOptionId(null);
                              setEditForm(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {option.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Sort order: {option.sortOrder}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={option.isActive ? "success" : "neutral"}
                          >
                            {option.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Button
                            disabled={isSaving}
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setEditingOptionId(option.id);
                              setEditForm(buildEditForm(option));
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            disabled={isSaving}
                            type="button"
                            variant={option.isActive ? "ghost" : "primary"}
                            onClick={() => {
                              void handleToggleActive(option);
                            }}
                          >
                            {option.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
