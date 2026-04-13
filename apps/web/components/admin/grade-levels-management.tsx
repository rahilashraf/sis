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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  activateGradeLevel,
  archiveGradeLevel,
  createGradeLevel,
  deleteGradeLevel,
  listGradeLevels,
  updateGradeLevel,
  type GradeLevel,
  type GradeLevelRemovalResult,
} from "@/lib/api/grade-levels";

type GradeLevelsManagementProps = {
  selectedSchoolId: string;
  selectedSchoolName: string | null;
};

type GradeLevelFormState = {
  name: string;
  sortOrder: string;
};

type GradeLevelActionTarget = {
  action: "activate" | "archive" | "delete";
  id: string;
  label: string;
  studentCount: number;
};

function buildCreateForm(): GradeLevelFormState {
  return {
    name: "",
    sortOrder: "0",
  };
}

function buildEditForm(gradeLevel: GradeLevel): GradeLevelFormState {
  return {
    name: gradeLevel.name,
    sortOrder: String(gradeLevel.sortOrder),
  };
}

function parseSortOrder(value: string) {
  if (!/^\d+$/.test(value.trim())) {
    throw new Error("Sort order must be a whole number.");
  }

  return Number(value);
}

export function GradeLevelsManagement({
  selectedSchoolId,
  selectedSchoolName,
}: GradeLevelsManagementProps) {
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [createForm, setCreateForm] = useState<GradeLevelFormState>(buildCreateForm());
  const [editingGradeLevel, setEditingGradeLevel] = useState<GradeLevel | null>(null);
  const [editForm, setEditForm] = useState<GradeLevelFormState | null>(null);
  const [actionTarget, setActionTarget] = useState<GradeLevelActionTarget | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningAction, setIsRunningAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadGradeLevels() {
      if (!selectedSchoolId) {
        setGradeLevels([]);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await listGradeLevels(selectedSchoolId, {
          includeInactive: true,
        });
        setGradeLevels(response);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load grade levels.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadGradeLevels();
  }, [selectedSchoolId]);

  async function refreshGradeLevels() {
    if (!selectedSchoolId) {
      setGradeLevels([]);
      return [];
    }

    const response = await listGradeLevels(selectedSchoolId, {
      includeInactive: true,
    });
    setGradeLevels(response);
    return response;
  }

  async function handleCreateGradeLevel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSchoolId) {
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!createForm.name.trim()) {
        throw new Error("Grade level name is required.");
      }

      await createGradeLevel({
        schoolId: selectedSchoolId,
        name: createForm.name.trim(),
        sortOrder: parseSortOrder(createForm.sortOrder),
      });

      await refreshGradeLevels();
      setCreateForm(buildCreateForm());
      setSuccessMessage("Grade level created successfully.");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create grade level.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSaveGradeLevel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingGradeLevel || !editForm) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!editForm.name.trim()) {
        throw new Error("Grade level name is required.");
      }

      await updateGradeLevel(editingGradeLevel.id, {
        name: editForm.name.trim(),
        sortOrder: parseSortOrder(editForm.sortOrder),
      });

      const updatedGradeLevels = await refreshGradeLevels();
      const updatedGradeLevel =
        updatedGradeLevels.find((gradeLevel) => gradeLevel.id === editingGradeLevel.id) ??
        null;

      setEditingGradeLevel(updatedGradeLevel);
      setEditForm(updatedGradeLevel ? buildEditForm(updatedGradeLevel) : null);
      setSuccessMessage("Grade level updated successfully.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update grade level.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmAction() {
    if (!actionTarget) {
      return;
    }

    setIsRunningAction(true);
    setError(null);
    setSuccessMessage(null);

    try {
      let removalResult: GradeLevelRemovalResult | null = null;

      if (actionTarget.action === "archive") {
        await archiveGradeLevel(actionTarget.id);
      } else if (actionTarget.action === "activate") {
        await activateGradeLevel(actionTarget.id);
      } else {
        removalResult = await deleteGradeLevel(actionTarget.id);
      }

      const updatedGradeLevels = await refreshGradeLevels();
      const updatedEditingGradeLevel = editingGradeLevel
        ? updatedGradeLevels.find((gradeLevel) => gradeLevel.id === editingGradeLevel.id) ?? null
        : null;

      setEditingGradeLevel(updatedEditingGradeLevel);
      setEditForm(updatedEditingGradeLevel ? buildEditForm(updatedEditingGradeLevel) : null);
      setActionTarget(null);
      if (actionTarget.action === "delete") {
        setSuccessMessage(
          removalResult?.removalMode === "deleted"
            ? "Grade level deleted permanently."
            : "Grade level is in use and was archived instead.",
        );
      } else {
        setSuccessMessage(
          actionTarget.action === "archive"
            ? "Grade level archived successfully."
            : "Grade level unarchived successfully.",
        );
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update grade level status.",
      );
    } finally {
      setIsRunningAction(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Grade Levels</CardTitle>
            <CardDescription>
              Manage the grade-level dropdown options for{" "}
              {selectedSchoolName ?? "the selected school"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedSchoolId ? (
              <form
                className="grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2"
                onSubmit={handleCreateGradeLevel}
              >
                <Field htmlFor="create-grade-level-name" label="Grade level name">
                  <Input
                    id="create-grade-level-name"
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Grade 1"
                    value={createForm.name}
                  />
                </Field>

                <Field htmlFor="create-grade-level-sort-order" label="Display order">
                  <Input
                    id="create-grade-level-sort-order"
                    inputMode="numeric"
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        sortOrder: event.target.value,
                      }))
                    }
                    value={createForm.sortOrder}
                  />
                </Field>

                <div className="md:col-span-2 flex justify-end">
                  <Button disabled={isCreating} type="submit">
                    {isCreating ? "Creating..." : "Create grade level"}
                  </Button>
                </div>
              </form>
            ) : (
              <EmptyState
                compact
                description="Select a school above before creating grade-level options."
                title="No school selected"
              />
            )}
          </CardContent>
        </Card>

        {editingGradeLevel && editForm ? (
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Edit Grade Level</CardTitle>
                <CardDescription>Updating {editingGradeLevel.name}.</CardDescription>
              </div>
              <Button
                onClick={() => {
                  setEditingGradeLevel(null);
                  setEditForm(null);
                }}
                type="button"
                variant="secondary"
              >
                Close
              </Button>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSaveGradeLevel}>
                <Field htmlFor="edit-grade-level-name" label="Grade level name">
                  <Input
                    id="edit-grade-level-name"
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
                    value={editForm.name}
                  />
                </Field>

                <Field htmlFor="edit-grade-level-sort-order" label="Display order">
                  <Input
                    id="edit-grade-level-sort-order"
                    inputMode="numeric"
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
                    value={editForm.sortOrder}
                  />
                </Field>

                <div className="md:col-span-2 flex justify-end">
                  <Button disabled={isSaving} type="submit">
                    {isSaving ? "Saving..." : "Save grade level"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Grade Level Rules</CardTitle>
              <CardDescription>
                Inactive grade levels stay valid for already-assigned students but are
                hidden from normal student edit dropdowns.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <p>Grade levels are scoped to the selected school.</p>
              <p>Names must be unique within that school.</p>
              <p>Display order follows ascending sort order, then name.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Grade Level Options</CardTitle>
            <CardDescription>
              Review active and archived options in the order shown to administrators.
            </CardDescription>
          </div>
          <Badge variant="neutral">
            {isLoading ? "Loading grade levels..." : `${gradeLevels.length} records`}
          </Badge>
        </CardHeader>
        <CardContent>
          {selectedSchoolId ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">Name</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Order</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Students</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {gradeLevels.map((gradeLevel) => (
                      <tr className="align-top hover:bg-slate-50" key={gradeLevel.id}>
                        <td className="px-4 py-4 font-medium text-slate-900">
                          {gradeLevel.name}
                        </td>
                        <td className="px-4 py-4 text-slate-600">{gradeLevel.sortOrder}</td>
                        <td className="px-4 py-4 text-slate-600">
                          {gradeLevel._count.students}
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant={gradeLevel.isActive ? "success" : "neutral"}>
                            {gradeLevel.isActive ? "Active" : "Archived"}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              disabled={isSaving || isRunningAction}
                              onClick={() => {
                                setEditingGradeLevel(gradeLevel);
                                setEditForm(buildEditForm(gradeLevel));
                                setError(null);
                                setSuccessMessage(null);
                              }}
                              type="button"
                              variant="secondary"
                            >
                              Edit
                            </Button>
                            <Button
                              disabled={isSaving || isRunningAction}
                              onClick={() => {
                                setActionTarget({
                                  id: gradeLevel.id,
                                  action: gradeLevel.isActive ? "archive" : "activate",
                                  label: gradeLevel.name,
                                  studentCount: gradeLevel._count.students,
                                });
                                setError(null);
                                setSuccessMessage(null);
                              }}
                              type="button"
                              variant={gradeLevel.isActive ? "danger" : "primary"}
                            >
                              {gradeLevel.isActive ? "Archive" : "Unarchive"}
                            </Button>
                            <Button
                              disabled={isSaving || isRunningAction}
                              onClick={() => {
                                setActionTarget({
                                  id: gradeLevel.id,
                                  action: "delete",
                                  label: gradeLevel.name,
                                  studentCount: gradeLevel._count.students,
                                });
                                setError(null);
                                setSuccessMessage(null);
                              }}
                              type="button"
                              variant="danger"
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!isLoading && gradeLevels.length === 0 ? (
                      <tr>
                        <td className="px-4 py-8" colSpan={5}>
                          <EmptyState
                            compact
                            description="This school does not have any grade levels yet."
                            title="No grade levels found"
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
              description="Select a school above to review and manage grade levels."
              title="No school selected"
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        confirmLabel={
          actionTarget?.action === "delete"
            ? "Delete grade level"
            : actionTarget?.action === "archive"
              ? "Archive grade level"
              : "Unarchive grade level"
        }
        confirmVariant={
          actionTarget?.action === "delete"
            ? "danger"
            : actionTarget?.action === "archive"
              ? "danger"
              : "primary"
        }
        description={
          actionTarget?.action === "delete"
            ? actionTarget.studentCount > 0
              ? `Delete ${actionTarget.label}? This grade level is currently assigned to ${actionTarget.studentCount} student(s), so it will be archived instead of deleted to preserve student records.`
              : `Delete ${actionTarget.label}? This will permanently remove the grade level because it is not assigned to any students.`
            : actionTarget?.action === "archive"
              ? `Archive ${actionTarget.label}? Existing student assignments are preserved, but the option will be hidden from normal dropdowns.`
              : `Unarchive ${actionTarget?.label}? This will make the option available in student grade-level dropdowns again.`
        }
        errorMessage={error}
        isOpen={actionTarget !== null}
        isPending={isRunningAction}
        onCancel={() => {
          if (!isRunningAction) {
            setActionTarget(null);
          }
        }}
        onConfirm={handleConfirmAction}
        pendingLabel={
          actionTarget?.action === "delete"
            ? "Deleting..."
            : actionTarget?.action === "archive"
              ? "Archiving..."
              : "Unarchiving..."
        }
        title={
          actionTarget?.action === "delete"
            ? "Delete grade level"
            : actionTarget?.action === "archive"
              ? "Archive grade level"
              : "Unarchive grade level"
        }
      />
    </div>
  );
}
