"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { getStudentById, type StudentProfile } from "@/lib/api/students";
import { listSchoolYears, type SchoolYear } from "@/lib/api/schools";
import { getReRegistrationWindowStatus, type ReRegistrationWindowStatus } from "@/lib/api/re-registration";
import { ParentReRegistrationForm } from "@/components/parent/re-registration-form";
import { parseDateOnly } from "@/lib/date";

function pickDefaultSchoolYear(years: SchoolYear[], now = new Date()) {
  const upcoming = years
    .filter((year) => {
      const startDate = parseDateOnly(year.startDate);
      return startDate ? startDate > now : false;
    })
    .sort((a, b) => {
      const startA = parseDateOnly(a.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const startB = parseDateOnly(b.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return startA - startB;
    })[0];

  return upcoming ?? years.find((year) => year.isActive) ?? years[0] ?? null;
}

export function ParentReRegistrationGate({ studentId }: { studentId: string }) {
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>("");
  const [status, setStatus] = useState<ReRegistrationWindowStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const schoolId = student?.memberships[0]?.schoolId ?? "";

  const selectedYear = useMemo(
    () => schoolYears.find((year) => year.id === selectedSchoolYearId) ?? null,
    [schoolYears, selectedSchoolYearId],
  );

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const profile = await getStudentById(studentId);
        setStudent(profile);

        const membershipSchoolId = profile.memberships[0]?.schoolId ?? "";
        if (!membershipSchoolId) {
          setSchoolYears([]);
          setSelectedSchoolYearId("");
          setStatus(null);
          return;
        }

        const years = await listSchoolYears(membershipSchoolId, { includeInactive: true });
        setSchoolYears(years);
        const defaultYear = pickDefaultSchoolYear(years);
        setSelectedSchoolYearId(defaultYear?.id ?? "");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load re-registration.");
        setStudent(null);
        setSchoolYears([]);
        setSelectedSchoolYearId("");
        setStatus(null);
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [studentId]);

  useEffect(() => {
    async function loadStatus() {
      if (!schoolId || !selectedSchoolYearId) {
        setStatus(null);
        return;
      }

      try {
        const response = await getReRegistrationWindowStatus({
          schoolId,
          schoolYearId: selectedSchoolYearId,
        });
        setStatus(response);
      } catch (loadError) {
        setStatus(null);
        setError(loadError instanceof Error ? loadError.message : "Unable to load re-registration status.");
      }
    }

    void loadStatus();
  }, [schoolId, selectedSchoolYearId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Re-registration"
        description="Update returning-student information without creating a duplicate record."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className={buttonClassName({ variant: "secondary" })} href={`/parent?studentId=${encodeURIComponent(studentId)}`}>
              Back to portal
            </Link>
            <Link className={buttonClassName({ variant: "secondary" })} href={`/parent/students/${studentId}`}>
              Student profile
            </Link>
          </div>
        }
        meta={
          student ? (
            <Badge variant="neutral">
              {student.firstName} {student.lastName}
            </Badge>
          ) : null
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading re-registration...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !student ? (
        <EmptyState title="Student unavailable" description="This student record could not be loaded." />
      ) : null}

      {student ? (
        <Card>
          <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
            <Field htmlFor="rr-school-year" label="School year">
              <Select
                id="rr-school-year"
                disabled={schoolYears.length === 0}
                onChange={(event) => setSelectedSchoolYearId(event.target.value)}
                value={selectedSchoolYearId}
              >
                {schoolYears.length === 0 ? <option value="">No school years</option> : null}
                {schoolYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}{year.isActive ? " (Active)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="self-end text-sm text-slate-600">
              {status?.status === "OPEN"
                ? `Open until ${new Date(status.window?.closesAt ?? "").toLocaleDateString()}`
                : status?.status === "CLOSED"
                  ? "Re-registration is currently closed."
                  : status?.status === "NOT_CONFIGURED"
                    ? "Re-registration has not been scheduled."
                    : "—"}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {student && selectedYear && status?.status === "OPEN" ? (
        <ParentReRegistrationForm studentId={studentId} schoolYearId={selectedYear.id} />
      ) : student && selectedYear && status?.status === "CLOSED" ? (
        <EmptyState
          title="Re-registration closed"
          description="Re-registration is not available right now. Please check back during the scheduled window."
        />
      ) : student && selectedYear && status?.status === "NOT_CONFIGURED" ? (
        <EmptyState
          title="Re-registration unavailable"
          description="Re-registration has not been scheduled for the selected school year."
        />
      ) : null}
    </div>
  );
}
