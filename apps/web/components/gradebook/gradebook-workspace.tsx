"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
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
  createAssessment,
  deleteAssessment,
  getAssessmentGrades,
  listAssessments,
  listAssessmentTypes,
  updateAssessment,
  upsertAssessmentGrades,
  type Assessment,
  type AssessmentGradeRow,
  type AssessmentType,
} from "@/lib/api/assessments";
import {
  listReportingPeriods,
  type ReportingPeriod,
} from "@/lib/api/reporting-periods";
import {
  listClasses,
  listMyClasses,
  type SchoolClass,
} from "@/lib/api/classes";
import {
  getClassGradeSummary,
  getClassGradebookGrid,
  getStudentInClassSummary,
  type ClassGradeSummary,
  type ClassGradebookGrid,
  type StudentInClassSummary,
} from "@/lib/api/gradebook";
import { getDisplayText } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { formatDateOnly, normalizeDateOnlyPayload } from "@/lib/date";

type Mode = "teacher" | "admin";

type AssessmentFormState = {
  mode: "create" | "edit";
  assessmentId: string | null;
  title: string;
  assessmentTypeId: string;
  maxScore: string;
  weight: string;
  reportingPeriodId: string;
  dueDate: string;
  isPublishedToParents: boolean;
};

function buildDefaultForm(types: AssessmentType[]): AssessmentFormState {
  return {
    mode: "create",
    assessmentId: null,
    title: "",
    assessmentTypeId: types[0]?.id ?? "",
    maxScore: "10",
    weight: "1",
    reportingPeriodId: "",
    dueDate: "",
    isPublishedToParents: false,
  };
}

function buildEditForm(assessment: Assessment): AssessmentFormState {
  const dueDate = normalizeDateOnlyPayload(assessment.dueAt);

  return {
    mode: "edit",
    assessmentId: assessment.id,
    title: assessment.title,
    assessmentTypeId: assessment.assessmentTypeId,
    maxScore: `${assessment.maxScore}`,
    weight: `${assessment.weight ?? 1}`,
    reportingPeriodId: assessment.reportingPeriodId ?? "",
    dueDate,
    isPublishedToParents: assessment.isPublishedToParents,
  };
}

function getClassOptionLabel(schoolClass: SchoolClass) {
  const className = getDisplayText(schoolClass.name);
  const subject = getDisplayText(
    schoolClass.subjectOption?.name ?? schoolClass.subject,
    "",
  );
  const gradeLevel = getDisplayText(schoolClass.gradeLevel?.name, "");

  return `${className}${gradeLevel ? ` • ${gradeLevel}` : ""}${subject ? ` • ${subject}` : ""}${schoolClass.isActive ? "" : " • Inactive"}`;
}

