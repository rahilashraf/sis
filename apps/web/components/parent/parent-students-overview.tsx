"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { listParentStudents, type ParentStudentLink } from "@/lib/api/students";
import { getStudentAcademicOverview, type StudentAcademicOverview } from "@/lib/api/gradebook";
import { getAttendanceStudentSummary, type AttendanceStudentSummary } from "@/lib/api/attendance";
import { listSchoolYears } from "@/lib/api/schools";
import { getReRegistrationWindowStatus, type ReRegistrationWindowStatus } from "@/lib/api/re-registration";
import { listParentForms, type ParentFormSummary } from "@/lib/api/forms";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import { dateOnlyFromDate, parseDateOnly } from "@/lib/date";
import { formatDisplayedPercent } from "@/lib/utils";

function toISODate(value: Date) {
  return dateOnlyFromDate(value);
}

export function ParentStudentsOverview() {
  const searchParams = useSearchParams();
  const { session } = useAuth();
  const [links, setLinks] = useState<ParentStudentLink[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [academicOverview, setAcademicOverview] = useState<StudentAcademicOverview | null>(null);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceStudentSummary | null>(null);
  const [reRegistrationStatus, setReRegistrationStatus] = useState<ReRegistrationWindowStatus | null>(null);
  const [parentForms, setParentForms] = useState<ParentFormSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!session?.user.id) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await listParentStudents(session.user.id);
        setLinks(response);
        const requestedStudentId = searchParams.get("studentId") ?? "";
        const defaultStudentId =
          requestedStudentId && response.some((entry) => entry.studentId === requestedStudentId)
            ? requestedStudentId
            : response[0]?.studentId ?? "";
        setSelectedStudentId((current) => current || defaultStudentId);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load linked students.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [searchParams, session?.user.id]);

  const selectedLink = useMemo(
    () => links.find((entry) => entry.studentId === selectedStudentId) ?? null,
    [links, selectedStudentId],
  );

  useEffect(() => {
    async function loadStudentDashboard() {
      if (!selectedStudentId) {
        setAcademicOverview(null);
        setAttendanceSummary(null);
        setReRegistrationStatus(null);
        setParentForms([]);
        setDetailError(null);
        return;
      }

      setDetailError(null);

      try {
        const today = new Date();
        const start = new Date(today);
        start.setDate(today.getDate() - 30);

        const [overviewResponse, attendanceResponse, formsResponse] = await Promise.all([
          getStudentAcademicOverview(selectedStudentId),
          getAttendanceStudentSummary({
            studentId: selectedStudentId,
            startDate: toISODate(start),
            endDate: toISODate(today),
          }),
          listParentForms(selectedStudentId),
        ]);

        setAcademicOverview(overviewResponse);
        setAttendanceSummary(attendanceResponse);
        setParentForms(formsResponse);

        const membershipSchoolId = getDefaultSchoolContextId(selectedLink?.student) ?? "";
        if (!membershipSchoolId) {
          setReRegistrationStatus(null);
          return;
        }

        const schoolYears = await listSchoolYears(membershipSchoolId, { includeInactive: true });
        const now = new Date();
        const upcoming =
          schoolYears
            .filter((year) => {
              const startDate = parseDateOnly(year.startDate);
              return startDate ? startDate > now : false;
            })
            .sort((a, b) => {
              const startA = parseDateOnly(a.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
              const startB = parseDateOnly(b.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
              return startA - startB;
            })[0] ??
          schoolYears.find((year) => year.isActive) ??
          schoolYears[0];

        if (!upcoming) {
          setReRegistrationStatus(null);
          return;
        }

        const status = await getReRegistrationWindowStatus({
          schoolId: membershipSchoolId,
          schoolYearId: upcoming.id,
        });
        setReRegistrationStatus(status);
      } catch (loadError) {
        setAcademicOverview(null);
        setAttendanceSummary(null);
        setReRegistrationStatus(null);
        setParentForms([]);
        setDetailError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load student dashboard details.",
        );
      }
    }

    void loadStudentDashboard();
  }, [selectedLink?.student, selectedStudentId]);

  return (
    <div className="space-y-6">
      <PageHeader
        description="Summary-first academic and attendance view for your linked students."
        meta={
          <Badge variant="neutral">
            {isLoading ? "Loading..." : `${links.length} linked child${links.length === 1 ? "" : "ren"}`}
          </Badge>
        }
        title="Parent Portal"
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {detailError ? <Notice tone="danger">{detailError}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading linked students...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && links.length === 0 ? (
        <EmptyState
          description="No student records are currently linked to this parent account."
          title="No linked students"
        />
      ) : null}

      {!isLoading && links.length > 0 ? (
        <>
          <Card>
            <CardContent className="grid gap-4 pt-6 md:grid-cols-[1fr_auto] md:items-end">
              <Field htmlFor="parent-student-selector" label="Student">
                <Select
                  id="parent-student-selector"
                  onChange={(event) => setSelectedStudentId(event.target.value)}
                  value={selectedStudentId}
                >
                  {links.map((link) => (
                    <option key={link.studentId} value={link.studentId}>
                      {link.student.firstName} {link.student.lastName}
                    </option>
                  ))}
                </Select>
              </Field>

              {selectedStudentId ? (
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Link
                    className={buttonClassName({ variant: "secondary" })}
                    href={`/parent/students/${selectedStudentId}`}
                  >
                    Student profile
                  </Link>
                  <Link
                    className={buttonClassName({ variant: "secondary" })}
                    href={`/parent/students/${selectedStudentId}/academics`}
                  >
                    Academics
                  </Link>
                  <Link
                    className={buttonClassName({ variant: "secondary" })}
                    href={`/parent/students/${selectedStudentId}/timetable`}
                  >
                    Timetable
                  </Link>
                  <Link
                    className={buttonClassName({ variant: "secondary" })}
                    href={`/parent/forms?studentId=${encodeURIComponent(selectedStudentId)}`}
                  >
                    Forms
                  </Link>
                  {reRegistrationStatus?.isOpen ? (
                    <Link
                      className={buttonClassName({ variant: "secondary" })}
                      href={`/parent/students/${selectedStudentId}/re-registration`}
                    >
                      Re-registration
                    </Link>
                  ) : reRegistrationStatus?.status === "CLOSED" ? (
                    <span
                      className={`${buttonClassName({ variant: "secondary" })} cursor-not-allowed opacity-60`}
                    >
                      Re-registration closed
                    </span>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {reRegistrationStatus && !reRegistrationStatus.isOpen && reRegistrationStatus.status !== "NOT_CONFIGURED" ? (
            <Notice tone="info">Re-registration is currently closed.</Notice>
          ) : null}

          {selectedLink ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Attendance (30 days)</CardTitle>
                  <CardDescription>Present / Late / Absent summary</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Present</span>
                    <span className="font-medium text-slate-900">{attendanceSummary?.presentCount ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Late</span>
                    <span className="font-medium text-slate-900">{attendanceSummary?.lateCount ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Absent</span>
                    <span className="font-medium text-slate-900">{attendanceSummary?.absentCount ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Rate</span>
                    <span className="font-medium text-slate-900">
                      {typeof attendanceSummary?.attendancePercentage === "number"
                        ? `${attendanceSummary.attendancePercentage}%`
                        : "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Forms</CardTitle>
                  <CardDescription>Parent action items</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Open</span>
                    <span className="font-medium text-slate-900">
                      {parentForms.filter((form) => form.state === "OPEN").length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Submitted</span>
                    <span className="font-medium text-slate-900">
                      {parentForms.filter((form) => form.state === "SUBMITTED").length}
                    </span>
                  </div>
                  <div className="pt-1">
                    <Link
                      className={buttonClassName({ size: "sm", variant: "secondary" })}
                      href={`/parent/forms?studentId=${encodeURIComponent(selectedStudentId)}`}
                    >
                      Open forms
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Courses</CardTitle>
              <CardDescription>Course-by-course overview with parent-visible grades.</CardDescription>
            </CardHeader>
            <CardContent>
              {!academicOverview ? (
                <EmptyState
                  compact
                  title="No course overview"
                  description="Grades are not available yet for the selected student."
                />
              ) : academicOverview.classes.length === 0 ? (
                <EmptyState
                  compact
                  title="No courses"
                  description="This student is not currently enrolled in any classes."
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50/80">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-slate-700">Course</th>
                          <th className="px-4 py-3 font-semibold text-slate-700">School year</th>
                          <th className="px-4 py-3 font-semibold text-slate-700">Progress</th>
                          <th className="px-4 py-3 font-semibold text-slate-700">%</th>
                          <th className="px-4 py-3 font-semibold text-slate-700">Grade</th>
                          <th className="px-4 py-3 font-semibold text-slate-700">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {academicOverview.classes.map((entry) => (
                          <tr className="align-top hover:bg-slate-50" key={entry.class.id}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">{entry.class.name}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {entry.class.subject ?? "—"} • {entry.class.school.shortName ?? entry.class.school.name}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{entry.class.schoolYear.name}</td>
                            <td className="px-4 py-3 text-slate-600">
                              {entry.gradedCount}/{entry.assessmentCount} graded
                            </td>
                            <td className="px-4 py-3 text-slate-900">
                              {formatDisplayedPercent(entry.averagePercent)}
                            </td>
                            <td className="px-4 py-3 text-slate-900">{entry.averageLetterGrade ?? "—"}</td>
                            <td className="px-4 py-3">
                              <Link
                                className={buttonClassName({ size: "sm", variant: "secondary" })}
                                href={`/parent/students/${selectedStudentId}/classes/${entry.class.id}`}
                              >
                                View
                              </Link>
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
        </>
      ) : null}
    </div>
  );
}
