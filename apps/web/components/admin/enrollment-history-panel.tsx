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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { normalizeDateOnlyPayload } from "@/lib/date";
import {
  createEnrollmentHistory,
  getEnrollmentHistory,
  listEnrollmentSubjectOptions,
  replaceEnrollmentSubjects,
  updateEnrollmentHistory,
  type EnrollmentHistoryRecord,
  type EnrollmentHistoryStatus,
  type EnrollmentSubjectOption,
} from "@/lib/api/enrollment-history";

type EnrollmentHistoryPanelProps = {
  studentId: string;
  canManage: boolean;
};

type EnrollmentHistoryFormState = {
  dateOfEnrollment: string;
  dateOfDeparture: string;
  previousSchoolName: string;
  status: EnrollmentHistoryStatus;
  notes: string;
};

const statusOptions: Array<{ value: EnrollmentHistoryStatus; label: string }> =
  [
    { value: "ACTIVE", label: "Active" },
    { value: "WITHDRAWN", label: "Withdrawn" },
    { value: "TRANSFERRED", label: "Transferred" },
    { value: "GRADUATED", label: "Graduated" },
  ];

function toDateInputValue(value: string | null) {
  return normalizeDateOnlyPayload(value);
}

function buildFormState(
  history: EnrollmentHistoryRecord | null,
): EnrollmentHistoryFormState {
  if (!history) {
    return {
      dateOfEnrollment: "",
      dateOfDeparture: "",
      previousSchoolName: "",
      status: "ACTIVE",
      notes: "",
    };
  }

  return {
    dateOfEnrollment: toDateInputValue(history.dateOfEnrollment),
    dateOfDeparture: toDateInputValue(history.dateOfDeparture),
    previousSchoolName: history.previousSchoolName ?? "",
    status: history.status,
    notes: history.notes ?? "",
  };
}

function normalizeOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapSubjectNamesToOptionIds(
  selectedSubjects: string[],
  subjectOptions: EnrollmentSubjectOption[],
) {
  const idsByName = new Map(
    subjectOptions
      .filter((entry) => entry.isActive)
      .map((entry) => [entry.name, entry.id]),
  );

  const selectedIds: string[] = [];
  for (const subjectName of selectedSubjects) {
    const id = idsByName.get(subjectName);
    if (id) {
      selectedIds.push(id);
    }
  }

  return selectedIds;
}

function toggleSelection(current: string[], value: string) {
  if (current.includes(value)) {
    return current.filter((entry) => entry !== value);
  }

  return [...current, value];
}

