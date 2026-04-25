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
import { listGradeLevels, type GradeLevel } from "@/lib/api/grade-levels";
import {
  listSchools,
  listSchoolYears,
  type School,
  type SchoolYear,
} from "@/lib/api/schools";
import {
  listEnrollmentSubjectOptions,
  type EnrollmentSubjectOption,
} from "@/lib/api/enrollment-history";
import {
  assignTeacher,
  copyGradebookSettings,
  duplicateClass,
  enrollStudent,
  getClassById,
  listClasses,
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
  gradeLevelId: string;
  subjectOptionId: string;
  isHomeroom: boolean;
  takesAttendance: boolean;
  isActive: boolean;
};

function buildEditForm(schoolClass: SchoolClass): ClassEditFormState {
  return {
    name: schoolClass.name,
    gradeLevelId: schoolClass.gradeLevelId ?? "",
    subjectOptionId: schoolClass.subjectOptionId ?? "",
    isHomeroom: schoolClass.isHomeroom,
    takesAttendance: schoolClass.takesAttendance,
    isActive: schoolClass.isActive,
  };
}

function buildDuplicateClassForm(
  schoolClass: SchoolClass,
): DuplicateClassFormState {
  return {
    targetSchoolId: schoolClass.schoolId,
    targetSchoolYearId: schoolClass.schoolYearId,
    targetGradeLevelId: schoolClass.gradeLevelId ?? "",
    targetSubjectOptionId: schoolClass.subjectOptionId ?? "",
    targetName: `${schoolClass.name} (Copy)`,
    targetTeacherId: "",
    isHomeroom: schoolClass.isHomeroom,
    takesAttendance: schoolClass.takesAttendance,
    copyAssessmentCategories: true,
  };
}

type TeacherAssignmentDraft = {
  assignmentType: TeacherAssignmentType;
  startsAt: string;
  endsAt: string;
};

