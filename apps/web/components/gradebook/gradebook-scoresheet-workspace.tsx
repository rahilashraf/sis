"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { listClasses, listMyClasses, type SchoolClass } from "@/lib/api/classes";
import {
  listAssessmentResultStatusLabels,
  upsertAssessmentGrades,
  type AssessmentResultStatusLabel,
  type UpsertAssessmentGradeInput,
} from "@/lib/api/assessments";
import {
  deleteGradeOverride,
  getClassGradebookGrid,
  getClassGradeSummary,
  listAssessmentCategories,
  upsertGradeOverride,
  type AssessmentCategory,
  type ClassGradebookGrid,
  type ClassGradeSummary,
} from "@/lib/api/gradebook";
import { listReportingPeriods, type ReportingPeriod } from "@/lib/api/reporting-periods";
import { formatDisplayedPercent, getDisplayText, roundDisplayedPercent } from "@/lib/utils";

type Mode = "teacher" | "admin";

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function formatPercent(value: number | null) {
  return formatDisplayedPercent(value);
}

function getFullName(firstName: unknown, lastName: unknown, fallback = "—") {
  const first = getDisplayText(firstName, "");
  const last = getDisplayText(lastName, "");
  const fullName = `${first} ${last}`.trim();

  return fullName || fallback;
}

function getClassOptionLabel(schoolClass: SchoolClass) {
  const className = getDisplayText(schoolClass.name);
  const subject = getDisplayText(schoolClass.subject, "");

  return `${className}${subject ? ` • ${subject}` : ""}${schoolClass.isActive ? "" : " • Inactive"}`;
}

