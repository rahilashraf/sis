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
  activateAssessmentType,
  archiveAssessmentType,
  createAssessmentType,
  listAssessmentTypes,
  updateAssessmentType,
  type AssessmentType,
} from "@/lib/api/assessments";

const allowedRoles = new Set(["OWNER", "SUPER_ADMIN"]);

type TypeFormState = {
  name: string;
  sortOrder: string;
  scope: "school" | "global";
};

function buildCreateForm(): TypeFormState {
  return { name: "", sortOrder: "0", scope: "school" };
}

function buildEditForm(type: AssessmentType): TypeFormState {
  return {
    name: type.name,
    sortOrder: String(type.sortOrder),
    scope: type.schoolId ? "school" : "global",
  };
}

function parseIntField(value: string, label: string) {
  if (!/^-?\d+$/.test(value.trim())) {
    throw new Error(`${label} must be a whole number.`);
  }
  return Number(value);
}

export function AssessmentTypesManagement() {
  const { session } = useAuth();
  const role = session?.user.role;
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [types, setTypes] = useState<AssessmentType[]>([]);
  const [createForm, setCreateForm] = useState<TypeFormState>(buildCreateForm());
  const [editingType, setEditingType] = useState<AssessmentType | null>(null);
  const [editForm, setEditForm] = useState<TypeFormState | null>(null);
  const [includeInactive, setIncludeInactive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId],
  );

  useEffect(() => {
    async function loadSchools() {
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
  }, []);

  useEffect(() => {
    async function loadTypes() {
      if (!selectedSchoolId) {
        setTypes([]);
        return;
      }

      setError(null);

      try {
        const response = await listAssessmentTypes({
          schoolId: selectedSchoolId,
          includeInactive,
        });
        setTypes(response);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load assessment types.");
        setTypes([]);
      }
    }

    void loadTypes();
  }, [includeInactive, selectedSchoolId]);

  async function refreshTypes() {
    if (!selectedSchoolId) {
      setTypes([]);
      return [];
    }

    const response = await listAssessmentTypes({
      schoolId: selectedSchoolId,
      includeInactive,
    });
    setTypes(response);
    return response;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSchoolId) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!createForm.name.trim()) {
        throw new Error("Name is required.");
      }

      await createAssessmentType({
        schoolId: createForm.scope === "global" ? null : selectedSchoolId,
        name: createForm.name.trim(),
        sortOrder: parseIntField(createForm.sortOrder, "Sort order"),
      });

      await refreshTypes();
      setCreateForm(buildCreateForm());
      setSuccessMessage("Assessment type created.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create assessment type.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingType || !editForm) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!editForm.name.trim()) {
        throw new Error("Name is required.");
      }

      await updateAssessmentType(editingType.id, {
        name: editForm.name.trim(),
        sortOrder: parseIntField(editForm.sortOrder, "Sort order"),
      });

      const next = await refreshTypes();
      setEditingType(next.find((entry) => entry.id === editingType.id) ?? null);
      setEditForm(editingType ? buildEditForm(editingType) : null);
      setSuccessMessage("Assessment type updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update assessment type.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(type: AssessmentType) {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (type.isActive) {
        await archiveAssessmentType(type.id);
      } else {
        await activateAssessmentType(type.id);
      }

      await refreshTypes();
      setSuccessMessage(type.isActive ? "Assessment type archived." : "Assessment type activated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update assessment type.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!role || !allowedRoles.has(role)) {
    return (
      <EmptyState
        title="Not authorized"
        description="Only owners and super admins can manage assessment types."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading assessment types...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessment Types"
        description="Manage the assessment-type dropdown used by teachers when creating assessments."
        meta={
          selectedSchool ? (
            <>
              <Badge variant="neutral">{selectedSchool.name}</Badge>
              <Badge variant="neutral">{types.length} types</Badge>
            </>
          ) : null
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>School Context</CardTitle>
          <CardDescription>Pick the school scope to view types (global + school).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field htmlFor="assessment-type-school" label="School">
            <Select
              id="assessment-type-school"
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

          <Field htmlFor="assessment-type-include-inactive" label="Include inactive">
            <Select
              id="assessment-type-include-inactive"
              onChange={(event) => setIncludeInactive(event.target.value === "true")}
              value={includeInactive ? "true" : "false"}
            >
              <option value="true">Show inactive</option>
              <option value="false">Hide inactive</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create Type</CardTitle>
            <CardDescription>Add a new assessment type.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedSchoolId ? (
              <EmptyState
                compact
                title="No school selected"
                description="Select a school before creating a school-scoped type."
              />
            ) : (
              <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreate}>
                <Field htmlFor="create-type-name" label="Name">
                  <Input
                    id="create-type-name"
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Quiz"
                    value={createForm.name}
                  />
                </Field>
                <Field htmlFor="create-type-order" label="Sort order">
                  <Input
                    id="create-type-order"
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
                <Field htmlFor="create-type-scope" label="Scope">
                  <Select
                    id="create-type-scope"
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        scope: event.target.value as "school" | "global",
                      }))
                    }
                    value={createForm.scope}
                  >
                    <option value="school">School</option>
                    <option value="global">Global default</option>
                  </Select>
                </Field>
                <div className="md:col-span-2 flex justify-end">
                  <Button disabled={isSaving} type="submit">
                    {isSaving ? "Saving..." : "Create type"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Types</CardTitle>
            <CardDescription>Inactive types remain valid for existing assessments.</CardDescription>
          </CardHeader>
          <CardContent>
            {types.length === 0 ? (
              <EmptyState
                compact
                title="No assessment types"
                description="Create your first type to enable assessment creation."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate-700">Name</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Scope</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {types.map((type) => (
                        <tr className="align-top hover:bg-slate-50" key={type.id}>
                          <td className="px-4 py-4">
                            <p className="font-medium text-slate-900">{type.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {type.key} • Order {type.sortOrder}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {type.schoolId ? "School" : "Global"}
                          </td>
                          <td className="px-4 py-4">
                            <Badge variant={type.isActive ? "success" : "neutral"}>
                              {type.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                onClick={() => {
                                  setEditingType(type);
                                  setEditForm(buildEditForm(type));
                                }}
                                size="sm"
                                type="button"
                                variant="secondary"
                              >
                                Edit
                              </Button>
                              <Button
                                disabled={isSaving}
                                onClick={() => void handleToggleActive(type)}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                {type.isActive ? "Archive" : "Activate"}
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

      {editingType && editForm ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Edit Type</CardTitle>
              <CardDescription>Update name and sort order.</CardDescription>
            </div>
            <Button
              onClick={() => {
                setEditingType(null);
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
              <Field htmlFor="edit-type-name" label="Name">
                <Input
                  id="edit-type-name"
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  value={editForm.name}
                />
              </Field>
              <Field htmlFor="edit-type-order" label="Sort order">
                <Input
                  id="edit-type-order"
                  inputMode="numeric"
                  onChange={(event) =>
                    setEditForm((current) =>
                      current ? { ...current, sortOrder: event.target.value } : current,
                    )
                  }
                  value={editForm.sortOrder}
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

