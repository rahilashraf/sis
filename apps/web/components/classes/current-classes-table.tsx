"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { listClasses, listMyClasses, type SchoolClass } from "@/lib/api/classes";
import { listReportingPeriods, type ReportingPeriod } from "@/lib/api/reporting-periods";
import { dateOnlyFromDate, parseDateOnly } from "@/lib/date";

type Mode = "teacher" | "admin";
type SortOption =
  | "NAME_ASC"
  | "NAME_DESC"
  | "GRADE_LEVEL_ASC"
  | "STUDENT_COUNT_DESC"
  | "STUDENT_COUNT_ASC"
  | "UPDATED_DESC"
  | "UPDATED_ASC";

function inferGradeLevelLabel(schoolClass: SchoolClass) {
  if (schoolClass.gradeLevel?.name) {
    return schoolClass.gradeLevel.name;
  }

  const name = schoolClass.name ?? "";
  const gradeMatch = name.match(/\bgrade\s+(\d{1,2})\b/i);
  if (gradeMatch?.[1]) {
    return `Grade ${gradeMatch[1]}`;
  }

  const gMatch = name.match(/\bg(\d{1,2})\b/i);
  if (gMatch?.[1]) {
    return `Grade ${gMatch[1]}`;
  }

  return schoolClass.isHomeroom ? "Homeroom" : "—";
}

function getGradeLevelFilterValue(schoolClass: SchoolClass) {
  const label = inferGradeLevelLabel(schoolClass);
  return label === "—" ? "Unassigned" : label;
}

function getSubjectLabel(schoolClass: SchoolClass) {
  return schoolClass.subjectOption?.name ?? schoolClass.subject ?? "—";
}

function getSubjectFilterValue(schoolClass: SchoolClass) {
  const subject = getSubjectLabel(schoolClass);
  return subject === "—" ? "Unassigned" : subject;
}

function getStudentCount(schoolClass: SchoolClass) {
  if (typeof schoolClass._count?.students === "number") {
    return schoolClass._count.students;
  }

  return schoolClass.students?.length ?? 0;
}

function getGradeSortKey(schoolClass: SchoolClass) {
  const label = getGradeLevelFilterValue(schoolClass);
  const gradeNumberMatch = label.match(/(\d{1,2})/);
  const gradeNumber = gradeNumberMatch ? Number(gradeNumberMatch[1]) : Number.MAX_SAFE_INTEGER;

  return {
    gradeNumber,
    label,
  };
}

function findCurrentReportingPeriod(periods: ReportingPeriod[], now = new Date()) {
  const currentDate = parseDateOnly(dateOnlyFromDate(now));
  if (!currentDate) {
    return null;
  }

  const activePeriods = periods.filter((period) => period.isActive);
  const matchingPeriod = activePeriods.find((period) => {
    const start = parseDateOnly(period.startsAt);
    const end = parseDateOnly(period.endsAt);
    return Boolean(start && end && currentDate >= start && currentDate <= end);
  });

  return matchingPeriod ?? activePeriods.sort((a, b) => a.order - b.order)[0] ?? null;
}

