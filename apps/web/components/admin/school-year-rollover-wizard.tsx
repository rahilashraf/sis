"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import {
  executeSchoolYearRollover,
  listSchools,
  listSchoolYears,
  previewSchoolYearRollover,
  type School,
  type SchoolYear,
  type SchoolYearRolloverExecuteResult,
  type SchoolYearRolloverInput,
  type SchoolYearRolloverPreview,
} from "@/lib/api/schools";
import { formatDateLabel } from "@/lib/utils";
import { parseDateOnly } from "@/lib/date";

const allowedRoles = new Set(["OWNER", "SUPER_ADMIN"]);

type WizardFormState = {
  schoolId: string;
  sourceSchoolYearId: string;
  targetSchoolYearName: string;
  targetStartDate: string;
  targetEndDate: string;
  copyGradeLevels: boolean;
  copyClassTemplates: boolean;
  promoteStudents: boolean;
  graduateFinalGradeStudents: boolean;
  archivePriorYearLeftovers: boolean;
  activateTargetSchoolYear: boolean;
};

function toDateInputValue(value: string) {
  return value.slice(0, 10);
}

function addCalendarYear(value: string) {
  const parsed = parseDateOnly(value);
  if (!parsed) {
    return "";
  }

  const next = new Date(parsed);
  next.setFullYear(next.getFullYear() + 1);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function suggestNextSchoolYearName(sourceName: string) {
  const yearRangeMatch = sourceName.match(/(\d{4})\s*[-/]\s*(\d{4})/);
  if (yearRangeMatch) {
    const start = Number.parseInt(yearRangeMatch[1], 10);
    const end = Number.parseInt(yearRangeMatch[2], 10);
    if (!Number.isNaN(start) && !Number.isNaN(end)) {
      return `${start + 1}-${end + 1}`;
    }
  }

  const singleYearMatch = sourceName.match(/(\d{4})/);
  if (singleYearMatch) {
    const year = Number.parseInt(singleYearMatch[1], 10);
    if (!Number.isNaN(year)) {
      return sourceName.replace(singleYearMatch[1], String(year + 1));
    }
  }

  return `${sourceName} (Next)`;
}

function buildInitialForm(): WizardFormState {
  return {
    schoolId: "",
    sourceSchoolYearId: "",
    targetSchoolYearName: "",
    targetStartDate: "",
    targetEndDate: "",
    copyGradeLevels: true,
    copyClassTemplates: true,
    promoteStudents: true,
    graduateFinalGradeStudents: true,
    archivePriorYearLeftovers: true,
    activateTargetSchoolYear: true,
  };
}

export function SchoolYearRolloverWizard() {
  const { session } = useAuth();
  const searchParams = useSearchParams();
  const schoolIdFromQuery = searchParams.get("schoolId") ?? "";

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [form, setForm] = useState<WizardFormState>(buildInitialForm());
  const [preview, setPreview] = useState<SchoolYearRolloverPreview | null>(null);
  const [executionResult, setExecutionResult] =
    useState<SchoolYearRolloverExecuteResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSchoolYears, setIsLoadingSchoolYears] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [hasReviewedPlan, setHasReviewedPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canManage = session?.user.role
    ? allowedRoles.has(session.user.role)
    : false;

  useEffect(() => {
    async function loadSchools() {
      setIsLoading(true);
      try {
        const response = await listSchools();
        setSchools(response);

        const preferredSchoolId = response.some(
          (school) => school.id === schoolIdFromQuery,
        )
          ? schoolIdFromQuery
          : (response[0]?.id ?? "");

        setForm((current) => ({
          ...current,
          schoolId: preferredSchoolId,
        }));
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
  }, [schoolIdFromQuery]);

  useEffect(() => {
    async function loadSchoolYearsForSchool() {
      if (!form.schoolId) {
        setSchoolYears([]);
        return;
      }

      setIsLoadingSchoolYears(true);
      try {
        const response = await listSchoolYears(form.schoolId, {
          includeInactive: true,
        });
        setSchoolYears(response);

        const activeYear = response.find((schoolYear) => schoolYear.isActive);
        const fallbackYear = activeYear ?? response[0] ?? null;

        setForm((current) => {
          const source = fallbackYear;
          if (!source) {
            return {
              ...current,
              sourceSchoolYearId: "",
              targetSchoolYearName: "",
              targetStartDate: "",
              targetEndDate: "",
            };
          }

          return {
            ...current,
            sourceSchoolYearId: source.id,
            targetSchoolYearName: suggestNextSchoolYearName(source.name),
            targetStartDate: addCalendarYear(toDateInputValue(source.startDate)),
            targetEndDate: addCalendarYear(toDateInputValue(source.endDate)),
          };
        });
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load school years.",
        );
      } finally {
        setIsLoadingSchoolYears(false);
      }
    }

    void loadSchoolYearsForSchool();
  }, [form.schoolId]);

  function buildPayload(): SchoolYearRolloverInput {
    return {
      schoolId: form.schoolId,
      sourceSchoolYearId: form.sourceSchoolYearId,
      targetSchoolYearName: form.targetSchoolYearName.trim(),
      targetStartDate: form.targetStartDate,
      targetEndDate: form.targetEndDate,
      copyGradeLevels: form.copyGradeLevels,
      copyClassTemplates: form.copyClassTemplates,
      promoteStudents: form.promoteStudents,
      graduateFinalGradeStudents: form.graduateFinalGradeStudents,
      archivePriorYearLeftovers: form.archivePriorYearLeftovers,
      activateTargetSchoolYear: form.activateTargetSchoolYear,
    };
  }

  function validateFormState() {
    if (!form.schoolId) {
      throw new Error("Select a school.");
    }

    if (!form.sourceSchoolYearId) {
      throw new Error("Select the source school year.");
    }

    if (!form.targetSchoolYearName.trim()) {
      throw new Error("Target school year name is required.");
    }

    const startDate = parseDateOnly(form.targetStartDate);
    const endDate = parseDateOnly(form.targetEndDate);

    if (!startDate || !endDate) {
      throw new Error("Target start and end dates are required.");
    }

    if (endDate.getTime() <= startDate.getTime()) {
      throw new Error("Target end date must be after target start date.");
    }
  }

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setExecutionResult(null);
    setHasReviewedPlan(false);

    try {
      validateFormState();
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Please complete all required fields.",
      );
      return;
    }

    setIsPreviewing(true);
    try {
      const response = await previewSchoolYearRollover(buildPayload());
      setPreview(response);
      setSuccessMessage("Preview generated. Review and execute when ready.");
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Unable to generate rollover preview.",
      );
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleExecute() {
    if (!canManage || !preview || !hasReviewedPlan) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsExecuting(true);

    try {
      const response = await executeSchoolYearRollover(buildPayload());
      setExecutionResult(response);
      setSuccessMessage("Rollover executed successfully.");
      const refreshedYears = await listSchoolYears(form.schoolId, {
        includeInactive: true,
      });
      setSchoolYears(refreshedYears);
    } catch (executeError) {
      setError(
        executeError instanceof Error
          ? executeError.message
          : "Unable to execute rollover.",
      );
    } finally {
      setIsExecuting(false);
    }
  }

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="School Year Rollover"
          description="This workflow is limited to owner and super admin roles."
        />
        <Notice tone="info">
          Your role can view school-year data but cannot run rollover operations.
        </Notice>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Year Rollover"
        description="Preview-first wizard to create the next school year, carry templates forward, and transition students safely."
        meta={
          <Badge variant="neutral">
            {preview ? "Step 2: Review" : "Step 1: Configure"}
          </Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Rollover Setup</CardTitle>
          <CardDescription>
            Choose source year and target details, then generate a dry-run preview.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handlePreview}>
            <Field htmlFor="rollover-school" label="School">
              <Select
                id="rollover-school"
                onChange={(event) => {
                  const schoolId = event.target.value;
                  setForm((current) => ({ ...current, schoolId }));
                  setPreview(null);
                  setExecutionResult(null);
                }}
                value={form.schoolId}
              >
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="rollover-source-year" label="Source school year">
              <Select
                disabled={!form.schoolId || isLoadingSchoolYears}
                id="rollover-source-year"
                onChange={(event) => {
                  const nextSourceId = event.target.value;
                  const sourceYear = schoolYears.find(
                    (schoolYear) => schoolYear.id === nextSourceId,
                  );

                  setForm((current) => ({
                    ...current,
                    sourceSchoolYearId: nextSourceId,
                    targetSchoolYearName: sourceYear
                      ? suggestNextSchoolYearName(sourceYear.name)
                      : current.targetSchoolYearName,
                    targetStartDate: sourceYear
                      ? addCalendarYear(toDateInputValue(sourceYear.startDate))
                      : current.targetStartDate,
                    targetEndDate: sourceYear
                      ? addCalendarYear(toDateInputValue(sourceYear.endDate))
                      : current.targetEndDate,
                  }));
                  setPreview(null);
                  setExecutionResult(null);
                }}
                value={form.sourceSchoolYearId}
              >
                <option value="">Select source school year</option>
                {schoolYears.map((schoolYear) => (
                  <option key={schoolYear.id} value={schoolYear.id}>
                    {schoolYear.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="rollover-target-name" label="Target school year name">
              <Input
                id="rollover-target-name"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetSchoolYearName: event.target.value,
                  }))
                }
                required
                value={form.targetSchoolYearName}
              />
            </Field>

            <div />

            <Field htmlFor="rollover-target-start-date" label="Target start date">
              <Input
                id="rollover-target-start-date"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetStartDate: event.target.value,
                  }))
                }
                required
                type="date"
                value={form.targetStartDate}
              />
            </Field>

            <Field htmlFor="rollover-target-end-date" label="Target end date">
              <Input
                id="rollover-target-end-date"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetEndDate: event.target.value,
                  }))
                }
                required
                type="date"
                value={form.targetEndDate}
              />
            </Field>

            <div className="grid gap-3 rounded-xl border border-slate-200 p-4 md:col-span-2">
              <CheckboxField
                checked={form.copyGradeLevels}
                description="Reactivates inactive grade levels still referenced by source classes or students."
                label="Copy grade levels"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    copyGradeLevels: event.target.checked,
                  }))
                }
              />
              <CheckboxField
                checked={form.copyClassTemplates}
                description="Copies active class structures into the target year and skips duplicates automatically."
                label="Copy class templates"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    copyClassTemplates: event.target.checked,
                  }))
                }
              />
              <CheckboxField
                checked={form.promoteStudents}
                description="Moves students with a next grade level to that grade."
                label="Promote students"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    promoteStudents: event.target.checked,
                  }))
                }
              />
              <CheckboxField
                checked={form.graduateFinalGradeStudents}
                description="Marks final-grade students as graduated in enrollment history."
                label="Graduate final grade students"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    graduateFinalGradeStudents: event.target.checked,
                  }))
                }
              />
              <CheckboxField
                checked={form.archivePriorYearLeftovers}
                description="Ends the source school year and archives active classes in that source year."
                label="Archive prior-year leftovers"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    archivePriorYearLeftovers: event.target.checked,
                  }))
                }
              />
              <CheckboxField
                checked={form.activateTargetSchoolYear}
                description="Makes the target year active after execution."
                label="Activate target school year"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    activateTargetSchoolYear: event.target.checked,
                  }))
                }
              />
            </div>

            <div className="md:col-span-2 flex justify-end">
              <Button
                disabled={isPreviewing || isLoading || isLoadingSchoolYears}
                type="submit"
              >
                {isPreviewing ? "Generating Preview..." : "Generate Preview"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>Review & Execute</CardTitle>
            <CardDescription>
              Confirm this plan before executing. Source: {preview.sourceSchoolYear.name} ({formatDateLabel(preview.sourceSchoolYear.startDate)} - {formatDateLabel(preview.sourceSchoolYear.endDate)}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Badge variant="neutral">Grade levels to reactivate: {preview.summary.gradeLevelsToReactivate}</Badge>
              <Badge variant="neutral">Class templates to create: {preview.summary.classTemplatesToCreate}</Badge>
              <Badge variant="neutral">Templates already present: {preview.summary.classTemplatesAlreadyPresent}</Badge>
              <Badge variant="neutral">Students to promote: {preview.summary.promotableStudents}</Badge>
              <Badge variant="neutral">Students to graduate: {preview.summary.graduatingStudents}</Badge>
              <Badge variant="neutral">Classes to archive: {preview.summary.activeClassesToArchiveFromSource}</Badge>
            </div>

            {preview.warnings.length > 0 ? (
              <Notice tone="warning">
                <div className="space-y-2">
                  <p className="font-medium">Warnings</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {preview.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </Notice>
            ) : null}

            <Notice tone="info">
              <div className="space-y-2">
                <p className="font-medium">Reversibility notes</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {preview.reversibleNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </Notice>

            <CheckboxField
              checked={hasReviewedPlan}
              description="Required before execute."
              label="I reviewed the plan and want to execute this rollover"
              onChange={(event) => setHasReviewedPlan(event.target.checked)}
            />

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setPreview(null);
                  setExecutionResult(null);
                  setHasReviewedPlan(false);
                }}
                type="button"
                variant="secondary"
              >
                Back To Edit
              </Button>
              <Button
                disabled={!hasReviewedPlan || isExecuting}
                onClick={handleExecute}
                type="button"
                variant="danger"
              >
                {isExecuting ? "Executing..." : "Execute Rollover"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {executionResult ? (
        <Card>
          <CardHeader>
            <CardTitle>Execution Summary</CardTitle>
            <CardDescription>
              Target year: {executionResult.targetSchoolYearName}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Badge variant="success">Reactivated grade levels: {executionResult.summary.reactivatedGradeLevels}</Badge>
              <Badge variant="success">Created class templates: {executionResult.summary.createdClassTemplates}</Badge>
              <Badge variant="neutral">Skipped templates: {executionResult.summary.skippedExistingClassTemplates}</Badge>
              <Badge variant="success">Promoted students: {executionResult.summary.promotedStudentCount}</Badge>
              <Badge variant="success">Graduated students: {executionResult.summary.graduatedStudentCount}</Badge>
              <Badge variant="neutral">Archived source classes: {executionResult.summary.archivedSourceClassCount}</Badge>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
