"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { getStudentById, type StudentProfile } from "@/lib/api/students";
import {
  getStudentAcademicOverview,
  getStudentInClassSummary,
  type StudentAcademicOverview,
  type StudentInClassSummary,
} from "@/lib/api/gradebook";
import { formatDateLabel, formatDisplayedPercent } from "@/lib/utils";

export function ParentStudentAcademics({ studentId }: { studentId: string }) {
  type OverviewClass = StudentAcademicOverview["classes"][number]["class"];

  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [classes, setClasses] = useState<OverviewClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [overview, setOverview] = useState<StudentAcademicOverview | null>(
    null,
  );
  const [classDetail, setClassDetail] = useState<StudentInClassSummary | null>(
    null,
  );
  const [isLoadingGrades, setIsLoadingGrades] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lowAssessmentCount =
    classDetail?.groups
      .flatMap((group) => group.assessments)
      .filter(
        (assessment) =>
          typeof assessment.percent === "number" && assessment.percent < 65,
      ).length ?? 0;

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getStudentById(studentId);
        setStudent(response);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load student.",
        );
        setStudent(null);
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [studentId]);

  useEffect(() => {
    async function loadOverview() {
      if (!student) {
        setOverview(null);
        setClasses([]);
        setSelectedClassId("");
        return;
      }

      setGradeError(null);

      try {
        const response = await getStudentAcademicOverview(studentId);
        setOverview(response);
        const nextClasses = response.classes.map((entry) => entry.class);
        setClasses(nextClasses);
        setSelectedClassId((current) => current || nextClasses[0]?.id || "");
      } catch (loadError) {
        setGradeError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load academics.",
        );
        setOverview(null);
        setClasses([]);
        setSelectedClassId("");
      }
    }

    void loadOverview();
  }, [student, studentId]);

  useEffect(() => {
    async function loadClassDetail() {
      if (!selectedClassId) {
        setClassDetail(null);
        return;
      }

      setIsLoadingGrades(true);
      setGradeError(null);

      try {
        const response = await getStudentInClassSummary(
          selectedClassId,
          studentId,
        );
        setClassDetail(response);
      } catch (loadError) {
        setGradeError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load course grades.",
        );
        setClassDetail(null);
      } finally {
        setIsLoadingGrades(false);
      }
    }

    void loadClassDetail();
  }, [selectedClassId, studentId]);

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/parent"
            >
              Back to my students
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/parent/students/${encodeURIComponent(studentId)}`}
            >
              Student profile
            </Link>
          </div>
        }
        description="Academic overview and published assessment detail for your linked child."
        meta={
          student ? (
            <Badge variant="neutral">
              {student.firstName} {student.lastName}
            </Badge>
          ) : null
        }
        title="Academics"
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {gradeError ? <Notice tone="danger">{gradeError}</Notice> : null}
      {lowAssessmentCount > 0 ? (
        <Notice tone="warning">
          {lowAssessmentCount} published assessment
          {lowAssessmentCount === 1 ? "" : "s"} currently show below 65%.
          Consider contacting the school for support planning.
        </Notice>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading academic view...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !student ? (
        <EmptyState
          title="Student unavailable"
          description="This student record could not be loaded."
        />
      ) : null}

      {student ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Class selection</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field htmlFor="parent-academic-class" label="Class">
                <Select
                  disabled={classes.length === 0}
                  id="parent-academic-class"
                  onChange={(event) => setSelectedClassId(event.target.value)}
                  value={selectedClassId}
                >
                  {classes.length === 0 ? (
                    <option value="">No classes</option>
                  ) : null}
                  {classes.map((schoolClass) => (
                    <option key={schoolClass.id} value={schoolClass.id}>
                      {schoolClass.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="self-end text-sm text-slate-600">
                Overall averages may include assessments that are hidden from
                the published breakdown.
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-slate-50/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Need Help?</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Link
                className={buttonClassName({
                  className: "w-full",
                  variant: "secondary",
                })}
                href={`/parent/interviews?studentId=${encodeURIComponent(studentId)}`}
              >
                Request interview
              </Link>
              <Link
                className={buttonClassName({
                  className: "w-full",
                  variant: "secondary",
                })}
                href={`/parent/forms?studentId=${encodeURIComponent(studentId)}`}
              >
                Review forms
              </Link>
              <Link
                className={buttonClassName({
                  className: "w-full",
                  variant: "secondary",
                })}
                href={`/parent/students/${encodeURIComponent(studentId)}`}
              >
                Back to student profile
              </Link>
            </CardContent>
          </Card>

          {overview?.classes.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {overview.classes.map((entry) => (
                <button
                  className={`text-left ${selectedClassId === entry.class.id ? "ring-2 ring-slate-400" : ""}`}
                  key={entry.class.id}
                  onClick={() => setSelectedClassId(entry.class.id)}
                  type="button"
                >
                  <Card className="h-full transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        {entry.class.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <p className="text-sm font-medium text-slate-900">
                        {formatDisplayedPercent(entry.averagePercent)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Grade: {entry.averageLetterGrade ?? "—"}
                      </p>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          ) : null}

          {isLoadingGrades ? (
            <p className="text-sm text-slate-500">
              Loading published assessments...
            </p>
          ) : !classDetail ? (
            <EmptyState
              title="No course detail available"
              description="Grades are not available for the selected class yet."
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Published assessments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="neutral">
                    {classDetail.gradedCount}/{classDetail.assessmentCount}{" "}
                    graded
                  </Badge>
                  <Badge variant="neutral">
                    Average:{" "}
                    {formatDisplayedPercent(classDetail.averagePercent)}
                  </Badge>
                  <Badge variant="neutral">
                    Grade: {classDetail.averageLetterGrade ?? "—"}
                  </Badge>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <div className="space-y-4 p-4">
                      {classDetail.groups.map((group) => (
                        <div
                          className="space-y-2"
                          key={group.reportingPeriod?.id ?? "unassigned"}
                        >
                          <div className="flex items-center justify-between">
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
                            <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                              Scroll horizontally on smaller screens to view
                              all assessment columns.
                            </p>
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
                                      Status
                                    </th>
                                    <th className="px-4 py-3 font-semibold text-slate-700">
                                      Percent
                                    </th>
                                    <th className="px-4 py-3 font-semibold text-slate-700">
                                      Score
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 bg-white">
                                  {group.assessments.map((assessment) => (
                                    <tr
                                      className="align-top hover:bg-slate-50"
                                      key={assessment.id}
                                    >
                                      <td className="px-4 py-4">
                                        <p className="font-medium text-slate-900">
                                          {assessment.title}
                                        </p>
                                        {assessment.comment ? (
                                          <p className="mt-1 text-xs text-slate-500">
                                            {assessment.comment}
                                          </p>
                                        ) : null}
                                      </td>
                                      <td className="px-4 py-4 text-slate-600">
                                        {assessment.assessmentType.name}
                                      </td>
                                      <td className="px-4 py-4 text-slate-600">
                                        {assessment.dueAt
                                          ? formatDateLabel(assessment.dueAt)
                                          : "—"}
                                      </td>
                                      <td className="px-4 py-4 text-slate-600">
                                        {assessment.weight === null ||
                                        assessment.weight === undefined
                                          ? "—"
                                          : `${assessment.weight}%`}
                                      </td>
                                      <td className="px-4 py-4 text-slate-900">
                                        {assessment.statusLabel?.key ?? "—"}
                                      </td>
                                      <td className="px-4 py-4 text-slate-900">
                                        {formatDisplayedPercent(
                                          assessment.percent,
                                        )}
                                      </td>
                                      <td className="px-4 py-4 text-slate-900">
                                        {assessment.score === null
                                          ? "—"
                                          : `${assessment.score} / ${assessment.maxScore}`}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