export function CurrentClassesTable({ mode, actions }: { mode: Mode; actions?: ReactNode }) {
  const router = useRouter();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [reportingPeriodByKey, setReportingPeriodByKey] = useState<
    Record<string, ReportingPeriod | null>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGradeLevel, setSelectedGradeLevel] = useState("all");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [selectedSchoolYear, setSelectedSchoolYear] = useState("current");
  const [selectedReportingPeriod, setSelectedReportingPeriod] = useState("all");
  const [sortOption, setSortOption] = useState<SortOption>("NAME_ASC");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const gradeLevelFilterOptions = useMemo(
    () =>
      Array.from(new Set(classes.map((schoolClass) => getGradeLevelFilterValue(schoolClass)))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [classes],
  );

  const subjectFilterOptions = useMemo(
    () =>
      Array.from(new Set(classes.map((schoolClass) => getSubjectFilterValue(schoolClass)))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [classes],
  );

  const schoolYearFilterOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; isActive: boolean }>();
    for (const schoolClass of classes) {
      byId.set(schoolClass.schoolYear.id, {
        id: schoolClass.schoolYear.id,
        name: schoolClass.schoolYear.name,
        isActive: schoolClass.schoolYear.isActive,
      });
    }

    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);

  const reportingPeriodFilterOptions = useMemo(() => {
    const byId = new Map<string, ReportingPeriod>();

    for (const period of Object.values(reportingPeriodByKey)) {
      if (period) {
        byId.set(period.id, period);
      }
    }

    return Array.from(byId.values()).sort((a, b) => a.order - b.order);
  }, [reportingPeriodByKey]);

  const hasActiveSchoolYears = useMemo(
    () => classes.some((schoolClass) => schoolClass.schoolYear.isActive),
    [classes],
  );

  const effectiveSchoolYearFilter =
    selectedSchoolYear === "current" && !hasActiveSchoolYears ? "all" : selectedSchoolYear;

  const filteredAndSortedClasses = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filtered = classes.filter((schoolClass) => {
      const classKey = `${schoolClass.schoolId}:${schoolClass.schoolYearId}`;
      const currentPeriod = reportingPeriodByKey[classKey] ?? null;
      const className = schoolClass.name.toLowerCase();
      const subjectName = getSubjectLabel(schoolClass).toLowerCase();
      const schoolName = schoolClass.school.name.toLowerCase();
      const schoolShortName = (schoolClass.school.shortName ?? "").toLowerCase();

      const matchesSearch =
        normalizedQuery.length === 0 ||
        className.includes(normalizedQuery) ||
        subjectName.includes(normalizedQuery) ||
        schoolName.includes(normalizedQuery) ||
        schoolShortName.includes(normalizedQuery);

      const matchesGradeLevel =
        selectedGradeLevel === "all" ||
        getGradeLevelFilterValue(schoolClass) === selectedGradeLevel;

      const matchesSubject =
        selectedSubject === "all" || getSubjectFilterValue(schoolClass) === selectedSubject;

      const matchesSchoolYear =
        effectiveSchoolYearFilter === "all" ||
        (effectiveSchoolYearFilter === "current"
          ? schoolClass.schoolYear.isActive
          : schoolClass.schoolYear.id === effectiveSchoolYearFilter);

      const matchesReportingPeriod =
        selectedReportingPeriod === "all" ||
        (selectedReportingPeriod === "none"
          ? currentPeriod === null
          : currentPeriod?.id === selectedReportingPeriod);

      return (
        matchesSearch &&
        matchesGradeLevel &&
        matchesSubject &&
        matchesSchoolYear &&
        matchesReportingPeriod
      );
    });

    return [...filtered].sort((left, right) => {
      if (sortOption === "NAME_ASC") {
        return left.name.localeCompare(right.name);
      }

      if (sortOption === "NAME_DESC") {
        return right.name.localeCompare(left.name);
      }

      if (sortOption === "GRADE_LEVEL_ASC") {
        const leftSortKey = getGradeSortKey(left);
        const rightSortKey = getGradeSortKey(right);

        if (leftSortKey.gradeNumber !== rightSortKey.gradeNumber) {
          return leftSortKey.gradeNumber - rightSortKey.gradeNumber;
        }

        return leftSortKey.label.localeCompare(rightSortKey.label);
      }

      if (sortOption === "STUDENT_COUNT_DESC") {
        return getStudentCount(right) - getStudentCount(left);
      }

      if (sortOption === "STUDENT_COUNT_ASC") {
        return getStudentCount(left) - getStudentCount(right);
      }

      const leftUpdatedAt = new Date(left.updatedAt).getTime();
      const rightUpdatedAt = new Date(right.updatedAt).getTime();

      if (sortOption === "UPDATED_DESC") {
        return rightUpdatedAt - leftUpdatedAt;
      }

      return leftUpdatedAt - rightUpdatedAt;
    });
  }, [
    classes,
    reportingPeriodByKey,
    searchQuery,
    selectedGradeLevel,
    selectedSubject,
    effectiveSchoolYearFilter,
    selectedReportingPeriod,
    sortOption,
  ]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedGradeLevel !== "all" ||
    selectedSubject !== "all" ||
    selectedSchoolYear !== "current" ||
    selectedReportingPeriod !== "all" ||
    sortOption !== "NAME_ASC";

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const response = mode === "teacher" ? await listMyClasses() : await listClasses();
        setClasses(response);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load classes.");
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [mode]);

  useEffect(() => {
    async function loadReportingPeriods() {
      if (classes.length === 0) {
        setReportingPeriodByKey({});
        return;
      }

      const uniqueKeys = Array.from(
        new Set(classes.map((schoolClass) => `${schoolClass.schoolId}:${schoolClass.schoolYearId}`)),
      );

      const results = await Promise.allSettled(
        uniqueKeys.map(async (key) => {
          const [schoolId, schoolYearId] = key.split(":");
          const periods = await listReportingPeriods({ schoolId, schoolYearId });
          return { key, period: findCurrentReportingPeriod(periods) };
        }),
      );

      const nextReportingPeriods: Record<string, ReportingPeriod | null> = {};
      for (const result of results) {
        if (result.status === "fulfilled") {
          nextReportingPeriods[result.value.key] = result.value.period;
        }
      }

      setReportingPeriodByKey(nextReportingPeriods);
    }

    void loadReportingPeriods();
  }, [classes]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading classes...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Current Classes"
        description="Your active class list with quick access to gradebook, attendance, and student rosters."
        actions={actions}
        meta={
          <Badge variant="neutral">
            {filteredAndSortedClasses.length}
            {filteredAndSortedClasses.length !== classes.length ? ` of ${classes.length}` : ""} classes
          </Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {classes.length === 0 ? (
        <EmptyState
          title="No classes available"
          description={
            mode === "teacher"
              ? "No classes are currently assigned to you."
              : "No active classes are available for your schools."
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Classes</CardTitle>
            <CardDescription>
              Filter, sort, and open classes directly into gradebook, attendance, or student views.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field htmlFor={`${mode}-classes-search`} label="Search">
                <Input
                  id={`${mode}-classes-search`}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Class, subject, or school"
                  value={searchQuery}
                />
              </Field>

              <Field htmlFor={`${mode}-classes-grade-level-filter`} label="Grade level">
                <Select
                  id={`${mode}-classes-grade-level-filter`}
                  onChange={(event) => setSelectedGradeLevel(event.target.value)}
                  value={selectedGradeLevel}
                >
                  <option value="all">All grade levels</option>
                  {gradeLevelFilterOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field htmlFor={`${mode}-classes-subject-filter`} label="Subject">
                <Select
                  id={`${mode}-classes-subject-filter`}
                  onChange={(event) => setSelectedSubject(event.target.value)}
                  value={selectedSubject}
                >
                  <option value="all">All subjects</option>
                  {subjectFilterOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field htmlFor={`${mode}-classes-school-year-filter`} label="School year">
                <Select
                  id={`${mode}-classes-school-year-filter`}
                  onChange={(event) => setSelectedSchoolYear(event.target.value)}
                  value={selectedSchoolYear}
                >
                  <option value="current">Current school year</option>
                  <option value="all">All school years</option>
                  {schoolYearFilterOptions.map((schoolYear) => (
                    <option key={schoolYear.id} value={schoolYear.id}>
                      {schoolYear.name}
                      {schoolYear.isActive ? " (Current)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field htmlFor={`${mode}-classes-reporting-period-filter`} label="Reporting period">
                <Select
                  id={`${mode}-classes-reporting-period-filter`}
                  onChange={(event) => setSelectedReportingPeriod(event.target.value)}
                  value={selectedReportingPeriod}
                >
                  <option value="all">All reporting periods</option>
                  <option value="none">No current reporting period</option>
                  {reportingPeriodFilterOptions.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.order}. {period.name}
                      {period.school?.shortName ? ` • ${period.school.shortName}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field htmlFor={`${mode}-classes-sort`} label="Sort by">
                <Select
                  id={`${mode}-classes-sort`}
                  onChange={(event) => setSortOption(event.target.value as SortOption)}
                  value={sortOption}
                >
                  <option value="NAME_ASC">Class name (A–Z)</option>
                  <option value="NAME_DESC">Class name (Z–A)</option>
                  <option value="GRADE_LEVEL_ASC">Grade level</option>
                  <option value="STUDENT_COUNT_DESC">Student count (high to low)</option>
                  <option value="STUDENT_COUNT_ASC">Student count (low to high)</option>
                  <option value="UPDATED_DESC">Recently updated</option>
                  <option value="UPDATED_ASC">Least recently updated</option>
                </Select>
              </Field>

              <div className="md:col-span-2 xl:col-span-2 xl:self-end">
                <Button
                  disabled={!hasActiveFilters}
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedGradeLevel("all");
                    setSelectedSubject("all");
                    setSelectedSchoolYear("current");
                    setSelectedReportingPeriod("all");
                    setSortOption("NAME_ASC");
                  }}
                  type="button"
                  variant="secondary"
                >
                  Reset filters
                </Button>
              </div>
            </div>

            {filteredAndSortedClasses.length === 0 ? (
              <EmptyState
                title="No matching classes"
                description="No classes match the current search/filter combination."
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate-700">Class</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Subject</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Students</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Grade level</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">School year</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Reporting period</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredAndSortedClasses.map((schoolClass) => {
                        const key = `${schoolClass.schoolId}:${schoolClass.schoolYearId}`;
                        const currentPeriod = reportingPeriodByKey[key] ?? null;

                        return (
                          <tr className="align-top hover:bg-slate-50" key={schoolClass.id}>
                            <td className="px-4 py-4">
                              <button
                                className="text-left font-medium text-slate-900 hover:underline"
                                onClick={() => {
                                  router.push(
                                    `/${mode}/gradebook?classId=${encodeURIComponent(schoolClass.id)}`,
                                  );
                                }}
                                type="button"
                              >
                                {schoolClass.name}
                              </button>
                              <p className="mt-1 text-xs text-slate-500">{schoolClass.school.name}</p>
                            </td>
                            <td className="px-4 py-4 text-slate-600">{getSubjectLabel(schoolClass)}</td>
                            <td className="px-4 py-4 text-slate-600">{getStudentCount(schoolClass)}</td>
                            <td className="px-4 py-4 text-slate-600">{inferGradeLevelLabel(schoolClass)}</td>
                            <td className="px-4 py-4 text-slate-600">{schoolClass.schoolYear.name}</td>
                            <td className="px-4 py-4 text-slate-600">
                              {currentPeriod ? (
                                <span>
                                  {currentPeriod.order}. {currentPeriod.name}
                                  {currentPeriod.isLocked ? " (Locked)" : ""}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap gap-2">
                                <Link
                                  className={buttonClassName({ size: "sm", variant: "secondary" })}
                                  href={`/${mode}/gradebook?classId=${encodeURIComponent(
                                    schoolClass.id,
                                  )}`}
                                >
                                  Gradebook
                                </Link>
                                <Link
                                  className={buttonClassName({ size: "sm", variant: "secondary" })}
                                  href={`/${mode}/attendance?classId=${encodeURIComponent(schoolClass.id)}`}
                                >
                                  Attendance
                                </Link>
                                <Link
                                  className={buttonClassName({ size: "sm", variant: "secondary" })}
                                  href={
                                    mode === "admin"
                                      ? `/admin/classes/${schoolClass.id}/summary`
                                      : `/teacher/classes/${schoolClass.id}`
                                  }
                                >
                                  Students
                                </Link>
                                <Link
                                  className={buttonClassName({ size: "sm", variant: "secondary" })}
                                  href={`/${mode}/classes/${schoolClass.id}/assignments`}
                                >
                                  Assignments
                                </Link>
                                <Button size="sm" type="button" variant="secondary" disabled>
                                  Reports
                                </Button>
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
      )}
    </div>
  );
}
