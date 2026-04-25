"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getClassById, type SchoolClass } from "@/lib/api/classes";
import { getStudentById, type StudentProfile } from "@/lib/api/students";
import {
  getStudentInClassSummary,
  type StudentInClassSummary,
} from "@/lib/api/gradebook";
import { formatDateLabel, formatDisplayedPercent } from "@/lib/utils";

export function ParentClassDetail({
  studentId,
  classId,
}: {
  studentId: string;
  classId: string;
}) {
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [schoolClass, setSchoolClass] = useState<SchoolClass | null>(null);
  const [summary, setSummary] = useState<StudentInClassSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      const [studentResult, classResult, summaryResult] =
        await Promise.allSettled([
          getStudentById(studentId),
          getClassById(classId),
          getStudentInClassSummary(classId, studentId),
        ]);

      if (studentResult.status === "fulfilled") {
        setStudent(studentResult.value);
      } else {
        setStudent(null);
      }

      if (classResult.status === "fulfilled") {
        setSchoolClass(classResult.value);
      } else {
        setSchoolClass(null);
      }

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
      } else {
        setSummary(null);
        setError(
          summaryResult.reason instanceof Error
            ? summaryResult.reason.message
            : "Unable to load class grades.",
        );
      }

      setIsLoading(false);
    }

    void load();
  }, [classId, studentId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={schoolClass ? schoolClass.name : "Course Detail"}
        description={
          student
            ? `${student.firstName} ${student.lastName}`
            : "Parent-visible course detail"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/parent?studentId=${encodeURIComponent(studentId)}`}
            >
              Back to portal
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/parent/students/${studentId}`}
            >
              Student profile
            </Link>
          </div>
        }
        meta={
          summary ? (
            <>
              <Badge variant="neutral">
                {summary.gradedCount}/{summary.assessmentCount} graded
              </Badge>
              <Badge variant="neutral">
                Average: {formatDisplayedPercent(summary.averagePercent)}
              </Badge>
              <Badge variant="neutral">
                Grade: {summary.averageLetterGrade ?? "—"}
              </Badge>
            </>
          ) : null
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading course detail...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !summary ? (
        <EmptyState
          title="No gradebook available"
          description="Grades are not available for this class yet."
        />
      ) : null}

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>Published assessments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {summary.groups.map((group) => (
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
                                {formatDisplayedPercent(assessment.percent)}
                              </td>
                              <td className="px-4 py-4 text-slate-900">
                                {assessment.score === null
                                  ? "—"
                                  : `${assessment.score} / ${assessment.maxScore}`}
                              </td>
                            </tr>
                          ))}
                          {group.assessments.length === 0 ? (
                            <tr>
                              <td className="px-4 py-10" colSpan={6}>
                                <EmptyState
                                  compact
                                  title="No assessments"
                                  description="No published assessments exist for this reporting period."
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
