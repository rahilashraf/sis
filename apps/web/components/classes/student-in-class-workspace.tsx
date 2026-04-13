"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getClassById, type SchoolClass } from "@/lib/api/classes";
import {
  getClassGradeSummary,
  deleteGradeOverride,
  getStudentInClassSummary,
  upsertGradeOverride,
  type ClassGradeSummary,
  type StudentInClassSummary,
} from "@/lib/api/gradebook";
import {
  listAssessmentResultStatusLabels,
  upsertAssessmentGrades,
  type AssessmentResultStatusLabel,
  type UpsertAssessmentGradeInput,
} from "@/lib/api/assessments";
import { formatDateLabel, formatDisplayedPercent, getDisplayText } from "@/lib/utils";

type Mode = "teacher" | "admin";

function getFullName(firstName: unknown, lastName: unknown, fallback = "—") {
  const first = getDisplayText(firstName, "");
  const last = getDisplayText(lastName, "");
  const fullName = `${first} ${last}`.trim();

  return fullName || fallback;
}

export function StudentInClassWorkspace({
  mode,
  classId,
  studentId,
}: {
  mode: Mode;
  classId: string;
  studentId: string;
}) {
  const [schoolClass, setSchoolClass] = useState<SchoolClass | null>(null);
  const [classSummary, setClassSummary] = useState<ClassGradeSummary | null>(null);
  const [summary, setSummary] = useState<StudentInClassSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [scoreByAssessmentId, setScoreByAssessmentId] = useState<Record<string, string>>({});
  const [commentByAssessmentId, setCommentByAssessmentId] = useState<Record<string, string>>({});
  const [statusKeyByAssessmentId, setStatusKeyByAssessmentId] = useState<Record<string, string>>({});
  const [statusLabels, setStatusLabels] = useState<AssessmentResultStatusLabel[]>([]);
  const [statusLabelError, setStatusLabelError] = useState<string | null>(null);

  const [overridePercent, setOverridePercent] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      setSaveError(null);
      setSuccessMessage(null);

      const [classResult, classSummaryResult, summaryResult] = await Promise.allSettled([
        getClassById(classId),
        getClassGradeSummary(classId),
        getStudentInClassSummary(classId, studentId),
      ]);

      if (classResult.status === "fulfilled") {
        setSchoolClass(classResult.value);
      } else {
        setSchoolClass(null);
      }

      if (classSummaryResult.status === "fulfilled") {
        setClassSummary(classSummaryResult.value);
      } else {
        setClassSummary(null);
      }

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
        setScoreByAssessmentId({});
        setCommentByAssessmentId({});
        setStatusKeyByAssessmentId({});
      } else {
        setSummary(null);
        setError(
          summaryResult.reason instanceof Error
            ? summaryResult.reason.message
            : "Unable to load student academic detail.",
        );
      }

      setIsLoading(false);
    }

    void load();
  }, [classId, studentId]);

  useEffect(() => {
    async function loadStatusLabels() {
      const schoolId = summary?.schoolId ?? schoolClass?.schoolId ?? "";

      if (!schoolId) {
        setStatusLabels([]);
        setStatusLabelError(null);
        return;
      }

      setStatusLabelError(null);

      try {
        const response = await listAssessmentResultStatusLabels({ schoolId, includeInactive: false });
        setStatusLabels(response);
      } catch (loadError) {
        setStatusLabels([]);
        setStatusLabelError(
          loadError instanceof Error ? loadError.message : "Unable to load status labels.",
        );
      }
    }

    void loadStatusLabels();
  }, [schoolClass?.schoolId, summary?.schoolId]);

  useEffect(() => {
    const existing = summary?.override ?? null;
    setOverridePercent(
      existing?.overridePercent === null || existing?.overridePercent === undefined
        ? ""
        : String(existing.overridePercent),
    );
    setOverrideReason(existing?.overrideReason ?? "");
    setOverrideError(null);
  }, [summary?.override?.id, summary?.override?.updatedAt]);

  const studentName = useMemo(() => {
    if (!classSummary) {
      return "Student";
    }

    const entry = classSummary.students.find((row) => row.student.id === studentId);
    if (!entry) {
      return "Student";
    }

    return getFullName(entry.student.firstName, entry.student.lastName, "Student");
  }, [classSummary, studentId]);

  async function handleSave() {
    if (!summary) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSuccessMessage(null);

    try {
      const flattened = summary.groups.flatMap((group) =>
        group.assessments.map((assessment) => ({
          assessment,
          isLocked: assessment.reportingPeriod?.isLocked ?? false,
          existingRawScore: assessment.rawScore ?? null,
          existingComment: assessment.comment ?? null,
          existingStatusKey: assessment.statusLabel?.key ?? null,
        })),
      );

      const updates = flattened
        .map(({ assessment, isLocked, existingRawScore, existingComment, existingStatusKey }) => {
          if (isLocked) {
            return null;
          }

          const scoreTouched = Object.prototype.hasOwnProperty.call(scoreByAssessmentId, assessment.id);
          const commentTouched = Object.prototype.hasOwnProperty.call(commentByAssessmentId, assessment.id);
          const statusTouched = Object.prototype.hasOwnProperty.call(statusKeyByAssessmentId, assessment.id);

          if (!scoreTouched && !commentTouched && !statusTouched) {
            return null;
          }

          const scoreRaw = scoreTouched ? (scoreByAssessmentId[assessment.id] ?? "").trim() : "";
          const commentRaw = commentTouched ? (commentByAssessmentId[assessment.id] ?? "").trim() : "";
          const statusRaw = statusTouched ? (statusKeyByAssessmentId[assessment.id] ?? "").trim() : "";

          const nextScore: number | null | undefined = scoreTouched
            ? scoreRaw.length === 0
              ? null
              : Number(scoreRaw)
            : undefined;

          if (scoreTouched && nextScore !== null && nextScore !== undefined) {
            if (!Number.isFinite(nextScore) || nextScore < 0) {
              throw new Error(`Invalid score provided for ${assessment.title}.`);
            }

            if (nextScore > assessment.maxScore) {
              throw new Error(`Score for ${assessment.title} cannot exceed ${assessment.maxScore}.`);
            }
          }

          const nextComment: string | null | undefined = commentTouched
            ? commentRaw.length === 0
              ? null
              : commentRaw
            : undefined;

          const nextStatusKey: string | null | undefined = statusTouched
            ? statusRaw.length === 0
              ? null
              : statusRaw.toUpperCase()
            : undefined;

          const normalizedExistingComment =
            (existingComment ?? "").trim().length === 0 ? null : (existingComment ?? "").trim();

          const scoreChanged = scoreTouched && (existingRawScore ?? null) !== (nextScore ?? null);
          const commentChanged = commentTouched && normalizedExistingComment !== (nextComment ?? null);
          const statusChanged = statusTouched && (existingStatusKey ?? null) !== (nextStatusKey ?? null);

          if (!scoreChanged && !commentChanged && !statusChanged) {
            return null;
          }

          const effectiveStatusKey =
            statusTouched
              ? nextStatusKey
              : scoreTouched && nextScore !== null && nextScore !== undefined
                ? null
                : (existingStatusKey ?? null);

          const effectiveComment = commentTouched ? nextComment : normalizedExistingComment;
          const effectiveScore =
            scoreTouched ? nextScore ?? null : existingRawScore ?? null;

          if (effectiveScore === null && effectiveStatusKey === null && effectiveComment === null) {
            return {
              assessmentId: assessment.id,
              grade: { studentId, clear: true } satisfies UpsertAssessmentGradeInput,
            };
          }

          return {
            assessmentId: assessment.id,
            grade: {
              studentId,
              score: effectiveScore,
              statusLabelKey: effectiveStatusKey,
              comment: effectiveComment,
            } satisfies UpsertAssessmentGradeInput,
          };
        })
        .filter(Boolean) as Array<{ assessmentId: string; grade: UpsertAssessmentGradeInput }>;

      const payloadByAssessmentId = new Map<string, UpsertAssessmentGradeInput[]>();

      for (const update of updates) {
        const bucket = payloadByAssessmentId.get(update.assessmentId) ?? [];
        bucket.push(update.grade);
        payloadByAssessmentId.set(update.assessmentId, bucket);
      }

      if (payloadByAssessmentId.size === 0) {
        setSuccessMessage("No changes to save.");
        return;
      }

      const settled = await Promise.allSettled(
        Array.from(payloadByAssessmentId.entries()).map(([assessmentId, grades]) =>
          upsertAssessmentGrades(assessmentId, grades),
        ),
      );

      const failures = settled.filter((result) => result.status === "rejected") as PromiseRejectedResult[];

      if (failures.length > 0) {
        setSaveError(
          failures
            .map((failure) =>
              failure.reason instanceof Error ? failure.reason.message : "Unable to save grades.",
            )
            .join(" "),
        );
        return;
      }

      const refreshed = await getStudentInClassSummary(classId, studentId);
      setSummary(refreshed);
      setScoreByAssessmentId({});
      setCommentByAssessmentId({});
      setStatusKeyByAssessmentId({});
      setSuccessMessage("Student grades saved.");
    } catch (saveError) {
      setSaveError(saveError instanceof Error ? saveError.message : "Unable to save grades.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveOverride() {
    if (!summary) {
      return;
    }

    setIsSavingOverride(true);
    setOverrideError(null);
    setSuccessMessage(null);

    try {
      const rawPercent = overridePercent.trim();
      const parsedPercent =
        rawPercent.length === 0 ? undefined : Number(rawPercent);
      if (parsedPercent !== undefined) {
        if (!Number.isFinite(parsedPercent) || parsedPercent < 0 || parsedPercent > 100) {
          throw new Error("Override percent must be a number between 0 and 100.");
        }
      }

      if (parsedPercent === undefined) {
        throw new Error("Override percent is required.");
      }

      await upsertGradeOverride(
        { classId, studentId },
        {
          overridePercent: parsedPercent,
          overrideReason: overrideReason.trim() || null,
        },
      );

      const refreshed = await getStudentInClassSummary(classId, studentId);
      setSummary(refreshed);
      setSuccessMessage("Grade override saved.");
    } catch (saveError) {
      setOverrideError(saveError instanceof Error ? saveError.message : "Unable to save override.");
    } finally {
      setIsSavingOverride(false);
    }
  }

  async function handleClearOverride() {
    setIsSavingOverride(true);
    setOverrideError(null);
    setSuccessMessage(null);

    try {
      await deleteGradeOverride({ classId, studentId });
      const refreshed = await getStudentInClassSummary(classId, studentId);
      setSummary(refreshed);
      setSuccessMessage("Grade override cleared.");
    } catch (clearError) {
      setOverrideError(clearError instanceof Error ? clearError.message : "Unable to clear override.");
    } finally {
      setIsSavingOverride(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={studentName}
        description={schoolClass ? `${schoolClass.name} • Student academic record` : "Student academic record"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={mode === "admin" ? `/admin/classes/${classId}/summary` : `/teacher/classes/${classId}`}
            >
              Back to class
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/${mode}/gradebook?classId=${encodeURIComponent(classId)}`}
            >
              Gradebook
            </Link>
            <Button disabled={isSaving || !summary} onClick={() => void handleSave()} type="button">
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        }
        meta={
          summary ? (
            <>
              <Badge variant="neutral">
                Avg: {formatDisplayedPercent(summary.averagePercent)}
              </Badge>
              <Badge variant="neutral">Grade: {summary.averageLetterGrade ?? "—"}</Badge>
              {summary.usesWeights ? <Badge variant="neutral">Weighted</Badge> : null}
              {summary.override ? <Badge variant="warning">Override</Badge> : null}
            </>
          ) : null
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {saveError ? <Notice tone="danger">{saveError}</Notice> : null}
      {statusLabelError ? <Notice tone="danger">{statusLabelError}</Notice> : null}
      {overrideError ? <Notice tone="danger">{overrideError}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading student detail...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !summary ? (
        <EmptyState
          title="Student detail unavailable"
          description="This academic record could not be loaded."
        />
      ) : null}

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>Final grade override</CardTitle>
            <CardDescription>
              Override the final class percentage. Letter grade is derived automatically from the school scale.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <p className="font-semibold text-slate-900">Calculated</p>
                <p className="mt-1 text-slate-600">
                  {formatDisplayedPercent(summary.calculatedAveragePercent)}{" "}
                  • {summary.calculatedAverageLetterGrade ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <p className="font-semibold text-slate-900">Final</p>
                <p className="mt-1 text-slate-600">
                  {formatDisplayedPercent(summary.averagePercent)} •{" "}
                  {summary.averageLetterGrade ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <p className="font-semibold text-slate-900">Override status</p>
                <p className="mt-1 text-slate-600">
                  {summary.override ? "Override active" : "No override"}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field htmlFor="override-percent" label="Override percent">
                <Input
                  id="override-percent"
                  inputMode="decimal"
                  onChange={(event) => setOverridePercent(event.target.value)}
                  type="number"
                  value={overridePercent}
                />
              </Field>
              <div className="md:col-span-2">
                <Field htmlFor="override-reason" label="Reason (optional)">
                  <Textarea
                    id="override-reason"
                    onChange={(event) => setOverrideReason(event.target.value)}
                    rows={2}
                    value={overrideReason}
                  />
                </Field>
              </div>
              <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
                {summary.override ? (
                  <Button
                    disabled={isSavingOverride}
                    onClick={() => void handleClearOverride()}
                    type="button"
                    variant="secondary"
                  >
                    Clear override
                  </Button>
                ) : null}
                <Button
                  disabled={isSavingOverride}
                  onClick={() => void handleSaveOverride()}
                  type="button"
                >
                  {isSavingOverride ? "Saving..." : "Save override"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>Assessments</CardTitle>
            <CardDescription>
              Scores are grouped by reporting period. Locked periods are read-only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {summary.groups.map((group) => (
                <div className="space-y-3" key={group.reportingPeriod?.id ?? "unassigned"}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {group.reportingPeriod
                        ? `${group.reportingPeriod.order}. ${group.reportingPeriod.name}`
                        : "Unassigned"}
                    </p>
                    {group.reportingPeriod?.isLocked ? (
                      <Badge variant="neutral">Locked</Badge>
                    ) : null}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                        <thead className="bg-slate-50/80">
                          <tr>
                            <th className="px-4 py-3 font-semibold text-slate-700">Assessment</th>
                            <th className="px-4 py-3 font-semibold text-slate-700">Type</th>
                            <th className="px-4 py-3 font-semibold text-slate-700">Due</th>
                            <th className="px-4 py-3 font-semibold text-slate-700">Wt</th>
                            <th className="px-4 py-3 font-semibold text-slate-700">Parents</th>
                            <th className="px-4 py-3 font-semibold text-slate-700">Code</th>
                            <th className="px-4 py-3 font-semibold text-slate-700">%</th>
                            <th className="px-4 py-3 font-semibold text-slate-700">Score</th>
                            <th className="px-4 py-3 font-semibold text-slate-700">Edit</th>
                            <th className="px-4 py-3 font-semibold text-slate-700">Comment</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {group.assessments.map((assessment) => {
                            const isLocked = assessment.reportingPeriod?.isLocked ?? false;
                            const scoreValue =
                              scoreByAssessmentId[assessment.id] ??
                              (assessment.rawScore === null || assessment.rawScore === undefined ? "" : `${assessment.rawScore}`);
                            const statusValue =
                              statusKeyByAssessmentId[assessment.id] ??
                              assessment.statusLabel?.key ??
                              "";

                            return (
                              <tr className="align-top hover:bg-slate-50" key={assessment.id}>
                                <td className="px-4 py-3">
                                  <p className="font-medium text-slate-900">{assessment.title}</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    Max {assessment.maxScore}
                                  </p>
                                </td>
                                <td className="px-4 py-3 text-slate-600">
                                  {assessment.assessmentType.name}
                                </td>
                                <td className="px-4 py-3 text-slate-600">
                                  {assessment.dueAt ? formatDateLabel(assessment.dueAt) : "—"}
                                </td>
                                <td className="px-4 py-3 text-slate-600">{assessment.weight}</td>
                                <td className="px-4 py-3">
                                  <Badge variant={assessment.isPublishedToParents ? "success" : "neutral"}>
                                    {assessment.isPublishedToParents ? "Visible" : "Hidden"}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <Select
                                    aria-label={`Status code for ${assessment.title}`}
                                    className="min-w-40"
                                    disabled={isLocked || isSaving || statusLabels.length === 0}
                                    onChange={(event) =>
                                      setStatusKeyByAssessmentId((current) => ({
                                        ...current,
                                        [assessment.id]: event.target.value,
                                      }))
                                    }
                                    value={statusValue}
                                  >
                                    <option value="">—</option>
                                    {statusLabels.map((label) => (
                                      <option key={label.id} value={label.key}>
                                        {label.key} • {label.label}
                                      </option>
                                    ))}
                                  </Select>
                                </td>
                                <td className="px-4 py-3 text-slate-900">
                                  {assessment.percent === null ? "—" : `${assessment.percent}%`}
                                </td>
                                <td className="px-4 py-3 text-slate-900">
                                  {assessment.score === null ? "—" : `${assessment.score} / ${assessment.maxScore}`}
                                </td>
                                <td className="px-4 py-3">
                                  <Input
                                    aria-label={`Score for ${assessment.title}`}
                                    className="h-9 w-28 rounded-lg px-2 text-right tabular-nums"
                                    disabled={isLocked || isSaving}
                                    id={`score-${assessment.id}`}
                                    inputMode="decimal"
                                    onChange={(event) =>
                                      setScoreByAssessmentId((current) => ({
                                        ...current,
                                        [assessment.id]: event.target.value,
                                      }))
                                    }
                                    placeholder={isLocked ? "Locked" : `0 - ${assessment.maxScore}`}
                                    value={scoreValue}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <Textarea
                                    className="h-9 min-h-[2.25rem] rounded-lg px-2 py-1 text-xs"
                                    disabled={isLocked || isSaving}
                                    onChange={(event) =>
                                      setCommentByAssessmentId((current) => ({
                                        ...current,
                                        [assessment.id]: event.target.value,
                                      }))
                                    }
                                    placeholder={isLocked ? "Locked" : "Optional comment"}
                                    rows={1}
                                    value={commentByAssessmentId[assessment.id] ?? assessment.comment ?? ""}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                          {group.assessments.length === 0 ? (
                            <tr>
                              <td className="px-4 py-10" colSpan={10}>
                                <EmptyState
                                  compact
                                  title="No assessments"
                                  description="No assessments exist in this reporting period yet."
                                />
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
