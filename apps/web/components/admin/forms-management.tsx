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
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth/auth-context";
import {
  activateForm,
  archiveForm,
  createForm,
  deleteForm,
  getFormById,
  getFormResponses,
  listForms,
  type FormField,
  type FormFieldType,
  type FormResponse,
  type FormSummary,
  type UpdateFormInput,
  updateForm,
} from "@/lib/api/forms";
import { listSchools, type School } from "@/lib/api/schools";
import {
  formatDateLabel,
  formatDateTimeLabel,
  getDisplayText,
} from "@/lib/utils";

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);

type EditableField = {
  id: string;
  key: string;
  label: string;
  type: FormFieldType;
  optionsText: string;
  sortOrder: string;
  isRequired: boolean;
  isActive: boolean;
};

type FormEditorState = {
  title: string;
  description: string;
  opensAt: string;
  closesAt: string;
  isActive: boolean;
  requiresStudentContext: boolean;
  fields: EditableField[];
};

const fieldTypeLabels: Record<FormFieldType, string> = {
  SHORT_TEXT: "Short text",
  LONG_TEXT: "Long text",
  SELECT: "Select",
  CHECKBOX: "Checkbox",
  DATE: "Date",
};

function parseDateTimeLocal(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Date/time values must be valid.");
  }

  return parsed.toISOString();
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function normalizeFieldKey(value: string) {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized;
}

function createEmptyField(index: number): EditableField {
  return {
    id: `field-${Date.now()}-${index}`,
    key: "",
    label: "",
    type: "SHORT_TEXT",
    optionsText: "",
    sortOrder: String(index),
    isRequired: false,
    isActive: true,
  };
}

function mapFormFieldToEditable(field: FormField): EditableField {
  return {
    id: field.id,
    key: field.key,
    label: field.label,
    type: field.type,
    optionsText: (field.optionsJson ?? []).join(", "),
    sortOrder: String(field.sortOrder),
    isRequired: field.isRequired,
    isActive: field.isActive,
  };
}

function createEmptyEditor(): FormEditorState {
  return {
    title: "",
    description: "",
    opensAt: "",
    closesAt: "",
    isActive: true,
    requiresStudentContext: false,
    fields: [createEmptyField(0)],
  };
}

function mapFormToEditor(form: FormSummary): FormEditorState {
  return {
    title: form.title,
    description: form.description ?? "",
    opensAt: toDateTimeLocal(form.opensAt),
    closesAt: toDateTimeLocal(form.closesAt),
    isActive: form.isActive,
    requiresStudentContext: form.requiresStudentContext,
    fields:
      form.fields.length > 0
        ? form.fields.map(mapFormFieldToEditable)
        : [createEmptyField(0)],
  };
}

function parseSortOrder(value: string, index: number) {
  const trimmed = value.trim();
  if (!trimmed) {
    return index;
  }

  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error("Sort order must be a whole number.");
  }

  return Number(trimmed);
}

