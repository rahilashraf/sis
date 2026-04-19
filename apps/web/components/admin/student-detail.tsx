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
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth/auth-context";
import {
  listGradeLevels,
  type GradeLevel,
} from "@/lib/api/grade-levels";
import {
  createStudentParentLink,
  deleteStudentParentLink,
  getStudentById,
  listStudentParents,
  updateStudent,
  type StudentParentLink,
  type StudentProfile,
  type UpdateStudentInput,
} from "@/lib/api/students";
import { listUsers, type ManagedUser } from "@/lib/api/users";
import { StudentProfileOverview } from "@/components/students/student-profile-overview";
import { StudentDocumentsPanel } from "@/components/admin/student-documents-panel";
import { EnrollmentHistoryPanel } from "@/components/admin/enrollment-history-panel";
import { BehaviorRecordsPanel } from "@/components/admin/behavior-records-panel";
import { normalizeDateOnlyPayload } from "@/lib/date";
import { formatDateTimeLabel, getDisplayText } from "@/lib/utils";

type StudentProfileFormState = {
  gradeLevelId: string;
  studentNumber: string;
  oen: string;
  dateOfBirth: string;
  gender: string;
  studentEmail: string;
  allergies: string;
  medicalConditions: string;
  healthCardNumber: string;
  guardian1Name: string;
  guardian1Email: string;
  guardian1Phone: string;
  guardian1Address: string;
  guardian1Relationship: string;
  guardian1WorkPhone: string;
  guardian2Name: string;
  guardian2Email: string;
  guardian2Phone: string;
  guardian2Address: string;
  guardian2Relationship: string;
  guardian2WorkPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
};

function toDateInputValue(value: string | null) {
  return normalizeDateOnlyPayload(value);
}

