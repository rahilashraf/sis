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
import { listSchools, type School } from "@/lib/api/schools";
import {
  createAssessmentResultStatusLabel,
  listAssessmentResultStatusLabels,
  updateAssessmentResultStatusLabel,
  type AssessmentResultStatusLabel,
} from "@/lib/api/assessments";

const allowedRoles = new Set(["OWNER", "SUPER_ADMIN"]);

type CreateFormState = {
  key: string;
  label: string;
  behavior: AssessmentResultStatusLabel["behavior"];
  sortOrder: string;
};

type EditFormState = {
  label: string;
  behavior: AssessmentResultStatusLabel["behavior"];
  sortOrder: string;
  isActive: boolean;
};

function buildCreateForm(): CreateFormState {
  return {
    key: "",
    label: "",
    behavior: "INFORMATION_ONLY",
    sortOrder: "0",
  };
}

function buildEditForm(record: AssessmentResultStatusLabel): EditFormState {
  return {
    label: record.label,
    behavior: record.behavior,
    sortOrder: String(record.sortOrder),
    isActive: record.isActive,
  };
}

function parseIntField(value: string, label: string) {
  if (!/^-?\d+$/.test(value.trim())) {
    throw new Error(`${label} must be a whole number.`);
  }
  return Number(value);
}