function formatPercent(value: number | null) {
  if (value === null || value === undefined) {
    return "—";
  }

  return `${value}%`;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function getFullName(firstName: unknown, lastName: unknown, fallback = "—") {
  const first = getDisplayText(firstName, "");
  const last = getDisplayText(lastName, "");
  const fullName = `${first} ${last}`.trim();

  return fullName || fallback;
}

export function GradebookWorkspace({ mode }: { mode: Mode }) {
  const {
    selectedSchoolId: schoolContextId,
    setSelectedSchoolId: setSchoolContextId,
  } = useAuth();
  const searchParams = useSearchParams();
  const requestedClassId = searchParams.get("classId") ?? "";
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [assessmentTypes, setAssessmentTypes] = useState<AssessmentType[]>([]);
  const [assessmentTypeError, setAssessmentTypeError] = useState<string | null>(
    null,
  );
  const [reportingPeriods, setReportingPeriods] = useState<ReportingPeriod[]>(
    [],
  );
  const [reportingPeriodError, setReportingPeriodError] = useState<
    string | null
  >(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [selectedGradeLevelId, setSelectedGradeLevelId] = useState("");
  const [selectedSubjectOptionId, setSelectedSubjectOptionId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [includeInactiveClasses, setIncludeInactiveClasses] = useState(false);
  const [formState, setFormState] = useState<AssessmentFormState>(() =>
    buildDefaultForm([]),
  );
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [gradeRows, setGradeRows] = useState<AssessmentGradeRow[]>([]);
  const [scoreByStudentId, setScoreByStudentId] = useState<
    Record<string, string>
  >({});
  const [commentByStudentId, setCommentByStudentId] = useState<
    Record<string, string>
  >({});
  const [summary, setSummary] = useState<ClassGradeSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [grid, setGrid] = useState<ClassGradebookGrid | null>(null);
  const [gridError, setGridError] = useState<string | null>(null);
  const [gridSaveError, setGridSaveError] = useState<string | null>(null);
  const [isSavingGrid, setIsSavingGrid] = useState(false);
  const [draftGridScores, setDraftGridScores] = useState<
    Record<string, string>
  >({});
  const [selectedGridReportingPeriodId, setSelectedGridReportingPeriodId] =
    useState<string>("all");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    null,
  );
  const [studentSummary, setStudentSummary] =
    useState<StudentInClassSummary | null>(null);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [studentScoreByAssessmentId, setStudentScoreByAssessmentId] = useState<
    Record<string, string>
  >({});
  const [studentCommentByAssessmentId, setStudentCommentByAssessmentId] =
    useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Assessment | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingClass, setIsLoadingClass] = useState(false);
  const [isLoadingGrid, setIsLoadingGrid] = useState(false);
  const [isLoadingGrades, setIsLoadingGrades] = useState(false);
  const [isLoadingStudentSummary, setIsLoadingStudentSummary] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingStudentDetail, setIsSavingStudentDetail] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
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

    return Array.from(schoolMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [classes]);

  const visibleClasses = useMemo(() => {
    const schoolFiltered =
      mode === "teacher"
        ? classes
        : selectedSchoolId
          ? classes.filter(
              (schoolClass) => schoolClass.schoolId === selectedSchoolId,
            )
          : classes;

    return schoolFiltered.filter((schoolClass) => {
      if (
        selectedGradeLevelId &&
        schoolClass.gradeLevelId !== selectedGradeLevelId
      ) {
        return false;
      }

      if (
        selectedSubjectOptionId &&
        schoolClass.subjectOptionId !== selectedSubjectOptionId
      ) {
        return false;
      }

      return true;
    });
  }, [
    classes,
    mode,
    selectedGradeLevelId,
    selectedSchoolId,
    selectedSubjectOptionId,
  ]);

  const availableGradeLevelOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const schoolClass of classes) {
      if (
        mode === "admin" &&
        selectedSchoolId &&
        schoolClass.schoolId !== selectedSchoolId
      ) {
        continue;
      }

      if (!schoolClass.gradeLevelId) {
        continue;
      }

      map.set(
        schoolClass.gradeLevelId,
        schoolClass.gradeLevel?.name ??
          `Grade level ${schoolClass.gradeLevelId}`,
      );
    }

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [classes, mode, selectedSchoolId]);

  const availableSubjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const schoolClass of classes) {
      if (
        mode === "admin" &&
        selectedSchoolId &&
        schoolClass.schoolId !== selectedSchoolId
      ) {
        continue;
      }

      if (!schoolClass.subjectOptionId) {
        continue;
      }

      map.set(
        schoolClass.subjectOptionId,
        schoolClass.subjectOption?.name ?? schoolClass.subject ?? "Subject",
      );
    }

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [classes, mode, selectedSchoolId]);

  const selectedClass = useMemo(
    () =>
      visibleClasses.find(
        (schoolClass) => schoolClass.id === selectedClassId,
      ) ?? null,
    [selectedClassId, visibleClasses],
  );

  const selectedAssessment = useMemo(
    () =>
      assessments.find((entry) => entry.id === selectedAssessmentId) ?? null,
    [assessments, selectedAssessmentId],
  );

  const selectedFormReportingPeriod = useMemo(() => {
    if (!formState.reportingPeriodId) {
      return null;
    }

    return (
      reportingPeriods.find(
        (period) => period.id === formState.reportingPeriodId,
      ) ?? null
    );
  }, [formState.reportingPeriodId, reportingPeriods]);

  const isAssessmentFormLocked = selectedFormReportingPeriod?.isLocked ?? false;
  const isEditingLockedAssessment =
    formState.mode === "edit" && isAssessmentFormLocked;

  const selectedAssessmentIsLocked = useMemo(() => {
    if (!selectedAssessmentId || !grid) {
      return false;
    }

    return (
      grid.assessments.find(
        (assessment) => assessment.id === selectedAssessmentId,
      )?.reportingPeriod?.isLocked ?? false
    );
  }, [grid, selectedAssessmentId]);

  const summaryByStudentId = useMemo(() => {
    const map = new Map<
      string,
      { averagePercent: number | null; averageLetterGrade: string | null }
    >();

    if (!summary) {
      return map;
    }

    for (const entry of summary.students) {
      map.set(entry.student.id, {
        averagePercent: entry.averagePercent,
        averageLetterGrade: entry.averageLetterGrade,
      });
    }

    return map;
  }, [summary]);

  const gridResultsByAssessmentId = useMemo(() => {
    if (!grid) {
      return null;
    }

    const byAssessmentId = new Map<
      string,
      Map<string, { score: number | null; comment: string | null }>
    >();

    for (const assessment of grid.assessments) {
      const byStudent = new Map<
        string,
        { score: number | null; comment: string | null }
      >();

      for (const result of assessment.results) {
        byStudent.set(result.studentId, {
          score: result.score,
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

  const visibleGridAssessments = useMemo(() => {
    if (!grid) {
      return [];
    }

    if (selectedGridReportingPeriodId === "all") {
      return grid.assessments;
    }

    if (selectedGridReportingPeriodId === "unassigned") {
      return grid.assessments.filter(
        (assessment) => !assessment.reportingPeriod,
      );
    }

    return grid.assessments.filter(
      (assessment) =>
        assessment.reportingPeriod?.id === selectedGridReportingPeriodId,
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
              : (reportingPeriods.find(
                  (period) => period.id === selectedGridReportingPeriodId,
                )?.name ?? "Reporting period"),
          assessments: visibleGridAssessments,
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
      const existing = byKey.get(key) ?? {
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
  }, [
    grid,
    reportingPeriods,
    selectedGridReportingPeriodId,
    visibleGridAssessments,
  ]);

  const pendingGridChangeCount = useMemo(() => {
    if (!gridResultsByAssessmentId) {
      return 0;
    }

    let count = 0;

    for (const [key, value] of Object.entries(draftGridScores)) {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }

      const [assessmentId, studentId] = key.split(":");
      const original =
        gridResultsByAssessmentId.get(assessmentId)?.get(studentId)?.score ??
        null;
      const numeric = Number(trimmed);
      if (!Number.isFinite(numeric)) {
        continue;
      }

      if (original !== numeric) {
        count += 1;
      }
    }

    return count;
  }, [draftGridScores, gridResultsByAssessmentId]);

  useEffect(() => {
    async function loadInitial() {
      setIsLoading(true);
      setError(null);
      setAssessmentTypeError(null);

      try {
        const classResponse =
          mode === "teacher"
            ? await listMyClasses()
            : await listClasses({ includeInactive: includeInactiveClasses });

        const requested =
          requestedClassId &&
          classResponse.some((entry) => entry.id === requestedClassId)
            ? requestedClassId
            : "";
        const initialClassId = requested || classResponse[0]?.id || "";
        const contextSchoolId =
          mode === "admin" &&
          schoolContextId &&
          classResponse.some((entry) => entry.schoolId === schoolContextId)
            ? schoolContextId
            : "";
        const initialSchoolId =
          mode === "admin"
            ? (classResponse.find((entry) => entry.id === initialClassId)
                ?.schoolId ??
              contextSchoolId ??
              classResponse[0]?.schoolId ??
              "")
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
  }, [includeInactiveClasses, mode, requestedClassId, schoolContextId]);

  useEffect(() => {
    if (mode !== "admin") {
      return;
    }

    setSchoolContextId(selectedSchoolId || null);
  }, [mode, selectedSchoolId, setSchoolContextId]);

  useEffect(() => {
    async function loadAssessmentTypes() {
      const schoolIdForTypes =
        selectedClass?.schoolId || (mode === "admin" ? selectedSchoolId : "");

      if (!schoolIdForTypes) {
        setAssessmentTypes([]);
        setFormState(buildDefaultForm([]));
        setAssessmentTypeError(null);
        return;
      }

      setAssessmentTypeError(null);

      try {
        const response = await listAssessmentTypes({
          schoolId: schoolIdForTypes,
        });
        setAssessmentTypes(response);
        setFormState((current) => {
          if (current.mode === "edit") {
            return current;
          }

          return buildDefaultForm(response);
        });
      } catch (loadError) {
        setAssessmentTypes([]);
        setFormState(buildDefaultForm([]));
        setAssessmentTypeError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load assessment types.",
        );
      }
    }

    void loadAssessmentTypes();
  }, [mode, selectedClass?.schoolId, selectedSchoolId]);

  useEffect(() => {
    async function loadReportingPeriodsForClass() {
      if (!selectedClass) {
        setReportingPeriods([]);
        setReportingPeriodError(null);
        setFormState((current) => ({ ...current, reportingPeriodId: "" }));
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

  async function refreshClassData(nextClassId = selectedClassId) {
    if (!nextClassId) {
      setAssessments([]);
      setSummary(null);
      setSummaryError(null);
      setGrid(null);
      setGridError(null);
      return;
    }

    setIsLoadingClass(true);
    setIsLoadingGrid(true);
    setError(null);
    setSummaryError(null);
    setGridError(null);

    const [assessmentsResult, summaryResult, gridResult] =
      await Promise.allSettled([
        listAssessments(nextClassId),
        getClassGradeSummary(nextClassId),
        getClassGradebookGrid(nextClassId),
      ]);

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

    setIsLoadingClass(false);
    setIsLoadingGrid(false);
  }

  useEffect(() => {
    setSelectedAssessmentId("");
    setGradeRows([]);
    setScoreByStudentId({});
    setCommentByStudentId({});
    setSelectedStudentId(null);
    setStudentSummary(null);
    setStudentScoreByAssessmentId({});
    setStudentCommentByAssessmentId({});
    setDraftGridScores({});
    setGridSaveError(null);
    setSelectedGridReportingPeriodId("all");
    setSuccessMessage(null);
    void refreshClassData(selectedClassId);
  }, [selectedClassId]);

  useEffect(() => {
    async function loadGrades() {
      if (!selectedAssessmentId) {
        setGradeRows([]);
        setScoreByStudentId({});
        setCommentByStudentId({});
        return;
      }

      setIsLoadingGrades(true);
      setError(null);

      try {
        const response = await getAssessmentGrades(selectedAssessmentId);
        setGradeRows(response.grades);

        const nextScores: Record<string, string> = {};
        const nextComments: Record<string, string> = {};

        for (const row of response.grades) {
          nextScores[row.student.id] =
            row.result?.score === null || row.result?.score === undefined
              ? ""
              : `${row.result.score}`;
          nextComments[row.student.id] = row.result?.comment ?? "";
        }

        setScoreByStudentId(nextScores);
        setCommentByStudentId(nextComments);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load assessment grades.",
        );
      } finally {
        setIsLoadingGrades(false);
      }
    }

    void loadGrades();
  }, [selectedAssessmentId]);

  const selectedStudent = useMemo(() => {
    if (!grid || !selectedStudentId) {
      return null;
    }

    return (
      grid.students.find((student) => student.id === selectedStudentId) ?? null
    );
  }, [grid, selectedStudentId]);

  useEffect(() => {
    async function loadStudentSummary() {
      if (!selectedStudentId || !selectedClassId) {
        setStudentSummary(null);
        setStudentError(null);
        return;
      }

      setIsLoadingStudentSummary(true);
      setStudentError(null);

      try {
        const response = await getStudentInClassSummary(
          selectedClassId,
          selectedStudentId,
        );
        setStudentSummary(response);

        const nextScores: Record<string, string> = {};
        const nextComments: Record<string, string> = {};

        for (const group of response.groups) {
          for (const assessment of group.assessments) {
            nextScores[assessment.id] =
              assessment.score === null || assessment.score === undefined
                ? ""
                : `${assessment.score}`;
            nextComments[assessment.id] = assessment.comment ?? "";
          }
        }

        setStudentScoreByAssessmentId(nextScores);
        setStudentCommentByAssessmentId(nextComments);
      } catch (loadError) {
        setStudentSummary(null);
        setStudentScoreByAssessmentId({});
        setStudentCommentByAssessmentId({});
        setStudentError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load student grade details.",
        );
      } finally {
        setIsLoadingStudentSummary(false);
      }
    }

    void loadStudentSummary();
  }, [selectedClassId, selectedStudentId]);

  async function handleSubmitAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClassId || assessmentTypes.length === 0) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    const maxScore = Number(formState.maxScore);
    const weight = Number(formState.weight);

    try {
      if (!Number.isFinite(maxScore) || maxScore <= 0) {
        throw new Error("Max score must be greater than 0.");
      }

      if (!Number.isFinite(weight) || weight < 0) {
        throw new Error("Weight must be a valid number (0 or higher).");
      }

      const payload = {
        title: formState.title.trim(),
        assessmentTypeId: formState.assessmentTypeId,
        maxScore,
        weight,
        dueAt: formState.dueDate ? formState.dueDate : undefined,
        reportingPeriodId: formState.reportingPeriodId
          ? formState.reportingPeriodId
          : undefined,
        isPublishedToParents: formState.isPublishedToParents,
      };

      if (formState.mode === "create") {
        await createAssessment({ classId: selectedClassId, ...payload });
        setSuccessMessage("Assessment created successfully.");
      } else if (formState.assessmentId) {
        await updateAssessment(formState.assessmentId, {
          ...payload,
          dueAt: formState.dueDate ? formState.dueDate : null,
          reportingPeriodId: formState.reportingPeriodId
            ? formState.reportingPeriodId
            : null,
        });
        setSuccessMessage("Assessment updated successfully.");
      }

      await refreshClassData();
      setFormState(buildDefaultForm(assessmentTypes));
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to save assessment.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTogglePublish(assessment: Assessment) {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const nextValue = !assessment.isPublishedToParents;
      await updateAssessment(assessment.id, {
        isPublishedToParents: nextValue,
      });
      await refreshClassData();
      setSuccessMessage(
        nextValue
          ? "Assessment is now visible to parents."
          : "Assessment hidden from parents.",
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update parent visibility.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteAssessment() {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await deleteAssessment(deleteTarget.id);
      await refreshClassData();
      setSuccessMessage(
        result.removalMode === "deleted"
          ? "Assessment deleted permanently."
          : "Assessment archived and hidden from active gradebook workflows.",
      );

      if (selectedAssessmentId === deleteTarget.id) {
        setSelectedAssessmentId("");
      }

      setDeleteTarget(null);
    } catch (deletionError) {
      setDeleteError(
        deletionError instanceof Error
          ? deletionError.message
          : "Unable to remove assessment.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleSaveGrades() {
    if (!selectedAssessment) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const gradesPayload = gradeRows
        .map((row) => {
          const scoreValue = scoreByStudentId[row.student.id]?.trim() ?? "";

          if (!scoreValue) {
            return null;
          }

          const score = Number(scoreValue);

          if (!Number.isFinite(score) || score < 0) {
            throw new Error(
              `Invalid score provided for ${getFullName(row.student.firstName, row.student.lastName)}.`,
            );
          }

          return {
            studentId: row.student.id,
            score,
            comment:
              (commentByStudentId[row.student.id] ?? "").trim() || undefined,
          };
        })
        .filter(Boolean) as Array<{
        studentId: string;
        score: number;
        comment?: string;
      }>;

      await upsertAssessmentGrades(selectedAssessment.id, gradesPayload);
      await refreshClassData();

      const gradeResponse = await getAssessmentGrades(selectedAssessment.id);
      setGradeRows(gradeResponse.grades);

      setSuccessMessage("Grades saved successfully.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save grades.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveGridEdits() {
    if (!grid || !gridResultsByAssessmentId) {
      return;
    }

    setIsSavingGrid(true);
    setGridSaveError(null);
    setSuccessMessage(null);

    try {
      const gradesByAssessmentId = new Map<
        string,
        Array<{ studentId: string; score: number }>
      >();

      for (const [key, value] of Object.entries(draftGridScores)) {
        const trimmed = value.trim();
        if (!trimmed) {
          continue;
        }

        const [assessmentId, studentId] = key.split(":");
        const assessment = gridAssessmentById.get(assessmentId);
        if (!assessment) {
          continue;
        }

        if (assessment.reportingPeriod?.isLocked) {
          continue;
        }

        const score = Number(trimmed);
        if (!Number.isFinite(score) || score < 0) {
          throw new Error(`Invalid score provided for ${assessment.title}.`);
        }

        if (score > assessment.maxScore) {
          throw new Error(
            `Score for ${assessment.title} cannot exceed ${assessment.maxScore}.`,
          );
        }

        const original =
          gridResultsByAssessmentId.get(assessmentId)?.get(studentId)?.score ??
          null;
        if (original === score) {
          continue;
        }

        const bucket = gradesByAssessmentId.get(assessmentId) ?? [];
        bucket.push({ studentId, score });
        gradesByAssessmentId.set(assessmentId, bucket);
      }

      if (gradesByAssessmentId.size === 0) {
        setSuccessMessage("No score changes to save.");
        return;
      }

      const batches = Array.from(gradesByAssessmentId.entries());
      const settled = await Promise.allSettled(
        batches.map(([assessmentId, grades]) =>
          upsertAssessmentGrades(assessmentId, grades),
        ),
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

        await refreshClassData();
      }

      if (failures.length > 0) {
        setGridSaveError(
          failures
            .map(({ result }) =>
              result.reason instanceof Error
                ? result.reason.message
                : "Unable to save grades.",
            )
            .join(" "),
        );
      } else {
        setSuccessMessage("Scoresheet saved.");
      }
    } catch (saveError) {
      setGridSaveError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save grades.",
      );
    } finally {
      setIsSavingGrid(false);
    }
  }

  async function handleSaveStudentDetail() {
    if (!studentSummary || !selectedStudentId) {
      return;
    }

    setIsSavingStudentDetail(true);
    setStudentError(null);
    setSuccessMessage(null);

    try {
      const flattened = studentSummary.groups.flatMap((group) =>
        group.assessments.map((assessment) => ({
          assessment,
          isLocked: assessment.reportingPeriod?.isLocked ?? false,
          existingScore: assessment.score,
          existingComment: assessment.comment ?? "",
        })),
      );

      const updates = flattened
        .map(({ assessment, isLocked, existingScore, existingComment }) => {
          if (isLocked) {
            return null;
          }

          const scoreValue =
            studentScoreByAssessmentId[assessment.id]?.trim() ?? "";

          if (!scoreValue) {
            return null;
          }

          const score = Number(scoreValue);
          if (!Number.isFinite(score) || score < 0) {
            throw new Error(`Invalid score provided for ${assessment.title}.`);
          }

          if (score > assessment.maxScore) {
            throw new Error(
              `Score for ${assessment.title} cannot exceed ${assessment.maxScore}.`,
            );
          }

          const comment = (
            studentCommentByAssessmentId[assessment.id] ?? ""
          ).trim();
          const normalizedExistingScore =
            existingScore === null || existingScore === undefined
              ? null
              : existingScore;
          const normalizedExistingComment = existingComment.trim();

          if (
            normalizedExistingScore === score &&
            normalizedExistingComment === (comment || "").trim()
          ) {
            return null;
          }

          return {
            assessmentId: assessment.id,
            score,
            comment: comment || undefined,
          };
        })
        .filter(Boolean) as Array<{
        assessmentId: string;
        score: number;
        comment?: string;
      }>;

      if (updates.length === 0) {
        setSuccessMessage("No grade changes to save.");
        return;
      }

      await Promise.all(
        updates.map((update) =>
          upsertAssessmentGrades(update.assessmentId, [
            {
              studentId: selectedStudentId,
              score: update.score,
              comment: update.comment,
            },
          ]),
        ),
      );

      await refreshClassData();
      const refreshed = await getStudentInClassSummary(
        selectedClassId,
        selectedStudentId,
      );
      setStudentSummary(refreshed);

      const nextScores: Record<string, string> = {};
      const nextComments: Record<string, string> = {};

      for (const group of refreshed.groups) {
        for (const assessment of group.assessments) {
          nextScores[assessment.id] =
            assessment.score === null || assessment.score === undefined
              ? ""
              : `${assessment.score}`;
          nextComments[assessment.id] = assessment.comment ?? "";
        }
      }

      setStudentScoreByAssessmentId(nextScores);
      setStudentCommentByAssessmentId(nextComments);
      setSuccessMessage("Student grades updated successfully.");
    } catch (saveError) {
      setStudentError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save student grades.",
      );
    } finally {
      setIsSavingStudentDetail(false);
    }
  }

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
        title="Gradebook"
        description="Create assessments, enter grades in bulk, and control parent visibility."
        actions={
          mode === "admin" && selectedClassId ? (
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/admin/classes/${selectedClassId}`}
            >
              Edit Class
            </Link>
          ) : undefined
        }
        meta={
          <>
            <Badge variant="neutral">
              {selectedClass
                ? getDisplayText(selectedClass.name)
                : "Select class"}
            </Badge>
            <Badge variant="neutral">{assessments.length} assessments</Badge>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Class Context</CardTitle>
          <CardDescription>
            Select a class to load assessments, grade entry, and summary
            calculations.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {mode === "admin" ? (
            <Field htmlFor="gradebook-school" label="School">
              <Select
                id="gradebook-school"
                onChange={(event) => {
                  setSelectedSchoolId(event.target.value);
                  setSelectedGradeLevelId("");
                  setSelectedSubjectOptionId("");
                }}
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

          <Field htmlFor="gradebook-grade-level-filter" label="Grade level">
            <Select
              id="gradebook-grade-level-filter"
              onChange={(event) => setSelectedGradeLevelId(event.target.value)}
              value={selectedGradeLevelId}
            >
              <option value="">All grade levels</option>
              {availableGradeLevelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="gradebook-subject-filter" label="Subject">
            <Select
              id="gradebook-subject-filter"
              onChange={(event) =>
                setSelectedSubjectOptionId(event.target.value)
              }
              value={selectedSubjectOptionId}
            >
              <option value="">All subjects</option>
              {availableSubjectOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="gradebook-class" label="Class">
            <Select
              disabled={visibleClasses.length === 0}
              id="gradebook-class"
              onChange={(event) => setSelectedClassId(event.target.value)}
              value={selectedClassId}
            >
              {visibleClasses.length === 0 ? (
                <option value="">No classes</option>
              ) : null}
              {visibleClasses.map((schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id}>
                  {getClassOptionLabel(schoolClass)}
                </option>
              ))}
            </Select>
          </Field>

          {mode === "admin" ? (
            <CheckboxField
              checked={includeInactiveClasses}
              className="md:col-span-2 lg:col-span-4"
              description="Include inactive classes that were removed from normal workflows."
              label="Show inactive classes"
              onChange={(event) =>
                setIncludeInactiveClasses(event.target.checked)
              }
            />
          ) : null}
        </CardContent>
      </Card>

      {visibleClasses.length === 0 ? (
        <EmptyState
          title="No classes available"
          description={
            mode === "teacher"
              ? "No classes are currently assigned to you."
              : "No classes are available for the selected filters."
          }
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {formState.mode === "create"
              ? "Create Assessment"
              : "Edit Assessment"}
          </CardTitle>
          <CardDescription>
            Assessments stay in the teacher gradebook and can be shown or hidden
            from parents at any time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {assessmentTypeError ? (
            <Notice tone="danger">
              {assessmentTypeError} Assessment creation is temporarily disabled.
            </Notice>
          ) : assessmentTypes.length === 0 ? (
            <Notice tone="info">
              No assessment types are available for this school yet, so
              assessment creation is disabled.
            </Notice>
          ) : null}
          {reportingPeriodError ? (
            <Notice tone="danger">{reportingPeriodError}</Notice>
          ) : null}
          {isAssessmentFormLocked ? (
            <Notice tone="info">
              {formState.mode === "edit"
                ? "This assessment is assigned to a locked reporting period, so editing is disabled."
                : "The selected reporting period is locked. Choose a different reporting period to create this assessment."}
            </Notice>
          ) : null}
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={handleSubmitAssessment}
          >
            <Field htmlFor="assessment-title" label="Title">
              <Input
                disabled={
                  assessmentTypes.length === 0 ||
                  !selectedClassId ||
                  isEditingLockedAssessment
                }
                id="assessment-title"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Assessment title"
                required
                value={formState.title}
              />
            </Field>

            <Field htmlFor="assessment-type" label="Type">
              <Select
                disabled={
                  assessmentTypes.length === 0 ||
                  !selectedClassId ||
                  isEditingLockedAssessment
                }
                id="assessment-type"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    assessmentTypeId: event.target.value,
                  }))
                }
                value={formState.assessmentTypeId}
              >
                {assessmentTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="assessment-max-score" label="Max score">
              <Input
                disabled={
                  assessmentTypes.length === 0 ||
                  !selectedClassId ||
                  isEditingLockedAssessment
                }
                id="assessment-max-score"
                min={1}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    maxScore: event.target.value,
                  }))
                }
                required
                step="0.5"
                type="number"
                value={formState.maxScore}
              />
            </Field>

            <Field
              htmlFor="assessment-weight"
              label="Weight"
              description="Relative weighting used in averages. Set to 0 to exclude from weighted averages."
            >
              <Input
                disabled={
                  assessmentTypes.length === 0 ||
                  !selectedClassId ||
                  isEditingLockedAssessment
                }
                id="assessment-weight"
                min={0}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    weight: event.target.value,
                  }))
                }
                required
                step="0.25"
                type="number"
                value={formState.weight}
              />
            </Field>

            <Field
              htmlFor="assessment-reporting-period"
              label="Reporting period"
              description="Optional grouping used for academic reporting."
            >
              <Select
                disabled={
                  assessmentTypes.length === 0 ||
                  !selectedClassId ||
                  isEditingLockedAssessment
                }
                id="assessment-reporting-period"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    reportingPeriodId: event.target.value,
                  }))
                }
                value={formState.reportingPeriodId}
              >
                <option value="">No reporting period</option>
                {reportingPeriods
                  .filter((period) => period.isActive)
                  .sort((a, b) => a.order - b.order)
                  .map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.order}. {period.name}
                    </option>
                  ))}
              </Select>
            </Field>

            <Field
              htmlFor="assessment-due-date"
              label="Due date"
              description="Optional date shown to staff; parent visibility is controlled separately."
            >
              <Input
                disabled={
                  assessmentTypes.length === 0 ||
                  !selectedClassId ||
                  isEditingLockedAssessment
                }
                id="assessment-due-date"
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
                type="date"
                value={formState.dueDate}
              />
            </Field>

            <CheckboxField
              checked={formState.isPublishedToParents}
              className="md:col-span-2"
              description="If checked, parents will see this assessment and its grades. You can change this anytime."
              disabled={
                assessmentTypes.length === 0 ||
                !selectedClassId ||
                isEditingLockedAssessment
              }
              label="Visible to parents"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  isPublishedToParents: event.target.checked,
                }))
              }
            />

            <div className="md:col-span-2 flex justify-end gap-3">
              {formState.mode === "edit" ? (
                <Button
                  disabled={isSaving}
                  onClick={() =>
                    setFormState(buildDefaultForm(assessmentTypes))
                  }
                  type="button"
                  variant="secondary"
                >
                  Cancel edit
                </Button>
              ) : null}
              <Button
                disabled={
                  isSaving ||
                  isLoadingClass ||
                  !selectedClassId ||
                  assessmentTypes.length === 0 ||
                  isAssessmentFormLocked
                }
                type="submit"
              >
                {isSaving
                  ? "Saving..."
                  : formState.mode === "create"
                    ? "Create assessment"
                    : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Assessments</CardTitle>
            <CardDescription>
              Manage assessments for the selected class and open bulk grade
              entry.
            </CardDescription>
          </div>
          <Button
            disabled={isLoadingClass || !selectedClassId}
            onClick={() => {
              void refreshClassData();
            }}
            type="button"
            variant="secondary"
          >
            {isLoadingClass ? "Refreshing..." : "Refresh"}
          </Button>
        </CardHeader>
        <CardContent>
          {assessments.length === 0 ? (
            <EmptyState
              title="No assessments yet"
              description="Create the first assessment above to start entering grades for this class."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Assessment
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Type
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Max
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Weight
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Due
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Parents
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {assessments.map((assessment) => (
                      <tr
                        className="align-top hover:bg-slate-50"
                        key={assessment.id}
                      >
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-900">
                            {assessment.title}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {assessment.assessmentType.name}
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {assessment.maxScore}
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {assessment.weight}
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {assessment.dueAt
                            ? formatDateOnly(assessment.dueAt)
                            : "—"}
                        </td>
                        <td className="px-4 py-4">
                          <Badge
                            variant={
                              assessment.isPublishedToParents
                                ? "success"
                                : "neutral"
                            }
                          >
                            {assessment.isPublishedToParents
                              ? "Visible"
                              : "Hidden"}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => {
                                setSelectedAssessmentId(assessment.id);
                                setSuccessMessage(null);
                              }}
                              size="sm"
                              type="button"
                              variant={
                                selectedAssessmentId === assessment.id
                                  ? "primary"
                                  : "secondary"
                              }
                            >
                              Enter grades
                            </Button>
                            <Button
                              onClick={() =>
                                setFormState(buildEditForm(assessment))
                              }
                              size="sm"
                              type="button"
                              variant="secondary"
                            >
                              Edit
                            </Button>
                            <Button
                              disabled={isSaving}
                              onClick={() => {
                                void handleTogglePublish(assessment);
                              }}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              {assessment.isPublishedToParents
                                ? "Hide from parents"
                                : "Show to parents"}
                            </Button>
                            <Button
                              onClick={() => setDeleteTarget(assessment)}
                              size="sm"
                              type="button"
                              variant="danger"
                            >
                              Remove
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

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Scoresheet</CardTitle>
            <CardDescription>
              PowerTeacher-style view of student marks. Edit cells inline and
              click a student name to drill down.
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end sm:justify-end">
            <Field
              htmlFor="scoresheet-reporting-period"
              label="Reporting period"
            >
              <Select
                id="scoresheet-reporting-period"
                onChange={(event) =>
                  setSelectedGridReportingPeriodId(event.target.value)
                }
                value={selectedGridReportingPeriodId}
              >
                <option value="all">All</option>
                <option value="unassigned">Unassigned</option>
                {reportingPeriods
                  .filter((period) => period.isActive)
                  .sort((a, b) => a.order - b.order)
                  .map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.order}. {period.name}
                      {period.isLocked ? " (Locked)" : ""}
                    </option>
                  ))}
              </Select>
            </Field>

            <div className="flex flex-wrap gap-2 sm:pb-[0.125rem]">
              <Button
                disabled={
                  pendingGridChangeCount === 0 ||
                  isSavingGrid ||
                  isLoadingGrid ||
                  !selectedClassId
                }
                onClick={() => {
                  void handleSaveGridEdits();
                }}
                type="button"
              >
                {isSavingGrid
                  ? "Saving..."
                  : pendingGridChangeCount > 0
                    ? `Save (${pendingGridChangeCount})`
                    : "Save"}
              </Button>
              <Button
                disabled={isLoadingGrid || !selectedClassId}
                onClick={() => {
                  void refreshClassData();
                }}
                type="button"
                variant="secondary"
              >
                {isLoadingGrid ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {gridError ? <Notice tone="danger">{gridError}</Notice> : null}
          {gridSaveError ? (
            <Notice tone="danger">{gridSaveError}</Notice>
          ) : null}
          {!grid ? (
            <EmptyState
              title="No gradebook grid available"
              description="Select a class to load student marks."
            />
          ) : grid.students.length === 0 ? (
            <EmptyState
              title="No students enrolled"
              description="Enroll students in this class to begin entering grades."
            />
          ) : visibleGridAssessments.length === 0 ? (
            <EmptyState
              title="No assessments for this filter"
              description="Create an assessment or adjust the reporting period filter to begin entering grades."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    {selectedGridReportingPeriodId === "all" &&
                    gridAssessmentGroups.length > 1 ? (
                      <>
                        <tr>
                          <th
                            className="sticky left-0 z-20 bg-slate-50/80 px-4 py-3 font-semibold text-slate-700"
                            rowSpan={2}
                          >
                            Student
                          </th>
                          {gridAssessmentGroups.map((group) => (
                            <th
                              className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600"
                              colSpan={group.assessments.length}
                              key={group.key}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span>{group.label}</span>
                                {(group as { isLocked?: boolean }).isLocked ? (
                                  <Badge variant="neutral">Locked</Badge>
                                ) : null}
                              </div>
                            </th>
                          ))}
                          <th
                            className="px-4 py-3 font-semibold text-slate-700"
                            rowSpan={2}
                          >
                            Avg
                          </th>
                          <th
                            className="px-4 py-3 font-semibold text-slate-700"
                            rowSpan={2}
                          >
                            %
                          </th>
                          <th
                            className="px-4 py-3 font-semibold text-slate-700"
                            rowSpan={2}
                          >
                            Grade
                          </th>
                        </tr>
                        <tr>
                          {gridAssessmentGroups.flatMap((group) =>
                            group.assessments.map((assessment) => (
                              <th
                                className="px-2 py-2 align-bottom font-semibold text-slate-700"
                                key={assessment.id}
                              >
                                <button
                                  className="min-w-[10rem] text-left hover:underline"
                                  onClick={() => {
                                    setSelectedAssessmentId(assessment.id);
                                    setSuccessMessage(null);
                                  }}
                                  type="button"
                                >
                                  <span className="block font-semibold text-slate-800">
                                    {assessment.title}
                                  </span>
                                  <span className="mt-0.5 block text-xs font-normal text-slate-500">
                                    {assessment.assessmentType.name} • Wt{" "}
                                    {assessment.weight} •{" "}
                                    {assessment.reportingPeriod
                                      ? `Term ${assessment.reportingPeriod.order}`
                                      : "Unassigned"}
                                  </span>
                                </button>
                              </th>
                            )),
                          )}
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <th className="sticky left-0 z-20 bg-slate-50/80 px-4 py-3 font-semibold text-slate-700">
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
                                setSelectedAssessmentId(assessment.id);
                                setSuccessMessage(null);
                              }}
                              type="button"
                            >
                              <span className="block font-semibold text-slate-800">
                                {assessment.title}
                              </span>
                              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                                {assessment.assessmentType.name} • Wt{" "}
                                {assessment.weight} •{" "}
                                {assessment.reportingPeriod
                                  ? `Term ${assessment.reportingPeriod.order}`
                                  : "Unassigned"}
                              </span>
                            </button>
                          </th>
                        ))}
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Avg
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          %
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Grade
                        </th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {grid.students.map((student) => {
                      const summaryEntry = summaryByStudentId.get(student.id);

                      return (
                        <tr
                          className="align-top hover:bg-slate-50"
                          key={student.id}
                        >
                          <td className="sticky left-0 z-10 bg-white px-4 py-3">
                            <button
                              className="text-left font-medium text-slate-900 hover:underline"
                              onClick={() => setSelectedStudentId(student.id)}
                              type="button"
                            >
                              {getFullName(student.firstName, student.lastName)}
                            </button>
                            <p className="mt-1 text-xs text-slate-500">
                              @{student.username}
                            </p>
                          </td>
                          {visibleGridAssessments.map((assessment) => {
                            const result =
                              gridResultsByAssessmentId
                                ?.get(assessment.id)
                                ?.get(student.id) ?? null;
                            const originalScore = result?.score ?? null;
                            const cellKey = `${assessment.id}:${student.id}`;
                            const draftValue = draftGridScores[cellKey];
                            const displayValue =
                              draftValue !== undefined
                                ? draftValue
                                : originalScore === null ||
                                    originalScore === undefined
                                  ? ""
                                  : `${originalScore}`;

                            const trimmed = displayValue.trim();
                            const numeric = trimmed ? Number(trimmed) : null;
                            const percent =
                              numeric === null || !Number.isFinite(numeric)
                                ? originalScore === null ||
                                  originalScore === undefined
                                  ? null
                                  : round1(
                                      (originalScore / assessment.maxScore) *
                                        100,
                                    )
                                : round1((numeric / assessment.maxScore) * 100);
                            const isLocked =
                              assessment.reportingPeriod?.isLocked ?? false;
                            const isDirty =
                              trimmed &&
                              Number.isFinite(Number(trimmed)) &&
                              (originalScore === null ||
                              originalScore === undefined
                                ? true
                                : Number(trimmed) !== originalScore);

                            return (
                              <td
                                className="px-2 py-2"
                                key={`${student.id}-${assessment.id}`}
                              >
                                <Input
                                  aria-label={`${getFullName(student.firstName, student.lastName)} ${assessment.title}`}
                                  className={[
                                    "h-9 w-20 rounded-lg px-2 text-right tabular-nums",
                                    isDirty ? "bg-amber-50" : "",
                                  ].join(" ")}
                                  disabled={isSavingGrid || isLocked}
                                  inputMode="decimal"
                                  onBlur={(event) => {
                                    const nextValue = event.target.value.trim();
                                    const original = originalScore ?? null;

                                    if (!nextValue) {
                                      setDraftGridScores((current) => {
                                        if (!(cellKey in current)) {
                                          return current;
                                        }
                                        const next = { ...current };
                                        delete next[cellKey];
                                        return next;
                                      });
                                      return;
                                    }

                                    const parsed = Number(nextValue);
                                    if (
                                      Number.isFinite(parsed) &&
                                      original !== null &&
                                      parsed === original
                                    ) {
                                      setDraftGridScores((current) => {
                                        if (!(cellKey in current)) {
                                          return current;
                                        }
                                        const next = { ...current };
                                        delete next[cellKey];
                                        return next;
                                      });
                                    }
                                  }}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    setDraftGridScores((current) => ({
                                      ...current,
                                      [cellKey]: nextValue,
                                    }));
                                  }}
                                  placeholder="—"
                                  title={
                                    percent === null
                                      ? isLocked
                                        ? "Locked"
                                        : "No grade"
                                      : `${trimmed || originalScore} / ${assessment.maxScore} (${percent}%)${isLocked ? " (Locked)" : ""}`
                                  }
                                  value={displayValue}
                                />
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-slate-900">
                            {summaryEntry?.averagePercent === null ||
                            summaryEntry?.averagePercent === undefined
                              ? "—"
                              : round1(summaryEntry.averagePercent)}
                          </td>
                          <td className="px-4 py-3 text-slate-900">
                            {formatPercent(
                              summaryEntry?.averagePercent ?? null,
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-900">
                            {summaryEntry?.averageLetterGrade ?? "—"}
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

      {selectedStudentId ? (
        <Card>
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Student Detail</CardTitle>
              <CardDescription>
                {selectedStudent
                  ? `Edit grades for ${getFullName(selectedStudent.firstName, selectedStudent.lastName)} in this class.`
                  : "Edit grades for the selected student."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={isSavingStudentDetail || isLoadingStudentSummary}
                onClick={() => {
                  void handleSaveStudentDetail();
                }}
                type="button"
              >
                {isSavingStudentDetail ? "Saving..." : "Save student grades"}
              </Button>
              <Button
                onClick={() => {
                  setSelectedStudentId(null);
                  setStudentSummary(null);
                  setStudentError(null);
                }}
                type="button"
                variant="secondary"
              >
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {studentError ? (
              <Notice tone="danger">{studentError}</Notice>
            ) : null}

            {isLoadingStudentSummary ? (
              <p className="text-sm text-slate-500">
                Loading student grades...
              </p>
            ) : !studentSummary ? (
              <EmptyState
                title="Student grades unavailable"
                description="Grade details could not be loaded for this student."
              />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="neutral">
                    {studentSummary.gradedCount}/
                    {studentSummary.assessmentCount} graded
                  </Badge>
                  <Badge variant="neutral">
                    Average:{" "}
                    {studentSummary.averagePercent === null
                      ? "—"
                      : `${studentSummary.averagePercent}%`}
                  </Badge>
                  <Badge variant="neutral">
                    Grade: {studentSummary.averageLetterGrade ?? "—"}
                  </Badge>
                  {studentSummary.usesWeights ? (
                    <Badge variant="neutral">Weighted</Badge>
                  ) : null}
                </div>

                <div className="space-y-4">
                  {studentSummary.groups.map((group) => {
                    const groupKey = group.reportingPeriod?.id ?? "unassigned";
                    const isLocked = group.reportingPeriod?.isLocked ?? false;

                    return (
                      <div className="space-y-2" key={groupKey}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">
                            {group.reportingPeriod
                              ? `${group.reportingPeriod.order}. ${group.reportingPeriod.name}`
                              : "Unassigned"}
                          </p>
                          {isLocked ? (
                            <Badge variant="neutral">Locked</Badge>
                          ) : null}
                        </div>

                        <div className="overflow-hidden rounded-xl border border-slate-200">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                              <thead className="bg-slate-50/80">
                                <tr>
                                  <th className="px-4 py-3 font-semibold text-slate-700">
                                    Assessment
                                  </th>
                                  <th className="px-4 py-3 font-semibold text-slate-700">
                                    Type
                                  </th>
                                  <th className="px-4 py-3 font-semibold text-slate-700">
                                    Due
                                  </th>
                                  <th className="px-4 py-3 font-semibold text-slate-700">
                                    Weight
                                  </th>
                                  <th className="px-4 py-3 font-semibold text-slate-700">
                                    Parents
                                  </th>
                                  <th className="px-4 py-3 font-semibold text-slate-700">
                                    Percent
                                  </th>
                                  <th className="px-4 py-3 font-semibold text-slate-700">
                                    Score
                                  </th>
                                  <th className="px-4 py-3 font-semibold text-slate-700">
                                    Comment
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 bg-white">
                                {group.assessments.map((assessment) => {
                                  const scoreValue =
                                    studentScoreByAssessmentId[assessment.id] ??
                                    "";
                                  const trimmedScore = scoreValue.trim();
                                  const numericScore = trimmedScore
                                    ? Number(trimmedScore)
                                    : null;
                                  const percent =
                                    numericScore === null ||
                                    !Number.isFinite(numericScore)
                                      ? assessment.percent
                                      : round1(
                                          (numericScore / assessment.maxScore) *
                                            100,
                                        );

                                  return (
                                    <tr
                                      className="align-top hover:bg-slate-50"
                                      key={assessment.id}
                                    >
                                      <td className="px-4 py-4">
                                        <p className="font-medium text-slate-900">
                                          {assessment.title}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                          Max {assessment.maxScore}
                                        </p>
                                      </td>
                                      <td className="px-4 py-4 text-slate-600">
                                        {assessment.assessmentType.name}
                                      </td>
                                      <td className="px-4 py-4 text-slate-600">
                                        {assessment.dueAt
                                          ? formatDateOnly(assessment.dueAt)
                                          : "—"}
                                      </td>
                                      <td className="px-4 py-4 text-slate-600">
                                        {assessment.weight}
                                      </td>
                                      <td className="px-4 py-4">
                                        <Badge
                                          variant={
                                            assessment.isPublishedToParents
                                              ? "success"
                                              : "neutral"
                                          }
                                        >
                                          {assessment.isPublishedToParents
                                            ? "Visible"
                                            : "Hidden"}
                                        </Badge>
                                      </td>
                                      <td className="px-4 py-4 text-slate-900">
                                        {percent === null ? "—" : `${percent}%`}
                                      </td>
                                      <td className="px-4 py-4">
                                        <Input
                                          className="h-9 w-28 rounded-lg px-2 text-right tabular-nums"
                                          disabled={
                                            isLocked || isSavingStudentDetail
                                          }
                                          max={assessment.maxScore}
                                          min={0}
                                          onBlur={(event) => {
                                            if (!event.target.value.trim()) {
                                              setStudentScoreByAssessmentId(
                                                (current) => {
                                                  if (
                                                    !(assessment.id in current)
                                                  ) {
                                                    return current;
                                                  }

                                                  const next = { ...current };
                                                  delete next[assessment.id];
                                                  return next;
                                                },
                                              );
                                            }
                                          }}
                                          onChange={(event) =>
                                            setStudentScoreByAssessmentId(
                                              (current) => ({
                                                ...current,
                                                [assessment.id]:
                                                  event.target.value,
                                              }),
                                            )
                                          }
                                          placeholder={
                                            isLocked
                                              ? "Locked"
                                              : `0 - ${assessment.maxScore}`
                                          }
                                          step="0.5"
                                          type="number"
                                          value={scoreValue}
                                        />
                                      </td>
                                      <td className="px-4 py-4">
                                        <Textarea
                                          className="h-9 min-h-[2.25rem] rounded-lg px-2 py-1 text-xs"
                                          disabled={
                                            isLocked || isSavingStudentDetail
                                          }
                                          onChange={(event) =>
                                            setStudentCommentByAssessmentId(
                                              (current) => ({
                                                ...current,
                                                [assessment.id]:
                                                  event.target.value,
                                              }),
                                            )
                                          }
                                          placeholder={
                                            isLocked
                                              ? "Locked"
                                              : "Optional comment"
                                          }
                                          rows={1}
                                          value={
                                            studentCommentByAssessmentId[
                                              assessment.id
                                            ] ?? ""
                                          }
                                        />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Grade Entry</CardTitle>
            <CardDescription>
              {selectedAssessment
                ? `Bulk-enter grades for ${selectedAssessment.title}. Leave a score blank to skip saving for that student.`
                : "Select an assessment above to start entering grades."}
            </CardDescription>
          </div>
          <Button
            disabled={
              !selectedAssessment ||
              isSaving ||
              isLoadingGrades ||
              selectedAssessmentIsLocked
            }
            onClick={() => {
              void handleSaveGrades();
            }}
            type="button"
          >
            {isSaving ? "Saving..." : "Save grades"}
          </Button>
        </CardHeader>
        <CardContent>
          {selectedAssessment && selectedAssessmentIsLocked ? (
            <Notice tone="info">
              This assessment is in a locked reporting period, so grade entry is
              read-only.
            </Notice>
          ) : null}
          {!selectedAssessment ? (
            <EmptyState
              title="No assessment selected"
              description="Choose an assessment to load the student roster and enter grades."
            />
          ) : isLoadingGrades ? (
            <p className="text-sm text-slate-500">Loading grade roster...</p>
          ) : gradeRows.length === 0 ? (
            <EmptyState
              title="No students enrolled"
              description="Enroll students in this class before entering grades."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Student
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Score
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Comment
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {gradeRows.map((row) => (
                      <tr
                        className="align-top hover:bg-slate-50"
                        key={row.student.id}
                      >
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-900">
                            {getFullName(
                              row.student.firstName,
                              row.student.lastName,
                            )}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            @{row.student.username}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <Input
                            disabled={selectedAssessmentIsLocked || isSaving}
                            max={selectedAssessment.maxScore}
                            min={0}
                            onChange={(event) =>
                              setScoreByStudentId((current) => ({
                                ...current,
                                [row.student.id]: event.target.value,
                              }))
                            }
                            placeholder={`0 - ${selectedAssessment.maxScore}`}
                            step="0.5"
                            type="number"
                            value={scoreByStudentId[row.student.id] ?? ""}
                          />
                        </td>
                        <td className="px-4 py-4">
                          <Textarea
                            disabled={selectedAssessmentIsLocked || isSaving}
                            onChange={(event) =>
                              setCommentByStudentId((current) => ({
                                ...current,
                                [row.student.id]: event.target.value,
                              }))
                            }
                            placeholder="Optional comment"
                            rows={2}
                            value={commentByStudentId[row.student.id] ?? ""}
                          />
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

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Class Summary</CardTitle>
            <CardDescription>
              Simple average-based summaries across all assessments in the
              selected class.
            </CardDescription>
          </div>
          <Button
            disabled={isLoadingClass || !selectedClassId}
            onClick={() => {
              void refreshClassData();
            }}
            type="button"
            variant="secondary"
          >
            {isLoadingClass ? "Refreshing..." : "Refresh summary"}
          </Button>
        </CardHeader>
        <CardContent>
          {!summary ? (
            <p className="text-sm text-slate-500">No summary available.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Students
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {summary.studentCount}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Assessments
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {summary.assessmentCount}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Class Average
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {formatPercent(summary.overallAveragePercent)}{" "}
                      <span className="text-slate-500">
                        ({summary.overallLetterGrade ?? "—"})
                      </span>
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Student
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Graded
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Average
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-700">
                          Grade
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {summary.students.map((entry) => (
                        <tr
                          className="align-top hover:bg-slate-50"
                          key={entry.student.id}
                        >
                          <td className="px-4 py-4">
                            <p className="font-medium text-slate-900">
                              {getFullName(
                                entry.student.firstName,
                                entry.student.lastName,
                              )}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {entry.gradedCount}/{entry.assessmentCount}
                          </td>
                          <td className="px-4 py-4 text-slate-900">
                            {formatPercent(entry.averagePercent)}
                          </td>
                          <td className="px-4 py-4 text-slate-900">
                            {entry.averageLetterGrade ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        confirmLabel="Remove assessment"
        description={
          deleteTarget
            ? `Remove "${deleteTarget.title}" from the active gradebook? If students already have grades, it will be archived instead of deleted.`
            : "Remove this assessment?"
        }
        errorMessage={deleteError}
        isOpen={Boolean(deleteTarget)}
        isPending={isDeleting}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={handleDeleteAssessment}
        pendingLabel="Removing..."
        title="Remove assessment"
      />
    </div>
  );
}
