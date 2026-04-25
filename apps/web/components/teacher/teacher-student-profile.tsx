"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getStudentById, type StudentProfile } from "@/lib/api/students";
import { formatDateOnly } from "@/lib/date";
import { getDisplayText } from "@/lib/utils";

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm text-slate-800">{value}</p>
    </div>
  );
}

function formatGender(value: StudentProfile["gender"]) {
  if (value === "MALE") {
    return "Male";
  }

  if (value === "FEMALE") {
    return "Female";
  }

  return "Not provided";
}

export function TeacherStudentProfile({
  classId,
  studentId,
}: {
  classId: string;
  studentId: string;
}) {
  const [student, setStudent] = useState<StudentProfile | null>(null);
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
        setStudent(null);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          student
            ? `${student.firstName} ${student.lastName}`
            : "Student Profile"
        }
        description="Read-only profile and emergency contact details for students in your assigned classes."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/teacher/classes/${encodeURIComponent(classId)}`}
            >
              Back to class
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/teacher/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}`}
            >
              Academics
            </Link>
          </div>
        }
        meta={
          student ? (
            <>
              <Badge variant="neutral">
                Student ID: {getDisplayText(student.studentNumber)}
              </Badge>
              <Badge variant="neutral">OEN {getDisplayText(student.oen)}</Badge>
            </>
          ) : null
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading student profile...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !student ? (
        <EmptyState
          title="Student profile unavailable"
          description="This student may no longer be in your assigned class list or you may not have access."
        />
      ) : null}

      {student ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Student Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-3">
              <DetailItem
                label="Student name"
                value={`${student.firstName} ${student.lastName}`}
              />
              <DetailItem
                label="Date of birth"
                value={formatDateOnly(student.dateOfBirth)}
              />
              <DetailItem label="Gender" value={formatGender(student.gender)} />
              <DetailItem
                label="Student ID"
                value={getDisplayText(student.studentNumber)}
              />
              <DetailItem label="OEN" value={getDisplayText(student.oen)} />
              <DetailItem
                label="Health conditions"
                value={getDisplayText(
                  student.medicalConditions,
                  "None recorded",
                )}
              />
              <DetailItem
                label="Allergies"
                value={getDisplayText(student.allergies, "None recorded")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Guardian Contacts</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="space-y-5 rounded-xl border border-slate-200 p-4">
                <DetailItem
                  label="Guardian"
                  value={getDisplayText(student.guardian1Name)}
                />
                <DetailItem
                  label="Relationship"
                  value={getDisplayText(student.guardian1Relationship)}
                />
                <DetailItem
                  label="Email"
                  value={getDisplayText(student.guardian1Email)}
                />
                <DetailItem
                  label="Phone"
                  value={getDisplayText(student.guardian1Phone)}
                />
                <DetailItem
                  label="Work phone"
                  value={getDisplayText(student.guardian1WorkPhone)}
                />
              </div>

              <div className="space-y-5 rounded-xl border border-slate-200 p-4">
                <DetailItem
                  label="Guardian"
                  value={getDisplayText(student.guardian2Name)}
                />
                <DetailItem
                  label="Relationship"
                  value={getDisplayText(student.guardian2Relationship)}
                />
                <DetailItem
                  label="Email"
                  value={getDisplayText(student.guardian2Email)}
                />
                <DetailItem
                  label="Phone"
                  value={getDisplayText(student.guardian2Phone)}
                />
                <DetailItem
                  label="Work phone"
                  value={getDisplayText(student.guardian2WorkPhone)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Emergency Contact</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-3">
              <DetailItem
                label="Contact name"
                value={getDisplayText(student.emergencyContactName)}
              />
              <DetailItem
                label="Relationship"
                value={getDisplayText(student.emergencyContactRelationship)}
              />
              <DetailItem
                label="Phone"
                value={getDisplayText(student.emergencyContactPhone)}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