function buildEditForm(student: StudentProfile): StudentProfileFormState {
  return {
    gradeLevelId: student.gradeLevelId ?? "",
    studentNumber: student.studentNumber ?? "",
    oen: student.oen ?? "",
    dateOfBirth: toDateInputValue(student.dateOfBirth),
    gender: student.gender ?? "",
    studentEmail: student.studentEmail ?? "",
    allergies: student.allergies ?? "",
    medicalConditions: student.medicalConditions ?? "",
    healthCardNumber: student.healthCardNumber ?? "",
    guardian1Name: student.guardian1Name ?? "",
    guardian1Email: student.guardian1Email ?? "",
    guardian1Phone: student.guardian1Phone ?? "",
    guardian1Address: student.guardian1Address ?? "",
    guardian1Relationship: student.guardian1Relationship ?? "",
    guardian1WorkPhone: student.guardian1WorkPhone ?? "",
    guardian2Name: student.guardian2Name ?? "",
    guardian2Email: student.guardian2Email ?? "",
    guardian2Phone: student.guardian2Phone ?? "",
    guardian2Address: student.guardian2Address ?? "",
    guardian2Relationship: student.guardian2Relationship ?? "",
    guardian2WorkPhone: student.guardian2WorkPhone ?? "",
    addressLine1: student.addressLine1 ?? "",
    addressLine2: student.addressLine2 ?? "",
    city: student.city ?? "",
    province: student.province ?? "",
    postalCode: student.postalCode ?? "",
    emergencyContactName: student.emergencyContactName ?? "",
    emergencyContactPhone: student.emergencyContactPhone ?? "",
    emergencyContactRelationship: student.emergencyContactRelationship ?? "",
  };
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function buildUpdatePayload(
  student: StudentProfile,
  form: StudentProfileFormState,
): UpdateStudentInput {
  const payload: UpdateStudentInput = {};

  if ((form.gradeLevelId || null) !== (student.gradeLevelId ?? null)) {
    payload.gradeLevelId = form.gradeLevelId || null;
  }

  if (normalizeText(form.studentNumber) !== (student.studentNumber ?? null)) {
    payload.studentNumber = normalizeText(form.studentNumber);
  }

  if (normalizeText(form.oen) !== (student.oen ?? null)) {
    payload.oen = normalizeText(form.oen);
  }

  if (form.dateOfBirth !== toDateInputValue(student.dateOfBirth)) {
    payload.dateOfBirth = form.dateOfBirth || null;
  }

  if (normalizeText(form.gender) !== (student.gender ?? null)) {
    payload.gender =
      normalizeText(form.gender) === null
        ? null
        : form.gender === "MALE" || form.gender === "FEMALE"
          ? form.gender
          : null;
  }

  if (normalizeText(form.studentEmail) !== (student.studentEmail ?? null)) {
    payload.studentEmail = normalizeText(form.studentEmail);
  }

  if (normalizeText(form.allergies) !== (student.allergies ?? null)) {
    payload.allergies = normalizeText(form.allergies);
  }

  if (
    normalizeText(form.medicalConditions) !==
    (student.medicalConditions ?? null)
  ) {
    payload.medicalConditions = normalizeText(form.medicalConditions);
  }

  if (
    normalizeText(form.healthCardNumber) !==
    (student.healthCardNumber ?? null)
  ) {
    payload.healthCardNumber = normalizeText(form.healthCardNumber);
  }

  if (normalizeText(form.guardian1Name) !== (student.guardian1Name ?? null)) {
    payload.guardian1Name = normalizeText(form.guardian1Name);
  }

  if (normalizeText(form.guardian1Email) !== (student.guardian1Email ?? null)) {
    payload.guardian1Email = normalizeText(form.guardian1Email);
  }

  if (normalizeText(form.guardian1Phone) !== (student.guardian1Phone ?? null)) {
    payload.guardian1Phone = normalizeText(form.guardian1Phone);
  }

  if (
    normalizeText(form.guardian1Address) !==
    (student.guardian1Address ?? null)
  ) {
    payload.guardian1Address = normalizeText(form.guardian1Address);
  }

  if (
    normalizeText(form.guardian1Relationship) !==
    (student.guardian1Relationship ?? null)
  ) {
    payload.guardian1Relationship = normalizeText(form.guardian1Relationship);
  }

  if (
    normalizeText(form.guardian1WorkPhone) !==
    (student.guardian1WorkPhone ?? null)
  ) {
    payload.guardian1WorkPhone = normalizeText(form.guardian1WorkPhone);
  }

  if (normalizeText(form.guardian2Name) !== (student.guardian2Name ?? null)) {
    payload.guardian2Name = normalizeText(form.guardian2Name);
  }

  if (normalizeText(form.guardian2Email) !== (student.guardian2Email ?? null)) {
    payload.guardian2Email = normalizeText(form.guardian2Email);
  }

  if (normalizeText(form.guardian2Phone) !== (student.guardian2Phone ?? null)) {
    payload.guardian2Phone = normalizeText(form.guardian2Phone);
  }

  if (
    normalizeText(form.guardian2Address) !==
    (student.guardian2Address ?? null)
  ) {
    payload.guardian2Address = normalizeText(form.guardian2Address);
  }

  if (
    normalizeText(form.guardian2Relationship) !==
    (student.guardian2Relationship ?? null)
  ) {
    payload.guardian2Relationship = normalizeText(form.guardian2Relationship);
  }

  if (
    normalizeText(form.guardian2WorkPhone) !==
    (student.guardian2WorkPhone ?? null)
  ) {
    payload.guardian2WorkPhone = normalizeText(form.guardian2WorkPhone);
  }

  if (normalizeText(form.addressLine1) !== (student.addressLine1 ?? null)) {
    payload.addressLine1 = normalizeText(form.addressLine1);
  }

  if (normalizeText(form.addressLine2) !== (student.addressLine2 ?? null)) {
    payload.addressLine2 = normalizeText(form.addressLine2);
  }

  if (normalizeText(form.city) !== (student.city ?? null)) {
    payload.city = normalizeText(form.city);
  }

  if (normalizeText(form.province) !== (student.province ?? null)) {
    payload.province = normalizeText(form.province);
  }

  if (normalizeText(form.postalCode) !== (student.postalCode ?? null)) {
    payload.postalCode = normalizeText(form.postalCode);
  }

  if (
    normalizeText(form.emergencyContactName) !==
    (student.emergencyContactName ?? null)
  ) {
    payload.emergencyContactName = normalizeText(form.emergencyContactName);
  }

  if (
    normalizeText(form.emergencyContactPhone) !==
    (student.emergencyContactPhone ?? null)
  ) {
    payload.emergencyContactPhone = normalizeText(form.emergencyContactPhone);
  }

  if (
    normalizeText(form.emergencyContactRelationship) !==
    (student.emergencyContactRelationship ?? null)
  ) {
    payload.emergencyContactRelationship = normalizeText(form.emergencyContactRelationship);
  }

  return payload;
}

export function StudentDetail({ studentId }: { studentId: string }) {
  const { session } = useAuth();
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [parents, setParents] = useState<StudentParentLink[]>([]);
  const [parentUsers, setParentUsers] = useState<ManagedUser[]>([]);
  const [form, setForm] = useState<StudentProfileFormState | null>(null);
  const [parentSearch, setParentSearch] = useState("");
  const [selectedParentId, setSelectedParentId] = useState("");
  const [unlinkTarget, setUnlinkTarget] = useState<StudentParentLink | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingParents, setIsLoadingParents] = useState(false);
  const [isLoadingGradeLevels, setIsLoadingGradeLevels] = useState(false);
  const [isLoadingParentDirectory, setIsLoadingParentDirectory] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isLinkingParent, setIsLinkingParent] = useState(false);
  const [isUnlinkingParent, setIsUnlinkingParent] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [parentSectionError, setParentSectionError] = useState<string | null>(null);
  const [gradeLevelsError, setGradeLevelsError] = useState<string | null>(null);
  const [parentDirectoryError, setParentDirectoryError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const canManageStudent =
    session?.user.role === "OWNER" ||
    session?.user.role === "SUPER_ADMIN" ||
    session?.user.role === "ADMIN";
  const canViewBehavior =
    session?.user.role === "OWNER" ||
    session?.user.role === "SUPER_ADMIN" ||
    session?.user.role === "ADMIN" ||
    session?.user.role === "STAFF" ||
    session?.user.role === "TEACHER" ||
    session?.user.role === "SUPPLY_TEACHER";
  const canManageDocuments =
    session?.user.role === "OWNER" ||
    session?.user.role === "SUPER_ADMIN" ||
    session?.user.role === "ADMIN" ||
    session?.user.role === "STAFF" ||
    session?.user.role === "TEACHER";

  function updateFormValue(field: keyof StudentProfileFormState, value: string) {
    setForm((current) =>
      current
        ? {
            ...current,
            [field]: value,
          }
        : current,
    );
  }

  const availableParents = useMemo(() => {
    if (!student) {
      return [];
    }

    const studentSchoolIds = new Set(
      student.memberships.map((membership) => membership.schoolId),
    );
    const linkedParentIds = new Set(parents.map((link) => link.parentId));
    const searchTerm = parentSearch.trim().toLowerCase();

    return parentUsers.filter((user) => {
      if (user.role !== "PARENT" || linkedParentIds.has(user.id)) {
        return false;
      }

      const sharesSchool = user.memberships.some((membership) =>
        studentSchoolIds.has(membership.schoolId),
      );

      if (!sharesSchool) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      const haystack = [
        user.firstName,
        user.lastName,
        user.email ?? "",
        user.username,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(searchTerm);
    });
  }, [parentSearch, parentUsers, parents, student]);

  const availableGradeLevels = useMemo(() => {
    if (!student) {
      return [];
    }

    return gradeLevels.filter(
      (gradeLevel) => gradeLevel.isActive || gradeLevel.id === student.gradeLevelId,
    );
  }, [gradeLevels, student]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setPageError(null);
      setProfileError(null);
      setParentSectionError(null);
      setGradeLevelsError(null);
      setParentDirectoryError(null);
      setStudent(null);
      setGradeLevels([]);
      setParents([]);
      setParentUsers([]);
      setForm(null);

      try {
        const studentResponse = await getStudentById(studentId);
        setStudent(studentResponse);
        setForm(buildEditForm(studentResponse));

        if (canManageStudent) {
          const studentSchoolIds = Array.from(
            new Set(
              studentResponse.memberships
                .filter((membership) => membership.isActive)
                .map((membership) => membership.schoolId),
            ),
          );

          if (studentSchoolIds.length === 1) {
            setIsLoadingGradeLevels(true);

            try {
              const gradeLevelResponse = await listGradeLevels(studentSchoolIds[0], {
                includeInactive: true,
              });
              setGradeLevels(gradeLevelResponse);
            } catch (loadError) {
              setGradeLevelsError(
                getErrorMessage(loadError, "Unable to load grade levels."),
              );
            } finally {
              setIsLoadingGradeLevels(false);
            }
          } else if (studentSchoolIds.length > 1) {
            setGradeLevelsError(
              "Grade level options require a single active school membership.",
            );
          }
        }
      } catch (loadError) {
        setPageError(getErrorMessage(loadError, "Unable to load student details."));
        return;
      } finally {
        setIsLoading(false);
      }

      setIsLoadingParents(true);

      try {
        const parentResponse = await listStudentParents(studentId);
        setParents(parentResponse);
      } catch (loadError) {
        setParentSectionError(
          getErrorMessage(loadError, "Unable to load linked parents."),
        );
      } finally {
        setIsLoadingParents(false);
      }

      if (!canManageStudent) {
        setParentUsers([]);
        return;
      }

      setIsLoadingParentDirectory(true);

      try {
        const userResponse = await listUsers();
        setParentUsers(userResponse);
      } catch (loadError) {
        setParentDirectoryError(
          getErrorMessage(loadError, "Unable to load parent accounts."),
        );
      } finally {
        setIsLoadingParentDirectory(false);
      }
    }

    void load();
  }, [canManageStudent, studentId]);

  useEffect(() => {
    if (availableParents.length === 0) {
      setSelectedParentId("");
      return;
    }

    setSelectedParentId((current) =>
      availableParents.some((parent) => parent.id === current)
        ? current
        : availableParents[0]?.id ?? "",
    );
  }, [availableParents]);

  async function refreshStudent() {
    const studentResponse = await getStudentById(studentId);
    setStudent(studentResponse);
    setForm(buildEditForm(studentResponse));

    if (canManageStudent) {
      const studentSchoolIds = Array.from(
        new Set(
          studentResponse.memberships
            .filter((membership) => membership.isActive)
            .map((membership) => membership.schoolId),
        ),
      );

      if (studentSchoolIds.length === 1) {
        try {
          const gradeLevelResponse = await listGradeLevels(studentSchoolIds[0], {
            includeInactive: true,
          });
          setGradeLevels(gradeLevelResponse);
          setGradeLevelsError(null);
        } catch (loadError) {
          setGradeLevelsError(
            getErrorMessage(loadError, "Unable to load grade levels."),
          );
        }
      } else {
        setGradeLevels([]);
        setGradeLevelsError(
          studentSchoolIds.length > 1
            ? "Grade level options require a single active school membership."
            : null,
        );
      }
    }

    try {
      const parentResponse = await listStudentParents(studentId);
      setParents(parentResponse);
      setParentSectionError(null);
    } catch (loadError) {
      setParentSectionError(
        getErrorMessage(loadError, "Unable to load linked parents."),
      );
    }
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!student || !form) {
      return;
    }

    setIsSavingProfile(true);
    setProfileError(null);
    setSuccessMessage(null);

    try {
      const payload = buildUpdatePayload(student, form);

      if (Object.keys(payload).length === 0) {
        setSuccessMessage("No profile changes to save.");
        setIsSavingProfile(false);
        return;
      }

      const updatedStudent = await updateStudent(studentId, payload);
      setStudent(updatedStudent);
      setForm(buildEditForm(updatedStudent));
      setSuccessMessage("Student profile updated successfully.");
    } catch (submissionError) {
      setProfileError(
        getErrorMessage(submissionError, "Unable to update student profile."),
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleLinkParent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedParentId) {
      return;
    }

    setIsLinkingParent(true);
    setParentSectionError(null);
    setSuccessMessage(null);

    try {
      await createStudentParentLink(selectedParentId, studentId);
      await refreshStudent();
      setParentSearch("");
      setSelectedParentId("");
      setSuccessMessage("Parent linked successfully.");
    } catch (submissionError) {
      setParentSectionError(getErrorMessage(submissionError, "Unable to link parent."));
    } finally {
      setIsLinkingParent(false);
    }
  }

  async function handleConfirmUnlink() {
    if (!unlinkTarget) {
      return;
    }

    setIsUnlinkingParent(true);
    setUnlinkError(null);
    setParentSectionError(null);
    setSuccessMessage(null);

    try {
      await deleteStudentParentLink(unlinkTarget.id);
      await refreshStudent();
      setSuccessMessage("Parent link removed successfully.");
      setUnlinkTarget(null);
    } catch (deletionError) {
      setUnlinkError(
        deletionError instanceof Error
          ? deletionError.message
          : "Unable to remove parent link.",
      );
    } finally {
      setIsUnlinkingParent(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/admin/users"
            >
              Back to users
            </Link>
            {student ? (
              <Link
                className={buttonClassName({ variant: "ghost" })}
                href={`/admin/users#${student.id}`}
              >
                Open user directory
              </Link>
            ) : null}
          </>
        }
        description={
          student
            ? "Review profile details, update student contact information, and manage linked parents from one place."
            : "Review profile details and linked parent access for this student."
        }
        meta={
          student ? (
            <>
              <Badge variant="neutral">
                {student.memberships.length} school
                {student.memberships.length === 1 ? "" : "s"}
              </Badge>
              <Badge variant="neutral">{parents.length} linked parents</Badge>
            </>
          ) : null
        }
        title={
          student
            ? `${student.firstName} ${student.lastName}`
            : "Student Detail"
        }
      />

      {pageError ? <Notice tone="danger">{pageError}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}
      {!isLoading && !canManageStudent ? (
        <Notice tone="info">
          This view is read-only for your current role. Student profile updates and
          parent link changes remain limited to owner, super admin, and admin roles.
        </Notice>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading student details...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && !student ? (
        <EmptyState
          description="The student record could not be loaded. It may have been removed or you may no longer have access."
          title="Student details unavailable"
        />
      ) : null}

      {student ? (
        <>
          <StudentProfileOverview
            showSensitiveHealthInfo={canManageStudent}
            student={student}
          />

          <EnrollmentHistoryPanel
            canManage={canManageStudent}
            studentId={student.id}
          />

          <BehaviorRecordsPanel
            canView={canViewBehavior}
            studentId={student.id}
          />

          <StudentDocumentsPanel
            canManage={canManageDocuments}
            studentId={student.id}
          />

          <Card>
            <CardHeader>
              <CardTitle>Parent Access</CardTitle>
              <CardDescription>
                {canManageStudent
                  ? "Linked parents are listed here first, with a visible control to add or unlink parent access."
                  : "Review the parent accounts currently linked to this student."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="neutral">{parents.length} linked parents</Badge>
                    <Badge variant="neutral">
                      {availableParents.length} available to link
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    {canManageStudent
                      ? "Use this control to search parent accounts in the same school, select one, and link it to this student."
                      : "Parent linking is read-only for your current role."}
                  </p>

                  {canManageStudent ? (
                    <form
                      className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto]"
                      onSubmit={handleLinkParent}
                    >
                      <Field
                        description="Search by first name, last name, username, or email."
                        htmlFor="student-parent-search"
                        label="Find parent account"
                      >
                        <Input
                          id="student-parent-search"
                          onChange={(event) => setParentSearch(event.target.value)}
                          placeholder="Search parent accounts"
                          value={parentSearch}
                        />
                      </Field>

                      <Field
                        description="Only active parent users in the same school and not already linked are shown."
                        htmlFor="student-parent-select"
                        label="Add/link parent"
                      >
                        <Select
                          id="student-parent-select"
                          onChange={(event) => setSelectedParentId(event.target.value)}
                          value={selectedParentId}
                        >
                          <option value="">
                            {availableParents.length === 0
                              ? "No matching parents available"
                              : "Select parent account"}
                          </option>
                          {availableParents.map((parent) => (
                            <option key={parent.id} value={parent.id}>
                              {parent.firstName} {parent.lastName}
                              {parent.email
                                ? ` • ${parent.email}`
                                : ` • @${parent.username}`}
                            </option>
                          ))}
                        </Select>
                      </Field>

                      <div className="flex items-end">
                        <Button
                          disabled={
                            isLinkingParent ||
                            isLoadingParentDirectory ||
                            selectedParentId.length === 0
                          }
                          type="submit"
                        >
                          {isLinkingParent ? "Linking..." : "Link parent"}
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-900">Linked parents</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {parents.length > 0
                      ? "Unlinking is confirmed before access is removed."
                      : "No parent accounts are currently linked to this student."}
                  </p>
                  <div className="mt-4 space-y-2">
                    {parents.slice(0, 3).map((link) => (
                      <div
                        className="rounded-xl border border-slate-200 px-3 py-2"
                        key={link.id}
                      >
                        <p className="text-sm font-medium text-slate-900">
                          {link.parent.firstName} {link.parent.lastName}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {getDisplayText(link.parent.email, `@${link.parent.username}`)}
                        </p>
                      </div>
                    ))}
                    {parents.length === 0 ? (
                      <EmptyState
                        compact
                        description="Link a parent above to grant family access to this student."
                        title="No linked parents"
                      />
                    ) : null}
                  </div>
                </div>
              </div>

              {isLoadingParents ? (
                <Notice tone="info">Loading linked parents...</Notice>
              ) : null}
              {parentSectionError ? (
                <Notice tone="danger">{parentSectionError}</Notice>
              ) : null}
              {parentDirectoryError ? (
                <Notice tone="danger">{parentDirectoryError}</Notice>
              ) : null}
              {isLoadingParentDirectory ? (
                <Notice tone="info">Loading parent directory...</Notice>
              ) : null}

              {canManageStudent && !isLoadingParentDirectory && availableParents.length === 0 ? (
                <EmptyState
                  compact
                  description={
                    parentSearch.trim().length > 0
                      ? "No active parent users match the current search within the student's school access."
                      : "No additional active parent users are available to link for this student."
                  }
                  title="No parent matches"
                />
              ) : null}

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate-700">Parent</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Username</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Email</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Linked</th>
                        {canManageStudent ? (
                          <th className="px-4 py-3 font-semibold text-slate-700">Action</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {parents.map((link) => (
                        <tr className="align-top hover:bg-slate-50" key={link.id}>
                          <td className="px-4 py-4">
                            <p className="font-medium text-slate-900">
                              {link.parent.firstName} {link.parent.lastName}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">{link.parent.id}</p>
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {getDisplayText(link.parent.username)}
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {getDisplayText(link.parent.email, "No email on file")}
                          </td>
                          <td className="px-4 py-4">
                            <Badge variant={link.parent.isActive ? "success" : "neutral"}>
                              {link.parent.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {formatDateTimeLabel(link.createdAt)}
                          </td>
                          {canManageStudent ? (
                            <td className="px-4 py-4">
                              <Button
                                disabled={isUnlinkingParent}
                                onClick={() => {
                                  setUnlinkTarget(link);
                                  setUnlinkError(null);
                                  setParentSectionError(null);
                                  setSuccessMessage(null);
                                }}
                                type="button"
                                variant="danger"
                              >
                                Unlink
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                      {parents.length === 0 ? (
                        <tr>
                          <td className="px-4 py-8" colSpan={canManageStudent ? 6 : 5}>
                            <EmptyState
                              compact
                              description="No parents are currently linked to this student."
                              title="No linked parents"
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

          {canManageStudent && form ? (
            <Card>
              <CardHeader>
                <CardTitle>Edit Student Profile</CardTitle>
                <CardDescription>
                  Keep identity, health, guardian, and existing contact details current.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSaveProfile}>
                  {profileError ? (
                    <div className="md:col-span-2">
                      <Notice tone="danger">{profileError}</Notice>
                    </div>
                  ) : null}

                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold text-slate-900">Identity</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Core identifiers and student-facing account details.
                    </p>
                  </div>

                  <Field
                    description="School-issued student ID. Leading zeros and mixed formats are allowed."
                    htmlFor="student-student-number"
                    label="Student Number"
                  >
                    <Input
                      id="student-student-number"
                      onChange={(event) =>
                        updateFormValue("studentNumber", event.target.value)
                      }
                      value={form.studentNumber}
                    />
                  </Field>

                  <Field htmlFor="student-oen" label="OEN">
                    <Input
                      id="student-oen"
                      onChange={(event) => updateFormValue("oen", event.target.value)}
                      value={form.oen}
                    />
                  </Field>

                  <Field htmlFor="student-date-of-birth" label="Date of birth">
                    <Input
                      id="student-date-of-birth"
                      onChange={(event) =>
                        updateFormValue("dateOfBirth", event.target.value)
                      }
                      type="date"
                      value={form.dateOfBirth}
                    />
                  </Field>

                  <Field htmlFor="student-gender" label="Gender">
                    <Select
                      id="student-gender"
                      onChange={(event) =>
                        updateFormValue("gender", event.target.value)
                      }
                      value={form.gender}
                    >
                      <option value="">Select gender</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                    </Select>
                  </Field>

                  <Field htmlFor="student-student-email" label="Student Email">
                    <Input
                      id="student-student-email"
                      onChange={(event) =>
                        updateFormValue("studentEmail", event.target.value)
                      }
                      type="email"
                      value={form.studentEmail}
                    />
                  </Field>

                  <Field
                    description="Only active grade levels are shown unless this student is already assigned to an inactive one."
                    htmlFor="student-grade-level"
                    label="Grade Level"
                  >
                    <Select
                      disabled={isLoadingGradeLevels}
                      id="student-grade-level"
                      onChange={(event) =>
                        updateFormValue("gradeLevelId", event.target.value)
                      }
                      value={form.gradeLevelId}
                    >
                      <option value="">
                        {isLoadingGradeLevels
                          ? "Loading grade levels..."
                          : "No grade level assigned"}
                      </option>
                      {availableGradeLevels.map((gradeLevel) => (
                        <option key={gradeLevel.id} value={gradeLevel.id}>
                          {gradeLevel.name}
                          {gradeLevel.isActive ? "" : " (Inactive)"}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field htmlFor="student-name" label="Name">
                    <Input
                      disabled
                      id="student-name"
                      value={`${student.firstName} ${student.lastName}`}
                    />
                  </Field>

                  {gradeLevelsError ? (
                    <div className="md:col-span-2">
                      <Notice tone="danger">{gradeLevelsError}</Notice>
                    </div>
                  ) : null}

                  <div className="md:col-span-2 mt-2 border-t border-slate-200 pt-4">
                    <h3 className="text-sm font-semibold text-slate-900">Health Info</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Sensitive health details are limited to admin roles.
                    </p>
                  </div>

                  <Field
                    className="md:col-span-2"
                    htmlFor="student-allergies"
                    label="Allergies"
                  >
                    <Textarea
                      id="student-allergies"
                      onChange={(event) =>
                        updateFormValue("allergies", event.target.value)
                      }
                      rows={3}
                      value={form.allergies}
                    />
                  </Field>

                  <Field
                    className="md:col-span-2"
                    htmlFor="student-medical-conditions"
                    label="Medical Conditions"
                  >
                    <Textarea
                      id="student-medical-conditions"
                      onChange={(event) =>
                        updateFormValue("medicalConditions", event.target.value)
                      }
                      rows={3}
                      value={form.medicalConditions}
                    />
                  </Field>

                  <Field
                    htmlFor="student-health-card-number"
                    label="Health Card Number"
                  >
                    <Input
                      id="student-health-card-number"
                      onChange={(event) =>
                        updateFormValue("healthCardNumber", event.target.value)
                      }
                      value={form.healthCardNumber}
                    />
                  </Field>

                  <div className="md:col-span-2 mt-2 border-t border-slate-200 pt-4">
                    <h3 className="text-sm font-semibold text-slate-900">Guardian 1</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Administrative contact details stored separately from linked
                      parent portal access.
                    </p>
                  </div>

                  <Field htmlFor="student-guardian1-name" label="Name">
                    <Input
                      id="student-guardian1-name"
                      onChange={(event) =>
                        updateFormValue("guardian1Name", event.target.value)
                      }
                      value={form.guardian1Name}
                    />
                  </Field>

                  <Field htmlFor="student-guardian1-email" label="Email">
                    <Input
                      id="student-guardian1-email"
                      onChange={(event) =>
                        updateFormValue("guardian1Email", event.target.value)
                      }
                      type="email"
                      value={form.guardian1Email}
                    />
                  </Field>

                  <Field htmlFor="student-guardian1-phone" label="Phone">
                    <Input
                      id="student-guardian1-phone"
                      onChange={(event) =>
                        updateFormValue("guardian1Phone", event.target.value)
                      }
                      type="tel"
                      value={form.guardian1Phone}
                    />
                  </Field>

                  <Field htmlFor="student-guardian1-address" label="Address">
                    <Input
                      id="student-guardian1-address"
                      onChange={(event) =>
                        updateFormValue("guardian1Address", event.target.value)
                      }
                      value={form.guardian1Address}
                    />
                  </Field>

                  <Field
                    htmlFor="student-guardian1-relationship"
                    label="Relationship"
                  >
                    <Input
                      id="student-guardian1-relationship"
                      onChange={(event) =>
                        updateFormValue("guardian1Relationship", event.target.value)
                      }
                      value={form.guardian1Relationship}
                    />
                  </Field>

                  <Field htmlFor="student-guardian1-work-phone" label="Work phone">
                    <Input
                      id="student-guardian1-work-phone"
                      onChange={(event) =>
                        updateFormValue("guardian1WorkPhone", event.target.value)
                      }
                      type="tel"
                      value={form.guardian1WorkPhone}
                    />
                  </Field>

                  <div className="md:col-span-2 mt-2 border-t border-slate-200 pt-4">
                    <h3 className="text-sm font-semibold text-slate-900">Guardian 2</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Secondary administrative contact details for the student file.
                    </p>
                  </div>

                  <Field htmlFor="student-guardian2-name" label="Name">
                    <Input
                      id="student-guardian2-name"
                      onChange={(event) =>
                        updateFormValue("guardian2Name", event.target.value)
                      }
                      value={form.guardian2Name}
                    />
                  </Field>

                  <Field htmlFor="student-guardian2-email" label="Email">
                    <Input
                      id="student-guardian2-email"
                      onChange={(event) =>
                        updateFormValue("guardian2Email", event.target.value)
                      }
                      type="email"
                      value={form.guardian2Email}
                    />
                  </Field>

                  <Field htmlFor="student-guardian2-phone" label="Phone">
                    <Input
                      id="student-guardian2-phone"
                      onChange={(event) =>
                        updateFormValue("guardian2Phone", event.target.value)
                      }
                      type="tel"
                      value={form.guardian2Phone}
                    />
                  </Field>

                  <Field htmlFor="student-guardian2-address" label="Address">
                    <Input
                      id="student-guardian2-address"
                      onChange={(event) =>
                        updateFormValue("guardian2Address", event.target.value)
                      }
                      value={form.guardian2Address}
                    />
                  </Field>

                  <Field
                    htmlFor="student-guardian2-relationship"
                    label="Relationship"
                  >
                    <Input
                      id="student-guardian2-relationship"
                      onChange={(event) =>
                        updateFormValue("guardian2Relationship", event.target.value)
                      }
                      value={form.guardian2Relationship}
                    />
                  </Field>

                  <Field htmlFor="student-guardian2-work-phone" label="Work phone">
                    <Input
                      id="student-guardian2-work-phone"
                      onChange={(event) =>
                        updateFormValue("guardian2WorkPhone", event.target.value)
                      }
                      type="tel"
                      value={form.guardian2WorkPhone}
                    />
                  </Field>

                  <div className="md:col-span-2 mt-2 border-t border-slate-200 pt-4">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Additional Contact
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Existing address and emergency contact fields remain available.
                    </p>
                  </div>

                  <Field htmlFor="student-address-line-1" label="Address line 1">
                    <Input
                      id="student-address-line-1"
                      onChange={(event) =>
                        updateFormValue("addressLine1", event.target.value)
                      }
                      value={form.addressLine1}
                    />
                  </Field>

                  <Field htmlFor="student-address-line-2" label="Address line 2">
                    <Input
                      id="student-address-line-2"
                      onChange={(event) =>
                        updateFormValue("addressLine2", event.target.value)
                      }
                      value={form.addressLine2}
                    />
                  </Field>

                  <Field htmlFor="student-city" label="City">
                    <Input
                      id="student-city"
                      onChange={(event) =>
                        updateFormValue("city", event.target.value)
                      }
                      value={form.city}
                    />
                  </Field>

                  <Field htmlFor="student-province" label="Province">
                    <Input
                      id="student-province"
                      onChange={(event) =>
                        updateFormValue("province", event.target.value)
                      }
                      value={form.province}
                    />
                  </Field>

                  <Field htmlFor="student-postal-code" label="Postal code">
                    <Input
                      id="student-postal-code"
                      onChange={(event) =>
                        updateFormValue("postalCode", event.target.value)
                      }
                      value={form.postalCode}
                    />
                  </Field>

                  <Field
                    htmlFor="student-emergency-contact-name"
                    label="Emergency contact name"
                  >
                    <Input
                      id="student-emergency-contact-name"
                      onChange={(event) =>
                        updateFormValue("emergencyContactName", event.target.value)
                      }
                      value={form.emergencyContactName}
                    />
                  </Field>

                  <Field
                    htmlFor="student-emergency-contact-phone"
                    label="Emergency contact phone"
                  >
                    <Input
                      id="student-emergency-contact-phone"
                      onChange={(event) =>
                        updateFormValue("emergencyContactPhone", event.target.value)
                      }
                      value={form.emergencyContactPhone}
                    />
                  </Field>

                  <Field
                    htmlFor="student-emergency-contact-relationship"
                    label="Emergency contact relationship"
                  >
                    <Input
                      id="student-emergency-contact-relationship"
                      onChange={(event) =>
                        updateFormValue("emergencyContactRelationship", event.target.value)
                      }
                      value={form.emergencyContactRelationship}
                    />
                  </Field>

                  <div className="md:col-span-2 flex justify-end">
                    <Button disabled={isSavingProfile} type="submit">
                      {isSavingProfile ? "Saving..." : "Save profile"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        confirmLabel="Unlink parent"
        description={
          unlinkTarget
            ? `Remove the link between ${unlinkTarget.parent.firstName} ${unlinkTarget.parent.lastName} and this student? The parent will immediately lose student read access.`
            : ""
        }
        errorMessage={unlinkError}
        isOpen={unlinkTarget !== null}
        isPending={isUnlinkingParent}
        onCancel={() => {
          if (!isUnlinkingParent) {
            setUnlinkTarget(null);
            setUnlinkError(null);
          }
        }}
        onConfirm={handleConfirmUnlink}
        pendingLabel="Unlinking..."
        title="Remove parent link"
      />
    </div>
  );
}
