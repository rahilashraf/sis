"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import {
  executeDataImport,
  previewDataImport,
  type DataImportDuplicateStrategy,
  type DataImportEntityType,
  type DataImportExecuteResult,
  type DataImportPreview,
} from "@/lib/api/data-import";
import { listSchools, type School } from "@/lib/api/schools";

const allowedRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);

const entityOptions: Array<{
  value: DataImportEntityType;
  label: string;
  description: string;
  columns: string[];
}> = [
  {
    value: "students",
    label: "Students",
    description: "Creates student accounts and resolves grade levels by name.",
    columns: [
      "username",
      "firstName",
      "lastName",
      "password",
      "email",
      "phone",
      "gradeLevelName",
      "studentNumber",
      "oen",
      "gender",
    ],
  },
  {
    value: "parents",
    label: "Parents",
    description: "Creates parent accounts and optionally links them to students by username.",
    columns: [
      "username",
      "firstName",
      "lastName",
      "password",
      "email",
      "phone",
      "linkedStudentUsernames",
    ],
  },
  {
    value: "users",
    label: "Users / Staff",
    description: "Creates admin, staff, teacher, and supply teacher accounts.",
    columns: [
      "username",
      "firstName",
      "lastName",
      "password",
      "email",
      "phone",
      "role",
    ],
  },
  {
    value: "classes",
    label: "Classes",
    description: "Creates classes by school year, grade level, and subject option names.",
    columns: [
      "name",
      "schoolYearName",
      "gradeLevelName",
      "subjectOptionName",
      "isHomeroom",
      "takesAttendance",
    ],
  },
  {
    value: "library-items",
    label: "Library Items",
    description: "Creates inventory rows with duplicate checks on barcode, ISBN, or title/author.",
    columns: [
      "title",
      "author",
      "isbn",
      "barcode",
      "category",
      "totalCopies",
      "availableCopies",
      "status",
      "lostFeeOverride",
    ],
  },
];

const duplicateStrategyOptions: Array<{
  value: DataImportDuplicateStrategy;
  label: string;
  description: string;
}> = [
  {
    value: "fail",
    label: "Fail on duplicates",
    description: "Preview marks duplicates as blocking errors.",
  },
  {
    value: "skip",
    label: "Skip duplicates",
    description: "Preview marks duplicates as skipped rows and imports the rest.",
  },
];

function getRowBadgeVariant(status: "create" | "skip" | "error") {
  if (status === "create") {
    return "success" as const;
  }

  if (status === "skip") {
    return "warning" as const;
  }

  return "danger" as const;
}

