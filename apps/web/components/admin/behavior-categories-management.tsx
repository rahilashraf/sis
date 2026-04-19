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
import { listSchools, type School } from "@/lib/api/schools";
import {
  activateBehaviorCategory,
  createBehaviorCategory,
  deactivateBehaviorCategory,
  listBehaviorCategories,
  updateBehaviorCategory,
  type BehaviorCategoryOption,
} from "@/lib/api/behavior";

type CategoryFormState = {
  name: string;
  sortOrder: string;
  schoolId: string;
};

const allowedRoles = new Set(["OWNER", "SUPER_ADMIN"]);

function buildCreateForm(defaultSchoolId = "GLOBAL"): CategoryFormState {
  return {
    name: "",
    sortOrder: "0",
    schoolId: defaultSchoolId,
  };
}

function buildEditForm(category: BehaviorCategoryOption): CategoryFormState {
  return {
    name: category.name,
    sortOrder: String(category.sortOrder),
    schoolId: category.schoolId ?? "GLOBAL",
  };
}

function parseSortOrder(value: string) {
  if (!/^-?\d+$/.test(value.trim())) {
    throw new Error("Sort order must be a whole number.");
  }

  return Number(value);
}

export function BehaviorCategoriesManagement() {
  const { session } = useAuth();
  const role = session?.user.role;
  const [schools, setSchools] = useState<School[]>([]);
  const [categories, setCategories] = useState<BehaviorCategoryOption[]>([]);
  const [createForm, setCreateForm] = useState<CategoryFormState>(buildCreateForm());
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CategoryFormState | null>(null);
  const [includeInactive, setIncludeInactive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const schoolsById = useMemo(() => {
    const map = new Map<string, School>();
    for (const school of schools) {
      map.set(school.id, school);
    }
    return map;
  }, [schools]);

  async function refreshCategories() {
    const response = await listBehaviorCategories({ includeInactive: true });
    setCategories(response);
    return response;
  }

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const [schoolResponse, categoryResponse] = await Promise.all([
          listSchools({ includeInactive: false }),
          listBehaviorCategories({ includeInactive: true }),
        ]);
        setSchools(schoolResponse);
        setCategories(categoryResponse);
        setCreateForm((current) =>
          current.schoolId
            ? current
            : buildCreateForm(schoolResponse[0]?.id ?? "GLOBAL"),
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load incident categories.");
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
        throw new Error("Category name is required.");
      }

      await createBehaviorCategory({
        name,
        sortOrder: parseSortOrder(createForm.sortOrder),
        schoolId: createForm.schoolId === "GLOBAL" ? null : createForm.schoolId,
      });

      await refreshCategories();
      setCreateForm(buildCreateForm(createForm.schoolId));
      setSuccessMessage("Incident category created.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create category.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCategoryId || !editForm) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const name = editForm.name.trim();
      if (!name) {
        throw new Error("Category name is required.");
      }

      await updateBehaviorCategory(editingCategoryId, {
        name,
        sortOrder: parseSortOrder(editForm.sortOrder),
        schoolId: editForm.schoolId === "GLOBAL" ? null : editForm.schoolId,
      });

      const response = await refreshCategories();
      const updated = response.find((entry) => entry.id === editingCategoryId);
      setEditingCategoryId(updated ? updated.id : null);
      setEditForm(updated ? buildEditForm(updated) : null);
      setSuccessMessage("Incident category updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update category.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(category: BehaviorCategoryOption) {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (category.isActive) {
        await deactivateBehaviorCategory(category.id);
      } else {
        await activateBehaviorCategory(category.id);
      }
      await refreshCategories();
      setSuccessMessage(category.isActive ? "Category deactivated." : "Category activated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update category status.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!role || !allowedRoles.has(role)) {
    return (
      <EmptyState
        title="Not authorized"
        description="Only owners and super admins can manage incident categories."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading incident categories...</p>
        </CardContent>
      </Card>
    );
  }

  const visibleCategories = includeInactive
    ? categories
    : categories.filter((entry) => entry.isActive);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incident Categories"
        description="Manage category options used when staff file incident reports."
        meta={<Badge variant="neutral">{categories.length} categories</Badge>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Create Incident Category</CardTitle>
          <CardDescription>
            Add a global or school-specific category for incident reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-4" onSubmit={handleCreate}>
            <Field htmlFor="create-behavior-category-name" label="Incident category name">
              <Input
                id="create-behavior-category-name"
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Disruption"
              />
            </Field>

            <Field htmlFor="create-behavior-category-sort-order" label="Sort order">
              <Input
                id="create-behavior-category-sort-order"
                inputMode="numeric"
                value={createForm.sortOrder}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, sortOrder: event.target.value }))
                }
              />
            </Field>

            <Field htmlFor="create-behavior-category-school" label="Scope">
              <Select
                id="create-behavior-category-school"
                value={createForm.schoolId}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, schoolId: event.target.value }))
                }
              >
                <option value="GLOBAL">Global</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex items-end justify-end">
              <Button disabled={isSaving} type="submit">
                {isSaving ? "Saving..." : "Create incident category"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Incident Category List</CardTitle>
          <CardDescription>
            Inactive categories stay on historical incident reports but are hidden from normal selection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field htmlFor="behavior-categories-visibility" label="Visibility">
            <Select
              id="behavior-categories-visibility"
              value={includeInactive ? "all" : "active"}
              onChange={(event) => setIncludeInactive(event.target.value === "all")}
            >
              <option value="all">Show active and inactive</option>
              <option value="active">Show active only</option>
            </Select>
          </Field>

          {visibleCategories.length === 0 ? (
            <EmptyState
              compact
              title="No categories"
              description="Create incident categories to support incident report workflows."
            />
          ) : (
            <div className="space-y-3">
              {visibleCategories.map((category) => {
                const isEditing = editingCategoryId === category.id && editForm !== null;

                return (
                  <div
                    className="rounded-xl border border-slate-200 bg-white p-4"
                    key={category.id}
                  >
                    {isEditing ? (
                      <form className="grid gap-3 md:grid-cols-4" onSubmit={handleSaveEdit}>
                        <Field htmlFor={`edit-category-name-${category.id}`} label="Name">
                          <Input
                            id={`edit-category-name-${category.id}`}
                            value={editForm.name}
                            onChange={(event) =>
                              setEditForm((current) =>
                                current ? { ...current, name: event.target.value } : current,
                              )
                            }
                          />
                        </Field>

                        <Field htmlFor={`edit-category-order-${category.id}`} label="Sort order">
                          <Input
                            id={`edit-category-order-${category.id}`}
                            inputMode="numeric"
                            value={editForm.sortOrder}
                            onChange={(event) =>
                              setEditForm((current) =>
                                current
                                  ? { ...current, sortOrder: event.target.value }
                                  : current,
                              )
                            }
                          />
                        </Field>

                        <Field htmlFor={`edit-category-school-${category.id}`} label="Scope">
                          <Select
                            id={`edit-category-school-${category.id}`}
                            value={editForm.schoolId}
                            onChange={(event) =>
                              setEditForm((current) =>
                                current
                                  ? { ...current, schoolId: event.target.value }
                                  : current,
                              )
                            }
                          >
                            <option value="GLOBAL">Global</option>
                            {schools.map((school) => (
                              <option key={school.id} value={school.id}>
                                {school.name}
                              </option>
                            ))}
                          </Select>
                        </Field>

                        <div className="flex items-end justify-end gap-2">
                          <Button disabled={isSaving} type="submit" variant="secondary">
                            {isSaving ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            disabled={isSaving}
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setEditingCategoryId(null);
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
                          <p className="text-sm font-semibold text-slate-900">{category.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {category.schoolId
                              ? schoolsById.get(category.schoolId)?.name ?? category.schoolId
                              : "Global"}{" "}
                            · Sort {category.sortOrder}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={category.isActive ? "success" : "neutral"}>
                            {category.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Button
                            disabled={isSaving}
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setEditingCategoryId(category.id);
                              setEditForm(buildEditForm(category));
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            disabled={isSaving}
                            type="button"
                            variant={category.isActive ? "ghost" : "primary"}
                            onClick={() => {
                              void handleToggleActive(category);
                            }}
                          >
                            {category.isActive ? "Deactivate" : "Activate"}
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