export function AssessmentResultStatusLabelsManagement() {
  const { session } = useAuth();
  const role = session?.user.role;

  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [labels, setLabels] = useState<AssessmentResultStatusLabel[]>([]);

  const [createForm, setCreateForm] = useState<CreateFormState>(buildCreateForm());
  const [editingLabel, setEditingLabel] = useState<AssessmentResultStatusLabel | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);

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
    async function loadLabels() {
      if (!selectedSchoolId) {
        setLabels([]);
        return;
      }

      setError(null);

      try {
        const response = await listAssessmentResultStatusLabels({
          schoolId: selectedSchoolId,
          includeInactive,
        });
        setLabels(response);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load status labels.");
        setLabels([]);
      }
    }

    void loadLabels();
  }, [includeInactive, selectedSchoolId]);

  async function refreshLabels() {
    if (!selectedSchoolId) {
      setLabels([]);
      return [];
    }

    const response = await listAssessmentResultStatusLabels({
      schoolId: selectedSchoolId,
      includeInactive,
    });
    setLabels(response);
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
      const label = createForm.label.trim();
      if (!label) {
        throw new Error("Label is required.");
      }

      await createAssessmentResultStatusLabel({
        schoolId: selectedSchoolId,
        key: createForm.key.trim() || undefined,
        label,
        behavior: createForm.behavior,
        sortOrder: parseIntField(createForm.sortOrder, "Sort order"),
      });

      await refreshLabels();
      setCreateForm(buildCreateForm());
      setSuccessMessage("Status label created.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create status label.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingLabel || !editForm) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const label = editForm.label.trim();
      if (!label) {
        throw new Error("Label is required.");
      }

      await updateAssessmentResultStatusLabel(editingLabel.id, {
        label,
        behavior: editForm.behavior,
        sortOrder: parseIntField(editForm.sortOrder, "Sort order"),
        isActive: editForm.isActive,
      });

      const next = await refreshLabels();
      const updated = next.find((entry) => entry.id === editingLabel.id) ?? null;
      setEditingLabel(updated);
      setEditForm(updated ? buildEditForm(updated) : null);
      setSuccessMessage("Status label updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update status label.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!role || !allowedRoles.has(role)) {
    return (
      <EmptyState
        title="Not authorized"
        description="Only owners and super admins can manage assessment result status labels."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading status labels...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Result Status Labels"
        description="PowerSchool-style grade entry codes like Absent, Exempt, and custom labels."
        meta={
          selectedSchool ? (
            <>
              <Badge variant="neutral">{selectedSchool.name}</Badge>
              <Badge variant="neutral">{labels.length} labels</Badge>
            </>
          ) : null
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>School Context</CardTitle>
          <CardDescription>Select the school to manage grade entry codes.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field htmlFor="status-label-school" label="School">
            <Select
              id="status-label-school"
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
          <div className="self-end">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
                type="checkbox"
              />
              Include inactive labels
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create Custom Label</CardTitle>
          <CardDescription>Create new grade entry codes for the selected school.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-4" onSubmit={handleCreate}>
            <Field htmlFor="status-label-key" label="Key (optional)">
              <Input
                id="status-label-key"
                onChange={(event) => setCreateForm((current) => ({ ...current, key: event.target.value }))}
                placeholder="e.g. MISSING"
                value={createForm.key}
              />
            </Field>
            <Field htmlFor="status-label-label" label="Label">
              <Input
                id="status-label-label"
                onChange={(event) => setCreateForm((current) => ({ ...current, label: event.target.value }))}
                required
                value={createForm.label}
              />
            </Field>
            <Field htmlFor="status-label-behavior" label="Calculation behavior">
              <Select
                id="status-label-behavior"
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, behavior: event.target.value as CreateFormState["behavior"] }))
                }
                value={createForm.behavior}
              >
                <option value="COUNT_AS_ZERO">COUNT_AS_ZERO</option>
                <option value="EXCLUDE_FROM_CALCULATION">EXCLUDE_FROM_CALCULATION</option>
                <option value="INFORMATION_ONLY">INFORMATION_ONLY</option>
              </Select>
            </Field>
            <Field htmlFor="status-label-sort" label="Sort order">
              <Input
                id="status-label-sort"
                inputMode="numeric"
                onChange={(event) => setCreateForm((current) => ({ ...current, sortOrder: event.target.value }))}
                value={createForm.sortOrder}
              />
            </Field>
            <div className="md:col-span-4 flex justify-end">
              <Button disabled={isSaving || !selectedSchoolId} type="submit">
                {isSaving ? "Saving..." : "Create label"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Labels</CardTitle>
          <CardDescription>System labels are created automatically per school.</CardDescription>
        </CardHeader>
        <CardContent>
          {labels.length === 0 ? (
            <EmptyState
              title="No labels found"
              description="Select a school to view system and custom grade entry codes."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">Key</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Label</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Behavior</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Type</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Active</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {labels.map((record) => (
                      <tr className="align-top hover:bg-slate-50" key={record.id}>
                        <td className="px-4 py-3 text-slate-700">{record.key}</td>
                        <td className="px-4 py-3 text-slate-900">{record.label}</td>
                        <td className="px-4 py-3 text-slate-700">{record.behavior}</td>
                        <td className="px-4 py-3">
                          <Badge variant={record.isSystem ? "neutral" : "success"}>
                            {record.isSystem ? "System" : "Custom"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={record.isActive ? "success" : "neutral"}>
                            {record.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            disabled={isSaving}
                            onClick={() => {
                              setEditingLabel(record);
                              setEditForm(buildEditForm(record));
                              setSuccessMessage(null);
                              setError(null);
                            }}
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            Edit
                          </Button>
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

      {editingLabel && editForm ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit Label</CardTitle>
            <CardDescription>
              Update the label text and calculation behavior. Key: {editingLabel.key}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-4" onSubmit={handleSaveEdit}>
              <Field htmlFor="edit-status-label" label="Label">
                <Input
                  id="edit-status-label"
                  onChange={(event) => setEditForm((current) => (current ? { ...current, label: event.target.value } : current))}
                  value={editForm.label}
                />
              </Field>
              <Field htmlFor="edit-status-behavior" label="Behavior">
                <Select
                  id="edit-status-behavior"
                  onChange={(event) =>
                    setEditForm((current) => (current ? { ...current, behavior: event.target.value as EditFormState["behavior"] } : current))
                  }
                  value={editForm.behavior}
                >
                  <option value="COUNT_AS_ZERO">COUNT_AS_ZERO</option>
                  <option value="EXCLUDE_FROM_CALCULATION">EXCLUDE_FROM_CALCULATION</option>
                  <option value="INFORMATION_ONLY">INFORMATION_ONLY</option>
                </Select>
              </Field>
              <Field htmlFor="edit-status-sort" label="Sort order">
                <Input
                  id="edit-status-sort"
                  inputMode="numeric"
                  onChange={(event) => setEditForm((current) => (current ? { ...current, sortOrder: event.target.value } : current))}
                  value={editForm.sortOrder}
                />
              </Field>
              <Field htmlFor="edit-status-active" label="Active">
                <Select
                  id="edit-status-active"
                  onChange={(event) => setEditForm((current) => (current ? { ...current, isActive: event.target.value === "true" } : current))}
                  value={editForm.isActive ? "true" : "false"}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </Select>
              </Field>
              <div className="md:col-span-4 flex justify-end gap-2">
                <Button
                  disabled={isSaving}
                  onClick={() => {
                    setEditingLabel(null);
                    setEditForm(null);
                  }}
                  type="button"
                  variant="secondary"
                >
                  Close
                </Button>
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

