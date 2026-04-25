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
import { useAuth } from "@/lib/auth/auth-context";
import { listSchools, type School } from "@/lib/api/schools";
import {
  activateGradeScale,
  addGradeScaleRule,
  applyGradeScaleMultiSchool,
  archiveGradeScale,
  createGradeScale,
  listGradeScales,
  setDefaultGradeScale,
  updateGradeScale,
  updateGradeScaleRule,
  type ApplyGradeScaleMultiSchoolResponse,
  type GradeScale,
  type GradeScaleRule,
} from "@/lib/api/grade-scales";

const allowedRoles = new Set(["OWNER", "SUPER_ADMIN"]);

type ScaleFormState = {
  name: string;
  isDefault: boolean;
};

type RuleFormState = {
  letterGrade: string;
  minPercent: string;
  maxPercent: string;
  sortOrder: string;
};

type MultiSchoolFormState = {
  mode: "create" | "copy";
  name: string;
  sourceGradeScaleId: string;
  isDefault: boolean;
  copyRules: boolean;
  targetSchoolIds: string[];
};

function buildScaleForm(): ScaleFormState {
  return { name: "", isDefault: false };
}

function buildRuleForm(): RuleFormState {
  return {
    letterGrade: "",
    minPercent: "0",
    maxPercent: "100",
    sortOrder: "0",
  };
}

function buildMultiSchoolForm(): MultiSchoolFormState {
  return {
    mode: "create",
    name: "",
    sourceGradeScaleId: "",
    isDefault: false,
    copyRules: true,
    targetSchoolIds: [],
  };
}

function buildEditRuleForm(rule: GradeScaleRule): RuleFormState {
  return {
    letterGrade: rule.letterGrade,
    minPercent: `${rule.minPercent}`,
    maxPercent: `${rule.maxPercent}`,
    sortOrder: `${rule.sortOrder}`,
  };
}

function parseNumberField(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`);
  }
  return parsed;
}

function parseIntField(value: string, label: string) {
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${label} must be a whole number.`);
  }
  return Number(value);
}

