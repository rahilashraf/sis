"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { formatRoleLabel } from "@/lib/utils";
import {
  assignTeacher,
  enrollStudent,
  getClassById,
  removeStudent,
  removeTeacher,
  updateTeacherAssignment,
  updateClass,
  type SchoolClass,
  type TeacherAssignment,
  type TeacherAssignmentType,
} from "@/lib/api/classes";
import { listUsers, type ManagedUser } from "@/lib/api/users";

const adminManageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);
const teacherRoles = new Set(["TEACHER", "SUPPLY_TEACHER"]);
const studentRoles = new Set(["STUDENT"]);

type ClassEditFormState = {
  name: string;
  subject: string;
  isHomeroom: boolean;
  isActive: boolean;
};

function buildEditForm(schoolClass: SchoolClass): ClassEditFormState {
  return {
    name: schoolClass.name,
    subject: schoolClass.subject ?? "",
    isHomeroom: schoolClass.isHomeroom,
    isActive: schoolClass.isActive,
  };
}

type TeacherAssignmentDraft = {
  assignmentType: TeacherAssignmentType;
  startsAt: string;
  endsAt: string;
};

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function toIsoOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Assignment dates must be valid.");
  }

  return parsed.toISOString();
}

function mapAssignmentToDraft(assignment: TeacherAssignment): TeacherAssignmentDraft {
  return {
    assignmentType: assignment.assignmentType,
    startsAt: toDateTimeLocal(assignment.startsAt),
    endsAt: toDateTimeLocal(assignment.endsAt),
  };
}

