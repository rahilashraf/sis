"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { StudentProfileOverview } from "@/components/students/student-profile-overview";
import { getStudentById, type StudentProfile } from "@/lib/api/students";
import { getAttendanceStudentSummary, type AttendanceStudentSummary } from "@/lib/api/attendance";
import { listStudentDocuments, type StudentDocument } from "@/lib/api/student-documents";
import { dateOnlyFromDate } from "@/lib/date";
import { formatDateLabel } from "@/lib/utils";

function toISODate(value: Date) {
  return dateOnlyFromDate(value);
}

export function ParentStudentDetail({ studentId }: { studentId: string }) {
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceStudentSummary | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            : "Unable to load student profile.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [studentId]);

  useEffect(() => {
    async function loadDocuments() {
      setDocumentsError(null);
      setDocuments([]);

      try {
        const response = await listStudentDocuments(studentId);
        setDocuments(response);
      } catch (loadError) {
        setDocuments([]);
        setDocumentsError(
          loadError instanceof Error ? loadError.message : "Unable to load documents.",
        );
      }
    }

    void loadDocuments();
  }, [studentId]);

  useEffect(() => {
    async function loadAttendance() {
      setAttendanceError(null);
      setAttendanceSummary(null);

      try {
        const today = new Date();
        const start = new Date(today);
        start.setDate(today.getDate() - 30);

        const response = await getAttendanceStudentSummary({
          studentId,
          startDate: toISODate(start),
          endDate: toISODate(today),
        });
        setAttendanceSummary(response);
      } catch (loadError) {
        setAttendanceSummary(null);
        setAttendanceError(
          loadError instanceof Error ? loadError.message : "Unable to load attendance summary.",
        );
      }
    }

    void loadAttendance();
  }, [studentId]);

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/parent"
          >
            Back to my students
          </Link>
        }
        description="Read-only child profile details available through the current parent-student link."
        meta={
          student ? (
            <Badge variant="neutral">
              {student.memberships.length} school
              {student.memberships.length === 1 ? "" : "s"}
            </Badge>
          ) : null
        }
        title={
          student
            ? `${student.firstName} ${student.lastName}`
            : "Student Profile"
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {attendanceError ? <Notice tone="danger">{attendanceError}</Notice> : null}
      {documentsError ? <Notice tone="danger">{documentsError}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading student profile...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !student ? (
        <EmptyState
          description="This student record is unavailable. The link may have been removed or you may no longer have access."
          title="Student profile unavailable"
        />
      ) : null}

      {student ? <StudentProfileOverview student={student} /> : null}

      {student ? (
        <Card>
          <CardHeader>
            <CardTitle>Parent Portal Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/parent/students/${encodeURIComponent(studentId)}/academics`}
            >
              View academics
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/parent/students/${encodeURIComponent(studentId)}/billing`}
            >
              Billing
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/parent/students/${encodeURIComponent(studentId)}/timetable`}
            >
              View timetable
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/parent/forms?studentId=${encodeURIComponent(studentId)}`}
            >
              Forms
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/parent/students/${encodeURIComponent(studentId)}/re-registration`}
            >
              Re-registration
            </Link>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <p className="font-semibold text-slate-900">Attendance (30 days)</p>
              <p className="mt-1 text-slate-600">
                Present: {attendanceSummary?.presentCount ?? "—"} • Late: {attendanceSummary?.lateCount ?? "—"} • Absent: {attendanceSummary?.absentCount ?? "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {student ? (
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {documents.length === 0 ? (
              <p className="text-sm text-slate-600">No documents are available.</p>
            ) : (
              <div className="space-y-2">
                {documents.slice(0, 8).map((doc) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    key={doc.id}
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{doc.label ?? doc.fileName}</p>
                      <p className="text-xs text-slate-500">
                        {doc.type} • {formatDateLabel(doc.createdAt)}
                      </p>
                    </div>
                    <Badge variant={doc.isActive ? "neutral" : "neutral"}>
                      {doc.isActive ? "Active" : "Archived"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
