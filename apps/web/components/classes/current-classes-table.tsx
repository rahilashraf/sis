"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { listClasses, listMyClasses, type SchoolClass } from "@/lib/api/classes";
import { listReportingPeriods, type ReportingPeriod } from "@/lib/api/reporting-periods";

type Mode = "teacher" | "admin";

function inferGradeLevelLabel(schoolClass: SchoolClass) {
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

function getStudentCount(schoolClass: SchoolClass) {
  if (typeof schoolClass._count?.students === "number") {
    return schoolClass._count.students;
  }

  return schoolClass.students?.length ?? 0;
}

function findCurrentReportingPeriod(periods: ReportingPeriod[], now = new Date()) {
  const active = periods.filter((period) => period.isActive);
  const current = active.find((period) => {
    const start = new Date(period.startsAt);
    const end = new Date(period.endsAt);
    return now >= start && now <= end;
  });

  return current ?? active.sort((a, b) => a.order - b.order)[0] ?? null;
}

export function CurrentClassesTable({ mode, actions }: { mode: Mode; actions?: ReactNode }) {
  const router = useRouter();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [reportingPeriodByKey, setReportingPeriodByKey] = useState<Record<string, ReportingPeriod | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sortedClasses = useMemo(() => {
    return [...classes].sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);

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

      const next: Record<string, ReportingPeriod | null> = {};
      for (const result of results) {
        if (result.status === "fulfilled") {
          next[result.value.key] = result.value.period;
        }
      }

      setReportingPeriodByKey(next);
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
        meta={<Badge variant="neutral">{sortedClasses.length} classes</Badge>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {sortedClasses.length === 0 ? (
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
              Click a class row to open the gradebook scoresheet.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                    {sortedClasses.map((schoolClass) => {
                      const key = `${schoolClass.schoolId}:${schoolClass.schoolYearId}`;
                      const currentPeriod = reportingPeriodByKey[key] ?? null;

                      return (
                        <tr
                          className="align-top hover:bg-slate-50"
                          key={schoolClass.id}
                        >
                          <td className="px-4 py-4">
                            <button
                              className="text-left font-medium text-slate-900 hover:underline"
                              onClick={() => {
                                router.push(
                                  `/${mode}/gradebook?classId=${encodeURIComponent(
                                    schoolClass.id,
                                  )}`,
                                );
                              }}
                              type="button"
                            >
                              {schoolClass.name}
                            </button>
                            <p className="mt-1 text-xs text-slate-500">{schoolClass.school.name}</p>
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {schoolClass.subject ?? "—"}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {getStudentCount(schoolClass)}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {inferGradeLevelLabel(schoolClass)}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {schoolClass.schoolYear.name}
                          </td>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
