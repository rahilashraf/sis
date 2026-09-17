"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import {
  getAttendanceClassSummaryDetails,
  type AttendanceClassSummaryDetails,
} from "@/lib/api/attendance";
import { listMyClasses, listClasses, type SchoolClass } from "@/lib/api/classes";
import { listReportingPeriods, type ReportingPeriod } from "@/lib/api/reporting-periods";
import { listSchoolYears, type SchoolYear } from "@/lib/api/schools";
import { useAuth } from "@/lib/auth/auth-context";
import { getLocalDateInputValue, formatDateLabel, getDisplayText } from "@/lib/utils";

type SummaryMode = "range" | "term" | "schoolYear";

function formatRate(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${value}%`;
}

function getStudentName(student: AttendanceClassSummaryDetails["students"][number]["student"]) {
  return `${getDisplayText(student.firstName, "")} ${getDisplayText(student.lastName, "")}`.trim() || "Unnamed student";
}

export function AttendanceSummaryWorkspace({
  mode,
}: {
  mode: "teacher" | "admin";
}) {
  const { selectedSchoolId: schoolContextId } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [reportingPeriods, setReportingPeriods] = useState<ReportingPeriod[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState("");
  const [selectedReportingPeriodId, setSelectedReportingPeriodId] = useState("");
  const [summaryMode, setSummaryMode] = useState<SummaryMode>("range");
  const [startDate, setStartDate] = useState(getLocalDateInputValue());
  const [endDate, setEndDate] = useState(getLocalDateInputValue());
  const [searchQuery, setSearchQuery] = useState("");
  const [summary, setSummary] = useState<AttendanceClassSummaryDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableSchools = useMemo(() => {
    const result = new Map<string, { id: string; name: string }>();
    classes.forEach((schoolClass) =>
      result.set(schoolClass.schoolId, {
        id: schoolClass.schoolId,
        name: schoolClass.school.name,
      }),
    );
    return Array.from(result.values());
  }, [classes]);

  const visibleClasses = useMemo(
    () =>
      mode === "admin" && selectedSchoolId
        ? classes.filter((schoolClass) => schoolClass.schoolId === selectedSchoolId)
        : classes,
    [classes, mode, selectedSchoolId],
  );

  const selectedClass = visibleClasses.find((schoolClass) => schoolClass.id === selectedClassId) ?? null;
  const selectedSchoolYear = schoolYears.find((year) => year.id === selectedSchoolYearId) ?? null;
  const selectedPeriod = reportingPeriods.find((period) => period.id === selectedReportingPeriodId) ?? null;
  const effectiveRange = useMemo(() => {
    if (summaryMode === "term" && selectedPeriod) {
      return { startDate: selectedPeriod.startsAt, endDate: selectedPeriod.endsAt };
    }
    if (summaryMode === "schoolYear" && selectedSchoolYear) {
      return { startDate: selectedSchoolYear.startDate, endDate: selectedSchoolYear.endDate };
    }
    return { startDate, endDate };
  }, [endDate, selectedPeriod, selectedSchoolYear, startDate, summaryMode]);

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!summary || !query) return summary?.students ?? [];
    return summary.students.filter(({ student }) =>
      [getStudentName(student), student.username]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [searchQuery, summary]);

  useEffect(() => {
    let cancelled = false;
    async function loadClasses() {
      setIsLoading(true);
      try {
        const loaded = mode === "teacher" ? await listMyClasses() : await listClasses();
        if (!cancelled) setClasses(loaded.filter((schoolClass) => schoolClass.takesAttendance));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load classes.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadClasses();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    if (mode === "teacher") {
      const schoolId = classes[0]?.schoolId ?? "";
      setSelectedSchoolId(schoolId);
      setSelectedClassId((current) => visibleClasses.some((schoolClass) => schoolClass.id === current) ? current : visibleClasses[0]?.id ?? "");
      return;
    }
    if (!selectedSchoolId && (schoolContextId || classes[0]?.schoolId)) {
      setSelectedSchoolId(schoolContextId || classes[0].schoolId);
    }
    if (selectedSchoolId && !visibleClasses.some((schoolClass) => schoolClass.id === selectedClassId)) {
      setSelectedClassId(visibleClasses[0]?.id ?? "");
      setSummary(null);
    }
  }, [classes, mode, schoolContextId, selectedClassId, selectedSchoolId, visibleClasses]);

  useEffect(() => {
    if (!selectedSchoolId) {
      setSchoolYears([]);
      setSelectedSchoolYearId("");
      return;
    }
    let cancelled = false;
    void listSchoolYears(selectedSchoolId, { includeInactive: true })
      .then((years) => {
        if (!cancelled) {
          setSchoolYears(years);
          setSelectedSchoolYearId((current) => current || years.find((year) => year.isActive)?.id || years[0]?.id || "");
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load school years.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSchoolId]);

  useEffect(() => {
    if (summaryMode !== "term" || !selectedSchoolId || !selectedSchoolYearId) {
      setReportingPeriods([]);
      setSelectedReportingPeriodId("");
      return;
    }
    let cancelled = false;
    setIsLoadingPeriods(true);
    void listReportingPeriods({
      schoolId: selectedSchoolId,
      schoolYearId: selectedSchoolYearId,
    })
      .then((periods) => {
        if (!cancelled) {
          setReportingPeriods(periods);
          setSelectedReportingPeriodId(periods[0]?.id ?? "");
        }
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load reporting periods.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPeriods(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSchoolId, selectedSchoolYearId, summaryMode]);

  useEffect(() => {
    if (summaryMode === "schoolYear" && selectedSchoolYear) {
      setStartDate(selectedSchoolYear.startDate);
      setEndDate(selectedSchoolYear.endDate);
    }
  }, [selectedSchoolYear, summaryMode]);

  useEffect(() => {
    if (!selectedClassId || !effectiveRange.startDate || !effectiveRange.endDate) {
      setSummary(null);
      return;
    }
    if (effectiveRange.startDate > effectiveRange.endDate) {
      setSummary(null);
      setError("Start date cannot be after end date.");
      return;
    }
    let cancelled = false;
    setIsLoadingSummary(true);
    setError(null);
    void getAttendanceClassSummaryDetails({
      classId: selectedClassId,
      startDate: effectiveRange.startDate,
      endDate: effectiveRange.endDate,
    })
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setSummary(null);
          setError(loadError instanceof Error ? loadError.message : "Unable to load attendance summary.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSummary(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveRange.endDate, effectiveRange.startDate, selectedClassId]);

  const modes: Array<{ value: SummaryMode; label: string }> = [
    { value: "range", label: "Date Range" },
    { value: "term", label: "Term" },
    { value: "schoolYear", label: "School Year" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance Summary"
        description="Review attendance by date range, reporting period, or school year."
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Summary period">
            {modes.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={summaryMode === item.value}
                className={`rounded-lg border px-4 py-2 text-sm font-medium outline-none focus-visible:ring-4 focus-visible:ring-slate-950/10 ${summaryMode === item.value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                onClick={() => setSummaryMode(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {mode === "admin" ? (
              <Field htmlFor="summary-school" label="School">
                <Select id="summary-school" value={selectedSchoolId} onChange={(event) => setSelectedSchoolId(event.target.value)}>
                  <option value="">Select school</option>
                  {availableSchools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
                </Select>
              </Field>
            ) : null}
            <Field htmlFor="summary-class" label="Class">
              <Select id="summary-class" value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>
                <option value="">Select class</option>
                {visibleClasses.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}
              </Select>
            </Field>
            {summaryMode === "range" ? (
              <>
                <Field htmlFor="summary-start-date" label="Start Date">
                  <Input id="summary-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                </Field>
                <Field htmlFor="summary-end-date" label="End Date">
                  <Input id="summary-end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </Field>
              </>
            ) : null}
            {summaryMode !== "range" ? (
              <Field htmlFor="summary-school-year" label="School Year">
                <Select id="summary-school-year" value={selectedSchoolYearId} onChange={(event) => setSelectedSchoolYearId(event.target.value)}>
                  <option value="">Select school year</option>
                  {schoolYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
                </Select>
              </Field>
            ) : null}
            {summaryMode === "term" ? (
              <Field htmlFor="summary-reporting-period" label="Reporting Period">
                <Select id="summary-reporting-period" value={selectedReportingPeriodId} onChange={(event) => setSelectedReportingPeriodId(event.target.value)} disabled={isLoadingPeriods}>
                  <option value="">{isLoadingPeriods ? "Loading periods..." : "Select reporting period"}</option>
                  {reportingPeriods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
                </Select>
              </Field>
            ) : null}
          </div>
          {summaryMode !== "range" && (selectedPeriod || selectedSchoolYear) ? (
            <p className="text-sm text-slate-600">
              Period: {formatDateLabel(effectiveRange.startDate)} – {formatDateLabel(effectiveRange.endDate)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {isLoading || isLoadingSummary ? <p className="text-sm text-slate-500">Loading attendance summary...</p> : null}
      {!isLoading && visibleClasses.length === 0 ? <EmptyState title="No classes available" description="There are no authorized attendance classes to summarize." /> : null}

      {summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Students", summary.studentCount],
              ["Present", summary.presentCount],
              ["Late", summary.lateCount],
              ["Absent", summary.absentCount],
              ["Attendance Rate", formatRate(summary.attendanceRate)],
            ].map(([label, value]) => (
              <Card key={label}><CardContent className="pt-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-slate-950">{value}</p></CardContent></Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle>Student Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field htmlFor="summary-student-search" label="Find student" className="w-full sm:max-w-sm">
                <Input id="summary-student-search" placeholder="Search by name or username" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              </Field>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Student</th>
                      <th className="px-4 py-3 font-semibold">Present</th>
                      <th className="px-4 py-3 font-semibold">Late</th>
                      <th className="px-4 py-3 font-semibold">Absent</th>
                      <th className="px-4 py-3 font-semibold">Informational</th>
                      <th className="px-4 py-3 font-semibold">Attendance %</th>
                      <th className="px-4 py-3 font-semibold">Custom statuses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredStudents.map((row) => (
                      <tr key={row.studentId}>
                        <td className="px-4 py-3"><p className="font-medium text-slate-950">{getStudentName(row.student)}</p><p className="text-xs text-slate-500">@{row.student.username}</p></td>
                        <td className="px-4 py-3">{row.presentCount}</td>
                        <td className="px-4 py-3">{row.lateCount}</td>
                        <td className="px-4 py-3">{row.absentCount}</td>
                        <td className="px-4 py-3">{row.informationalCount}</td>
                        <td className="px-4 py-3">{formatRate(row.attendancePercentage)}</td>
                        <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{row.customStatusCounts.length ? row.customStatusCounts.map((status) => <Badge key={status.id} variant="neutral">{status.label}: {status.count}{status.isActive ? "" : " (inactive)"}</Badge>) : "—"}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredStudents.length === 0 ? <p className="text-sm text-slate-500">No students match this search.</p> : null}
            </CardContent>
          </Card>
        </>
      ) : selectedClassId && !isLoadingSummary && !error ? (
        <EmptyState title="No attendance records" description="No attendance records exist for the selected scope." />
      ) : null}
    </div>
  );
}