export function GradebookScoresheetWorkspace({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedClassId = searchParams.get("classId") ?? "";

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [includeInactiveClasses, setIncludeInactiveClasses] = useState(false);

  const [reportingPeriods, setReportingPeriods] = useState<ReportingPeriod[]>([]);
  const [reportingPeriodError, setReportingPeriodError] = useState<string | null>(null);
  const [selectedGridReportingPeriodId, setSelectedGridReportingPeriodId] = useState<string>("all");

  const [summary, setSummary] = useState<ClassGradeSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [grid, setGrid] = useState<ClassGradebookGrid | null>(null);
  const [gridError, setGridError] = useState<string | null>(null);

  const [draftGridScores, setDraftGridScores] = useState<Record<string, string>>({});
  const [draftGridStatuses, setDraftGridStatuses] = useState<Record<string, string>>({});
  const [draftGridComments, setDraftGridComments] = useState<Record<string, string>>({});
  const [gridSaveError, setGridSaveError] = useState<string | null>(null);
  const [overrideSaveError, setOverrideSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savingOverrideStudentId, setSavingOverrideStudentId] = useState<string | null>(null);
  const [overridePercentByStudentId, setOverridePercentByStudentId] = useState<Record<string, string>>({});
  const [overrideReasonByStudentId, setOverrideReasonByStudentId] = useState<Record<string, string>>({});
  const [statusLabels, setStatusLabels] = useState<AssessmentResultStatusLabel[]>([]);
  const [statusLabelError, setStatusLabelError] = useState<string | null>(null);
  const [categories, setCategories] = useState<AssessmentCategory[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingGrid, setIsLoadingGrid] = useState(false);
  const [isSavingGrid, setIsSavingGrid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const availableSchoolOptions = useMemo(() => {
    const schoolMap = new Map<string, { id: string; name: string }>();

    for (const schoolClass of classes) {
      schoolMap.set(schoolClass.schoolId, {
        id: schoolClass.schoolId,
        name: schoolClass.school.name,
      });
    }

    return Array.from(schoolMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);

  const visibleClasses = useMemo(() => {
    if (mode === "teacher") {
      return classes;
    }

    return selectedSchoolId
      ? classes.filter((schoolClass) => schoolClass.schoolId === selectedSchoolId)
      : classes;
  }, [classes, mode, selectedSchoolId]);

  const selectedClass = useMemo(
    () => visibleClasses.find((schoolClass) => schoolClass.id === selectedClassId) ?? null,
    [selectedClassId, visibleClasses],
  );

  const summaryByStudentId = useMemo(() => {
    const map = new Map<string, ClassGradeSummary["students"][number]>();

    if (!summary) {
      return map;
    }

    for (const entry of summary.students) {
      map.set(entry.student.id, entry);
    }

    return map;
  }, [summary]);

  const gridResultsByAssessmentId = useMemo(() => {
    if (!grid) {
      return null;
    }

    const byAssessmentId = new Map<
      string,
      Map<string, { score: number | null; statusKey: string | null; statusBehavior: string | null; comment: string | null }>
    >();

    for (const assessment of grid.assessments) {
      const byStudent = new Map<string, { score: number | null; statusKey: string | null; statusBehavior: string | null; comment: string | null }>();

      for (const result of assessment.results) {
        byStudent.set(result.studentId, {
          score: result.score,
          statusKey: result.statusLabel?.key ?? null,
          statusBehavior: result.statusLabel?.behavior ?? null,
          comment: result.comment,
        });
      }

      byAssessmentId.set(assessment.id, byStudent);
    }

    return byAssessmentId;
  }, [grid]);

  const gridAssessmentById = useMemo(() => {
    const map = new Map<string, ClassGradebookGrid["assessments"][number]>();

    if (!grid) {
      return map;
    }

    for (const assessment of grid.assessments) {
      map.set(assessment.id, assessment);
    }

    return map;
  }, [grid]);

  const categoryNameById = useMemo(() => {
    return new Map(categories.map((category) => [category.id, category.name]));
  }, [categories]);

  const statusLabelByKey = useMemo(() => {
    return new Map(statusLabels.map((label) => [label.key, label]));
  }, [statusLabels]);

  const visibleGridAssessments = useMemo(() => {
    if (!grid) {
      return [];
    }

    if (selectedGridReportingPeriodId === "all") {
      return grid.assessments;
    }

    if (selectedGridReportingPeriodId === "unassigned") {
      return grid.assessments.filter((assessment) => !assessment.reportingPeriod);
    }

    return grid.assessments.filter(
      (assessment) => assessment.reportingPeriod?.id === selectedGridReportingPeriodId,
    );
  }, [grid, selectedGridReportingPeriodId]);

  const gridAssessmentGroups = useMemo(() => {
    if (!grid) {
      return [];
    }

    if (selectedGridReportingPeriodId !== "all") {
      return [
        {
          key: selectedGridReportingPeriodId,
          label:
            selectedGridReportingPeriodId === "unassigned"
              ? "Unassigned"
              : reportingPeriods.find((period) => period.id === selectedGridReportingPeriodId)
                  ?.name ?? "Reporting period",
          assessments: visibleGridAssessments,
          isLocked:
            selectedGridReportingPeriodId === "unassigned"
              ? false
              : reportingPeriods.find((period) => period.id === selectedGridReportingPeriodId)
                  ?.isLocked ?? false,
          order:
            selectedGridReportingPeriodId === "unassigned"
              ? 9999
              : reportingPeriods.find((period) => period.id === selectedGridReportingPeriodId)
                  ?.order ?? 9999,
        },
      ];
    }

    const byKey = new Map<
      string,
      {
        key: string;
        label: string;
        order: number;
        isLocked: boolean;
        assessments: typeof visibleGridAssessments;
      }
    >();

    for (const assessment of visibleGridAssessments) {
      const period = assessment.reportingPeriod;
      const key = period?.id ?? "unassigned";
      const existing =
        byKey.get(key) ??
        {
          key,
          label: period ? `${period.order}. ${period.name}` : "Unassigned",
          order: period?.order ?? 9999,
          isLocked: period?.isLocked ?? false,
          assessments: [],
        };

      existing.assessments.push(assessment);
      byKey.set(key, existing);
    }

    return Array.from(byKey.values()).sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }

      return a.label.localeCompare(b.label);
    });
  }, [grid, reportingPeriods, selectedGridReportingPeriodId, visibleGridAssessments]);

  const pendingGridChangeCount = useMemo(() => {
    if (!gridResultsByAssessmentId) {
      return 0;
    }

    let count = 0;
    const touchedCellKeys = new Set([
      ...Object.keys(draftGridScores),
      ...Object.keys(draftGridStatuses),
      ...Object.keys(draftGridComments),
    ]);

    for (const key of touchedCellKeys) {
      const [assessmentId, studentId] = key.split(":");
      const originalEntry = gridResultsByAssessmentId.get(assessmentId)?.get(studentId) ?? null;
      const originalScore =
        originalEntry?.score === null || originalEntry?.score === undefined
          ? ""
          : String(originalEntry.score);
      const originalStatus = originalEntry?.statusKey ?? "";
      const originalComment = (originalEntry?.comment ?? "").trim();

      const nextScore = (draftGridScores[key] ?? originalScore).trim();
      const nextStatus = (draftGridStatuses[key] ?? originalStatus).trim();
      const nextComment = (draftGridComments[key] ?? originalComment).trim();

      if (
        nextScore !== originalScore ||
        nextStatus.toUpperCase() !== originalStatus.toUpperCase() ||
        nextComment !== originalComment
      ) {
        count += 1;
      }
    }

    return count;
  }, [draftGridComments, draftGridScores, draftGridStatuses, gridResultsByAssessmentId]);

  const studentIndexById = useMemo(() => {
    const map = new Map<string, number>();
    if (!grid) {
      return map;
    }

    for (const [index, student] of grid.students.entries()) {
      map.set(student.id, index);
    }
    return map;
  }, [grid]);

  const assessmentIndexById = useMemo(() => {
    const map = new Map<string, number>();
    for (const [index, assessment] of visibleGridAssessments.entries()) {
      map.set(assessment.id, index);
    }
    return map;
  }, [visibleGridAssessments]);

  useEffect(() => {
    async function loadInitial() {
      setIsLoading(true);
      setError(null);

      try {
        const classResponse =
          mode === "teacher"
            ? await listMyClasses()
            : await listClasses({ includeInactive: includeInactiveClasses });

        const requested =
          requestedClassId && classResponse.some((entry) => entry.id === requestedClassId)
            ? requestedClassId
            : "";
        const initialClassId = requested || classResponse[0]?.id || "";
        const initialSchoolId =
          mode === "admin"
            ? classResponse.find((entry) => entry.id === initialClassId)?.schoolId ??
              classResponse[0]?.schoolId ??
              ""
            : "";

        setClasses(classResponse);
        setSelectedSchoolId((current) => {
          if (mode !== "admin") {
            return current;
          }

          if (requested) {
            return initialSchoolId;
          }

          return current || initialSchoolId;
        });
        setSelectedClassId((current) => {
          if (requested) {
            return requested;
          }

          if (current && classResponse.some((entry) => entry.id === current)) {
            return current;
          }

          return initialClassId;
        });
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load gradebook workspace.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadInitial();
  }, [includeInactiveClasses, mode, requestedClassId]);

  useEffect(() => {
    if (!selectedClassId && visibleClasses[0]) {
      setSelectedClassId(visibleClasses[0].id);
      return;
    }

    if (
      selectedClassId &&
      !visibleClasses.some((schoolClass) => schoolClass.id === selectedClassId)
    ) {
      setSelectedClassId(visibleClasses[0]?.id ?? "");
    }
  }, [selectedClassId, visibleClasses]);

  useEffect(() => {
    async function loadReportingPeriodsForClass() {
      if (!selectedClass) {
        setReportingPeriods([]);
        setReportingPeriodError(null);
        return;
      }

      setReportingPeriodError(null);

      try {
        const response = await listReportingPeriods({
          schoolId: selectedClass.schoolId,
          schoolYearId: selectedClass.schoolYearId,
        });
        setReportingPeriods(response);
      } catch (loadError) {
        setReportingPeriods([]);
        setReportingPeriodError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load reporting periods.",
        );
      }
    }

    void loadReportingPeriodsForClass();
  }, [selectedClass]);

  useEffect(() => {
    async function loadClassSupportData() {
      if (!selectedClassId || !selectedClass) {
        setStatusLabels([]);
        setCategories([]);
        setStatusLabelError(null);
        return;
      }

      setStatusLabelError(null);

      const [statusResult, categoriesResult] = await Promise.allSettled([
        listAssessmentResultStatusLabels({ schoolId: selectedClass.schoolId, includeInactive: false }),
        listAssessmentCategories(selectedClassId, { includeInactive: true }),
      ]);

      if (statusResult.status === "fulfilled") {
        setStatusLabels(statusResult.value);
      } else {
        setStatusLabels([]);
        setStatusLabelError(
          statusResult.reason instanceof Error
            ? statusResult.reason.message
            : "Unable to load result statuses.",
        );
      }

      if (categoriesResult.status === "fulfilled") {
        setCategories(categoriesResult.value);
      } else {
        setCategories([]);
      }
    }

    void loadClassSupportData();
  }, [selectedClass, selectedClassId]);

  async function refreshClassData(nextClassId = selectedClassId) {
    if (!nextClassId) {
      setSummary(null);
      setSummaryError(null);
      setGrid(null);
      setGridError(null);
      return;
    }

    setIsLoadingGrid(true);
    setSummaryError(null);
    setGridError(null);
    setGridSaveError(null);

    const [summaryResult, gridResult] = await Promise.allSettled([
      getClassGradeSummary(nextClassId),
      getClassGradebookGrid(nextClassId),
    ]);

    if (summaryResult.status === "fulfilled") {
      setSummary(summaryResult.value);
    } else {
      setSummary(null);
      setSummaryError(
        summaryResult.reason instanceof Error
          ? summaryResult.reason.message
          : "Unable to load class summary.",
      );
    }

    if (gridResult.status === "fulfilled") {
      setGrid(gridResult.value);
    } else {
      setGrid(null);
      setGridError(
        gridResult.reason instanceof Error
          ? gridResult.reason.message
          : "Unable to load gradebook grid.",
      );
    }

    setIsLoadingGrid(false);
  }

  useEffect(() => {
    setDraftGridScores({});
    setDraftGridStatuses({});
    setDraftGridComments({});
    setGridSaveError(null);
    setOverrideSaveError(null);
    setSelectedGridReportingPeriodId("all");
    setSuccessMessage(null);
    setLastSavedAt(null);
    setSavingOverrideStudentId(null);
    setOverridePercentByStudentId({});
    setOverrideReasonByStudentId({});
    void refreshClassData(selectedClassId);
  }, [selectedClassId]);

  useEffect(() => {
    if (!summary) {
      setOverridePercentByStudentId({});
      setOverrideReasonByStudentId({});
      return;
    }

    setOverridePercentByStudentId(
      Object.fromEntries(
        summary.students.map((entry) => [
          entry.student.id,
          entry.override?.overridePercent === null ||
          entry.override?.overridePercent === undefined
            ? ""
            : String(entry.override.overridePercent),
        ]),
      ),
    );
    setOverrideReasonByStudentId(
      Object.fromEntries(
        summary.students.map((entry) => [
          entry.student.id,
          entry.override?.overrideReason ?? "",
        ]),
      ),
    );
  }, [summary]);

  function focusCell(studentIndex: number, assessmentIndex: number) {
    const selector = `[data-scoresheet-cell='${studentIndex}:${assessmentIndex}']`;
    const next = document.querySelector<HTMLInputElement>(selector);
    next?.focus();
    next?.select?.();
  }

  async function handleSaveGridEdits() {
    if (!grid || !gridResultsByAssessmentId) {
      return;
    }

    setIsSavingGrid(true);
    setGridSaveError(null);
    setSuccessMessage(null);

    try {
      const gradesByAssessmentId = new Map<string, UpsertAssessmentGradeInput[]>();
      const touchedCellKeys = new Set([
        ...Object.keys(draftGridScores),
        ...Object.keys(draftGridStatuses),
        ...Object.keys(draftGridComments),
      ]);

      for (const key of touchedCellKeys) {
        const [assessmentId, studentId] = key.split(":");
        const assessment = gridAssessmentById.get(assessmentId);
        if (!assessment) {
          continue;
        }

        if (assessment.reportingPeriod?.isLocked) {
          continue;
        }

        const originalEntry = gridResultsByAssessmentId.get(assessmentId)?.get(studentId) ?? null;
        const originalScore = originalEntry?.score ?? null;
        const originalStatusKey = originalEntry?.statusKey ?? null;
        const originalComment = (originalEntry?.comment ?? "").trim() || null;

        const scoreTouched = Object.prototype.hasOwnProperty.call(draftGridScores, key);
        const statusTouched = Object.prototype.hasOwnProperty.call(draftGridStatuses, key);
        const commentTouched = Object.prototype.hasOwnProperty.call(draftGridComments, key);

        let nextScore = originalScore;
        if (scoreTouched) {
          const rawScore = (draftGridScores[key] ?? "").trim();
          if (!rawScore) {
            nextScore = null;
          } else {
            const parsed = Number(rawScore);
            if (!Number.isFinite(parsed) || parsed < 0) {
              throw new Error(`Invalid score provided for ${assessment.title}.`);
            }

            if (parsed > assessment.maxScore) {
              throw new Error(`Score for ${assessment.title} cannot exceed ${assessment.maxScore}.`);
            }

            nextScore = parsed;
          }
        }

        const nextStatusKey = statusTouched
          ? ((draftGridStatuses[key] ?? "").trim().toUpperCase() || null)
          : originalStatusKey;
        const nextComment = commentTouched
          ? ((draftGridComments[key] ?? "").trim() || null)
          : originalComment;

        const changed =
          nextScore !== originalScore ||
          nextStatusKey !== originalStatusKey ||
          nextComment !== originalComment;

        if (!changed) {
          continue;
        }

        const bucket = gradesByAssessmentId.get(assessmentId) ?? [];
        if (nextScore === null && nextStatusKey === null && nextComment === null) {
          bucket.push({ studentId, clear: true });
        } else {
          bucket.push({
            studentId,
            score: nextScore,
            statusLabelKey: nextStatusKey,
            comment: nextComment,
          });
        }
        gradesByAssessmentId.set(assessmentId, bucket);
      }

      if (gradesByAssessmentId.size === 0) {
        setSuccessMessage("No scoresheet changes to save.");
        return;
      }

      const batches = Array.from(gradesByAssessmentId.entries());
      const settled = await Promise.allSettled(
        batches.map(([assessmentId, grades]) => upsertAssessmentGrades(assessmentId, grades)),
      );

      const failures = settled
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => result.status === "rejected") as Array<{
        result: PromiseRejectedResult;
        index: number;
      }>;

      const successAssessmentIds = settled
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => result.status === "fulfilled")
        .map(({ index }) => batches[index]?.[0])
        .filter(Boolean) as string[];

      if (successAssessmentIds.length > 0) {
        setDraftGridScores((current) => {
          const next: Record<string, string> = { ...current };
          for (const assessmentId of successAssessmentIds) {
            for (const student of grid.students) {
              delete next[`${assessmentId}:${student.id}`];
            }
          }
          return next;
        });
        setDraftGridStatuses((current) => {
          const next: Record<string, string> = { ...current };
          for (const assessmentId of successAssessmentIds) {
            for (const student of grid.students) {
              delete next[`${assessmentId}:${student.id}`];
            }
          }
          return next;
        });
        setDraftGridComments((current) => {
          const next: Record<string, string> = { ...current };
          for (const assessmentId of successAssessmentIds) {
            for (const student of grid.students) {
              delete next[`${assessmentId}:${student.id}`];
            }
          }
          return next;
        });

        await refreshClassData();
      }

      if (failures.length > 0) {
        setGridSaveError(
          failures
            .map(({ result }) =>
              result.reason instanceof Error ? result.reason.message : "Unable to save grades.",
            )
            .join(" "),
        );
      } else {
        setSuccessMessage("Scoresheet saved.");
        setLastSavedAt(new Date());
      }
    } catch (saveError) {
      setGridSaveError(saveError instanceof Error ? saveError.message : "Unable to save grades.");
    } finally {
      setIsSavingGrid(false);
    }
  }

  async function handleSaveOverride(studentId: string) {
    if (!selectedClassId) {
      return;
    }

    setSavingOverrideStudentId(studentId);
    setOverrideSaveError(null);
    setSuccessMessage(null);

    try {
      const rawPercent = (overridePercentByStudentId[studentId] ?? "").trim();
      const parsedPercent = rawPercent.length === 0 ? undefined : Number(rawPercent);

      if (parsedPercent === undefined) {
        throw new Error("Override percent is required.");
      }

      if (!Number.isFinite(parsedPercent) || parsedPercent < 0 || parsedPercent > 100) {
        throw new Error("Override percent must be a number between 0 and 100.");
      }

      await upsertGradeOverride(
        { classId: selectedClassId, studentId },
        {
          overridePercent: parsedPercent,
          overrideReason: (overrideReasonByStudentId[studentId] ?? "").trim() || null,
        },
      );

      await refreshClassData();
      setSuccessMessage("Grade override saved.");
    } catch (saveError) {
      setOverrideSaveError(
        saveError instanceof Error ? saveError.message : "Unable to save override.",
      );
    } finally {
      setSavingOverrideStudentId(null);
    }
  }

  async function handleClearOverride(studentId: string) {
    if (!selectedClassId) {
      return;
    }

    setSavingOverrideStudentId(studentId);
    setOverrideSaveError(null);
    setSuccessMessage(null);

    try {
      await deleteGradeOverride({ classId: selectedClassId, studentId });
      await refreshClassData();
      setSuccessMessage("Grade override cleared.");
    } catch (clearError) {
      setOverrideSaveError(
        clearError instanceof Error ? clearError.message : "Unable to clear override.",
      );
    } finally {
      setSavingOverrideStudentId(null);
    }
  }

  const saveShortcutRef = useRef(handleSaveGridEdits);

  useEffect(() => {
    saveShortcutRef.current = handleSaveGridEdits;
  }, [handleSaveGridEdits]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveShortcutRef.current();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading gradebook...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gradebook Scoresheet"
        description="Enter scores quickly with students as rows and assessments as columns."
        meta={
          <>
            {pendingGridChangeCount > 0 ? (
              <Badge variant="warning">{pendingGridChangeCount} unsaved</Badge>
            ) : isSavingGrid ? (
              <Badge variant="warning">Saving…</Badge>
            ) : lastSavedAt ? (
              <Badge variant="success">Saved</Badge>
            ) : null}
            <Badge variant="neutral">{grid?.studentCount ?? 0} students</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {selectedClassId ? (
              <Link
                className={buttonClassName({ variant: "secondary" })}
                href={`/${mode}/classes/${selectedClassId}/assignments`}
              >
                Assignments
              </Link>
            ) : null}
            {selectedClassId ? (
              <Link
                className={buttonClassName({ variant: "secondary" })}
                href={
                  mode === "admin"
                    ? `/admin/classes/${selectedClassId}/summary`
                    : `/teacher/classes/${selectedClassId}`
                }
              >
                Class summary
              </Link>
            ) : null}
            <Button
              disabled={isSavingGrid || isLoadingGrid || pendingGridChangeCount === 0}
              onClick={() => void handleSaveGridEdits()}
              type="button"
            >
              {isSavingGrid ? "Saving..." : "Save scores"}
            </Button>
          </div>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Context</CardTitle>
          <div className="grid gap-3 md:grid-cols-3">
            {mode === "admin" ? (
              <Field htmlFor="scoresheet-school" label="School">
                <Select
                  id="scoresheet-school"
                  onChange={(event) => setSelectedSchoolId(event.target.value)}
                  value={selectedSchoolId}
                >
                  <option value="">All schools</option>
                  {availableSchoolOptions.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field htmlFor="scoresheet-class" label="Class">
              <Select
                disabled={visibleClasses.length === 0}
                id="scoresheet-class"
                onChange={(event) => {
                  setSelectedClassId(event.target.value);
                  setSuccessMessage(null);
                  setGridSaveError(null);
                  router.replace(`/${mode}/gradebook?classId=${encodeURIComponent(event.target.value)}`);
                }}
                value={selectedClassId}
              >
                <option value="">Select class</option>
                {visibleClasses.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {getClassOptionLabel(schoolClass)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="scoresheet-reporting-period" label="Reporting period">
              <Select
                disabled={!grid}
                id="scoresheet-reporting-period"
                onChange={(event) => setSelectedGridReportingPeriodId(event.target.value)}
                value={selectedGridReportingPeriodId}
              >
                <option value="all">All periods</option>
                <option value="unassigned">Unassigned</option>
                {reportingPeriods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.order}. {period.name}
                    {period.isLocked ? " (Locked)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {mode === "admin" ? (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                checked={includeInactiveClasses}
                onChange={(event) => setIncludeInactiveClasses(event.target.checked)}
                type="checkbox"
              />
              Include inactive classes
            </label>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {reportingPeriodError ? <Notice tone="danger">{reportingPeriodError}</Notice> : null}
          {statusLabelError ? <Notice tone="danger">{statusLabelError}</Notice> : null}
          {summaryError ? <Notice tone="danger">{summaryError}</Notice> : null}
          {gridError ? <Notice tone="danger">{gridError}</Notice> : null}
          {gridSaveError ? <Notice tone="danger">{gridSaveError}</Notice> : null}
          {overrideSaveError ? <Notice tone="danger">{overrideSaveError}</Notice> : null}
          {grid ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="neutral">Empty</Badge>
              <Badge variant="warning">Missing</Badge>
              <Badge variant="neutral">Exempt</Badge>
              <Badge variant="warning">Absent</Badge>
              <Badge variant="warning">Late</Badge>
              <Badge variant="success">Completed</Badge>
            </div>
          ) : null}

          {!selectedClassId ? (
            <EmptyState
              title="Select a class"
              description="Choose a class to load the scoresheet grid."
            />
          ) : isLoadingGrid ? (
            <p className="text-sm text-slate-500">Loading scoresheet...</p>
          ) : !grid ? (
            <EmptyState
              title="No gradebook grid available"
              description="This class does not have a gradebook grid yet."
            />
          ) : grid.students.length === 0 ? (
            <EmptyState
              title="No students enrolled"
              description="Enroll students in this class to start entering scores."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    {selectedGridReportingPeriodId === "all" && gridAssessmentGroups.length > 1 ? (
                      <>
                        <tr className="sticky top-0 z-30 bg-slate-50/80">
                          <th className="sticky left-0 z-40 bg-slate-50/80 px-4 py-3 font-semibold text-slate-700" rowSpan={2}>
                            Student
                          </th>
                          {gridAssessmentGroups.map((group) => (
                            <th
                              className="px-2 py-3 font-semibold text-slate-700"
                              colSpan={group.assessments.length}
                              key={group.key}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span>{group.label}</span>
                                {group.isLocked ? <Badge variant="neutral">Locked</Badge> : null}
                              </div>
                            </th>
                          ))}
                          <th className="px-4 py-3 font-semibold text-slate-700" rowSpan={2}>
                            Avg
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700" rowSpan={2}>
                            %
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700" rowSpan={2}>
                            Grade
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700" rowSpan={2}>
                            Override
                          </th>
                        </tr>
                        <tr className="sticky top-[2.875rem] z-30 bg-slate-50/80">
                          {gridAssessmentGroups.flatMap((group) =>
                            group.assessments.map((assessment) => (
                              <th
                                className="px-2 py-2 align-bottom font-semibold text-slate-700"
                                key={assessment.id}
                              >
                                <button
                                  className="min-w-[10rem] text-left hover:underline"
                                  onClick={() => {
                                    void router.push(`/${mode}/classes/${grid.classId}/assignments`);
                                  }}
                                  type="button"
                                >
                                  <span className="block font-semibold text-slate-800">
                                    {assessment.title}
                                  </span>
                                  <span className="mt-0.5 block text-xs font-normal text-slate-500">
                                    Max {assessment.maxScore} •{" "}
                                    {assessment.categoryId
                                      ? categoryNameById.get(assessment.categoryId) ?? "Category"
                                      : "No category"}{" "}
                                    • {assessment.dueAt ? new Date(assessment.dueAt).toLocaleDateString() : "No date"}
                                  </span>
                                  <span className="mt-0.5 block text-xs font-normal text-slate-500">
                                    {assessment.assessmentType.name}
                                  </span>
                                </button>
                              </th>
                            )),
                          )}
                        </tr>
                      </>
                    ) : (
                      <tr className="sticky top-0 z-30 bg-slate-50/80">
                        <th className="sticky left-0 z-40 bg-slate-50/80 px-4 py-3 font-semibold text-slate-700">
                          Student
                        </th>
                        {visibleGridAssessments.map((assessment) => (
                          <th
                            className="px-2 py-2 align-bottom font-semibold text-slate-700"
                            key={assessment.id}
                          >
                            <button
                              className="min-w-[10rem] text-left hover:underline"
                              onClick={() => {
                                void router.push(`/${mode}/classes/${grid.classId}/assignments`);
                              }}
                              type="button"
                            >
                              <span className="block font-semibold text-slate-800">
                                {assessment.title}
                              </span>
                              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                                Max {assessment.maxScore} •{" "}
                                {assessment.categoryId
                                  ? categoryNameById.get(assessment.categoryId) ?? "Category"
                                  : "No category"}{" "}
                                • {assessment.dueAt ? new Date(assessment.dueAt).toLocaleDateString() : "No date"}
                              </span>
                              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                                {assessment.assessmentType.name}
                                {assessment.reportingPeriod?.isLocked ? " • Locked" : ""}
                              </span>
                            </button>
                          </th>
                        ))}
                        <th className="px-4 py-3 font-semibold text-slate-700">Avg</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">%</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Grade</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Override</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {grid.students.map((student) => {
                      const summaryEntry = summaryByStudentId.get(student.id);
                      const overridePercentDraft = overridePercentByStudentId[student.id] ?? "";
                      const overrideReasonDraft = overrideReasonByStudentId[student.id] ?? "";
                      const isSavingStudentOverride = savingOverrideStudentId === student.id;

                      return (
                        <tr className="align-top hover:bg-slate-50" key={student.id}>
                          <td className="sticky left-0 z-20 bg-white px-4 py-3">
                            <button
                              className="text-left font-medium text-slate-900 hover:underline"
                              onClick={() => {
                                router.push(`/${mode}/classes/${grid.classId}/students/${student.id}`);
                              }}
                              type="button"
                            >
                              {getFullName(student.firstName, student.lastName)}
                            </button>
                            <p className="mt-1 text-xs text-slate-500">@{student.username}</p>
                          </td>
                          {visibleGridAssessments.map((assessment) => {
                            const result =
                              gridResultsByAssessmentId?.get(assessment.id)?.get(student.id) ??
                              null;
                            const originalScore = result?.score ?? null;
                            const originalStatusKey = result?.statusKey ?? null;
                            const originalComment = (result?.comment ?? "").trim() || null;
                            const cellKey = `${assessment.id}:${student.id}`;
                            const scoreDraft = draftGridScores[cellKey];
                            const statusDraft = draftGridStatuses[cellKey];
                            const commentDraft = draftGridComments[cellKey];
                            const scoreValue =
                              scoreDraft !== undefined
                                ? scoreDraft
                                : originalScore === null || originalScore === undefined
                                  ? ""
                                  : String(originalScore);
                            const statusValue =
                              statusDraft !== undefined ? statusDraft : originalStatusKey ?? "";
                            const commentValue =
                              commentDraft !== undefined
                                ? commentDraft
                                : originalComment ?? "";

                            const trimmedScore = scoreValue.trim();
                            const parsedScore = trimmedScore ? Number(trimmedScore) : null;
                            const effectiveScore =
                              parsedScore !== null && Number.isFinite(parsedScore)
                                ? parsedScore
                                : trimmedScore.length === 0
                                  ? null
                                  : originalScore;
                            const effectiveStatusKey = statusValue.trim().toUpperCase() || null;
                            const effectiveBehavior =
                              effectiveStatusKey
                                ? statusLabelByKey.get(effectiveStatusKey)?.behavior ??
                                  result?.statusBehavior ??
                                  null
                                : null;
                            const percent =
                              effectiveScore !== null && effectiveScore !== undefined
                                ? round1((effectiveScore / assessment.maxScore) * 100)
                                : effectiveBehavior === "COUNT_AS_ZERO"
                                  ? 0
                                  : effectiveBehavior === "EXCLUDE_FROM_CALCULATION"
                                    ? null
                                    : null;
                            const isLocked = assessment.reportingPeriod?.isLocked ?? false;
                            const isDirty =
                              trimmedScore !==
                                (originalScore === null || originalScore === undefined
                                  ? ""
                                  : String(originalScore)) ||
                              effectiveStatusKey !== (originalStatusKey ?? null) ||
                              commentValue.trim() !== (originalComment ?? "");

                            const statusToneClass =
                              effectiveStatusKey === "MISSING" ||
                              (effectiveBehavior === "COUNT_AS_ZERO" &&
                                (effectiveScore === null || effectiveScore === undefined))
                                ? "border-rose-200 bg-rose-50"
                                : effectiveStatusKey === "EXEMPT"
                                  ? "border-slate-200 bg-slate-100"
                                  : effectiveStatusKey === "ABSENT"
                                    ? "border-amber-200 bg-amber-50"
                                    : effectiveStatusKey === "LATE"
                                      ? "border-yellow-200 bg-yellow-50"
                                      : effectiveStatusKey === "COMPLETED" || effectiveScore !== null
                                        ? "border-emerald-200 bg-emerald-50"
                                        : "border-slate-200 bg-white";

                            const studentIndex = studentIndexById.get(student.id) ?? -1;
                            const assessmentIndex = assessmentIndexById.get(assessment.id) ?? -1;

                            return (
                              <td className="px-2 py-2" key={`${student.id}-${assessment.id}`}>
                                <div
                                  className={[
                                    "space-y-1 rounded-lg border p-1.5",
                                    statusToneClass,
                                    isDirty ? "ring-1 ring-amber-300" : "",
                                  ].join(" ")}
                                >
                                  <Input
                                    aria-label={`${getFullName(student.firstName, student.lastName)} ${assessment.title}`}
                                    className="h-8 w-20 rounded-lg px-2 text-right tabular-nums"
                                    data-scoresheet-cell={`${studentIndex}:${assessmentIndex}`}
                                    disabled={isSavingGrid || isLocked}
                                    inputMode="decimal"
                                    onChange={(event) => {
                                      const nextValue = event.target.value;
                                      setDraftGridScores((current) => ({
                                        ...current,
                                        [cellKey]: nextValue,
                                      }));
                                    }}
                                    onKeyDown={(event) => {
                                      if (!grid) {
                                        return;
                                      }

                                      const baseStudentIndex = studentIndexById.get(student.id) ?? -1;
                                      const baseAssessmentIndex = assessmentIndexById.get(assessment.id) ?? -1;

                                      if (baseStudentIndex < 0 || baseAssessmentIndex < 0) {
                                        return;
                                      }

                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        focusCell(Math.min(grid.students.length - 1, baseStudentIndex + 1), baseAssessmentIndex);
                                        return;
                                      }

                                      if (event.key === "ArrowRight") {
                                        event.preventDefault();
                                        focusCell(baseStudentIndex, Math.min(visibleGridAssessments.length - 1, baseAssessmentIndex + 1));
                                        return;
                                      }

                                      if (event.key === "ArrowLeft") {
                                        event.preventDefault();
                                        focusCell(baseStudentIndex, Math.max(0, baseAssessmentIndex - 1));
                                        return;
                                      }

                                      if (event.key === "ArrowDown") {
                                        event.preventDefault();
                                        focusCell(Math.min(grid.students.length - 1, baseStudentIndex + 1), baseAssessmentIndex);
                                        return;
                                      }

                                      if (event.key === "ArrowUp") {
                                        event.preventDefault();
                                        focusCell(Math.max(0, baseStudentIndex - 1), baseAssessmentIndex);
                                      }
                                    }}
                                    placeholder="—"
                                    title={
                                      percent === null
                                        ? isLocked
                                          ? "Locked"
                                          : "No grade"
                                        : `${effectiveScore ?? 0} / ${assessment.maxScore} (${percent}%)${isLocked ? " (Locked)" : ""}`
                                    }
                                    value={scoreValue}
                                  />
                                  <div className="flex items-center gap-1">
                                    <Select
                                      aria-label={`Status for ${getFullName(student.firstName, student.lastName)} ${assessment.title}`}
                                      className="h-8 min-w-[7.5rem] text-xs"
                                      disabled={isSavingGrid || isLocked || statusLabels.length === 0}
                                      onChange={(event) => {
                                        setDraftGridStatuses((current) => ({
                                          ...current,
                                          [cellKey]: event.target.value,
                                        }));
                                      }}
                                      value={statusValue}
                                    >
                                      <option value="">No status</option>
                                      {statusLabels.map((label) => (
                                        <option key={label.id} value={label.key}>
                                          {label.label}
                                        </option>
                                      ))}
                                    </Select>
                                    <button
                                      className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 px-2 text-xs text-slate-600 hover:bg-slate-100"
                                      disabled={isSavingGrid || isLocked}
                                      onClick={() => {
                                        const next = window.prompt(
                                          `Comment for ${assessment.title}`,
                                          commentValue,
                                        );
                                        if (next === null) {
                                          return;
                                        }

                                        setDraftGridComments((current) => ({
                                          ...current,
                                          [cellKey]: next,
                                        }));
                                      }}
                                      title="Edit comment"
                                      type="button"
                                    >
                                      {commentValue.trim() ? "💬*" : "💬"}
                                    </button>
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-slate-900">
                            {summaryEntry?.averagePercent === null || summaryEntry?.averagePercent === undefined
                              ? "—"
                              : roundDisplayedPercent(summaryEntry.averagePercent)}
                          </td>
                          <td className="px-4 py-3 text-slate-900">
                            {formatPercent(summaryEntry?.averagePercent ?? null)}
                          </td>
                          <td className="px-4 py-3 text-slate-900">
                            {summaryEntry?.averageLetterGrade ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="min-w-[14rem] space-y-2">
                              <div className="flex items-center gap-2">
                                <Input
                                  className="h-8 w-24 rounded-lg px-2 text-right tabular-nums"
                                  disabled={isSavingStudentOverride}
                                  inputMode="decimal"
                                  onChange={(event) =>
                                    setOverridePercentByStudentId((current) => ({
                                      ...current,
                                      [student.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="%"
                                  value={overridePercentDraft}
                                />
                                <Button
                                  disabled={isSavingStudentOverride}
                                  onClick={() => void handleSaveOverride(student.id)}
                                  size="sm"
                                  type="button"
                                >
                                  Save
                                </Button>
                                {summaryEntry?.override ? (
                                  <Button
                                    disabled={isSavingStudentOverride}
                                    onClick={() => void handleClearOverride(student.id)}
                                    size="sm"
                                    type="button"
                                    variant="secondary"
                                  >
                                    Clear
                                  </Button>
                                ) : null}
                              </div>
                              <Input
                                className="h-8 rounded-lg px-2 text-xs"
                                disabled={isSavingStudentOverride}
                                onChange={(event) =>
                                  setOverrideReasonByStudentId((current) => ({
                                    ...current,
                                    [student.id]: event.target.value,
                                  }))
                                }
                                placeholder="Reason (optional)"
                                value={overrideReasonDraft}
                              />
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Badge
                                  variant={summaryEntry?.override ? "warning" : "neutral"}
                                >
                                  {summaryEntry?.override ? "Overridden" : "Calculated"}
                                </Badge>
                                <span>
                                  Calc {formatPercent(summaryEntry?.calculatedAveragePercent ?? null)}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
