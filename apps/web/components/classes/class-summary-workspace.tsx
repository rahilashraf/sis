"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getClassById, type SchoolClass } from "@/lib/api/classes";
import { getClassGradeSummary, type ClassGradeSummary } from "@/lib/api/gradebook";
import { formatDisplayedPercent, getDisplayText, roundDisplayedPercent } from "@/lib/utils";

type Mode = "teacher" | "admin";

function formatPercent(value: number | null) {
  return formatDisplayedPercent(value);
}

function getFullName(firstName: unknown, lastName: unknown, fallback = "—") {
  const first = getDisplayText(firstName, "");
  const last = getDisplayText(lastName, "");
  const fullName = `${first} ${last}`.trim();

  return fullName || fallback;
}

export function ClassSummaryWorkspace({ mode, classId }: { mode: Mode; classId: string }) {
  const router = useRouter();
  const [schoolClass, setSchoolClass] = useState<SchoolClass | null>(null);
  const [summary, setSummary] = useState<ClassGradeSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      setSummaryError(null);

      const [classResult, summaryResult] = await Promise.allSettled([
        getClassById(classId),
        getClassGradeSummary(classId),
      ]);

      if (classResult.status === "fulfilled") {
        setSchoolClass(classResult.value);
      } else {
        setSchoolClass(null);
        setError(
          classResult.reason instanceof Error
            ? classResult.reason.message
            : "Unable to load class context.",
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

      setIsLoading(false);
    }

    void load();
  }, [classId]);

  const sortedStudents = useMemo(() => {
    if (!summary) {
      return [];
    }

    return [...summary.students].sort((a, b) => {
      const aLast = a.student.lastName ?? "";
      const bLast = b.student.lastName ?? "";
      if (aLast.localeCompare(bLast) !== 0) {
        return aLast.localeCompare(bLast);
      }

      const aFirst = a.student.firstName ?? "";
      const bFirst = b.student.firstName ?? "";
      return aFirst.localeCompare(bFirst);
    });
  }, [summary]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={schoolClass ? schoolClass.name : "Class Summary"}
        description="Academic overview for the class with quick student drill-down."
        meta={
          summary ? (
            <>
              <Badge variant="neutral">{summary.studentCount} students</Badge>
              <Badge variant="neutral">
                Class avg: {formatPercent(summary.overallAveragePercent)}
              </Badge>
              <Badge variant="neutral">Grade: {summary.overallLetterGrade ?? "—"}</Badge>
            </>
          ) : null
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className={buttonClassName({ variant: "secondary" })} href={`/${mode}/classes`}>
              Back to classes
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/${mode}/gradebook?classId=${encodeURIComponent(classId)}`}
            >
              Gradebook
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/${mode}/attendance?classId=${encodeURIComponent(classId)}`}
            >
              Attendance
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/${mode}/classes/${classId}/assignments`}
            >
              Assignments
            </Link>
          </div>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {summaryError ? <Notice tone="danger">{summaryError}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading class summary...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !summary ? (
        <EmptyState
          title="Summary unavailable"
          description="This class summary could not be loaded. Check access and try again."
        />
      ) : null}

      {schoolClass ? (
        <Card>
          <CardContent className="grid gap-3 pt-6 md:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Subject
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {schoolClass.subject ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                School year
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {schoolClass.schoolYear.name}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Assessments
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {summary?.assessmentCount ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                School
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {schoolClass.school.name}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>Students</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">Student</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Assessments</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Avg</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">%</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {sortedStudents.map((entry) => (
                      <tr className="align-top hover:bg-slate-50" key={entry.student.id}>
                        <td className="px-4 py-3">
                          <button
                            className="text-left font-medium text-slate-900 hover:underline"
                            onClick={() => {
                              router.push(`/${mode}/classes/${classId}/students/${entry.student.id}`);
                            }}
                            type="button"
                          >
                            {getFullName(entry.student.firstName, entry.student.lastName)}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {entry.gradedCount}/{entry.assessmentCount}
                        </td>
                        <td className="px-4 py-3 text-slate-900">
                          {entry.averagePercent === null ? "—" : roundDisplayedPercent(entry.averagePercent)}
                        </td>
                        <td className="px-4 py-3 text-slate-900">
                          {formatPercent(entry.averagePercent)}
                        </td>
                        <td className="px-4 py-3 text-slate-900">
                          {entry.averageLetterGrade ?? "—"}
                        </td>
                      </tr>
                    ))}
                    {sortedStudents.length === 0 ? (
                      <tr>
                        <td className="px-4 py-10" colSpan={5}>
                          <EmptyState
                            compact
                            title="No students enrolled"
                            description="Enroll students to view class academic summaries."
                          />
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
