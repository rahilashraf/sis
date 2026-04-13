"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import {
  activateAssessment,
  archiveAssessment,
  createAssessment,
  listAssessments,
  listAssessmentTypes,
  updateAssessment,
  type Assessment,
  type AssessmentType,
} from "@/lib/api/assessments";
import { getClassById, type SchoolClass } from "@/lib/api/classes";
import { listReportingPeriods, type ReportingPeriod } from "@/lib/api/reporting-periods";
import {
  createAssessmentCategory,
  getGradebookSettings,
  listAssessmentCategories,
  updateAssessmentCategory,
  updateGradebookSettings,
  type AssessmentCategory,
  type GradebookSettings,
} from "@/lib/api/gradebook";
import { formatDateLabel, getLocalDateInputValue } from "@/lib/utils";

type Mode = "teacher" | "admin";

type AssessmentFormState = {
  mode: "create" | "edit";
  assessmentId: string | null;
  title: string;
  assessmentTypeId: string;
  categoryId: string;
  maxScore: string;
  weight: string;
  dueDate: string;
  isPublishedToParents: boolean;
};

const CALCULATION_METHOD_LABELS = {
  UNWEIGHTED: "Equal weighting",
  ASSESSMENT_WEIGHTED: "Weighted by assessment",
  CATEGORY_WEIGHTED: "Weighted by category",
} as const;

function buildDefaultForm(types: AssessmentType[]): AssessmentFormState {
  return {
    mode: "create",
    assessmentId: null,
    title: "",
    assessmentTypeId: types[0]?.id ?? "",
    categoryId: "",
    maxScore: "10",
    weight: "100",
    dueDate: "",
    isPublishedToParents: false,
  };
}

function buildEditForm(assessment: Assessment): AssessmentFormState {
  const dueDate = assessment.dueAt ? getLocalDateInputValue(new Date(assessment.dueAt)) : "";

  return {
    mode: "edit",
    assessmentId: assessment.id,
    title: assessment.title,
    assessmentTypeId: assessment.assessmentTypeId,
    categoryId: assessment.categoryId ?? "",
    maxScore: `${assessment.maxScore}`,
    weight: `${assessment.weight ?? 1}`,
    dueDate,
    isPublishedToParents: assessment.isPublishedToParents,
  };
}

