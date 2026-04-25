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
  archiveBillingCategory,
  createBillingCategory,
  listBillingCategories,
  updateBillingCategory,
  type BillingCategory,
} from "@/lib/api/billing";
import { listSchools, type School } from "@/lib/api/schools";

const readRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);
const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);

type CategoryFormState = {
  schoolId: string;
  name: string;
  description: string;
};

function buildForm(defaultSchoolId = ""): CategoryFormState {
  return {
    schoolId: defaultSchoolId,
    name: "",
    description: "",
  };
}

export function BillingCategoriesManagement() {
  const { session } = useAuth();
  const role = session?.user.role;
  const canManage = role ? manageRoles.has(role) : false;

  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [categories, setCategories] = useState<BillingCategory[]>([]);

  const [createForm, setCreateForm] = useState<CategoryFormState>(buildForm());
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [editForm, setEditForm] = useState<CategoryFormState>(buildForm());

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

  const editingCategory = useMemo(
    () => categories.find((entry) => entry.id === editingCategoryId) ?? null,
    [categories, editingCategoryId],
  );

  async function refreshCategories() {
    const response = await listBillingCategories({
      schoolId: selectedSchoolId || undefined,
      includeInactive,
    });
    setCategories(response);
    return response;
  }

  useEffect(() => {
    async function load() {
      if (!role || !readRoles.has(role)) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const schoolResponse = await listSchools({ includeInactive: false });
        setSchools(schoolResponse);

        const defaultSchoolId = schoolResponse[0]?.id ?? "";
        setCreateForm((current) => ({
          ...current,
          schoolId: current.schoolId || defaultSchoolId,
        }));

        const categoryResponse = await listBillingCategories({
          includeInactive: true,
        });
        setCategories(categoryResponse);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load billing categories.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [role]);

  useEffect(() => {
    async function loadCategories() {
      if (!role || !readRoles.has(role)) {
        return;
      }

      try {
        const response = await listBillingCategories({
          schoolId: selectedSchoolId || undefined,
          includeInactive,
        });
        setCategories(response);

        if (
          editingCategoryId &&
          !response.some((entry) => entry.id === editingCategoryId)
        ) {
          setEditingCategoryId(null);
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load billing categories.",
        );
        setCategories([]);
      }
    }

    if (isLoading) {
      return;
    }

    void loadCategories();
  }, [editingCategoryId, includeInactive, isLoading, role, selectedSchoolId]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const name = createForm.name.trim();
      if (!createForm.schoolId) {
        throw new Error("School is required.");
      }
      if (!name) {
        throw new Error("Category name is required.");
      }

      await createBillingCategory({
        schoolId: createForm.schoolId,
        name,
        description: createForm.description.trim() || null,
      });

      await refreshCategories();
      setCreateForm(buildForm(createForm.schoolId));
      setSuccessMessage("Billing category created.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to create billing category.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || !editingCategoryId) {
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

      await updateBillingCategory(editingCategoryId, {
        name,
        description: editForm.description.trim() || null,
      });

      const updated = await refreshCategories();
      const next =
        updated.find((entry) => entry.id === editingCategoryId) ?? null;
      setEditingCategoryId(next?.id ?? null);
      setEditForm(
        next
          ? {
              schoolId: next.schoolId,
              name: next.name,
              description: next.description ?? "",
            }
          : buildForm(createForm.schoolId),
      );
      setSuccessMessage("Billing category updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update billing category.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive(category: BillingCategory) {
    if (!canManage) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await archiveBillingCategory(category.id);
      await refreshCategories();
      if (editingCategoryId === category.id) {
        setEditingCategoryId(null);
      }
      setSuccessMessage("Billing category archived.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to archive billing category.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function startEditing(category: BillingCategory) {
    setEditingCategoryId(category.id);
    setEditForm({
      schoolId: category.schoolId,
      name: category.name,
      description: category.description ?? "",
    });
  }

  if (!role || !readRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, ADMIN, and STAFF can access billing categories."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">
            Loading billing categories...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing Categories"
        description="Manage non-tuition billing categories used when creating charges."
        meta={<Badge variant="neutral">{categories.length} categories</Badge>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter category list by school and status.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field htmlFor="billing-categories-school" label="School">
            <Select
              id="billing-categories-school"
              onChange={(event) => setSelectedSchoolId(event.target.value)}
              value={selectedSchoolId}
            >
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            htmlFor="billing-categories-include-inactive"
            label="Status scope"
          >
            <Select
              id="billing-categories-include-inactive"
              onChange={(event) =>
                setIncludeInactive(event.target.value === "all")
              }
              value={includeInactive ? "all" : "active"}
            >
              <option value="all">Active + inactive</option>
              <option value="active">Active only</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Create category</CardTitle>
            <CardDescription>
              Add a new billing category for a school.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-4" onSubmit={handleCreate}>
              <Field htmlFor="create-billing-category-school" label="School">
                <Select
                  id="create-billing-category-school"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      schoolId: event.target.value,
                    }))
                  }
                  value={createForm.schoolId}
                >
                  <option value="">Select school</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field htmlFor="create-billing-category-name" label="Name">
                <Input
                  id="create-billing-category-name"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Field Trip"
                  value={createForm.name}
                />
              </Field>

              <Field
                htmlFor="create-billing-category-description"
                label="Description (optional)"
              >
                <Input
                  id="create-billing-category-description"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Optional category description"
                  value={createForm.description}
                />
              </Field>

              <div className="flex items-end">
                <Button disabled={isSaving} type="submit" className="w-full">
                  {isSaving ? "Creating..." : "Create category"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {canManage && editingCategory ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit category</CardTitle>
            <CardDescription>
              Update name or description for {editingCategory.name}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-3"
              onSubmit={handleSaveEdit}
            >
              <Field htmlFor="edit-billing-category-name" label="Name">
                <Input
                  id="edit-billing-category-name"
                  onChange={(event) =>
                    setEditForm((current) =>
                      current
                        ? { ...current, name: event.target.value }
                        : current,
                    )
                  }
                  value={editForm.name}
                />
              </Field>

              <Field
                htmlFor="edit-billing-category-description"
                label="Description (optional)"
              >
                <Input
                  id="edit-billing-category-description"
                  onChange={(event) =>
                    setEditForm((current) =>
                      current
                        ? { ...current, description: event.target.value }
                        : current,
                    )
                  }
                  value={editForm.description}
                />
              </Field>

              <div className="flex items-end gap-2">
                <Button disabled={isSaving} type="submit">
                  {isSaving ? "Saving..." : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditingCategoryId(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Billing category list and status.</CardDescription>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <EmptyState
              compact
              title="No categories found"
              description="Create a category to start organizing charges."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Name
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Description
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        School
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Status
                      </th>
                      {canManage ? (
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Actions
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {categories.map((category) => (
                      <tr
                        key={category.id}
                        className="align-top hover:bg-slate-50"
                      >
                        <td className="px-4 py-4 font-medium text-slate-900">
                          {category.name}
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {category.description?.trim() || "—"}
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          {schoolsById.get(category.schoolId)?.name ||
                            category.schoolId}
                        </td>
                        <td className="px-4 py-4">
                          <Badge
                            variant={category.isActive ? "success" : "neutral"}
                          >
                            {category.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        {canManage ? (
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                type="button"
                                variant="secondary"
                                onClick={() => startEditing(category)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                type="button"
                                variant="ghost"
                                disabled={isSaving || !category.isActive}
                                onClick={() => handleArchive(category)}
                              >
                                Archive
                              </Button>
                            </div>
                          </td>
                        ) : null}
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
  );
}