type DuplicateClassFormState = {
  targetSchoolId: string;
  targetSchoolYearId: string;
  targetGradeLevelId: string;
  targetSubjectOptionId: string;
  targetName: string;
  targetTeacherId: string;
  isHomeroom: boolean;
  takesAttendance: boolean;
  copyAssessmentCategories: boolean;
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

function mapAssignmentToDraft(
  assignment: TeacherAssignment,
): TeacherAssignmentDraft {
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
  const [schools, setSchools] = useState<School[]>([]);
  const [allClasses, setAllClasses] = useState<SchoolClass[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [duplicateGradeLevels, setDuplicateGradeLevels] = useState<
    GradeLevel[]
  >([]);
  const [duplicateSchoolYears, setDuplicateSchoolYears] = useState<
    SchoolYear[]
  >([]);
  const [subjectOptions, setSubjectOptions] = useState<
    EnrollmentSubjectOption[]
  >([]);
  const [editForm, setEditForm] = useState<ClassEditFormState | null>(null);
  const [duplicateForm, setDuplicateForm] =
    useState<DuplicateClassFormState | null>(null);
  const [copyTargetClassId, setCopyTargetClassId] = useState("");
  const [copyAssessmentCategoriesEnabled, setCopyAssessmentCategoriesEnabled] =
    useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [teacherAssignmentType, setTeacherAssignmentType] =
    useState<TeacherAssignmentType>("REGULAR");
  const [teacherAssignmentStartsAt, setTeacherAssignmentStartsAt] =
    useState("");
  const [teacherAssignmentEndsAt, setTeacherAssignmentEndsAt] = useState("");
  const [assignmentDraftByTeacherId, setAssignmentDraftByTeacherId] = useState<
    Record<string, TeacherAssignmentDraft>
  >({});
  const [studentId, setStudentId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isCopyingSettings, setIsCopyingSettings] = useState(false);
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
        setDuplicateForm(buildDuplicateClassForm(classResponse));
        setAssignmentDraftByTeacherId(
          Object.fromEntries(
            classResponse.teachers.map((assignment) => [
              assignment.teacherId,
              mapAssignmentToDraft(assignment),
            ]),
          ),
        );

        if (canManageClasses) {
          const [
            userResponse,
            gradeLevelResponse,
            subjectOptionResponse,
            schoolResponse,
            classDirectoryResponse,
            schoolYearResponse,
          ] = await Promise.all([
            listUsers(),
            listGradeLevels(classResponse.schoolId, { includeInactive: false }),
            listEnrollmentSubjectOptions({ includeInactive: false }),
            listSchools(),
            listClasses({ includeInactive: true }),
            listSchoolYears(classResponse.schoolId),
          ]);
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
          setSchools(schoolResponse);
          setAllClasses(
            classDirectoryResponse.filter((entry) => entry.id !== classId),
          );
          setGradeLevels(
            gradeLevelResponse.filter((gradeLevel) => gradeLevel.isActive),
          );
          setDuplicateGradeLevels(
            gradeLevelResponse.filter((gradeLevel) => gradeLevel.isActive),
          );
          setDuplicateSchoolYears(schoolYearResponse);
          setSubjectOptions(
            subjectOptionResponse.filter((option) => option.isActive),
          );
          setTeacherId(classTeachers[0]?.id ?? "");
          setStudentId(classStudents[0]?.id ?? "");
          setCopyTargetClassId(
            classDirectoryResponse.find((entry) => entry.id !== classId)?.id ??
              "",
          );
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

    setTeacherAssignmentType(
      selectedTeacher.role === "SUPPLY_TEACHER" ? "SUPPLY" : "REGULAR",
    );
    if (selectedTeacher.role !== "SUPPLY_TEACHER") {
      setTeacherAssignmentStartsAt("");
      setTeacherAssignmentEndsAt("");
    }
  }, [selectedTeacher]);

  useEffect(() => {
    async function loadDuplicateTargetContext() {
      if (!duplicateForm?.targetSchoolId || !canManageClasses) {
        return;
      }

      try {
        const [years, levels] = await Promise.all([
          listSchoolYears(duplicateForm.targetSchoolId),
          listGradeLevels(duplicateForm.targetSchoolId, {
            includeInactive: false,
          }),
        ]);
        setDuplicateSchoolYears(years);
        setDuplicateGradeLevels(
          levels.filter((gradeLevel) => gradeLevel.isActive),
        );
        setDuplicateForm((current) => {
          if (
            !current ||
            current.targetSchoolId !== duplicateForm.targetSchoolId
          ) {
            return current;
          }

          return {
            ...current,
            targetSchoolYearId:
              years.find((entry) => entry.id === current.targetSchoolYearId)
                ?.id ??
              years.find((entry) => entry.isActive)?.id ??
              years[0]?.id ??
              "",
            targetGradeLevelId:
              levels.find((entry) => entry.id === current.targetGradeLevelId)
                ?.id ??
              levels[0]?.id ??
              "",
          };
        });
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load duplication options.",
        );
      }
    }

    void loadDuplicateTargetContext();
  }, [canManageClasses, duplicateForm?.targetSchoolId]);

  const availableStudents = useMemo(() => {
    if (!schoolClass) {
      return [];
    }

    const enrolledStudentIds = new Set(
      (schoolClass.students ?? []).map((enrollment) => enrollment.studentId),
    );

    return students.filter((student) => !enrolledStudentIds.has(student.id));
  }, [schoolClass, students]);

  const copyTargetClassOptions = useMemo(() => {
    return allClasses.filter((entry) => entry.id !== classId);
  }, [allClasses, classId]);

  const duplicateTeacherOptions = useMemo(() => {
    if (!duplicateForm?.targetSchoolId) {
      return [];
    }

    return teachers.filter((teacher) =>
      teacher.memberships.some(
        (membership) => membership.schoolId === duplicateForm.targetSchoolId,
      ),
    );
  }, [duplicateForm?.targetSchoolId, teachers]);

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
        gradeLevelId: editForm.gradeLevelId,
        subjectOptionId: editForm.subjectOptionId,
        isHomeroom: editForm.isHomeroom,
        takesAttendance: editForm.takesAttendance,
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
        selectedTeacher?.role === "SUPPLY_TEACHER"
          ? "SUPPLY"
          : teacherAssignmentType;
      const startsAt =
        assignmentType === "SUPPLY"
          ? toIsoOrNull(teacherAssignmentStartsAt)
          : null;
      const endsAt =
        assignmentType === "SUPPLY"
          ? toIsoOrNull(teacherAssignmentEndsAt)
          : null;

      await assignTeacher(classId, {
        teacherId,
        assignmentType,
        startsAt,
        endsAt,
      });
      await refreshClass();
      setTeacherId(
        availableTeachers.find((teacher) => teacher.id !== teacherId)?.id ?? "",
      );
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
        startsAt:
          draft.assignmentType === "SUPPLY"
            ? toIsoOrNull(draft.startsAt)
            : null,
        endsAt:
          draft.assignmentType === "SUPPLY" ? toIsoOrNull(draft.endsAt) : null,
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
      setStudentId(
        availableStudents.find((student) => student.id !== studentId)?.id ?? "",
      );
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

  async function handleDuplicateClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!duplicateForm || !canManageClasses) {
      return;
    }

    setIsDuplicating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await duplicateClass(classId, {
        targetSchoolId: duplicateForm.targetSchoolId,
        targetSchoolYearId: duplicateForm.targetSchoolYearId,
        targetName: duplicateForm.targetName.trim(),
        targetGradeLevelId: duplicateForm.targetGradeLevelId,
        targetSubjectOptionId: duplicateForm.targetSubjectOptionId,
        targetTeacherId: duplicateForm.targetTeacherId || undefined,
        isHomeroom: duplicateForm.isHomeroom,
        takesAttendance: duplicateForm.takesAttendance,
        copyAssessmentCategories: duplicateForm.copyAssessmentCategories,
      });

      const refreshedClasses = await listClasses({ includeInactive: true });
      setAllClasses(refreshedClasses.filter((entry) => entry.id !== classId));
      setCopyTargetClassId(response.class.id);
      setSuccessMessage(
        `Class duplicated as "${response.class.name}". Students, grades, and assessment results were not copied.`,
      );
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to duplicate class.",
      );
    } finally {
      setIsDuplicating(false);
    }
  }

  async function handleCopyGradebookSettings(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!copyTargetClassId || !canManageClasses) {
      return;
    }

    setIsCopyingSettings(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await copyGradebookSettings(classId, {
        targetClassId: copyTargetClassId,
        copyAssessmentCategories: copyAssessmentCategoriesEnabled,
      });
      setSuccessMessage(
        `Copied ${response.weightingMode} settings to target class. Students, grades, and assessments were not copied.`,
      );
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to copy gradebook settings.",
      );
    } finally {
      setIsCopyingSettings(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/admin/classes"
            >
              Back to classes
            </Link>
            <Link
              className={buttonClassName({ variant: "ghost" })}
              href={`/admin/classes/bulk-enrollment?classId=${encodeURIComponent(classId)}`}
            >
              Bulk enrollment tools
            </Link>
          </div>
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
                  Grade level
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {schoolClass.gradeLevel?.name ?? "Not specified"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Subject
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">
                  {schoolClass.subjectOption?.name ??
                    schoolClass.subject ??
                    "Not specified"}
                </p>
              </CardContent>
            </Card>
          </div>

          {canManageClasses && editForm ? (
            <Card>
              <CardHeader>
                <CardTitle>Edit Class</CardTitle>
                <CardDescription>
                  Update display details and classroom status without changing
                  enrollment history.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-4 md:grid-cols-2"
                  onSubmit={handleSaveClass}
                >
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

                  <Field htmlFor="edit-class-grade-level" label="Grade level">
                    <Select
                      id="edit-class-grade-level"
                      onChange={(event) =>
                        setEditForm((current) =>
                          current
                            ? {
                                ...current,
                                gradeLevelId: event.target.value,
                              }
                            : current,
                        )
                      }
                      value={editForm.gradeLevelId}
                    >
                      <option value="">Select grade level</option>
                      {gradeLevels.map((gradeLevel) => (
                        <option key={gradeLevel.id} value={gradeLevel.id}>
                          {gradeLevel.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field htmlFor="edit-class-subject-option" label="Subject">
                    <Select
                      id="edit-class-subject-option"
                      onChange={(event) =>
                        setEditForm((current) =>
                          current
                            ? {
                                ...current,
                                subjectOptionId: event.target.value,
                              }
                            : current,
                        )
                      }
                      value={editForm.subjectOptionId}
                    >
                      <option value="">Select subject</option>
                      {subjectOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </Select>
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
                    checked={editForm.takesAttendance}
                    description="When disabled, attendance cannot be created or updated for this class."
                    label="This class will take attendance"
                    onChange={(event) =>
                      setEditForm((current) =>
                        current
                          ? {
                              ...current,
                              takesAttendance: event.target.checked,
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
                    <Button
                      disabled={
                        isSubmitting ||
                        !editForm.gradeLevelId ||
                        !editForm.subjectOptionId
                      }
                      type="submit"
                    >
                      {isSubmitting ? "Saving..." : "Save class"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {canManageClasses && duplicateForm ? (
            <Card id="duplicate-class">
              <CardHeader>
                <CardTitle>Duplicate Class</CardTitle>
                <CardDescription>
                  Copy class structure, assigned teacher(s), weighting mode, and
                  assessment categories. Student enrollments, grades, and
                  assessment results are never copied in this flow.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-4 md:grid-cols-2"
                  onSubmit={handleDuplicateClass}
                >
                  <Field
                    htmlFor="duplicate-target-school"
                    label="Target school"
                  >
                    <Select
                      id="duplicate-target-school"
                      onChange={(event) =>
                        setDuplicateForm((current) =>
                          current
                            ? {
                                ...current,
                                targetSchoolId: event.target.value,
                                targetSchoolYearId: "",
                                targetGradeLevelId: "",
                              }
                            : current,
                        )
                      }
                      value={duplicateForm.targetSchoolId}
                    >
                      <option value="">Select school</option>
                      {schools.map((school) => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field
                    htmlFor="duplicate-target-year"
                    label="Target school year"
                  >
                    <Select
                      id="duplicate-target-year"
                      onChange={(event) =>
                        setDuplicateForm((current) =>
                          current
                            ? {
                                ...current,
                                targetSchoolYearId: event.target.value,
                              }
                            : current,
                        )
                      }
                      value={duplicateForm.targetSchoolYearId}
                    >
                      <option value="">Select school year</option>
                      {duplicateSchoolYears.map((schoolYear) => (
                        <option key={schoolYear.id} value={schoolYear.id}>
                          {schoolYear.name}
                          {schoolYear.isActive ? " (Active)" : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field htmlFor="duplicate-target-name" label="New class name">
                    <Input
                      id="duplicate-target-name"
                      onChange={(event) =>
                        setDuplicateForm((current) =>
                          current
                            ? {
                                ...current,
                                targetName: event.target.value,
                              }
                            : current,
                        )
                      }
                      value={duplicateForm.targetName}
                    />
                  </Field>

                  <Field
                    htmlFor="duplicate-target-grade-level"
                    label="Target grade level"
                  >
                    <Select
                      id="duplicate-target-grade-level"
                      onChange={(event) =>
                        setDuplicateForm((current) =>
                          current
                            ? {
                                ...current,
                                targetGradeLevelId: event.target.value,
                              }
                            : current,
                        )
                      }
                      value={duplicateForm.targetGradeLevelId}
                    >
                      <option value="">Select grade level</option>
                      {duplicateGradeLevels.map((gradeLevel) => (
                        <option key={gradeLevel.id} value={gradeLevel.id}>
                          {gradeLevel.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field
                    htmlFor="duplicate-target-subject"
                    label="Target subject"
                  >
                    <Select
                      id="duplicate-target-subject"
                      onChange={(event) =>
                        setDuplicateForm((current) =>
                          current
                            ? {
                                ...current,
                                targetSubjectOptionId: event.target.value,
                              }
                            : current,
                        )
                      }
                      value={duplicateForm.targetSubjectOptionId}
                    >
                      <option value="">Select subject</option>
                      {subjectOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field
                    htmlFor="duplicate-target-teacher"
                    label="Override teacher (optional)"
                  >
                    <Select
                      id="duplicate-target-teacher"
                      onChange={(event) =>
                        setDuplicateForm((current) =>
                          current
                            ? {
                                ...current,
                                targetTeacherId: event.target.value,
                              }
                            : current,
                        )
                      }
                      value={duplicateForm.targetTeacherId}
                    >
                      <option value="">Copy source teacher assignments</option>
                      {duplicateTeacherOptions.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.firstName} {teacher.lastName} (
                          {formatRoleLabel(teacher.role)})
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <CheckboxField
                    checked={duplicateForm.isHomeroom}
                    className="md:col-span-2"
                    description="Keep the duplicated class as homeroom if enabled."
                    label="Homeroom class"
                    onChange={(event) =>
                      setDuplicateForm((current) =>
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
                    checked={duplicateForm.takesAttendance}
                    className="md:col-span-2"
                    description="Controls whether attendance is enabled on the duplicated class."
                    label="This class will take attendance"
                    onChange={(event) =>
                      setDuplicateForm((current) =>
                        current
                          ? {
                              ...current,
                              takesAttendance: event.target.checked,
                            }
                          : current,
                      )
                    }
                  />

                  <CheckboxField
                    checked={duplicateForm.copyAssessmentCategories}
                    className="md:col-span-2"
                    description="Copies category names and weights only. No assessments or results are copied."
                    label="Copy assessment categories"
                    onChange={(event) =>
                      setDuplicateForm((current) =>
                        current
                          ? {
                              ...current,
                              copyAssessmentCategories: event.target.checked,
                            }
                          : current,
                      )
                    }
                  />

                  <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    This duplication does not copy student enrollments, grade
                    records, assessment results, or overrides.
                  </div>

                  <div className="md:col-span-2 flex justify-end">
                    <Button
                      disabled={
                        isDuplicating ||
                        !duplicateForm.targetSchoolId ||
                        !duplicateForm.targetSchoolYearId ||
                        !duplicateForm.targetGradeLevelId ||
                        !duplicateForm.targetSubjectOptionId ||
                        !duplicateForm.targetName.trim()
                      }
                      type="submit"
                    >
                      {isDuplicating ? "Duplicating..." : "Duplicate class"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {canManageClasses ? (
            <Card>
              <CardHeader>
                <CardTitle>Copy Gradebook Settings / Weighting</CardTitle>
                <CardDescription>
                  Copy weighting mode and optionally category weights into
                  another class. Assessments, enrollments, and grades stay
                  untouched.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-4 md:grid-cols-2"
                  onSubmit={handleCopyGradebookSettings}
                >
                  <Field
                    htmlFor="copy-settings-target-class"
                    label="Target class"
                  >
                    <Select
                      id="copy-settings-target-class"
                      onChange={(event) =>
                        setCopyTargetClassId(event.target.value)
                      }
                      value={copyTargetClassId}
                    >
                      <option value="">Select target class</option>
                      {copyTargetClassOptions.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name} — {entry.school.name} (
                          {entry.schoolYear.name})
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <CheckboxField
                    checked={copyAssessmentCategoriesEnabled}
                    className="md:pt-7"
                    description="Category names and weights are merged by name on the target class."
                    label="Copy assessment categories"
                    onChange={(event) =>
                      setCopyAssessmentCategoriesEnabled(event.target.checked)
                    }
                  />

                  <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    This action does not copy assessments, student enrollments,
                    grades, or results.
                  </div>

                  <div className="md:col-span-2 flex justify-end">
                    <Button
                      disabled={isCopyingSettings || !copyTargetClassId}
                      type="submit"
                    >
                      {isCopyingSettings ? "Copying..." : "Copy settings"}
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
                  Keep teaching coverage current for attendance and roster
                  workflows.
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
                            {teacher.firstName} {teacher.lastName} (
                            {formatRoleLabel(teacher.role)})
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field
                      htmlFor="assign-teacher-type"
                      label="Assignment type"
                    >
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
                        <Field
                          htmlFor="assign-teacher-starts-at"
                          label="Starts at"
                        >
                          <Input
                            id="assign-teacher-starts-at"
                            onChange={(event) =>
                              setTeacherAssignmentStartsAt(event.target.value)
                            }
                            type="datetime-local"
                            value={teacherAssignmentStartsAt}
                          />
                        </Field>

                        <Field htmlFor="assign-teacher-ends-at" label="Ends at">
                          <Input
                            id="assign-teacher-ends-at"
                            onChange={(event) =>
                              setTeacherAssignmentEndsAt(event.target.value)
                            }
                            type="datetime-local"
                            value={teacherAssignmentEndsAt}
                          />
                        </Field>
                      </>
                    ) : null}

                    <div className="md:col-span-2 flex justify-end">
                      <Button
                        disabled={isSubmitting || !teacherId}
                        type="submit"
                      >
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
                            {assignment.teacher.firstName}{" "}
                            {assignment.teacher.lastName}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {formatRoleLabel(assignment.teacher.role)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            <Badge
                              variant={
                                assignment.assignmentType === "SUPPLY"
                                  ? "warning"
                                  : "neutral"
                              }
                            >
                              {assignment.assignmentType === "SUPPLY"
                                ? "Supply assignment"
                                : "Regular assignment"}
                            </Badge>
                            {assignment.assignmentType === "SUPPLY" ? (
                              <span>
                                {assignment.startsAt
                                  ? `Starts ${new Date(assignment.startsAt).toLocaleString()}`
                                  : "No start"}{" "}
                                •{" "}
                                {assignment.endsAt
                                  ? `Ends ${new Date(assignment.endsAt).toLocaleString()}`
                                  : "No end"}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {canManageClasses ? (
                          <div className="flex flex-wrap gap-2">
                            {assignment.assignmentType === "SUPPLY" ? (
                              <Button
                                disabled={isSubmitting}
                                onClick={() =>
                                  void handleEndTeacherAssignment(assignment)
                                }
                                type="button"
                                variant="secondary"
                              >
                                End now
                              </Button>
                            ) : null}
                            <Button
                              disabled={isSubmitting}
                              onClick={() =>
                                handleRemoveTeacher(assignment.teacherId)
                              }
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
                          <Field
                            htmlFor={`assignment-type-${assignment.id}`}
                            label="Type"
                          >
                            <Select
                              disabled
                              id={`assignment-type-${assignment.id}`}
                              onChange={(event) =>
                                setAssignmentDraftByTeacherId((current) => ({
                                  ...current,
                                  [assignment.teacherId]: {
                                    ...(current[assignment.teacherId] ??
                                      mapAssignmentToDraft(assignment)),
                                    assignmentType: event.target
                                      .value as TeacherAssignmentType,
                                  },
                                }))
                              }
                              value={
                                assignmentDraftByTeacherId[assignment.teacherId]
                                  ?.assignmentType ?? assignment.assignmentType
                              }
                            >
                              <option value="REGULAR">Regular</option>
                              <option value="SUPPLY">Supply</option>
                            </Select>
                          </Field>
                          {(assignmentDraftByTeacherId[assignment.teacherId]
                            ?.assignmentType ?? assignment.assignmentType) ===
                          "SUPPLY" ? (
                            <>
                              <Field
                                htmlFor={`assignment-starts-${assignment.id}`}
                                label="Starts at"
                              >
                                <Input
                                  id={`assignment-starts-${assignment.id}`}
                                  onChange={(event) =>
                                    setAssignmentDraftByTeacherId(
                                      (current) => ({
                                        ...current,
                                        [assignment.teacherId]: {
                                          ...(current[assignment.teacherId] ??
                                            mapAssignmentToDraft(assignment)),
                                          startsAt: event.target.value,
                                        },
                                      }),
                                    )
                                  }
                                  type="datetime-local"
                                  value={
                                    assignmentDraftByTeacherId[
                                      assignment.teacherId
                                    ]?.startsAt ??
                                    toDateTimeLocal(assignment.startsAt)
                                  }
                                />
                              </Field>
                              <Field
                                htmlFor={`assignment-ends-${assignment.id}`}
                                label="Ends at"
                              >
                                <Input
                                  id={`assignment-ends-${assignment.id}`}
                                  onChange={(event) =>
                                    setAssignmentDraftByTeacherId(
                                      (current) => ({
                                        ...current,
                                        [assignment.teacherId]: {
                                          ...(current[assignment.teacherId] ??
                                            mapAssignmentToDraft(assignment)),
                                          endsAt: event.target.value,
                                        },
                                      }),
                                    )
                                  }
                                  type="datetime-local"
                                  value={
                                    assignmentDraftByTeacherId[
                                      assignment.teacherId
                                    ]?.endsAt ??
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
                            onClick={() =>
                              void handleSaveTeacherAssignment(assignment)
                            }
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
                  Review enrolled students and keep the roster aligned for
                  attendance.
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
                          {student.firstName} {student.lastName} (
                          {student.username})
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
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Student
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Username
                          </th>
                          <th className="px-4 py-3 font-semibold text-slate-700">
                            Email
                          </th>
                          {canManageClasses ? (
                            <th className="px-4 py-3 font-semibold text-slate-700">
                              Action
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {(schoolClass.students ?? []).map((enrollment) => (
                          <tr
                            className="align-top hover:bg-slate-50"
                            key={enrollment.id}
                          >
                            <td className="px-4 py-4 font-medium text-slate-900">
                              {enrollment.student.firstName}{" "}
                              {enrollment.student.lastName}
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
                                  onClick={() =>
                                    handleRemoveStudent(enrollment.studentId)
                                  }
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