export function EnrollmentHistoryPanel({
  studentId,
  canManage,
}: EnrollmentHistoryPanelProps) {
  const [history, setHistory] = useState<EnrollmentHistoryRecord | null>(null);
  const [subjectOptions, setSubjectOptions] = useState<
    EnrollmentSubjectOption[]
  >([]);
  const [selectedSubjectOptionIds, setSelectedSubjectOptionIds] = useState<
    string[]
  >([]);
  const [form, setForm] = useState<EnrollmentHistoryFormState>(
    buildFormState(null),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isSavingSubjects, setIsSavingSubjects] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeSubjectOptions = useMemo(
    () => subjectOptions.filter((entry) => entry.isActive),
    [subjectOptions],
  );

  const inactiveSavedSubjects = useMemo(() => {
    if (!history) {
      return [] as string[];
    }

    const activeNames = new Set(
      activeSubjectOptions.map((entry) => entry.name),
    );
    return history.selectedSubjects.filter(
      (subjectName) => !activeNames.has(subjectName),
    );
  }, [activeSubjectOptions, history]);

  const hasSubjectChanges = useMemo(() => {
    if (!history) {
      return false;
    }

    const savedIds = mapSubjectNamesToOptionIds(
      history.selectedSubjects,
      activeSubjectOptions,
    );
    return (
      JSON.stringify(savedIds) !== JSON.stringify(selectedSubjectOptionIds)
    );
  }, [activeSubjectOptions, history, selectedSubjectOptionIds]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const [historyResponse, optionsResponse] = await Promise.all([
          getEnrollmentHistory(studentId),
          listEnrollmentSubjectOptions(),
        ]);

        setHistory(historyResponse);
        setSubjectOptions(optionsResponse);
        setForm(buildFormState(historyResponse));
        setSelectedSubjectOptionIds(
          historyResponse
            ? mapSubjectNamesToOptionIds(
                historyResponse.selectedSubjects,
                optionsResponse,
              )
            : [],
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load enrollment history.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [studentId]);

  async function handleSaveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) {
      return;
    }

    setIsSavingDetails(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!form.dateOfEnrollment) {
        throw new Error("Date of enrollment is required.");
      }

      const payload = {
        dateOfEnrollment: form.dateOfEnrollment,
        dateOfDeparture: form.dateOfDeparture || null,
        previousSchoolName: normalizeOptionalText(form.previousSchoolName),
        status: form.status,
        notes: normalizeOptionalText(form.notes),
      };

      const response = history
        ? await updateEnrollmentHistory(studentId, payload)
        : await createEnrollmentHistory(studentId, {
            ...payload,
            subjectOptionIds: selectedSubjectOptionIds,
          });

      setHistory(response);
      setForm(buildFormState(response));
      setSelectedSubjectOptionIds(
        mapSubjectNamesToOptionIds(
          response.selectedSubjects,
          activeSubjectOptions,
        ),
      );
      setSuccessMessage(
        history ? "Enrollment history updated." : "Enrollment history created.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save enrollment history.",
      );
    } finally {
      setIsSavingDetails(false);
    }
  }

  async function handleSaveSubjects() {
    if (!canManage || !history) {
      return;
    }

    setIsSavingSubjects(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await replaceEnrollmentSubjects(studentId, {
        subjectOptionIds: selectedSubjectOptionIds,
      });
      setHistory(response);
      setSelectedSubjectOptionIds(
        mapSubjectNamesToOptionIds(
          response.selectedSubjects,
          activeSubjectOptions,
        ),
      );
      setSuccessMessage("Selected subjects updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save subjects.",
      );
    } finally {
      setIsSavingSubjects(false);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">
            Loading enrollment history...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enrollment History</CardTitle>
        <CardDescription>
          Track a student&apos;s enrollment record and saved subject selections.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {successMessage ? (
          <Notice tone="success">{successMessage}</Notice>
        ) : null}

        {!history && !canManage ? (
          <EmptyState
            compact
            title="No enrollment history"
            description="Enrollment history has not been added for this student."
          />
        ) : null}

        {canManage ? (
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={handleSaveDetails}
          >
            <Field htmlFor="enrollment-date" label="Date of enrollment">
              <Input
                id="enrollment-date"
                type="date"
                value={form.dateOfEnrollment}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dateOfEnrollment: event.target.value,
                  }))
                }
              />
            </Field>

            <Field htmlFor="departure-date" label="Date of departure">
              <Input
                id="departure-date"
                type="date"
                value={form.dateOfDeparture}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dateOfDeparture: event.target.value,
                  }))
                }
              />
            </Field>

            <Field htmlFor="previous-school-name" label="Previous school name">
              <Input
                id="previous-school-name"
                value={form.previousSchoolName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    previousSchoolName: event.target.value,
                  }))
                }
              />
            </Field>

            <Field htmlFor="enrollment-status" label="Status">
              <Select
                id="enrollment-status"
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as EnrollmentHistoryStatus,
                  }))
                }
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              className="md:col-span-2"
              htmlFor="enrollment-notes"
              label="Notes"
            >
              <Textarea
                id="enrollment-notes"
                rows={3}
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </Field>

            <div className="md:col-span-2 flex justify-end">
              <Button disabled={isSavingDetails} type="submit">
                {isSavingDetails
                  ? "Saving..."
                  : history
                    ? "Save enrollment history"
                    : "Create enrollment history"}
              </Button>
            </div>
          </form>
        ) : history ? (
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Enrollment Date
              </p>
              <p className="mt-1 text-sm text-slate-900">
                {toDateInputValue(history.dateOfEnrollment)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Departure Date
              </p>
              <p className="mt-1 text-sm text-slate-900">
                {toDateInputValue(history.dateOfDeparture) || "Not set"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Previous School
              </p>
              <p className="mt-1 text-sm text-slate-900">
                {history.previousSchoolName ?? "Not set"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Status
              </p>
              <p className="mt-1 text-sm text-slate-900">
                {statusOptions.find((option) => option.value === history.status)
                  ?.label ?? history.status}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Notes
              </p>
              <p className="mt-1 text-sm text-slate-900">
                {history.notes ?? "No notes"}
              </p>
            </div>
          </div>
        ) : null}

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">
              Selected Subjects
            </p>
            <Badge variant="neutral">
              {history
                ? history.selectedSubjects.length
                : selectedSubjectOptionIds.length}
            </Badge>
          </div>

          {activeSubjectOptions.length === 0 ? (
            <EmptyState
              compact
              title="No active subjects configured"
              description="Owners and super admins can add subject options in admin settings."
            />
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {activeSubjectOptions.map((subjectOption) => (
                <CheckboxField
                  checked={selectedSubjectOptionIds.includes(subjectOption.id)}
                  disabled={!canManage}
                  key={subjectOption.id}
                  label={subjectOption.name}
                  onChange={() =>
                    setSelectedSubjectOptionIds((current) =>
                      toggleSelection(current, subjectOption.id),
                    )
                  }
                />
              ))}
            </div>
          )}

          {inactiveSavedSubjects.length > 0 ? (
            <Notice tone="info">
              Saved subjects not in active options:{" "}
              {inactiveSavedSubjects.join(", ")}
            </Notice>
          ) : null}

          {canManage && history ? (
            <div className="flex justify-end">
              <Button
                disabled={!hasSubjectChanges || isSavingSubjects}
                type="button"
                onClick={() => {
                  void handleSaveSubjects();
                }}
              >
                {isSavingSubjects ? "Saving..." : "Save selected subjects"}
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