export function AssignmentsWorkspace({ mode, classId }: { mode: Mode; classId: string }) {
  const [schoolClass, setSchoolClass] = useState<SchoolClass | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentTypes, setAssessmentTypes] = useState<AssessmentType[]>([]);
  const [reportingPeriods, setReportingPeriods] = useState<ReportingPeriod[]>([]);
  const [formState, setFormState] = useState<AssessmentFormState>(() => buildDefaultForm([]));
  const [gradebookSettings, setGradebookSettings] = useState<GradebookSettings | null>(null);
  const [categories, setCategories] = useState<AssessmentCategory[]>([]);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categorySuccess, setCategorySuccess] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryWeight, setNewCategoryWeight] = useState("100");
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(true);

  const [includeInactive, setIncludeInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedFormReportingPeriod = useMemo(() => {
    if (!formState.dueDate) {
      return null;
    }

    const dueDate = new Date(`${formState.dueDate}T12:00:00`);
    if (Number.isNaN(dueDate.getTime())) {
      return null;
    }

    return (
      reportingPeriods.find((period) => {
        const startsAt = new Date(period.startsAt);
        const endsAt = new Date(period.endsAt);
        return startsAt <= dueDate && dueDate <= endsAt;
      }) ?? null
    );
  }, [formState.dueDate, reportingPeriods]);

  const isFormLocked = selectedFormReportingPeriod?.isLocked ?? false;
  const isEditingArchived = formState.mode === "edit" && Boolean(formState.assessmentId)
    ? assessments.find((entry) => entry.id === formState.assessmentId)?.isActive === false
    : false;

  const weightingMode: GradebookSettings["weightingMode"] =
    gradebookSettings?.weightingMode ?? "UNWEIGHTED";
  const weightingModeLabel = CALCULATION_METHOD_LABELS[weightingMode];
  const isCategoryWeighted = weightingMode === "CATEGORY_WEIGHTED";
  const isAssessmentWeighted = weightingMode === "ASSESSMENT_WEIGHTED";
  const dueDateHasNoMatchingReportingPeriod =
    Boolean(formState.dueDate) && !selectedFormReportingPeriod;

  const activeCategories = useMemo(
    () => categories.filter((category) => category.isActive),
    [categories],
  );

  const categoryById = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category]));
  }, [categories]);

  const activeAssessmentsMissingCategory = useMemo(() => {
    if (!isCategoryWeighted) {
      return [];
    }

    return assessments.filter((assessment) => assessment.isActive && !assessment.categoryId);
  }, [assessments, isCategoryWeighted]);

  const activeAssessmentWeightTotal = useMemo(
    () =>
      assessments
        .filter((assessment) => assessment.isActive)
        .reduce((sum, assessment) => sum + (assessment.weight ?? 0), 0),
    [assessments],
  );

  const activeCategoryWeightTotal = useMemo(
    () =>
      activeCategories.reduce(
        (sum, category) => sum + (category.weight ?? 0),
        0,
      ),
    [activeCategories],
  );

  const isAssessmentWeightTotalValid = Math.abs(activeAssessmentWeightTotal - 100) < 0.001;
  const isCategoryWeightTotalValid = Math.abs(activeCategoryWeightTotal - 100) < 0.001;

  async function refresh() {
    const [classResult, settingsResult, categoriesResult, assessmentsResult] = await Promise.allSettled([
      getClassById(classId),
      getGradebookSettings(classId),
      listAssessmentCategories(classId, { includeInactive: true }),
      listAssessments(classId, { includeInactive }),
    ]);

    if (classResult.status === "fulfilled") {
      setSchoolClass(classResult.value);
    }

    if (settingsResult.status === "fulfilled") {
      setGradebookSettings(settingsResult.value);
    }

    if (categoriesResult.status === "fulfilled") {
      setCategories(categoriesResult.value);
    }

    if (assessmentsResult.status === "fulfilled") {
      setAssessments(assessmentsResult.value);
    } else {
      setAssessments([]);
      setError(
        assessmentsResult.reason instanceof Error
          ? assessmentsResult.reason.message
          : "Unable to load assessments.",
      );
    }
  }

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);
      setSettingsError(null);
      setCategoryError(null);
      setCategorySuccess(null);

      try {
        const classResponse = await getClassById(classId);
        setSchoolClass(classResponse);

        const [typesResponse, periodsResponse, settingsResponse, categoriesResponse, assessmentsResponse] = await Promise.all([
          listAssessmentTypes({ schoolId: classResponse.schoolId }),
          listReportingPeriods({ schoolId: classResponse.schoolId, schoolYearId: classResponse.schoolYearId }),
          getGradebookSettings(classId),
          listAssessmentCategories(classId, { includeInactive: true }),
          listAssessments(classId, { includeInactive }),
        ]);

        setAssessmentTypes(typesResponse);
        setReportingPeriods(periodsResponse);
        setGradebookSettings(settingsResponse);
        setCategories(categoriesResponse);
        setAssessments(assessmentsResponse);
        setFormState((current) => (current.mode === "edit" ? current : buildDefaultForm(typesResponse)));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load assignments.");
        setAssessmentTypes([]);
        setReportingPeriods([]);
        setGradebookSettings(null);
        setCategories([]);
        setAssessments([]);
        setFormState(buildDefaultForm([]));
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [classId, includeInactive]);

  async function handleUpdateWeightingMode(nextMode: GradebookSettings["weightingMode"]) {
    if (!gradebookSettings) {
      return;
    }

    setIsSavingSettings(true);
    setSettingsError(null);
    setSuccessMessage(null);

    try {
      const response = await updateGradebookSettings(classId, { weightingMode: nextMode });
      setGradebookSettings((current) =>
        current ? { ...current, weightingMode: response.weightingMode } : current,
      );
      setSuccessMessage("Gradebook settings updated.");
      await refresh();
    } catch (saveError) {
      setSettingsError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update gradebook settings.",
      );
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setCategoryError(null);
    setCategorySuccess(null);

    try {
      const name = newCategoryName.trim();
      if (!name) {
        throw new Error("Category name is required.");
      }

      const rawWeight = newCategoryWeight.trim();
      const weight = rawWeight.length === 0 ? null : Number(rawWeight);
      if (weight !== null && (!Number.isFinite(weight) || weight <= 0)) {
        throw new Error("Category percent must be a positive number.");
      }

      await createAssessmentCategory(classId, { name, weight: weight ?? undefined });
      const refreshed = await listAssessmentCategories(classId, { includeInactive: true });
      setCategories(refreshed);
      setNewCategoryName("");
      setNewCategoryWeight("100");
      setCategorySuccess("Category created.");
    } catch (createError) {
      setCategoryError(
        createError instanceof Error ? createError.message : "Unable to create category.",
      );
    }
  }

  async function handleUpdateCategory(
    categoryId: string,
    input: Parameters<typeof updateAssessmentCategory>[1],
  ) {
    setCategoryError(null);
    setCategorySuccess(null);

    try {
      await updateAssessmentCategory(categoryId, input);
      const refreshed = await listAssessmentCategories(classId, { includeInactive: true });
      setCategories(refreshed);
      setCategorySuccess("Category updated.");
    } catch (updateError) {
      setCategoryError(
        updateError instanceof Error ? updateError.message : "Unable to update category.",
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const title = formState.title.trim();
      if (!title) {
        throw new Error("Title is required.");
      }

      const maxScore = Number(formState.maxScore);
      if (!Number.isFinite(maxScore) || maxScore <= 0) {
        throw new Error("Max score must be a positive number.");
      }

      const selectedCategoryId = formState.categoryId.trim() || null;
      if (isCategoryWeighted && !selectedCategoryId) {
        throw new Error("Category is required for category-weighted classes.");
      }

      if (dueDateHasNoMatchingReportingPeriod) {
        throw new Error("No reporting period matches the selected due date.");
      }

      if (isFormLocked) {
        throw new Error("This reporting period is locked.");
      }

      let weight: number | undefined = undefined;
      if (isAssessmentWeighted) {
        const parsed = Number(formState.weight);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error("Assessment percent must be a positive number.");
        }
        weight = parsed;
      }

      const categoryPatch =
        formState.mode === "edit" ? { categoryId: selectedCategoryId } : {};

      const basePayload = {
        title,
        assessmentTypeId: formState.assessmentTypeId,
        maxScore,
        ...(isAssessmentWeighted ? { weight } : {}),
        dueAt: formState.dueDate ? new Date(formState.dueDate).toISOString() : undefined,
        isPublishedToParents: formState.isPublishedToParents,
      };

      if (formState.mode === "create") {
        await createAssessment({
          classId,
          ...basePayload,
          ...(selectedCategoryId ? { categoryId: selectedCategoryId } : {}),
        });
        setSuccessMessage("Assessment created.");
      } else if (formState.assessmentId) {
        await updateAssessment(formState.assessmentId, {
          ...basePayload,
          ...categoryPatch,
        });
        setSuccessMessage("Assessment updated.");
      }

      await refresh();
      setFormState(buildDefaultForm(assessmentTypes));
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to save assessment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTogglePublish(assessment: Assessment) {
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await updateAssessment(assessment.id, { isPublishedToParents: !assessment.isPublishedToParents });
      await refresh();
      setSuccessMessage(assessment.isPublishedToParents ? "Hidden from parents." : "Published to parents.");
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update publish status.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleArchiveToggle(assessment: Assessment) {
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (assessment.isActive) {
        await archiveAssessment(assessment.id);
        setSuccessMessage("Assessment archived.");
      } else {
        await activateAssessment(assessment.id);
        setSuccessMessage("Assessment activated.");
      }
      await refresh();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update assessment status.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading assignments...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description={schoolClass ? `${schoolClass.name} • Manage assessments` : "Manage class assessments"}
        meta={
          <>
            <Badge variant="neutral">{assessments.length} items</Badge>
            <Badge variant="neutral">Method: {weightingModeLabel}</Badge>
            {activeAssessmentsMissingCategory.length > 0 ? (
              <Badge variant="warning">{activeAssessmentsMissingCategory.length} uncategorized</Badge>
            ) : null}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setIsCreateFormOpen(true);
                document.getElementById("assessment-form-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              type="button"
              variant="secondary"
            >
              Add assessment
            </Button>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/${mode}/gradebook?classId=${encodeURIComponent(classId)}`}
            >
              Enter scores
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={mode === "admin" ? `/admin/classes/${classId}/summary` : `/teacher/classes/${classId}`}
            >
              Class summary
            </Link>
          </div>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {settingsError ? <Notice tone="danger">{settingsError}</Notice> : null}
      {categoryError ? <Notice tone="danger">{categoryError}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}
      {categorySuccess ? <Notice tone="success">{categorySuccess}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Current assessments</CardTitle>
          <CardDescription>
            Review existing assessments before adding new ones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {assessments.length === 0 ? (
            <EmptyState
              compact
              title="No assessments yet"
              description="Create the first assessment to start entering scores."
            />
          ) : (
            <div className="space-y-2">
              {assessments.slice(0, 6).map((assessment) => (
                <button
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  key={assessment.id}
                  onClick={() => {
                    setFormState(buildEditForm(assessment));
                    setIsCreateFormOpen(true);
                    document.getElementById("assessment-form-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  type="button"
                >
                  <span className="font-medium text-slate-900">{assessment.title}</span>
                  <span className="text-xs text-slate-500">
                    Max {assessment.maxScore}
                    {assessment.dueAt ? ` • ${formatDateLabel(assessment.dueAt)}` : ""}
                  </span>
                </button>
              ))}
              {assessments.length > 6 ? (
                <p className="text-xs text-slate-500">
                  Showing 6 of {assessments.length} assessments. Full list appears below.
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gradebook setup</CardTitle>
          <CardDescription>
            Setup controls are separate from daily grading. Choose a calculation method, then manage categories if needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field htmlFor="gradebook-weighting-mode" label="Calculation method">
            <Select
              disabled={!gradebookSettings || isSavingSettings}
              id="gradebook-weighting-mode"
              onChange={(event) =>
                void handleUpdateWeightingMode(event.target.value as GradebookSettings["weightingMode"])
              }
              value={weightingMode}
            >
              <option value="UNWEIGHTED">{CALCULATION_METHOD_LABELS.UNWEIGHTED}</option>
              <option value="ASSESSMENT_WEIGHTED">{CALCULATION_METHOD_LABELS.ASSESSMENT_WEIGHTED}</option>
              <option value="CATEGORY_WEIGHTED">{CALCULATION_METHOD_LABELS.CATEGORY_WEIGHTED}</option>
            </Select>
          </Field>
          <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <p className="font-semibold text-slate-900">Notes</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
              <li>{CALCULATION_METHOD_LABELS.UNWEIGHTED}: all assessments count equally.</li>
              <li>{CALCULATION_METHOD_LABELS.ASSESSMENT_WEIGHTED}: assessment weights are entered as percent of final grade.</li>
              <li>{CALCULATION_METHOD_LABELS.CATEGORY_WEIGHTED}: category weights are entered as percent of final grade.</li>
              {isCategoryWeighted ? (
                <li>In weighted by category mode, assessments within a category count equally.</li>
              ) : null}
            </ul>
          </div>
        </CardContent>
      </Card>

      {isAssessmentWeighted ? (
        <Notice tone={isAssessmentWeightTotalValid ? "info" : "warning"}>
          Assessment weight total: <strong>{activeAssessmentWeightTotal.toFixed(1)}%</strong>
          {isAssessmentWeightTotalValid ? " (ready)" : " (target: 100%)."}
        </Notice>
      ) : null}

      {isCategoryWeighted ? (
        <Notice tone={isCategoryWeightTotalValid ? "info" : "warning"}>
          Category weight total: <strong>{activeCategoryWeightTotal.toFixed(1)}%</strong>
          {isCategoryWeightTotalValid ? " (ready)" : " (target: 100%)."}
        </Notice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Assessment categories</CardTitle>
          <CardDescription>
            {isCategoryWeighted
              ? "Category weights are active for calculations."
              : "Categories are optional unless using weighted by category."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-3 md:grid-cols-3" onSubmit={handleCreateCategory}>
            <Field htmlFor="new-category-name" label="Name">
              <Input
                id="new-category-name"
                onChange={(event) => setNewCategoryName(event.target.value)}
                value={newCategoryName}
              />
            </Field>
            <Field htmlFor="new-category-weight" label="Percent of final grade (%)">
              <Input
                disabled={!isCategoryWeighted}
                id="new-category-weight"
                inputMode="decimal"
                onChange={(event) => setNewCategoryWeight(event.target.value)}
                value={newCategoryWeight}
              />
            </Field>
            <div className="self-end">
              <Button disabled={isSubmitting} type="submit" variant="secondary">
                Add category
              </Button>
            </div>
          </form>

          {categories.length === 0 ? (
            <EmptyState
              compact
              title="No categories"
              description="Create categories to support category-weighted mode."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">Category</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Percent of final grade</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {categories.map((category) => (
                      <tr className="align-top" key={category.id}>
                        <td className="px-4 py-3 text-slate-900">{category.name}</td>
                        <td className="px-4 py-3">
                          <Input
                            aria-label={`Weight for ${category.name}`}
                            className="h-9 w-28 rounded-lg px-2 text-right tabular-nums"
                            disabled={!isCategoryWeighted}
                            key={`${category.id}:${category.updatedAt}`}
                            defaultValue={category.weight === null ? "" : String(category.weight)}
                            inputMode="decimal"
                            onBlur={(event) => {
                              if (!isCategoryWeighted) {
                                return;
                              }
                              const raw = event.target.value.trim();
                              if (!raw) {
                                void handleUpdateCategory(category.id, { weight: null });
                                return;
                              }
                              const parsed = Number(raw);
                              if (!Number.isFinite(parsed) || parsed <= 0) {
                                setCategoryError("Category percent must be a positive number.");
                                return;
                              }
                              void handleUpdateCategory(category.id, { weight: parsed });
                            }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            aria-label={`Active status for ${category.name}`}
                            onChange={(event) =>
                              void handleUpdateCategory(category.id, { isActive: event.target.value === "true" })
                            }
                            value={category.isActive ? "true" : "false"}
                          >
                            <option value="true">Active</option>
                            <option value="false">Inactive</option>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {weightingMode === "CATEGORY_WEIGHTED" && activeCategories.length === 0 ? (
            <Notice tone="warning">At least one active category is required for category weighting.</Notice>
          ) : null}
          {weightingMode === "CATEGORY_WEIGHTED" && activeAssessmentsMissingCategory.length > 0 ? (
            <Notice tone="warning">
              {activeAssessmentsMissingCategory.length} active assessment(s) are missing a category. Edit them below before enabling category weighting.
            </Notice>
          ) : null}
          {!isCategoryWeighted ? (
            <Notice tone="info">
              Category weights are ignored unless calculation method is <strong>Weighted by category</strong>.
            </Notice>
          ) : null}
        </CardContent>
      </Card>

      <Card id="assessment-form-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{formState.mode === "create" ? "Add assessment" : "Edit assessment"}</CardTitle>
            <CardDescription>
              Reporting period is assigned automatically from the selected due date.
            </CardDescription>
          </div>
          <Button
            onClick={() => setIsCreateFormOpen((current) => !current)}
            type="button"
            variant="secondary"
          >
            {isCreateFormOpen ? "Hide form" : "Show form"}
          </Button>
        </CardHeader>
        {isCreateFormOpen ? (
        <CardContent>
          {isEditingArchived ? (
            <Notice tone="warning">This assessment is archived. Activate it before editing.</Notice>
          ) : null}
          {isFormLocked ? (
            <Notice tone="warning">Selected reporting period is locked. Editing is read-only.</Notice>
          ) : null}
          {dueDateHasNoMatchingReportingPeriod ? (
            <Notice tone="danger">No reporting period matches the selected due date.</Notice>
          ) : null}

          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <Field htmlFor="assessment-title" label="Title">
              <Input
                id="assessment-title"
                onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
                required
                value={formState.title}
              />
            </Field>

            <Field htmlFor="assessment-type" label="Type">
              <Select
                id="assessment-type"
                onChange={(event) => setFormState((current) => ({ ...current, assessmentTypeId: event.target.value }))}
                value={formState.assessmentTypeId}
              >
                {assessmentTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="assessment-category" label="Category">
              <Select
                disabled={isFormLocked || isEditingArchived || categories.length === 0}
                id="assessment-category"
                onChange={(event) => setFormState((current) => ({ ...current, categoryId: event.target.value }))}
                value={formState.categoryId}
              >
                <option value="">
                  {weightingMode === "CATEGORY_WEIGHTED" ? "Select category" : "No category"}
                </option>
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="assessment-due" label="Due date">
              <Input
                id="assessment-due"
                onChange={(event) => setFormState((current) => ({ ...current, dueDate: event.target.value }))}
                type="date"
                value={formState.dueDate}
              />
            </Field>

            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 md:col-span-2">
              <p>Reporting period is assigned automatically from the selected date.</p>
              <p className="mt-1 font-medium text-slate-700">
                {formState.dueDate
                  ? selectedFormReportingPeriod
                    ? `Matched reporting period: ${selectedFormReportingPeriod.order}. ${selectedFormReportingPeriod.name}${selectedFormReportingPeriod.isLocked ? " (Locked)" : ""}`
                    : "No matching reporting period for this date."
                  : "Select a due date to preview reporting period assignment."}
              </p>
            </div>

            <Field htmlFor="assessment-max" label="Max score">
              <Input
                id="assessment-max"
                inputMode="decimal"
                onChange={(event) => setFormState((current) => ({ ...current, maxScore: event.target.value }))}
                type="number"
                value={formState.maxScore}
              />
            </Field>

            {isAssessmentWeighted ? (
              <Field htmlFor="assessment-weight" label="Percent of final grade (%)">
                <Input
                  id="assessment-weight"
                  inputMode="decimal"
                  onChange={(event) => setFormState((current) => ({ ...current, weight: event.target.value }))}
                  type="number"
                  value={formState.weight}
                />
              </Field>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                {isCategoryWeighted
                  ? "Assessment weight is disabled in weighted by category mode."
                  : "Weight input is hidden in equal weighting mode."}
              </div>
            )}

            <div className="md:col-span-2">
              <CheckboxField
                checked={formState.isPublishedToParents}
                description="When enabled, this assessment is visible in the parent portal."
                label="Published to parents"
                onChange={(event) => setFormState((current) => ({ ...current, isPublishedToParents: event.target.checked }))}
              />
            </div>

            <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
              {formState.mode === "edit" ? (
                <Button
                  disabled={isSubmitting}
                  onClick={() => setFormState(buildDefaultForm(assessmentTypes))}
                  type="button"
                  variant="secondary"
                >
                  New assessment
                </Button>
              ) : null}
              <Button disabled={isSubmitting || isFormLocked || isEditingArchived} type="submit">
                {isSubmitting ? "Saving..." : formState.mode === "create" ? "Create" : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Assessment List</CardTitle>
            <CardDescription>Compact list of active and archived assessments.</CardDescription>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
              type="checkbox"
            />
            Show archived
          </label>
        </CardHeader>
        <CardContent>
          {assessments.length === 0 ? (
            <EmptyState
              title="No assessments yet"
              description="Create the first assessment to start entering grades for this class."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">Title</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Type</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Reporting period</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Category</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Due</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Max</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Weight %</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Parents</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {assessments.map((assessment) => (
                      <tr className="align-top hover:bg-slate-50" key={assessment.id}>
                        <td className="px-4 py-3">
                          <button
                            className="text-left font-medium text-slate-900 hover:underline"
                            onClick={() => setFormState(buildEditForm(assessment))}
                            type="button"
                          >
                            {assessment.title}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{assessment.assessmentType.name}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {assessment.reportingPeriodId
                            ? (() => {
                                const period = reportingPeriods.find((p) => p.id === assessment.reportingPeriodId);
                                return period ? `${period.order}. ${period.name}${period.isLocked ? " (Locked)" : ""}` : "—";
                              })()
                            : "Unassigned"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {assessment.categoryId
                            ? categoryById.get(assessment.categoryId)?.name ?? "—"
                            : weightingMode === "CATEGORY_WEIGHTED"
                              ? "Required"
                              : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {assessment.dueAt ? formatDateLabel(assessment.dueAt) : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{assessment.maxScore}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {assessment.weight === null || assessment.weight === undefined
                            ? "—"
                            : `${assessment.weight}%`}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={assessment.isPublishedToParents ? "success" : "neutral"}>
                            {assessment.isPublishedToParents ? "Visible" : "Hidden"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={assessment.isActive ? "success" : "neutral"}>
                            {assessment.isActive ? "Active" : "Archived"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              disabled={isSubmitting}
                              onClick={() => setFormState(buildEditForm(assessment))}
                              size="sm"
                              type="button"
                              variant="secondary"
                            >
                              Edit
                            </Button>
                            <Button
                              disabled={isSubmitting || !assessment.isActive}
                              onClick={() => void handleTogglePublish(assessment)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              {assessment.isPublishedToParents ? "Unpublish" : "Publish"}
                            </Button>
                            <Button
                              disabled={isSubmitting}
                              onClick={() => void handleArchiveToggle(assessment)}
                              size="sm"
                              type="button"
                              variant={assessment.isActive ? "danger" : "secondary"}
                            >
                              {assessment.isActive ? "Archive" : "Activate"}
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
  );
}