export function ClassDetail({ classId }: { classId: string }) {
  const { session } = useAuth();
  const [schoolClass, setSchoolClass] = useState<SchoolClass | null>(null);
  const [teachers, setTeachers] = useState<ManagedUser[]>([]);
  const [students, setStudents] = useState<ManagedUser[]>([]);
  const [editForm, setEditForm] = useState<ClassEditFormState | null>(null);
  const [teacherId, setTeacherId] = useState("");
  const [teacherAssignmentType, setTeacherAssignmentType] =
    useState<TeacherAssignmentType>("REGULAR");
  const [teacherAssignmentStartsAt, setTeacherAssignmentStartsAt] = useState("");
  const [teacherAssignmentEndsAt, setTeacherAssignmentEndsAt] = useState("");
  const [assignmentDraftByTeacherId, setAssignmentDraftByTeacherId] = useState<
    Record<string, TeacherAssignmentDraft>
  >({});
  const [studentId, setStudentId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canManageClasses = session?.user.role
    ? adminManageRoles.has(session.user.role)
    : false;

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const classResponse = await getClassById(classId);
        setSchoolClass(classResponse);
        setEditForm(buildEditForm(classResponse));
        setAssignmentDraftByTeacherId(
          Object.fromEntries(
            classResponse.teachers.map((assignment) => [
              assignment.teacherId,
              mapAssignmentToDraft(assignment),
            ]),
          ),
        );

        if (canManageClasses) {
          const userResponse = await listUsers();
          const classTeachers = userResponse.filter(
            (user) =>
              teacherRoles.has(user.role) &&
              user.memberships.some(
                (membership) => membership.schoolId === classResponse.schoolId,
              ),
          );
          const classStudents = userResponse.filter(
            (user) =>
              studentRoles.has(user.role) &&
              user.memberships.some(
                (membership) => membership.schoolId === classResponse.schoolId,
              ),
          );

          setTeachers(classTeachers);
          setStudents(classStudents);
          setTeacherId(classTeachers[0]?.id ?? "");
          setStudentId(classStudents[0]?.id ?? "");
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load class details.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [canManageClasses, classId]);

  const availableTeachers = useMemo(() => {
    if (!schoolClass) {
      return [];
    }

    const assignedTeacherIds = new Set(
      schoolClass.teachers.map((assignment) => assignment.teacherId),
    );

    return teachers.filter((teacher) => !assignedTeacherIds.has(teacher.id));
  }, [schoolClass, teachers]);

  const selectedTeacher = useMemo(
    () => availableTeachers.find((teacher) => teacher.id === teacherId) ?? null,
    [availableTeachers, teacherId],
  );

  useEffect(() => {
    if (!selectedTeacher) {
      return;
    }

    setTeacherAssignmentType(selectedTeacher.role === "SUPPLY_TEACHER" ? "SUPPLY" : "REGULAR");
    if (selectedTeacher.role !== "SUPPLY_TEACHER") {
      setTeacherAssignmentStartsAt("");
      setTeacherAssignmentEndsAt("");
    }
  }, [selectedTeacher]);

  const availableStudents = useMemo(() => {
    if (!schoolClass) {
      return [];
    }

    const enrolledStudentIds = new Set(
      (schoolClass.students ?? []).map((enrollment) => enrollment.studentId),
    );

    return students.filter((student) => !enrolledStudentIds.has(student.id));
  }, [schoolClass, students]);

  async function refreshClass() {
    const classResponse = await getClassById(classId);
    setSchoolClass(classResponse);
    setEditForm(buildEditForm(classResponse));
    setAssignmentDraftByTeacherId(
      Object.fromEntries(
        classResponse.teachers.map((assignment) => [
          assignment.teacherId,
          mapAssignmentToDraft(assignment),
        ]),
      ),
    );
  }

  async function handleSaveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editForm || !canManageClasses) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await updateClass(classId, {
        name: editForm.name.trim(),
        subject: editForm.subject.trim() || undefined,
        isHomeroom: editForm.isHomeroom,
        isActive: editForm.isActive,
      });

      await refreshClass();
      setSuccessMessage("Class updated successfully.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to update class.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAssignTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!teacherId || !canManageClasses) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const assignmentType =
        selectedTeacher?.role === "SUPPLY_TEACHER" ? "SUPPLY" : teacherAssignmentType;
      const startsAt =
        assignmentType === "SUPPLY" ? toIsoOrNull(teacherAssignmentStartsAt) : null;
      const endsAt = assignmentType === "SUPPLY" ? toIsoOrNull(teacherAssignmentEndsAt) : null;

      await assignTeacher(classId, {
        teacherId,
        assignmentType,
        startsAt,
        endsAt,
      });
      await refreshClass();
      setTeacherId(availableTeachers.find((teacher) => teacher.id !== teacherId)?.id ?? "");
      setTeacherAssignmentType("REGULAR");
      setTeacherAssignmentStartsAt("");
      setTeacherAssignmentEndsAt("");
      setSuccessMessage("Teacher assigned successfully.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to assign teacher.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveTeacher(teacherToRemoveId: string) {
    if (!canManageClasses) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await removeTeacher(classId, teacherToRemoveId);
      await refreshClass();
      setSuccessMessage("Teacher removed successfully.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to remove teacher.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveTeacherAssignment(assignment: TeacherAssignment) {
    if (!canManageClasses) {
      return;
    }

    const draft = assignmentDraftByTeacherId[assignment.teacherId];
    if (!draft) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await updateTeacherAssignment(classId, assignment.teacherId, {
        assignmentType: draft.assignmentType,
        startsAt: draft.assignmentType === "SUPPLY" ? toIsoOrNull(draft.startsAt) : null,
        endsAt: draft.assignmentType === "SUPPLY" ? toIsoOrNull(draft.endsAt) : null,
      });
      await refreshClass();
      setSuccessMessage("Teacher assignment updated.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to update teacher assignment.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEndTeacherAssignment(assignment: TeacherAssignment) {
    if (!canManageClasses) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await updateTeacherAssignment(classId, assignment.teacherId, {
        assignmentType: "SUPPLY",
        startsAt: assignment.startsAt,
        endsAt: new Date().toISOString(),
      });
      await refreshClass();
      setSuccessMessage("Supply assignment ended.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to end teacher assignment.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEnrollStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!studentId || !canManageClasses) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await enrollStudent(classId, studentId);
      await refreshClass();
      setStudentId(availableStudents.find((student) => student.id !== studentId)?.id ?? "");
      setSuccessMessage("Student added to class successfully.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to add student.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveStudent(studentToRemoveId: string) {
    if (!canManageClasses) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await removeStudent(classId, studentToRemoveId);
      await refreshClass();
      setSuccessMessage("Student removed successfully.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to remove student.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/admin/classes"
          >
            Back to classes
          </Link>
        }
        description={
          schoolClass
            ? "Review class details, staffing, and enrollment without leaving the current school-year context."
            : "Review class details, staffing, and enrollment."
        }
        meta={
          schoolClass ? (
            <>
              <Badge variant={schoolClass.isActive ? "success" : "neutral"}>
                {schoolClass.isActive ? "Active" : "Inactive"}
              </Badge>
              {schoolClass.isHomeroom ? (
                <Badge variant="warning">Homeroom</Badge>
              ) : null}
              <Badge variant="neutral">
                {schoolClass.students?.length ?? 0} students
              </Badge>
            </>
          ) : null
        }
        title={schoolClass?.name ?? "Class Detail"}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading class details...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !schoolClass ? (
        <EmptyState
          description="The class could not be loaded. It may have been removed or you may no longer have access to it."
          title="Class details unavailable"
        />
      ) : null}

      {schoolClass ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  School
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {schoolClass.school.name}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  School year
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {schoolClass.schoolYear.name}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Teachers
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {schoolClass.teachers.length}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Subject
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {schoolClass.subject || "Not specified"}
                </p>
              </CardContent>
            </Card>
          </div>

          {canManageClasses && editForm ? (
            <Card>
              <CardHeader>
                <CardTitle>Edit Class</CardTitle>
                <CardDescription>
                  Update display details and classroom status without changing enrollment history.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSaveClass}>
                  <Field htmlFor="edit-class-name" label="Class name">
                    <Input
                      id="edit-class-name"
                      onChange={(event) =>
                        setEditForm((current) =>
                          current
                            ? {
                                ...current,
                                name: event.target.value,
                              }
                            : current,
                        )
                      }
                      required
                      value={editForm.name}
                    />
                  </Field>

                  <Field htmlFor="edit-class-subject" label="Subject">
                    <Input
                      id="edit-class-subject"
                      onChange={(event) =>
                        setEditForm((current) =>
                          current
                            ? {
                                ...current,
                                subject: event.target.value,
                              }
                            : current,
                        )
                      }
                      value={editForm.subject}
                    />
                  </Field>

                  <CheckboxField
                    checked={editForm.isHomeroom}
                    description="Use this when the class should appear as a homeroom or advisory group."
                    label="Homeroom class"
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              isHomeroom: event.target.checked,
                            }
                          : current,
                      )
                    }
                  />

                  <CheckboxField
                    checked={editForm.isActive}
                    description="Inactive classes remain visible for reference but should not be used for active operations."
                    label="Class is active"
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              isActive: event.target.checked,
                            }
                          : current,
                      )
                    }
                  />

                  <div className="md:col-span-2 flex justify-end">
                    <Button disabled={isSubmitting} type="submit">
                      {isSubmitting ? "Saving..." : "Save class"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Assigned Teachers</CardTitle>
                <CardDescription>
                  Keep teaching coverage current for attendance and roster workflows.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {canManageClasses ? (
                  <form
                    className="grid gap-3 md:grid-cols-2"
                    onSubmit={handleAssignTeacher}
                  >
                    <Field htmlFor="assign-teacher-id" label="Teacher">
                      <Select
                        id="assign-teacher-id"
                        onChange={(event) => setTeacherId(event.target.value)}
                        value={teacherId}
                      >
                        <option value="">Select teacher</option>
                        {availableTeachers.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.firstName} {teacher.lastName} ({formatRoleLabel(teacher.role)})
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field htmlFor="assign-teacher-type" label="Assignment type">
                      <Select
                        disabled
                        id="assign-teacher-type"
                        value={teacherAssignmentType}
                      >
                        <option value="REGULAR">Regular teacher</option>
                        <option value="SUPPLY">Supply teacher</option>
                      </Select>
                    </Field>

                    {teacherAssignmentType === "SUPPLY" ? (
                      <>
                        <Field htmlFor="assign-teacher-starts-at" label="Starts at">
                          <Input
                            id="assign-teacher-starts-at"
                            onChange={(event) => setTeacherAssignmentStartsAt(event.target.value)}
                            type="datetime-local"
                            value={teacherAssignmentStartsAt}
                          />
                        </Field>

                        <Field htmlFor="assign-teacher-ends-at" label="Ends at">
                          <Input
                            id="assign-teacher-ends-at"
                            onChange={(event) => setTeacherAssignmentEndsAt(event.target.value)}
                            type="datetime-local"
                            value={teacherAssignmentEndsAt}
                          />
                        </Field>
                      </>
                    ) : null}

                    <div className="md:col-span-2 flex justify-end">
                      <Button disabled={isSubmitting || !teacherId} type="submit">
                        Assign teacher
                      </Button>
                    </div>
                  </form>
                ) : null}

                {canManageClasses && availableTeachers.length === 0 ? (
                  <EmptyState
                    compact
                    description="All available teachers for this school are already assigned to the class."
                    title="No additional teachers available"
                  />
                ) : null}

                <div className="space-y-3">
                  {schoolClass.teachers.map((assignment) => (
                    <div
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                      key={assignment.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {assignment.teacher.firstName} {assignment.teacher.lastName}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {formatRoleLabel(assignment.teacher.role)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            <Badge variant={assignment.assignmentType === "SUPPLY" ? "warning" : "neutral"}>
                              {assignment.assignmentType === "SUPPLY" ? "Supply assignment" : "Regular assignment"}
                            </Badge>
                            {assignment.assignmentType === "SUPPLY" ? (
                              <span>
                                {assignment.startsAt ? `Starts ${new Date(assignment.startsAt).toLocaleString()}` : "No start"} •{" "}
                                {assignment.endsAt ? `Ends ${new Date(assignment.endsAt).toLocaleString()}` : "No end"}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {canManageClasses ? (
                          <div className="flex flex-wrap gap-2">
                            {assignment.assignmentType === "SUPPLY" ? (
                              <Button
                                disabled={isSubmitting}
                                onClick={() => void handleEndTeacherAssignment(assignment)}
                                type="button"
                                variant="secondary"
                              >
                                End now
                              </Button>
                            ) : null}
                            <Button
                              disabled={isSubmitting}
                              onClick={() => handleRemoveTeacher(assignment.teacherId)}
                              type="button"
                              variant="danger"
                            >
                              Remove
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      {canManageClasses ? (
                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <Field htmlFor={`assignment-type-${assignment.id}`} label="Type">
                            <Select
                              disabled
                              id={`assignment-type-${assignment.id}`}
                              onChange={(event) =>
                                setAssignmentDraftByTeacherId((current) => ({
                                  ...current,
                                  [assignment.teacherId]: {
                                    ...(current[assignment.teacherId] ?? mapAssignmentToDraft(assignment)),
                                    assignmentType: event.target.value as TeacherAssignmentType,
                                  },
                                }))
                              }
                              value={
                                assignmentDraftByTeacherId[assignment.teacherId]?.assignmentType ??
                                assignment.assignmentType
                              }
                            >
                              <option value="REGULAR">Regular</option>
                              <option value="SUPPLY">Supply</option>
                            </Select>
                          </Field>
                          {(assignmentDraftByTeacherId[assignment.teacherId]?.assignmentType ??
                            assignment.assignmentType) === "SUPPLY" ? (
                            <>
                              <Field htmlFor={`assignment-starts-${assignment.id}`} label="Starts at">
                                <Input
                                  id={`assignment-starts-${assignment.id}`}
                                  onChange={(event) =>
                                    setAssignmentDraftByTeacherId((current) => ({
                                      ...current,
                                      [assignment.teacherId]: {
                                        ...(current[assignment.teacherId] ?? mapAssignmentToDraft(assignment)),
                                        startsAt: event.target.value,
                                      },
                                    }))
                                  }
                                  type="datetime-local"
                                  value={
                                    assignmentDraftByTeacherId[assignment.teacherId]?.startsAt ??
                                    toDateTimeLocal(assignment.startsAt)
                                  }
                                />
                              </Field>
                              <Field htmlFor={`assignment-ends-${assignment.id}`} label="Ends at">
                                <Input
                                  id={`assignment-ends-${assignment.id}`}
                                  onChange={(event) =>
                                    setAssignmentDraftByTeacherId((current) => ({
                                      ...current,
                                      [assignment.teacherId]: {
                                        ...(current[assignment.teacherId] ?? mapAssignmentToDraft(assignment)),
                                        endsAt: event.target.value,
                                      },
                                    }))
                                  }
                                  type="datetime-local"
                                  value={
                                    assignmentDraftByTeacherId[assignment.teacherId]?.endsAt ??
                                    toDateTimeLocal(assignment.endsAt)
                                  }
                                />
                              </Field>
                            </>
                          ) : (
                            <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                              Regular assignments stay active until removed.
                            </div>
                          )}
                        </div>
                      ) : null}

                      {canManageClasses ? (
                        <div className="mt-3 flex justify-end">
                          <Button
                            disabled={isSubmitting}
                            onClick={() => void handleSaveTeacherAssignment(assignment)}
                            type="button"
                            variant="secondary"
                          >
                            Save assignment
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}

                  {schoolClass.teachers.length === 0 ? (
                    <EmptyState
                      compact
                      description="Assign a teacher so this class can be used in teacher-facing workflows."
                      title="No teachers assigned"
                    />
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Student Roster</CardTitle>
                <CardDescription>
                  Review enrolled students and keep the roster aligned for attendance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {canManageClasses ? (
                  <form
                    className="flex flex-col gap-3 sm:flex-row"
                    onSubmit={handleEnrollStudent}
                  >
                    <Select
                      className="sm:max-w-sm"
                      onChange={(event) => setStudentId(event.target.value)}
                      value={studentId}
                    >
                      <option value="">Select student</option>
                      {availableStudents.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.firstName} {student.lastName} ({student.username})
                        </option>
                      ))}
                    </Select>

                    <Button disabled={isSubmitting || !studentId} type="submit">
                      Add student
                    </Button>
                  </form>
                ) : null}

                {canManageClasses && availableStudents.length === 0 ? (
                  <EmptyState
                    compact
                    description="All available students for this school are already enrolled in the class."
                    title="No additional students available"
                  />
                ) : null}

                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50/80">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-slate-700">Student</th>
                          <th className="px-4 py-3 font-semibold text-slate-700">Username</th>
                          <th className="px-4 py-3 font-semibold text-slate-700">Email</th>
                          {canManageClasses ? (
                            <th className="px-4 py-3 font-semibold text-slate-700">Action</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {(schoolClass.students ?? []).map((enrollment) => (
                          <tr className="align-top hover:bg-slate-50" key={enrollment.id}>
                            <td className="px-4 py-4 font-medium text-slate-900">
                              {enrollment.student.firstName} {enrollment.student.lastName}
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              {enrollment.student.username}
                            </td>
                            <td className="px-4 py-4 text-slate-600">
                              {enrollment.student.email ?? "No email on file"}
                            </td>
                            {canManageClasses ? (
                              <td className="px-4 py-4">
                                <Button
                                  disabled={isSubmitting}
                                  onClick={() => handleRemoveStudent(enrollment.studentId)}
                                  type="button"
                                  variant="danger"
                                >
                                  Remove
                                </Button>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                        {(schoolClass.students ?? []).length === 0 ? (
                          <tr>
                            <td
                              className="px-4 py-8"
                              colSpan={canManageClasses ? 4 : 3}
                            >
                              <EmptyState
                                compact
                                description="Enroll students to keep the class roster ready for attendance and reporting."
                                title="No students enrolled"
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
          </div>
        </>
      ) : null}
    </div>
  );
}