function normalizeOptions(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function buildFieldPayload(fields: EditableField[]) {
  if (fields.length === 0) {
    throw new Error("At least one field is required.");
  }

  const seenKeys = new Set<string>();

  return fields.map((field, index) => {
    const fallbackKey = normalizeFieldKey(field.label) || `FIELD_${index + 1}`;
    const key = normalizeFieldKey(field.key || fallbackKey);

    if (!key) {
      throw new Error("Each field must have a key.");
    }

    if (seenKeys.has(key)) {
      throw new Error(`Duplicate field key: ${key}`);
    }
    seenKeys.add(key);

    const label = field.label.trim();
    if (!label) {
      throw new Error("Each field must have a label.");
    }

    const options =
      field.type === "SELECT" ? normalizeOptions(field.optionsText) : undefined;

    if (field.type === "SELECT" && (!options || options.length === 0)) {
      throw new Error(`Select field "${label}" requires at least one option.`);
    }

    return {
      key,
      label,
      type: field.type,
      options,
      sortOrder: parseSortOrder(field.sortOrder, index),
      isRequired: field.isRequired,
      isActive: field.isActive,
    };
  });
}

function FormFieldBuilder({
  disabled,
  fields,
  onChange,
}: {
  disabled?: boolean;
  fields: EditableField[];
  onChange: (fields: EditableField[]) => void;
}) {
  function updateField(
    fieldId: string,
    updater: (field: EditableField) => EditableField,
  ) {
    onChange(
      fields.map((field) => (field.id === fieldId ? updater(field) : field)),
    );
  }

  function addField() {
    onChange([...fields, createEmptyField(fields.length)]);
  }

  function removeField(fieldId: string) {
    if (fields.length <= 1) {
      return;
    }

    onChange(fields.filter((field) => field.id !== fieldId));
  }

  return (
    <div className="space-y-3">
      {fields.map((field, index) => (
        <div className="rounded-xl border border-slate-200 p-4" key={field.id}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              htmlFor={`field-label-${field.id}`}
              label={`Field ${index + 1} label`}
            >
              <Input
                disabled={disabled}
                id={`field-label-${field.id}`}
                onChange={(event) =>
                  updateField(field.id, (current) => ({
                    ...current,
                    label: event.target.value,
                    key: current.key || normalizeFieldKey(event.target.value),
                  }))
                }
                placeholder="Emergency contact phone"
                value={field.label}
              />
            </Field>

            <Field htmlFor={`field-key-${field.id}`} label="Key">
              <Input
                disabled={disabled}
                id={`field-key-${field.id}`}
                onChange={(event) =>
                  updateField(field.id, (current) => ({
                    ...current,
                    key: normalizeFieldKey(event.target.value),
                  }))
                }
                placeholder="EMERGENCY_CONTACT_PHONE"
                value={field.key}
              />
            </Field>

            <Field htmlFor={`field-type-${field.id}`} label="Type">
              <Select
                disabled={disabled}
                id={`field-type-${field.id}`}
                onChange={(event) =>
                  updateField(field.id, (current) => ({
                    ...current,
                    type: event.target.value as FormFieldType,
                    optionsText:
                      event.target.value === "SELECT"
                        ? current.optionsText
                        : "",
                  }))
                }
                value={field.type}
              >
                {Object.entries(fieldTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor={`field-order-${field.id}`} label="Sort order">
              <Input
                disabled={disabled}
                id={`field-order-${field.id}`}
                inputMode="numeric"
                onChange={(event) =>
                  updateField(field.id, (current) => ({
                    ...current,
                    sortOrder: event.target.value,
                  }))
                }
                value={field.sortOrder}
              />
            </Field>

            {field.type === "SELECT" ? (
              <Field
                className="md:col-span-2"
                description="Comma-separated option values."
                htmlFor={`field-options-${field.id}`}
                label="Select options"
              >
                <Input
                  disabled={disabled}
                  id={`field-options-${field.id}`}
                  onChange={(event) =>
                    updateField(field.id, (current) => ({
                      ...current,
                      optionsText: event.target.value,
                    }))
                  }
                  placeholder="Option A, Option B, Option C"
                  value={field.optionsText}
                />
              </Field>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <CheckboxField
              checked={field.isRequired}
              disabled={disabled}
              label="Required"
              onChange={(event) =>
                updateField(field.id, (current) => ({
                  ...current,
                  isRequired: event.target.checked,
                }))
              }
            />
            <CheckboxField
              checked={field.isActive}
              disabled={disabled}
              label="Field active"
              onChange={(event) =>
                updateField(field.id, (current) => ({
                  ...current,
                  isActive: event.target.checked,
                }))
              }
            />
            <div className="flex items-end justify-end">
              <Button
                disabled={disabled || fields.length <= 1}
                onClick={() => removeField(field.id)}
                type="button"
                variant="ghost"
              >
                Remove field
              </Button>
            </div>
          </div>
        </div>
      ))}

      <div className="flex justify-end">
        <Button
          disabled={disabled}
          onClick={addField}
          type="button"
          variant="secondary"
        >
          Add field
        </Button>
      </div>
    </div>
  );
}

export function FormsManagement() {
  const { session } = useAuth();
  const role = session?.user.role ?? "";
  const canManage = manageRoles.has(role);
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [createEditor, setCreateEditor] =
    useState<FormEditorState>(createEmptyEditor());
  const [editEditor, setEditEditor] = useState<FormEditorState | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingResponses, setIsLoadingResponses] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FormSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId],
  );

  const selectedForm = useMemo(
    () => forms.find((form) => form.id === selectedFormId) ?? null,
    [forms, selectedFormId],
  );

  useEffect(() => {
    async function loadSchools() {
      if (!canManage) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const schoolResponse = await listSchools({ includeInactive: false });
        setSchools(schoolResponse);
        setSelectedSchoolId(
          (current) => current || schoolResponse[0]?.id || "",
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
  }, [canManage]);

  async function loadForms() {
    if (!selectedSchoolId) {
      setForms([]);
      setSelectedFormId("");
      setEditEditor(null);
      return;
    }

    const response = await listForms({
      schoolId: selectedSchoolId,
      includeInactive,
    });

    setForms(response);
    setSelectedFormId((current) => {
      if (current && response.some((form) => form.id === current)) {
        return current;
      }

      return response[0]?.id ?? "";
    });
  }

  useEffect(() => {
    if (!canManage) {
      return;
    }

    setError(null);
    setSuccessMessage(null);

    loadForms().catch((loadError) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load forms.",
      );
      setForms([]);
      setSelectedFormId("");
      setEditEditor(null);
    });
  }, [canManage, includeInactive, selectedSchoolId]);

  useEffect(() => {
    async function loadSelectedFormDetails() {
      if (!selectedFormId) {
        setEditEditor(null);
        setResponses([]);
        return;
      }

      setIsLoadingResponses(true);

      try {
        const [formDetail, formResponses] = await Promise.all([
          getFormById(selectedFormId),
          getFormResponses(selectedFormId),
        ]);
        setEditEditor(mapFormToEditor(formDetail));
        setResponses(formResponses);
      } catch (loadError) {
        setEditEditor(null);
        setResponses([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load form details.",
        );
      } finally {
        setIsLoadingResponses(false);
      }
    }

    void loadSelectedFormDetails();
  }, [selectedFormId]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSchoolId) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const title = createEditor.title.trim();
      if (!title) {
        throw new Error("Title is required.");
      }

      const opensAt = parseDateTimeLocal(createEditor.opensAt);
      const closesAt = parseDateTimeLocal(createEditor.closesAt);
      if (opensAt && closesAt && opensAt >= closesAt) {
        throw new Error("Open date must be before close date.");
      }

      await createForm({
        schoolId: selectedSchoolId,
        title,
        description: createEditor.description.trim() || null,
        isActive: createEditor.isActive,
        opensAt,
        closesAt,
        requiresStudentContext: createEditor.requiresStudentContext,
        fields: buildFieldPayload(createEditor.fields),
      });

      setCreateEditor(createEmptyEditor());
      await loadForms();
      setSuccessMessage("Form created.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to create form.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFormId || !editEditor) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const title = editEditor.title.trim();
      if (!title) {
        throw new Error("Title is required.");
      }

      const opensAt = parseDateTimeLocal(editEditor.opensAt);
      const closesAt = parseDateTimeLocal(editEditor.closesAt);
      if (opensAt && closesAt && opensAt >= closesAt) {
        throw new Error("Open date must be before close date.");
      }

      const payload: UpdateFormInput = {
        title,
        description: editEditor.description.trim() || null,
        isActive: editEditor.isActive,
        opensAt,
        closesAt,
        requiresStudentContext: editEditor.requiresStudentContext,
        fields: buildFieldPayload(editEditor.fields),
      };

      await updateForm(selectedFormId, payload);
      await loadForms();

      const [formDetail, formResponses] = await Promise.all([
        getFormById(selectedFormId),
        getFormResponses(selectedFormId),
      ]);
      setEditEditor(mapFormToEditor(formDetail));
      setResponses(formResponses);
      setSuccessMessage("Form updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update form.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleFormActive(form: FormSummary) {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (form.isActive) {
        await archiveForm(form.id);
      } else {
        await activateForm(form.id);
      }

      await loadForms();
      setSuccessMessage(form.isActive ? "Form archived." : "Form activated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update form status.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteForm() {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    setError(null);
    setSuccessMessage(null);

    try {
      await deleteForm(deleteTarget.id);
      await loadForms();
      if (selectedFormId === deleteTarget.id) {
        setSelectedFormId("");
      }
      setDeleteTarget(null);
      setSuccessMessage("Form deleted.");
    } catch (saveError) {
      setDeleteError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to delete form.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  if (!canManage) {
    return (
      <EmptyState
        title="Not authorized"
        description="Only OWNER, SUPER_ADMIN, and ADMIN can manage forms."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading forms workspace...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forms"
        description="Manage parent-facing forms and review submitted responses."
        meta={
          <>
            <Badge variant="neutral">
              {selectedSchool?.name ?? "Select school"}
            </Badge>
            <Badge variant="neutral">{forms.length} forms</Badge>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>School Context</CardTitle>
          <CardDescription>
            Pick a school and choose whether archived forms are listed.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field htmlFor="forms-school" label="School">
            <Select
              id="forms-school"
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

          <Field htmlFor="forms-include-inactive" label="Include archived">
            <Select
              id="forms-include-inactive"
              onChange={(event) =>
                setIncludeInactive(event.target.value === "true")
              }
              value={includeInactive ? "true" : "false"}
            >
              <option value="false">Active only</option>
              <option value="true">Include archived</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create Form</CardTitle>
            <CardDescription>
              Build a simple parent-facing form with supported field types.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedSchoolId ? (
              <EmptyState
                compact
                title="No school selected"
                description="Select a school before creating forms."
              />
            ) : (
              <form className="space-y-4" onSubmit={handleCreate}>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field htmlFor="create-form-title" label="Title">
                    <Input
                      id="create-form-title"
                      onChange={(event) =>
                        setCreateEditor((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      value={createEditor.title}
                    />
                  </Field>
                  <Field htmlFor="create-form-opens" label="Opens at">
                    <Input
                      id="create-form-opens"
                      onChange={(event) =>
                        setCreateEditor((current) => ({
                          ...current,
                          opensAt: event.target.value,
                        }))
                      }
                      type="datetime-local"
                      value={createEditor.opensAt}
                    />
                  </Field>
                  <Field htmlFor="create-form-closes" label="Closes at">
                    <Input
                      id="create-form-closes"
                      onChange={(event) =>
                        setCreateEditor((current) => ({
                          ...current,
                          closesAt: event.target.value,
                        }))
                      }
                      type="datetime-local"
                      value={createEditor.closesAt}
                    />
                  </Field>
                  <Field
                    className="md:col-span-2"
                    htmlFor="create-form-description"
                    label="Description"
                  >
                    <Textarea
                      id="create-form-description"
                      onChange={(event) =>
                        setCreateEditor((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      rows={3}
                      value={createEditor.description}
                    />
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <CheckboxField
                    checked={createEditor.isActive}
                    label="Form is active"
                    onChange={(event) =>
                      setCreateEditor((current) => ({
                        ...current,
                        isActive: event.target.checked,
                      }))
                    }
                  />
                  <CheckboxField
                    checked={createEditor.requiresStudentContext}
                    label="Requires student selection"
                    onChange={(event) =>
                      setCreateEditor((current) => ({
                        ...current,
                        requiresStudentContext: event.target.checked,
                      }))
                    }
                  />
                </div>

                <FormFieldBuilder
                  disabled={isSaving}
                  fields={createEditor.fields}
                  onChange={(fields) =>
                    setCreateEditor((current) => ({
                      ...current,
                      fields,
                    }))
                  }
                />

                <div className="flex justify-end">
                  <Button disabled={isSaving} type="submit">
                    {isSaving ? "Saving..." : "Create form"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing Forms</CardTitle>
            <CardDescription>
              Select a form to edit it or review responses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {forms.length === 0 ? (
              <EmptyState
                compact
                title="No forms"
                description="Create the first form for this school."
              />
            ) : (
              <>
                <Field htmlFor="selected-form" label="Form">
                  <Select
                    id="selected-form"
                    onChange={(event) => setSelectedFormId(event.target.value)}
                    value={selectedFormId}
                  >
                    {forms.map((form) => (
                      <option key={form.id} value={form.id}>
                        {form.title}
                      </option>
                    ))}
                  </Select>
                </Field>

                <div className="space-y-2">
                  {forms.map((form) => (
                    <div
                      className={`rounded-xl border px-4 py-3 ${
                        form.id === selectedFormId
                          ? "border-slate-400 bg-slate-50"
                          : "border-slate-200 bg-white"
                      }`}
                      key={form.id}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          className="text-left text-sm font-semibold text-slate-900 hover:underline"
                          onClick={() => setSelectedFormId(form.id)}
                          type="button"
                        >
                          {form.title}
                        </button>
                        <div className="flex items-center gap-2">
                          <Badge variant="neutral">
                            {form.isActive ? "Active" : "Archived"}
                          </Badge>
                          <Badge variant="neutral">
                            {(form._count?.responses ?? 0) > 0
                              ? `${form._count?.responses ?? 0} responses`
                              : "No responses"}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {form.opensAt
                          ? `Opens ${formatDateLabel(form.opensAt)}`
                          : "No open date"}{" "}
                        •{" "}
                        {form.closesAt
                          ? `Closes ${formatDateLabel(form.closesAt)}`
                          : "No close date"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          onClick={() => setSelectedFormId(form.id)}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          Edit
                        </Button>
                        <Button
                          disabled={isSaving}
                          onClick={() => void handleToggleFormActive(form)}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          {form.isActive ? "Archive" : "Activate"}
                        </Button>
                        <Button
                          disabled={isSaving}
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(form);
                          }}
                          size="sm"
                          type="button"
                          variant="danger"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedForm && editEditor ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Edit Form</CardTitle>
              <CardDescription>
                Update title, dates, and field definitions for{" "}
                {selectedForm.title}.
              </CardDescription>
            </div>
            <Button
              disabled={isSaving}
              onClick={() => void handleToggleFormActive(selectedForm)}
              type="button"
              variant="secondary"
            >
              {selectedForm.isActive ? "Archive form" : "Activate form"}
            </Button>
          </CardHeader>
          <CardContent>
            {isLoadingResponses ? (
              <p className="text-sm text-slate-500">Loading form details...</p>
            ) : (
              <form className="space-y-4" onSubmit={handleSaveEdit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field htmlFor="edit-form-title" label="Title">
                    <Input
                      id="edit-form-title"
                      onChange={(event) =>
                        setEditEditor((current) =>
                          current
                            ? {
                                ...current,
                                title: event.target.value,
                              }
                            : current,
                        )
                      }
                      value={editEditor.title}
                    />
                  </Field>
                  <Field htmlFor="edit-form-opens" label="Opens at">
                    <Input
                      id="edit-form-opens"
                      onChange={(event) =>
                        setEditEditor((current) =>
                          current
                            ? {
                                ...current,
                                opensAt: event.target.value,
                              }
                            : current,
                        )
                      }
                      type="datetime-local"
                      value={editEditor.opensAt}
                    />
                  </Field>
                  <Field htmlFor="edit-form-closes" label="Closes at">
                    <Input
                      id="edit-form-closes"
                      onChange={(event) =>
                        setEditEditor((current) =>
                          current
                            ? {
                                ...current,
                                closesAt: event.target.value,
                              }
                            : current,
                        )
                      }
                      type="datetime-local"
                      value={editEditor.closesAt}
                    />
                  </Field>
                  <Field
                    className="md:col-span-2"
                    htmlFor="edit-form-description"
                    label="Description"
                  >
                    <Textarea
                      id="edit-form-description"
                      onChange={(event) =>
                        setEditEditor((current) =>
                          current
                            ? {
                                ...current,
                                description: event.target.value,
                              }
                            : current,
                        )
                      }
                      rows={3}
                      value={editEditor.description}
                    />
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <CheckboxField
                    checked={editEditor.isActive}
                    label="Form is active"
                    onChange={(event) =>
                      setEditEditor((current) =>
                        current
                          ? {
                              ...current,
                              isActive: event.target.checked,
                            }
                          : current,
                      )
                    }
                  />
                  <CheckboxField
                    checked={editEditor.requiresStudentContext}
                    label="Requires student selection"
                    onChange={(event) =>
                      setEditEditor((current) =>
                        current
                          ? {
                              ...current,
                              requiresStudentContext: event.target.checked,
                            }
                          : current,
                      )
                    }
                  />
                </div>

                <FormFieldBuilder
                  disabled={isSaving}
                  fields={editEditor.fields}
                  onChange={(fields) =>
                    setEditEditor((current) =>
                      current ? { ...current, fields } : current,
                    )
                  }
                />

                <div className="flex justify-end">
                  <Button disabled={isSaving} type="submit">
                    {isSaving ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}

      {selectedForm ? (
        <Card>
          <CardHeader>
            <CardTitle>Responses</CardTitle>
            <CardDescription>
              Simple response view for operational follow-up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingResponses ? (
              <p className="text-sm text-slate-500">Loading responses...</p>
            ) : responses.length === 0 ? (
              <EmptyState
                compact
                title="No submissions yet"
                description="Parent submissions will appear here."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Submitted
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Parent
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Student
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Values
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {responses.map((response) => (
                        <tr
                          className="align-top hover:bg-slate-50"
                          key={response.id}
                        >
                          <td className="px-4 py-3 text-slate-700">
                            {formatDateTimeLabel(response.submittedAt)}
                          </td>
                          <td className="px-4 py-3 text-slate-900">
                            {getDisplayText(response.parent.firstName, "")}{" "}
                            {getDisplayText(response.parent.lastName, "")}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {response.student
                              ? `${response.student.firstName} ${response.student.lastName}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            <div className="space-y-1">
                              {response.values.map((value) => (
                                <p key={value.id}>
                                  <span className="font-medium text-slate-900">
                                    {value.field.label}:
                                  </span>{" "}
                                  {getDisplayText(value.valueText, "—")}
                                </p>
                              ))}
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
      ) : null}

      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel="Delete form"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.title}" permanently? Forms with submissions cannot be deleted and should be archived instead.`
            : ""
        }
        errorMessage={deleteError}
        isOpen={Boolean(deleteTarget)}
        isPending={isDeleting}
        onCancel={() => {
          if (isDeleting) {
            return;
          }
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={handleDeleteForm}
        pendingLabel="Deleting..."
        title="Delete form"
      />
    </div>
  );
}
