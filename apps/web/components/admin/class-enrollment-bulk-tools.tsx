"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import {
  bulkEnrollStudentAcrossClasses,
  bulkEnrollStudentsIntoClass,
  listClasses,
  type BulkEnrollmentResult,
  type SchoolClass,
} from "@/lib/api/classes";
import { listUsers, type ManagedUser } from "@/lib/api/users";

const adminManageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);

function getStudentName(student: ManagedUser) {
  return `${student.firstName} ${student.lastName}`.trim() || student.username;
}

function summarizeResult(result: BulkEnrollmentResult | null) {
  if (!result) {
    return null;
  }

  return `${result.success.length} enrolled • ${result.skipped.length} skipped • ${result.failed.length} failed${result.warnings.length ? ` • ${result.warnings.length} warning(s)` : ""}`;
}

export function ClassEnrollmentBulkTools() {
  const { session } = useAuth();
  const searchParams = useSearchParams();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<ManagedUser[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedClassIdForBulk, setSelectedClassIdForBulk] = useState("");
  const [selectedStudentIdsForClass, setSelectedStudentIdsForClass] = useState<
    string[]
  >([]);

  const [classSchoolFilter, setClassSchoolFilter] = useState("");
  const [classSchoolYearFilter, setClassSchoolYearFilter] = useState("");
  const [classGradeFilter, setClassGradeFilter] = useState("");
  const [classSubjectFilter, setClassSubjectFilter] = useState("");
  const [classTeacherFilter, setClassTeacherFilter] = useState("");
  const [classSearch, setClassSearch] = useState("");

  const [studentSchoolFilter, setStudentSchoolFilter] = useState("");
  const [studentSchoolYearFilter, setStudentSchoolYearFilter] = useState("");
  const [studentGradeFilter, setStudentGradeFilter] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("active");
  const [studentEnrollmentFilter, setStudentEnrollmentFilter] = useState<
    "all" | "already" | "not"
  >("not");
  const [studentSearch, setStudentSearch] = useState("");

  const [flowAResult, setFlowAResult] = useState<BulkEnrollmentResult | null>(
    null,
  );
  const [flowBResult, setFlowBResult] = useState<BulkEnrollmentResult | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingA, setIsSubmittingA] = useState(false);
  const [isSubmittingB, setIsSubmittingB] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = session?.user.role
    ? adminManageRoles.has(session.user.role)
    : false;

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [classResponse, studentResponse] = await Promise.all([
          listClasses({ includeInactive: true }),
          listUsers({ includeInactive: true, role: "STUDENT" }),
        ]);

        setClasses(classResponse);
        setStudents(studentResponse);

        const classIdFromQuery = searchParams.get("classId") ?? "";
        const studentIdFromQuery = searchParams.get("studentId") ?? "";

        const initialClassId =
          classResponse.find((entry) => entry.id === classIdFromQuery)?.id ??
          classResponse[0]?.id ??
          "";
        const initialStudentId =
          studentResponse.find((entry) => entry.id === studentIdFromQuery)
            ?.id ??
          studentResponse[0]?.id ??
          "";

        setSelectedClassIdForBulk(initialClassId);
        setSelectedStudentId(initialStudentId);
        setStudentSchoolFilter(
          classResponse.find((entry) => entry.id === initialClassId)
            ?.schoolId ?? "",
        );
        setStudentSchoolYearFilter(
          classResponse.find((entry) => entry.id === initialClassId)
            ?.schoolYearId ?? "",
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load bulk enrollment tools.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [searchParams]);

  const classTeacherOptions = useMemo(() => {
    const entries = new Map<string, string>();
    for (const schoolClass of classes) {
      for (const assignment of schoolClass.teachers) {
        entries.set(
          assignment.teacherId,
          `${assignment.teacher.firstName} ${assignment.teacher.lastName}`.trim(),
        );
      }
    }
    return Array.from(entries.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);

  const classSchoolOptions = useMemo(() => {
    const entries = new Map<string, string>();
    for (const schoolClass of classes) {
      entries.set(schoolClass.schoolId, schoolClass.school.name);
    }
    return Array.from(entries.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);

  const classSchoolYearOptions = useMemo(() => {
    const entries = new Map<string, string>();
    for (const schoolClass of classes) {
      if (classSchoolFilter && schoolClass.schoolId !== classSchoolFilter) {
        continue;
      }
      entries.set(schoolClass.schoolYearId, schoolClass.schoolYear.name);
    }
    return Array.from(entries.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classSchoolFilter, classes]);

  const classGradeOptions = useMemo(() => {
    const entries = new Map<string, string>();
    for (const schoolClass of classes) {
      if (!schoolClass.gradeLevelId || !schoolClass.gradeLevel?.name) {
        continue;
      }
      if (classSchoolFilter && schoolClass.schoolId !== classSchoolFilter) {
        continue;
      }
      entries.set(schoolClass.gradeLevelId, schoolClass.gradeLevel.name);
    }
    return Array.from(entries.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classSchoolFilter, classes]);

  const classSubjectOptions = useMemo(() => {
    const entries = new Map<string, string>();
    for (const schoolClass of classes) {
      if (!schoolClass.subjectOptionId) {
        continue;
      }
      const name =
        schoolClass.subjectOption?.name ?? schoolClass.subject ?? "Unknown";
      entries.set(schoolClass.subjectOptionId, name);
    }
    return Array.from(entries.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);

  const filteredClassesForFlowA = useMemo(() => {
    const query = classSearch.trim().toLowerCase();

    return classes.filter((schoolClass) => {
      if (!schoolClass.isActive) {
        return false;
      }
      if (classSchoolFilter && schoolClass.schoolId !== classSchoolFilter) {
        return false;
      }
      if (
        classSchoolYearFilter &&
        schoolClass.schoolYearId !== classSchoolYearFilter
      ) {
        return false;
      }
      if (classGradeFilter && schoolClass.gradeLevelId !== classGradeFilter) {
        return false;
      }
      if (
        classSubjectFilter &&
        schoolClass.subjectOptionId !== classSubjectFilter
      ) {
        return false;
      }
      if (
        classTeacherFilter &&
        !schoolClass.teachers.some(
          (assignment) => assignment.teacherId === classTeacherFilter,
        )
      ) {
        return false;
      }
      if (!query) {
        return true;
      }

      const haystack = [
        schoolClass.name,
        schoolClass.subject ?? "",
        schoolClass.school.name,
        schoolClass.schoolYear.name,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [
    classGradeFilter,
    classSchoolFilter,
    classSchoolYearFilter,
    classSearch,
    classSubjectFilter,
    classTeacherFilter,
    classes,
  ]);

  const selectedClassForFlowB = useMemo(
    () => classes.find((entry) => entry.id === selectedClassIdForBulk) ?? null,
    [classes, selectedClassIdForBulk],
  );

  const classEnrollmentSet = useMemo(() => {
    if (!selectedClassForFlowB?.students) {
      return new Set<string>();
    }
    return new Set(
      selectedClassForFlowB.students.map((entry) => entry.studentId),
    );
  }, [selectedClassForFlowB]);

  const filteredStudentsForFlowB = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();

    return students.filter((student) => {
      const studentGradeLevelId =
        (student as ManagedUser & { gradeLevelId?: string | null })
          .gradeLevelId ?? null;
      const inSchool = studentSchoolFilter
        ? student.memberships.some(
            (membership) => membership.schoolId === studentSchoolFilter,
          )
        : true;
      if (!inSchool) {
        return false;
      }

      if (studentGradeFilter && studentGradeLevelId !== studentGradeFilter) {
        return false;
      }

      if (studentStatusFilter === "active" && !student.isActive) {
        return false;
      }
      if (studentStatusFilter === "inactive" && student.isActive) {
        return false;
      }

      const isAlreadyEnrolled = classEnrollmentSet.has(student.id);
      if (studentEnrollmentFilter === "already" && !isAlreadyEnrolled) {
        return false;
      }
      if (studentEnrollmentFilter === "not" && isAlreadyEnrolled) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        student.firstName,
        student.lastName,
        student.username,
        student.email ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [
    classEnrollmentSet,
    studentEnrollmentFilter,
    studentGradeFilter,
    studentSchoolFilter,
    studentSearch,
    studentStatusFilter,
    students,
  ]);

  useEffect(() => {
    if (!selectedClassForFlowB) {
      return;
    }
    setStudentSchoolFilter(
      (current) => current || selectedClassForFlowB.schoolId,
    );
    setStudentSchoolYearFilter(
      (current) => current || selectedClassForFlowB.schoolYearId,
    );
  }, [selectedClassForFlowB]);

  async function handleFlowAEnroll() {
    if (!selectedStudentId || selectedClassIds.length === 0) {
      return;
    }

    setIsSubmittingA(true);
    setError(null);
    setFlowAResult(null);

    try {
      const response = await bulkEnrollStudentAcrossClasses({
        studentId: selectedStudentId,
        classIds: selectedClassIds,
      });
      setFlowAResult(response);
      setClasses(await listClasses({ includeInactive: true }));
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to process bulk enrollment.",
      );
    } finally {
      setIsSubmittingA(false);
    }
  }

  async function handleFlowBEnroll() {
    if (!selectedClassIdForBulk || selectedStudentIdsForClass.length === 0) {
      return;
    }

    setIsSubmittingB(true);
    setError(null);
    setFlowBResult(null);

    try {
      const response = await bulkEnrollStudentsIntoClass(
        selectedClassIdForBulk,
        {
          studentIds: selectedStudentIdsForClass,
        },
      );
      setFlowBResult(response);
      setClasses(await listClasses({ includeInactive: true }));
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to process bulk enrollment.",
      );
    } finally {
      setIsSubmittingB(false);
    }
  }

  if (!canManage) {
    return (
      <Notice tone="info">
        Your current role can view class rosters but cannot run bulk
        enrollments.
      </Notice>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk Enrollment Tools"
        description="Enroll one student into multiple classes or one class with multiple students in a single action."
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/admin/classes"
          >
            Back to classes
          </Link>
        }
        meta={
          <>
            <Badge variant="neutral">Flow A + Flow B</Badge>
            <Badge variant="neutral">Server-side validation enabled</Badge>
          </>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {isLoading ? (
        <Notice tone="info">Loading classes and students...</Notice>
      ) : null}

      {!isLoading ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Flow A — One student to multiple classes</CardTitle>
              <CardDescription>
                Pick a student, filter classes, then enroll to all selected
                classes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field htmlFor="flow-a-student" label="Student">
                <Select
                  id="flow-a-student"
                  value={selectedStudentId}
                  onChange={(event) => setSelectedStudentId(event.target.value)}
                >
                  <option value="">Select student</option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {getStudentName(student)} ({student.username})
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid gap-3 md:grid-cols-2">
                <Field htmlFor="flow-a-class-school" label="School">
                  <Select
                    id="flow-a-class-school"
                    value={classSchoolFilter}
                    onChange={(event) =>
                      setClassSchoolFilter(event.target.value)
                    }
                  >
                    <option value="">All schools</option>
                    {classSchoolOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="flow-a-class-year" label="School year">
                  <Select
                    id="flow-a-class-year"
                    value={classSchoolYearFilter}
                    onChange={(event) =>
                      setClassSchoolYearFilter(event.target.value)
                    }
                  >
                    <option value="">All years</option>
                    {classSchoolYearOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="flow-a-class-grade" label="Grade level">
                  <Select
                    id="flow-a-class-grade"
                    value={classGradeFilter}
                    onChange={(event) =>
                      setClassGradeFilter(event.target.value)
                    }
                  >
                    <option value="">All grade levels</option>
                    {classGradeOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="flow-a-class-subject" label="Subject">
                  <Select
                    id="flow-a-class-subject"
                    value={classSubjectFilter}
                    onChange={(event) =>
                      setClassSubjectFilter(event.target.value)
                    }
                  >
                    <option value="">All subjects</option>
                    {classSubjectOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="flow-a-class-teacher" label="Teacher">
                  <Select
                    id="flow-a-class-teacher"
                    value={classTeacherFilter}
                    onChange={(event) =>
                      setClassTeacherFilter(event.target.value)
                    }
                  >
                    <option value="">Any teacher</option>
                    {classTeacherOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="flow-a-search" label="Search classes">
                  <Input
                    id="flow-a-search"
                    value={classSearch}
                    onChange={(event) => setClassSearch(event.target.value)}
                    placeholder="Name, school, subject"
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">
                  Selectable classes ({filteredClassesForFlowA.length})
                </p>
                <p className="text-xs text-slate-600">
                  Selected: {selectedClassIds.length}
                </p>
                <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {filteredClassesForFlowA.map((entry) => (
                    <CheckboxField
                      key={entry.id}
                      checked={selectedClassIds.includes(entry.id)}
                      label={`${entry.name} • ${entry.schoolYear.name}`}
                      description={`${entry.school.name}${entry.subject ? ` • ${entry.subject}` : ""}`}
                      onChange={() =>
                        setSelectedClassIds((current) =>
                          current.includes(entry.id)
                            ? current.filter((id) => id !== entry.id)
                            : [...current, entry.id],
                        )
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  disabled={
                    isSubmittingA ||
                    !selectedStudentId ||
                    selectedClassIds.length === 0
                  }
                  type="button"
                  onClick={() => void handleFlowAEnroll()}
                >
                  {isSubmittingA
                    ? "Enrolling..."
                    : "Enroll student in selected classes"}
                </Button>
              </div>

              {flowAResult ? (
                <Notice tone="success">{summarizeResult(flowAResult)}</Notice>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Flow B — One class to multiple students</CardTitle>
              <CardDescription>
                Pick a class, filter students, then enroll all selected students
                into that class.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field htmlFor="flow-b-class" label="Class">
                <Select
                  id="flow-b-class"
                  value={selectedClassIdForBulk}
                  onChange={(event) =>
                    setSelectedClassIdForBulk(event.target.value)
                  }
                >
                  <option value="">Select class</option>
                  {classes
                    .filter((entry) => entry.isActive)
                    .map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name} • {entry.school.name} •{" "}
                        {entry.schoolYear.name}
                      </option>
                    ))}
                </Select>
              </Field>

              {selectedClassForFlowB ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Target class:{" "}
                  <span className="font-semibold">
                    {selectedClassForFlowB.name}
                  </span>{" "}
                  • {selectedClassForFlowB.school.name} •{" "}
                  {selectedClassForFlowB.schoolYear.name}
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <Field htmlFor="flow-b-student-school" label="School">
                  <Select
                    id="flow-b-student-school"
                    value={studentSchoolFilter}
                    onChange={(event) =>
                      setStudentSchoolFilter(event.target.value)
                    }
                  >
                    <option value="">All schools</option>
                    {classSchoolOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="flow-b-student-year" label="School year">
                  <Select
                    id="flow-b-student-year"
                    value={studentSchoolYearFilter}
                    onChange={(event) =>
                      setStudentSchoolYearFilter(event.target.value)
                    }
                  >
                    <option value="">All years</option>
                    {classSchoolYearOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="flow-b-student-grade" label="Grade level">
                  <Select
                    id="flow-b-student-grade"
                    value={studentGradeFilter}
                    onChange={(event) =>
                      setStudentGradeFilter(event.target.value)
                    }
                  >
                    <option value="">All grade levels</option>
                    {classGradeOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="flow-b-student-active" label="Active status">
                  <Select
                    id="flow-b-student-active"
                    value={studentStatusFilter}
                    onChange={(event) =>
                      setStudentStatusFilter(
                        event.target.value as "all" | "active" | "inactive",
                      )
                    }
                  >
                    <option value="all">Active + inactive</option>
                    <option value="active">Active only</option>
                    <option value="inactive">Inactive only</option>
                  </Select>
                </Field>
                <Field
                  htmlFor="flow-b-current-enrollments"
                  label="Current enrollments"
                >
                  <Select
                    id="flow-b-current-enrollments"
                    value={studentEnrollmentFilter}
                    onChange={(event) =>
                      setStudentEnrollmentFilter(
                        event.target.value as "all" | "already" | "not",
                      )
                    }
                  >
                    <option value="all">All students</option>
                    <option value="already">
                      Already enrolled in this class
                    </option>
                    <option value="not">Not enrolled in this class</option>
                  </Select>
                </Field>
                <Field htmlFor="flow-b-search" label="Search students">
                  <Input
                    id="flow-b-search"
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    placeholder="Name, username, email"
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">
                  Selectable students ({filteredStudentsForFlowB.length})
                </p>
                <p className="text-xs text-slate-600">
                  Selected: {selectedStudentIdsForClass.length}
                </p>
                <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {filteredStudentsForFlowB.map((student) => (
                    <CheckboxField
                      key={student.id}
                      checked={selectedStudentIdsForClass.includes(student.id)}
                      label={`${getStudentName(student)} (${student.username})`}
                      description={
                        classEnrollmentSet.has(student.id)
                          ? "Already enrolled"
                          : (student.email ?? "No email on file")
                      }
                      onChange={() =>
                        setSelectedStudentIdsForClass((current) =>
                          current.includes(student.id)
                            ? current.filter((id) => id !== student.id)
                            : [...current, student.id],
                        )
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  disabled={
                    isSubmittingB ||
                    !selectedClassIdForBulk ||
                    selectedStudentIdsForClass.length === 0
                  }
                  type="button"
                  onClick={() => void handleFlowBEnroll()}
                >
                  {isSubmittingB ? "Enrolling..." : "Enroll selected students"}
                </Button>
              </div>

              {flowBResult ? (
                <Notice tone="success">{summarizeResult(flowBResult)}</Notice>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