export function GradeScalesManagement() {
  const { session } = useAuth();
  const role = session?.user.role;
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [gradeScales, setGradeScales] = useState<GradeScale[]>([]);
  const [selectedScaleId, setSelectedScaleId] = useState<string>("");
  const [createScaleForm, setCreateScaleForm] =
    useState<ScaleFormState>(buildScaleForm());
  const [editingScale, setEditingScale] = useState<GradeScale | null>(null);
  const [editingScaleName, setEditingScaleName] = useState("");
  const [createRuleForm, setCreateRuleForm] =
    useState<RuleFormState>(buildRuleForm());
  const [editingRule, setEditingRule] = useState<GradeScaleRule | null>(null);
  const [editRuleForm, setEditRuleForm] = useState<RuleFormState | null>(null);
  const [multiSchoolForm, setMultiSchoolForm] = useState<MultiSchoolFormState>(
    buildMultiSchoolForm(),
  );
  const [multiSchoolResult, setMultiSchoolResult] =
    useState<ApplyGradeScaleMultiSchoolResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId],
  );

  const selectedScale = useMemo(
    () => gradeScales.find((scale) => scale.id === selectedScaleId) ?? null,
    [gradeScales, selectedScaleId],
  );

  const sourceScaleOptions = useMemo(
    () => gradeScales.filter((scale) => scale.isActive),
    [gradeScales],
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
  }, [role]);

  useEffect(() => {
    async function loadScales() {
      if (!role || !allowedRoles.has(role)) {
        return;
      }

      if (!selectedSchoolId) {
        setGradeScales([]);
        setSelectedScaleId("");
        return;
      }

      setError(null);

      try {
        const response = await listGradeScales(selectedSchoolId, {
          includeInactive: true,
        });
        setGradeScales(response);
        setSelectedScaleId((current) => current || response[0]?.id || "");
        setMultiSchoolForm((current) => ({
          ...current,
          sourceGradeScaleId:
            response.find((scale) => scale.id === current.sourceGradeScaleId)
              ?.id ??
            response[0]?.id ??
            "",
        }));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load grade scales.",
        );
        setGradeScales([]);
        setSelectedScaleId("");
      }
    }

    void loadScales();
  }, [role, selectedSchoolId]);

  async function refreshScales() {
    if (!selectedSchoolId) {
      setGradeScales([]);
      return [];
    }

    const response = await listGradeScales(selectedSchoolId, {
      includeInactive: true,
    });
    setGradeScales(response);
    return response;
  }

  function toggleTargetSchool(schoolId: string, checked: boolean) {
    setMultiSchoolForm((current) => {
      const nextIds = new Set(current.targetSchoolIds);
      if (checked) {
        nextIds.add(schoolId);
      } else {
        nextIds.delete(schoolId);
      }

      return {
        ...current,
        targetSchoolIds: Array.from(nextIds),
      };
    });
  }

  async function handleApplyAcrossSchools(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    setMultiSchoolResult(null);

    try {
      if (multiSchoolForm.targetSchoolIds.length === 0) {
        throw new Error("Select at least one target school.");
      }

      if (multiSchoolForm.mode === "create" && !multiSchoolForm.name.trim()) {
        throw new Error("Scale name is required when creating a new scale.");
      }

      if (
        multiSchoolForm.mode === "copy" &&
        !multiSchoolForm.sourceGradeScaleId
      ) {
        throw new Error("Select a source grade scale to copy.");
      }

      const response = await applyGradeScaleMultiSchool({
        targetSchoolIds: multiSchoolForm.targetSchoolIds,
        sourceGradeScaleId:
          multiSchoolForm.mode === "copy"
            ? multiSchoolForm.sourceGradeScaleId
            : undefined,
        name: multiSchoolForm.name.trim() || undefined,
        isDefault: multiSchoolForm.isDefault,
        copyRules:
          multiSchoolForm.mode === "copy" ? multiSchoolForm.copyRules : false,
      });

      setMultiSchoolResult(response);
      setSuccessMessage(
        `Applied "${response.name}" to ${response.results.length} school(s): ${response.createdCount} created, ${response.skippedCount} skipped, ${response.failedCount} failed.`,
      );

      if (
        selectedSchoolId &&
        multiSchoolForm.targetSchoolIds.includes(selectedSchoolId)
      ) {
        await refreshScales();
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to apply grade scale across schools.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateScale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSchoolId) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!createScaleForm.name.trim()) {
        throw new Error("Grade scale name is required.");
      }

      await createGradeScale({
        schoolId: selectedSchoolId,
        name: createScaleForm.name.trim(),
        isDefault: createScaleForm.isDefault,
      });

      await refreshScales();
      setCreateScaleForm(buildScaleForm());
      setSuccessMessage("Grade scale created successfully.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to create grade scale.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveScaleName() {
    if (!editingScale) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!editingScaleName.trim()) {
        throw new Error("Name is required.");
      }

      await updateGradeScale(editingScale.id, {
        name: editingScaleName.trim(),
      });
      const next = await refreshScales();
      setEditingScale(
        next.find((scale) => scale.id === editingScale.id) ?? null,
      );
      setSuccessMessage("Grade scale updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update grade scale.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSetDefault(scale: GradeScale) {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await setDefaultGradeScale(scale.id);
      await refreshScales();
      setSuccessMessage("Default grade scale updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to set default.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleScaleActive(scale: GradeScale) {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (scale.isActive) {
        await archiveGradeScale(scale.id);
      } else {
        await activateGradeScale(scale.id);
      }

      await refreshScales();
      setSuccessMessage(
        scale.isActive ? "Grade scale archived." : "Grade scale activated.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update grade scale.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedScale) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!createRuleForm.letterGrade.trim()) {
        throw new Error("Letter grade is required.");
      }

      await addGradeScaleRule(selectedScale.id, {
        letterGrade: createRuleForm.letterGrade.trim(),
        minPercent: parseNumberField(createRuleForm.minPercent, "Min percent"),
        maxPercent: parseNumberField(createRuleForm.maxPercent, "Max percent"),
        sortOrder: parseIntField(createRuleForm.sortOrder, "Sort order"),
      });

      await refreshScales();
      setCreateRuleForm(buildRuleForm());
      setSuccessMessage("Rule added.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Unable to add rule.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveRule() {
    if (!editingRule || !editRuleForm) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!editRuleForm.letterGrade.trim()) {
        throw new Error("Letter grade is required.");
      }

      await updateGradeScaleRule(editingRule.id, {
        letterGrade: editRuleForm.letterGrade.trim(),
        minPercent: parseNumberField(editRuleForm.minPercent, "Min percent"),
        maxPercent: parseNumberField(editRuleForm.maxPercent, "Max percent"),
        sortOrder: parseIntField(editRuleForm.sortOrder, "Sort order"),
      });

      await refreshScales();
      setEditingRule(null);
      setEditRuleForm(null);
      setSuccessMessage("Rule updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update rule.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!role || !allowedRoles.has(role)) {
    return (
      <EmptyState
        title="Not authorized"
        description="Only owners and super admins can manage grade scales."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">
            Loading grade scale settings...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grade Scales"
        description="Configure percentage-to-letter-grade mappings for a school."
        meta={
          selectedSchool ? (
            <>
              <Badge variant="neutral">{selectedSchool.name}</Badge>
              <Badge variant="neutral">{gradeScales.length} scales</Badge>
            </>
          ) : null
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>School Context</CardTitle>
          <CardDescription>
            Select a school to manage its grade scales.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field htmlFor="grade-scale-school" label="School">
            <Select
              id="grade-scale-school"
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Apply Across Schools</CardTitle>
          <CardDescription>
            Create a new scale or copy an existing one to multiple schools at
            once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleApplyAcrossSchools}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field htmlFor="multi-mode" label="Mode">
                <Select
                  id="multi-mode"
                  onChange={(event) =>
                    setMultiSchoolForm((current) => ({
                      ...current,
                      mode: event.target.value === "copy" ? "copy" : "create",
                    }))
                  }
                  value={multiSchoolForm.mode}
                >
                  <option value="create">Create new scale</option>
                  <option value="copy">Copy existing scale</option>
                </Select>
              </Field>

              <Field htmlFor="multi-is-default" label="Default">
                <Select
                  id="multi-is-default"
                  onChange={(event) =>
                    setMultiSchoolForm((current) => ({
                      ...current,
                      isDefault: event.target.value === "true",
                    }))
                  }
                  value={multiSchoolForm.isDefault ? "true" : "false"}
                >
                  <option value="false">Not default</option>
                  <option value="true">Set as default</option>
                </Select>
              </Field>

              <Field htmlFor="multi-name" label="Scale name">
                <Input
                  id="multi-name"
                  onChange={(event) =>
                    setMultiSchoolForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Default Scale"
                  value={multiSchoolForm.name}
                />
              </Field>

              {multiSchoolForm.mode === "copy" ? (
                <Field htmlFor="multi-source-scale" label="Source scale">
                  <Select
                    id="multi-source-scale"
                    onChange={(event) =>
                      setMultiSchoolForm((current) => ({
                        ...current,
                        sourceGradeScaleId: event.target.value,
                      }))
                    }
                    value={multiSchoolForm.sourceGradeScaleId}
                  >
                    <option value="">Select source scale</option>
                    {sourceScaleOptions.map((scale) => (
                      <option key={scale.id} value={scale.id}>
                        {scale.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              {multiSchoolForm.mode === "copy" ? (
                <CheckboxField
                  checked={multiSchoolForm.copyRules}
                  className="md:col-span-2"
                  description="When disabled, the scale is created without copying source rules."
                  label="Copy grade rules from source scale"
                  onChange={(event) =>
                    setMultiSchoolForm((current) => ({
                      ...current,
                      copyRules: event.target.checked,
                    }))
                  }
                />
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Target schools
              </p>
              <div className="grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-2">
                {schools.map((school) => (
                  <label
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    key={school.id}
                  >
                    <span>{school.name}</span>
                    <input
                      checked={multiSchoolForm.targetSchoolIds.includes(
                        school.id,
                      )}
                      onChange={(event) =>
                        toggleTargetSchool(school.id, event.target.checked)
                      }
                      type="checkbox"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button disabled={isSaving} type="submit">
                {isSaving ? "Applying..." : "Apply to schools"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {multiSchoolResult ? (
        <Card>
          <CardHeader>
            <CardTitle>Multi-School Result</CardTitle>
            <CardDescription>
              {multiSchoolResult.createdCount} created •{" "}
              {multiSchoolResult.skippedCount} skipped •{" "}
              {multiSchoolResult.failedCount} failed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        School
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Status
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Message
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {multiSchoolResult.results.map((result) => (
                      <tr key={result.schoolId}>
                        <td className="px-4 py-3">{result.schoolName}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              result.status === "created"
                                ? "success"
                                : result.status === "failed"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {result.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {result.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create Grade Scale</CardTitle>
            <CardDescription>
              Add a new grade scale for this school.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedSchoolId ? (
              <EmptyState
                compact
                title="No school selected"
                description="Select a school before creating a grade scale."
              />
            ) : (
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={handleCreateScale}
              >
                <Field htmlFor="create-grade-scale-name" label="Name">
                  <Input
                    id="create-grade-scale-name"
                    onChange={(event) =>
                      setCreateScaleForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Default Scale"
                    value={createScaleForm.name}
                  />
                </Field>
                <Field htmlFor="create-grade-scale-default" label="Default">
                  <Select
                    id="create-grade-scale-default"
                    onChange={(event) =>
                      setCreateScaleForm((current) => ({
                        ...current,
                        isDefault: event.target.value === "true",
                      }))
                    }
                    value={createScaleForm.isDefault ? "true" : "false"}
                  >
                    <option value="false">Not default</option>
                    <option value="true">Set as default</option>
                  </Select>
                </Field>
                <div className="md:col-span-2 flex justify-end">
                  <Button disabled={isSaving} type="submit">
                    {isSaving ? "Saving..." : "Create scale"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grade Scales</CardTitle>
            <CardDescription>
              Manage active/default status and open rules.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {gradeScales.length === 0 ? (
              <EmptyState
                compact
                title="No grade scales"
                description="Create the first grade scale to define letter grades."
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
                          Status
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Rules
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {gradeScales.map((scale) => (
                        <tr
                          className="align-top hover:bg-slate-50"
                          key={scale.id}
                        >
                          <td className="px-4 py-4">
                            <button
                              className="text-left font-medium text-slate-900 hover:underline"
                              onClick={() => setSelectedScaleId(scale.id)}
                              type="button"
                            >
                              {scale.name}
                            </button>
                            {scale.isDefault ? (
                              <p className="mt-1 text-xs text-slate-500">
                                Default
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            <Badge
                              variant={scale.isActive ? "success" : "neutral"}
                            >
                              {scale.isActive ? "Active" : "Archived"}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {scale.rules.length}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                disabled={isSaving}
                                onClick={() => void handleSetDefault(scale)}
                                size="sm"
                                type="button"
                                variant="secondary"
                              >
                                Set default
                              </Button>
                              <Button
                                disabled={isSaving}
                                onClick={() => {
                                  setEditingScale(scale);
                                  setEditingScaleName(scale.name);
                                }}
                                size="sm"
                                type="button"
                                variant="secondary"
                              >
                                Rename
                              </Button>
                              <Button
                                disabled={isSaving}
                                onClick={() =>
                                  void handleToggleScaleActive(scale)
                                }
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                {scale.isActive ? "Archive" : "Activate"}
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

      {editingScale ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Rename Grade Scale</CardTitle>
              <CardDescription>Update the scale name.</CardDescription>
            </div>
            <Button
              onClick={() => setEditingScale(null)}
              type="button"
              variant="secondary"
            >
              Close
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field htmlFor="edit-grade-scale-name" label="Name">
                <Input
                  id="edit-grade-scale-name"
                  onChange={(event) => setEditingScaleName(event.target.value)}
                  value={editingScaleName}
                />
              </Field>
            </div>
            <Button
              disabled={isSaving}
              onClick={() => void handleSaveScaleName()}
              type="button"
            >
              {isSaving ? "Saving..." : "Save name"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
          <CardDescription>
            {selectedScale
              ? `Manage percentage ranges for ${selectedScale.name}. Rules cannot overlap.`
              : "Select a grade scale above to manage its rules."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedScale ? (
            <EmptyState
              compact
              title="No grade scale selected"
              description="Pick a grade scale to view and edit its rules."
            />
          ) : (
            <div className="space-y-4">
              <form
                className="grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-4"
                onSubmit={handleCreateRule}
              >
                <Field htmlFor="create-rule-letter" label="Letter">
                  <Input
                    id="create-rule-letter"
                    onChange={(event) =>
                      setCreateRuleForm((current) => ({
                        ...current,
                        letterGrade: event.target.value,
                      }))
                    }
                    placeholder="A"
                    value={createRuleForm.letterGrade}
                  />
                </Field>
                <Field htmlFor="create-rule-min" label="Min %">
                  <Input
                    id="create-rule-min"
                    onChange={(event) =>
                      setCreateRuleForm((current) => ({
                        ...current,
                        minPercent: event.target.value,
                      }))
                    }
                    step="0.1"
                    type="number"
                    value={createRuleForm.minPercent}
                  />
                </Field>
                <Field htmlFor="create-rule-max" label="Max %">
                  <Input
                    id="create-rule-max"
                    onChange={(event) =>
                      setCreateRuleForm((current) => ({
                        ...current,
                        maxPercent: event.target.value,
                      }))
                    }
                    step="0.1"
                    type="number"
                    value={createRuleForm.maxPercent}
                  />
                </Field>
                <Field htmlFor="create-rule-order" label="Order">
                  <Input
                    id="create-rule-order"
                    onChange={(event) =>
                      setCreateRuleForm((current) => ({
                        ...current,
                        sortOrder: event.target.value,
                      }))
                    }
                    value={createRuleForm.sortOrder}
                  />
                </Field>
                <div className="md:col-span-4 flex justify-end">
                  <Button disabled={isSaving} type="submit">
                    {isSaving ? "Saving..." : "Add rule"}
                  </Button>
                </div>
              </form>

              {selectedScale.rules.length === 0 ? (
                <EmptyState
                  compact
                  title="No rules yet"
                  description="Add rules to map percent ranges to letter grades."
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50/80">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Letter
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Range
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Order
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {selectedScale.rules.map((rule) => (
                          <tr
                            className="align-top hover:bg-slate-50"
                            key={rule.id}
                          >
                            <td className="px-4 py-4 font-medium text-slate-900">
                              {rule.letterGrade}
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              {rule.minPercent} – {rule.maxPercent}
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              {rule.sortOrder}
                            </td>
                            <td className="px-4 py-4">
                              <Button
                                onClick={() => {
                                  setEditingRule(rule);
                                  setEditRuleForm(buildEditRuleForm(rule));
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
            </div>
          )}
        </CardContent>
      </Card>

      {editingRule && editRuleForm ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Edit Rule</CardTitle>
              <CardDescription>
                Update the selected rule range and letter grade.
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                setEditingRule(null);
                setEditRuleForm(null);
              }}
              type="button"
              variant="secondary"
            >
              Close
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <Field htmlFor="edit-rule-letter" label="Letter">
              <Input
                id="edit-rule-letter"
                onChange={(event) =>
                  setEditRuleForm((current) =>
                    current
                      ? { ...current, letterGrade: event.target.value }
                      : current,
                  )
                }
                value={editRuleForm.letterGrade}
              />
            </Field>
            <Field htmlFor="edit-rule-min" label="Min %">
              <Input
                id="edit-rule-min"
                onChange={(event) =>
                  setEditRuleForm((current) =>
                    current
                      ? { ...current, minPercent: event.target.value }
                      : current,
                  )
                }
                step="0.1"
                type="number"
                value={editRuleForm.minPercent}
              />
            </Field>
            <Field htmlFor="edit-rule-max" label="Max %">
              <Input
                id="edit-rule-max"
                onChange={(event) =>
                  setEditRuleForm((current) =>
                    current
                      ? { ...current, maxPercent: event.target.value }
                      : current,
                  )
                }
                step="0.1"
                type="number"
                value={editRuleForm.maxPercent}
              />
            </Field>
            <Field htmlFor="edit-rule-order" label="Order">
              <Input
                id="edit-rule-order"
                onChange={(event) =>
                  setEditRuleForm((current) =>
                    current
                      ? { ...current, sortOrder: event.target.value }
                      : current,
                  )
                }
                value={editRuleForm.sortOrder}
              />
            </Field>
            <div className="md:col-span-4 flex justify-end gap-3">
              <Button
                disabled={isSaving}
                onClick={() => void handleSaveRule()}
                type="button"
              >
                {isSaving ? "Saving..." : "Save rule"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
