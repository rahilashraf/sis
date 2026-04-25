"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { getAttendanceSessions } from "@/lib/api/attendance";
import {
  getClassById,
  listMyClasses,
  type SchoolClass,
} from "@/lib/api/classes";
import {
  listTeacherInterviewSlots,
  type InterviewSlotTeacher,
} from "@/lib/api/interviews";
import { formatDateTimeLabel, getLocalDateInputValue } from "@/lib/utils";
import {
  getTeacherAssignedClasses,
  getTodayAttendanceClasses,
} from "./teacher-dashboard.helpers";

function getClassMetaLabel(schoolClass: SchoolClass) {
  const grade = schoolClass.gradeLevel?.name ?? "No grade";
  const subject =
    schoolClass.subjectOption?.name ?? schoolClass.subject ?? "No subject";
  return `${grade} • ${subject} • ${schoolClass.schoolYear.name}`;
}

export function TeacherDashboard() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [rosterClassId, setRosterClassId] = useState("");
  const [rosterClass, setRosterClass] = useState<SchoolClass | null>(null);
  const [interviewSlots, setInterviewSlots] = useState<InterviewSlotTeacher[]>(
    [],
  );
  const [todaySessionClassIds, setTodaySessionClassIds] = useState<Set<string>>(
    new Set(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialWarning, setPartialWarning] = useState<string | null>(null);

  const today = getLocalDateInputValue();

  useEffect(() => {
    async function loadDashboard() {
      setIsLoading(true);
      setError(null);
      setPartialWarning(null);

      try {
        const myClasses = await listMyClasses();
        setClasses(myClasses);

        setRosterClassId((current) => {
          if (
            current &&
            myClasses.some((schoolClass) => schoolClass.id === current)
          ) {
            return current;
          }

          return myClasses[0]?.id ?? "";
        });

        const schoolIds = Array.from(
          new Set(myClasses.map((schoolClass) => schoolClass.schoolId)),
        );

        const [sessionResults, interviewResult] = await Promise.all([
          Promise.allSettled(
            schoolIds.map((schoolId) => getAttendanceSessions(schoolId, today)),
          ),
          listTeacherInterviewSlots(),
        ]);

        const nextSessionClassIds = new Set<string>();
        let sessionFailures = 0;

        for (const result of sessionResults) {
          if (result.status === "fulfilled") {
            for (const session of result.value) {
              for (const sessionClass of session.classes) {
                nextSessionClassIds.add(sessionClass.classId);
              }
            }
          } else {
            sessionFailures += 1;
          }
        }

        setTodaySessionClassIds(nextSessionClassIds);
        setInterviewSlots(interviewResult);

        if (sessionFailures > 0) {
          setPartialWarning(
            "Some attendance summaries could not be loaded. Refresh to retry.",
          );
        }
      } catch (loadError) {
        setClasses([]);
        setInterviewSlots([]);
        setTodaySessionClassIds(new Set());
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load teacher dashboard.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadDashboard();
  }, [today]);

  useEffect(() => {
    async function loadRosterClass() {
      if (!rosterClassId) {
        setRosterClass(null);
        return;
      }

      setIsLoadingRoster(true);
      try {
        const schoolClass = await getClassById(rosterClassId);
        setRosterClass(schoolClass);
      } catch {
        setRosterClass(null);
      } finally {
        setIsLoadingRoster(false);
      }
    }

    void loadRosterClass();
  }, [rosterClassId]);

  const attendanceEnabledClasses = useMemo(
    () =>
      getTeacherAssignedClasses(classes).filter(
        (schoolClass) => schoolClass.isActive && schoolClass.takesAttendance,
      ),
    [classes],
  );

  const classesNeedingAttendance = useMemo(
    () => getTodayAttendanceClasses(classes, todaySessionClassIds),
    [classes, todaySessionClassIds],
  );

  const gradebookClasses = useMemo(
    () => classes.filter((schoolClass) => schoolClass.isActive).slice(0, 6),
    [classes],
  );

  const upcomingInterviews = useMemo(() => {
    const now = Date.now();

    return interviewSlots
      .filter((slot) => new Date(slot.startTime).getTime() >= now)
      .sort(
        (left, right) =>
          new Date(left.startTime).getTime() -
          new Date(right.startTime).getTime(),
      )
      .slice(0, 5);
  }, [interviewSlots]);

  const rosterStudents = rosterClass?.students ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teacher Dashboard"
        description="Your classes, attendance, gradebook shortcuts, and student quick access."
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/teacher/classes"
          >
            View all classes
          </Link>
        }
        meta={
          <>
            <Badge variant="neutral">{classes.length} assigned classes</Badge>
            <Badge variant="neutral">
              {classesNeedingAttendance.length} attendance pending
            </Badge>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {partialWarning ? <Notice tone="warning">{partialWarning}</Notice> : null}

      {isLoading ? <Notice tone="info">Loading dashboard...</Notice> : null}

      {!isLoading && !error && classes.length === 0 ? (
        <EmptyState
          title="No assigned classes yet."
          description="When classes are assigned to you, they will appear here."
        />
      ) : null}

      {!isLoading && !error && classes.length > 0 ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>My Classes</CardTitle>
              <CardDescription>
                Assigned classes with direct links to class, attendance, and
                gradebook.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {classes.map((schoolClass) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                    key={schoolClass.id}
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {schoolClass.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {getClassMetaLabel(schoolClass)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        className={buttonClassName({
                          size: "sm",
                          variant: "secondary",
                        })}
                        href={`/teacher/classes/${encodeURIComponent(schoolClass.id)}`}
                      >
                        Open Class
                      </Link>
                      {schoolClass.takesAttendance ? (
                        <Link
                          className={buttonClassName({
                            size: "sm",
                            variant: "secondary",
                          })}
                          href={`/teacher/attendance?classId=${encodeURIComponent(schoolClass.id)}`}
                        >
                          Attendance
                        </Link>
                      ) : (
                        <Badge variant="warning">Attendance disabled</Badge>
                      )}
                      <Link
                        className={buttonClassName({
                          size: "sm",
                          variant: "secondary",
                        })}
                        href={`/teacher/gradebook?classId=${encodeURIComponent(schoolClass.id)}`}
                      >
                        Gradebook
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Today’s Attendance</CardTitle>
                <CardDescription>
                  Only classes with attendance enabled are listed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {attendanceEnabledClasses.length === 0 ? (
                  <EmptyState
                    compact
                    title="No attendance-enabled classes"
                    description="All assigned classes currently have attendance disabled."
                  />
                ) : classesNeedingAttendance.length === 0 ? (
                  <EmptyState
                    compact
                    title="Attendance up to date"
                    description="Attendance has already been submitted for all enabled classes today."
                  />
                ) : (
                  <div className="space-y-3">
                    {classesNeedingAttendance.map((schoolClass) => (
                      <div
                        className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"
                        key={schoolClass.id}
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {schoolClass.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {schoolClass.schoolYear.name}
                          </p>
                        </div>
                        <Link
                          className={buttonClassName({
                            size: "sm",
                            variant: "secondary",
                          })}
                          href={`/teacher/attendance?classId=${encodeURIComponent(schoolClass.id)}`}
                        >
                          Take attendance
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Gradebook Tasks</CardTitle>
                <CardDescription>
                  Quick access to class gradebooks and assignments.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {gradebookClasses.length === 0 ? (
                  <EmptyState
                    compact
                    title="No gradebook classes"
                    description="No active classes are currently available."
                  />
                ) : (
                  <div className="space-y-3">
                    {gradebookClasses.map((schoolClass) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2"
                        key={schoolClass.id}
                      >
                        <p className="text-sm font-medium text-slate-900">
                          {schoolClass.name}
                        </p>
                        <div className="flex gap-2">
                          <Link
                            className={buttonClassName({
                              size: "sm",
                              variant: "secondary",
                            })}
                            href={`/teacher/gradebook?classId=${encodeURIComponent(schoolClass.id)}`}
                          >
                            Gradebook
                          </Link>
                          <Link
                            className={buttonClassName({
                              size: "sm",
                              variant: "secondary",
                            })}
                            href={`/teacher/classes/${encodeURIComponent(schoolClass.id)}/assignments`}
                          >
                            Assignments
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Student Access</CardTitle>
                <CardDescription>
                  Access student profiles only from your assigned class roster.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field
                  htmlFor="teacher-dashboard-roster-class"
                  label="Class roster"
                >
                  <Select
                    id="teacher-dashboard-roster-class"
                    onChange={(event) => setRosterClassId(event.target.value)}
                    value={rosterClassId}
                  >
                    <option value="">Select class</option>
                    {classes.map((schoolClass) => (
                      <option key={schoolClass.id} value={schoolClass.id}>
                        {schoolClass.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                {isLoadingRoster ? (
                  <p className="text-sm text-slate-500">Loading roster...</p>
                ) : rosterStudents.length === 0 ? (
                  <EmptyState
                    compact
                    title="No students in roster"
                    description="Select a class with enrolled students to open student profiles."
                  />
                ) : (
                  <div className="space-y-2">
                    {rosterStudents.slice(0, 12).map((enrollment) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2"
                        key={enrollment.id}
                      >
                        <p className="text-sm font-medium text-slate-900">
                          {enrollment.student.firstName}{" "}
                          {enrollment.student.lastName}
                        </p>
                        <div className="flex gap-2">
                          <Link
                            className={buttonClassName({
                              size: "sm",
                              variant: "secondary",
                            })}
                            href={`/teacher/classes/${encodeURIComponent(rosterClassId)}/students/${encodeURIComponent(enrollment.studentId)}/profile`}
                          >
                            Profile
                          </Link>
                          <Link
                            className={buttonClassName({
                              size: "sm",
                              variant: "secondary",
                            })}
                            href={`/teacher/classes/${encodeURIComponent(rosterClassId)}/students/${encodeURIComponent(enrollment.studentId)}`}
                          >
                            Academics
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Interviews</CardTitle>
                <CardDescription>
                  Upcoming parent-teacher interview slots.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingInterviews.length === 0 ? (
                  <EmptyState
                    compact
                    title="No upcoming interviews"
                    description="Your next interview bookings will appear here."
                  />
                ) : (
                  upcomingInterviews.map((slot) => (
                    <div
                      className="rounded-xl border border-slate-200 px-3 py-2"
                      key={slot.id}
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {slot.interviewEvent.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDateTimeLabel(slot.startTime)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {slot.class?.name ?? "No class"}
                        {slot.bookedStudent
                          ? ` • ${slot.bookedStudent.firstName} ${slot.bookedStudent.lastName}`
                          : " • Unbooked"}
                      </p>
                    </div>
                  ))
                )}

                <Link
                  className={buttonClassName({ variant: "secondary" })}
                  href="/teacher/interviews"
                >
                  Open interviews
                </Link>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Forms / Notices</CardTitle>
              <CardDescription>
                Teacher-specific forms and notices.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyState
                compact
                title="Coming soon"
                description="Teacher forms and notices will appear here when the module is available."
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