export function DataImportManagement() {
  const { session } = useAuth();
  const role = session?.user.role ?? "";
  const canManage = allowedRoles.has(role);

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [entityType, setEntityType] = useState<DataImportEntityType>("students");
  const [duplicateStrategy, setDuplicateStrategy] =
    useState<DataImportDuplicateStrategy>("fail");
  const [csvContent, setCsvContent] = useState("");
  const [preview, setPreview] = useState<DataImportPreview | null>(null);
  const [result, setResult] = useState<DataImportExecuteResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [hasReviewedPlan, setHasReviewedPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedEntity = useMemo(
    () => entityOptions.find((option) => option.value === entityType) ?? entityOptions[0],
    [entityType],
  );

  useEffect(() => {
    async function loadSchools() {
      if (!canManage) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await listSchools();
        setSchools(response);
        const defaultSchoolId = getDefaultSchoolContextId(session?.user) ?? "";
        const resolvedSchoolId =
          response.find((school) => school.id === defaultSchoolId)?.id ??
          response[0]?.id ??
          "";
        setSchoolId(resolvedSchoolId);
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
  }, [canManage, session?.user]);

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      setCsvContent(content);
      setPreview(null);
      setResult(null);
      setHasReviewedPlan(false);
      setSuccessMessage(`Loaded ${file.name}`);
    } catch {
      setError("Unable to read CSV file.");
    }
  }

  async function handlePreview() {
    if (!schoolId) {
      setError("Select a school first.");
      return;
    }

    if (!csvContent.trim()) {
      setError("Paste CSV data or upload a .csv file first.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setResult(null);
    setHasReviewedPlan(false);
    setIsPreviewing(true);

    try {
      const response = await previewDataImport({
        schoolId,
        entityType,
        duplicateStrategy,
        csvContent,
      });
      setPreview(response);
      setSuccessMessage("Validation preview generated.");
    } catch (previewError) {
      setPreview(null);
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Unable to preview import.",
      );
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleExecute() {
    if (!preview || preview.summary.errorCount > 0 || !hasReviewedPlan) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsExecuting(true);

    try {
      const response = await executeDataImport({
        schoolId,
        entityType,
        duplicateStrategy,
        csvContent,
      });
      setResult(response);
      setSuccessMessage("Import completed successfully.");
    } catch (executeError) {
      setError(
        executeError instanceof Error
          ? executeError.message
          : "Unable to execute import.",
      );
    } finally {
      setIsExecuting(false);
    }
  }

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Bulk Setup"
          description="Bulk import tools are limited to owner, super admin, and admin roles."
        />
        <Notice tone="info">
          Your role can manage data day to day, but bulk imports are restricted to admin-level access.
        </Notice>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk Setup"
        description="Preview-first CSV import for students, parents, staff, classes, and library items."
        meta={
          <>
            <Badge variant="neutral">Validation preview required</Badge>
            <Badge variant="neutral">Transactional execute</Badge>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Import Setup</CardTitle>
          <CardDescription>
            Choose a school, choose the import type, then paste or upload CSV data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field htmlFor="import-school" label="School">
              <Select
                id="import-school"
                onChange={(event) => {
                  setSchoolId(event.target.value);
                  setPreview(null);
                  setResult(null);
                }}
                value={schoolId}
              >
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="import-entity" label="Import type">
              <Select
                id="import-entity"
                onChange={(event) => {
                  setEntityType(event.target.value as DataImportEntityType);
                  setPreview(null);
                  setResult(null);
                  setHasReviewedPlan(false);
                }}
                value={entityType}
              >
                {entityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="import-duplicate-strategy" label="Duplicate handling">
              <Select
                id="import-duplicate-strategy"
                onChange={(event) =>
                  setDuplicateStrategy(
                    event.target.value as DataImportDuplicateStrategy,
                  )
                }
                value={duplicateStrategy}
              >
                {duplicateStrategyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Notice tone="info" title={selectedEntity.label}>
            <p>{selectedEntity.description}</p>
            <p className="mt-2 text-xs">
              Expected columns: {selectedEntity.columns.join(", ")}
            </p>
          </Notice>

          <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
            <Field
              htmlFor="import-file"
              label="Upload CSV"
              description="Upload a UTF-8 CSV file, or paste data in the editor beside it."
            >
              <Input
                accept=".csv,text/csv"
                id="import-file"
                onChange={(event) => void handleFileSelected(event)}
                type="file"
              />
            </Field>

            <Field
              htmlFor="import-csv-content"
              label="CSV content"
              description="Preview always runs first. Execute stays disabled while any row is still blocking."
            >
              <Textarea
                className="min-h-72 font-mono text-xs"
                id="import-csv-content"
                onChange={(event) => {
                  setCsvContent(event.target.value);
                  setPreview(null);
                  setResult(null);
                  setHasReviewedPlan(false);
                }}
                placeholder={selectedEntity.columns.join(",")}
                value={csvContent}
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <Button
              disabled={isLoading || isPreviewing}
              onClick={() => void handlePreview()}
              type="button"
            >
              {isPreviewing ? "Generating preview..." : "Generate preview"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>Validation Preview</CardTitle>
            <CardDescription>
              Review every row outcome before executing. Blocking errors must be resolved first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Badge variant="neutral">Rows: {preview.summary.totalRows}</Badge>
              <Badge variant="success">Ready: {preview.summary.createCount}</Badge>
              <Badge variant="warning">Skipped: {preview.summary.skipCount}</Badge>
              <Badge variant="danger">Errors: {preview.summary.errorCount}</Badge>
              <Badge variant="neutral">Duplicates: {preview.summary.duplicateCount}</Badge>
            </div>

            {preview.warnings.length > 0 ? (
              <Notice tone="warning" title="Warnings">
                <ul className="list-disc pl-5 text-sm">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}

            <Notice tone="info" title="Safety">
              Execute runs inside a single transaction. If any create step fails, the import rolls back automatically and no partial rows remain.
            </Notice>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">Row</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Identifier</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {preview.rows.map((row) => (
                      <tr className="align-top hover:bg-slate-50" key={`${row.rowNumber}-${row.identifier}`}>
                        <td className="px-4 py-3 text-slate-700">{row.rowNumber}</td>
                        <td className="px-4 py-3">
                          <Badge variant={getRowBadgeVariant(row.status)}>{row.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-900">{row.identifier}</td>
                        <td className="px-4 py-3 text-slate-600">{row.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <CheckboxField
              checked={hasReviewedPlan}
              description="Required before execute."
              label="I reviewed the preview and want to run this import"
              onChange={(event) => setHasReviewedPlan(event.target.checked)}
            />

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setPreview(null);
                  setResult(null);
                  setHasReviewedPlan(false);
                }}
                type="button"
                variant="secondary"
              >
                Back to edit
              </Button>
              <Button
                disabled={
                  !hasReviewedPlan ||
                  preview.summary.errorCount > 0 ||
                  preview.summary.createCount === 0 ||
                  isExecuting
                }
                onClick={() => void handleExecute()}
                type="button"
                variant="danger"
              >
                {isExecuting ? "Executing..." : "Execute import"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Execution Result</CardTitle>
            <CardDescription>
              {result.entityType} import completed for the selected school.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Badge variant="success">Imported: {result.summary.importedCount}</Badge>
              <Badge variant="warning">Skipped: {result.summary.skippedCount}</Badge>
              <Badge variant="danger">Preview errors blocked: {result.summary.errorCount}</Badge>
              <Badge variant="neutral">Rows reviewed: {result.summary.totalRows}</Badge>
            </div>
            <Notice tone="info" title="Rollback policy">
              {result.rollback}
            </Notice>
          </CardContent>
        </Card>
      ) : null}

      {!preview && !result ? (
        <Card>
          <CardHeader>
            <CardTitle>Importer Notes</CardTitle>
            <CardDescription>
              This tool is designed for safe initial setup and controlled bulk admin changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              compact
              title="Preview before execute"
              description="Generate a validation preview to check duplicates, missing references, and CSV issues before any rows are written."
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
