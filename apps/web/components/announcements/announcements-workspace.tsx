"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckboxField, Field } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
  type Announcement,
  type AnnouncementAudience,
  type AnnouncementStatusFilter,
} from "@/lib/api/announcements";
import { listClasses, listClassStudents, listMyClasses } from "@/lib/api/classes";
import { listGradeLevels } from "@/lib/api/grade-levels";
import { listUsers, type ManagedUser } from "@/lib/api/users";
import { useAuth } from "@/lib/auth/auth-context";
import { getAccessibleSchoolIds } from "@/lib/auth/school-membership";
import { formatDateTimeLabel, formatRoleLabel } from "@/lib/utils";

type AnnouncementWorkspaceMode = "admin" | "teacher" | "parent" | "student";

type TargetForm = {
  includeWholeSchool: boolean;
  gradeLevelIds: string[];
  classIds: string[];
  studentIds: string[];
};

type FormState = {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  isPinned: boolean;
  expiresAtLocal: string;
} & TargetForm;

type FilterState = {
  audience: "ALL" | AnnouncementAudience;
  classId: string;
  gradeLevelId: string;
  pinned: "ALL" | "PINNED" | "UNPINNED";
  status: AnnouncementStatusFilter;
};

const initialFormState: FormState = {
  title: "",
  body: "",
  audience: "PARENTS_AND_STUDENTS",
  isPinned: false,
  expiresAtLocal: "",
  includeWholeSchool: false,
  gradeLevelIds: [],
  classIds: [],
  studentIds: [],
};

const initialFilters: FilterState = {
  audience: "ALL",
  classId: "",
  gradeLevelId: "",
  pinned: "ALL",
  status: "ACTIVE",
};

function toLocalDateTimeInput(isoValue: string | null) {
  if (!isoValue) {
    return "";
  }

  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoOrNull(localValue: string) {
  if (!localValue.trim()) {
    return null;
  }

  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function getAudienceLabel(audience: AnnouncementAudience) {
  if (audience === "PARENTS") return "Parents";
  if (audience === "STUDENTS") return "Students";
  return "Parents + Students";
}

function summarizeRecipients(announcement: Announcement) {
  const hasSchool = announcement.targets.some(
    (target) => target.targetType === "SCHOOL",
  );
  const gradeCount = announcement.targets.filter(
    (target) => target.targetType === "GRADE_LEVEL",
  ).length;
  const classCount = announcement.targets.filter(
    (target) => target.targetType === "CLASS",
  ).length;
  const studentCount = announcement.targets.filter(
    (target) => target.targetType === "STUDENT",
  ).length;

  const parts: string[] = [];
  if (hasSchool) {
    parts.push("Whole school");
  }
  if (gradeCount > 0) {
    parts.push(`${gradeCount} grade${gradeCount === 1 ? "" : "s"}`);
  }
  if (classCount > 0) {
    parts.push(`${classCount} class${classCount === 1 ? "" : "es"}`);
  }
  if (studentCount > 0) {
    parts.push(`${studentCount} student${studentCount === 1 ? "" : "s"}`);
  }

  return parts.length > 0 ? parts.join(" + ") : "No recipients";
}

function isInSchool(user: ManagedUser, schoolId: string | null) {
  if (!schoolId) {
    return true;
  }

  return getAccessibleSchoolIds(user).includes(schoolId);
}

function toggleInList(current: string[], id: string) {
  if (current.includes(id)) {
    return current.filter((entry) => entry !== id);
  }

  return [...current, id];
}

export function AnnouncementsWorkspace({ mode }: { mode: AnnouncementWorkspaceMode }) {
  const { selectedSchoolId, session } = useAuth();
  const searchParams = useSearchParams();
  const role = session?.user.role;
  const canManage = mode === "admin" || mode === "teacher";
  const canPublishWholeSchool = mode === "admin";
  const highlightedAnnouncementId = searchParams.get("announcementId");
  const highlightedOnceRef = useRef(false);

  useEffect(() => {
    highlightedOnceRef.current = false;
  }, [highlightedAnnouncementId]);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [gradeOptions, setGradeOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [classOptions, setClassOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [studentOptions, setStudentOptions] = useState<
    Array<{ id: string; name: string; detail: string }>
  >([]);

  const [form, setForm] = useState<FormState>(initialFormState);
  const [filters, setFilters] = useState<FilterState>(initialFilters);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const pageTitle =
    mode === "admin"
      ? "Admin Announcements"
      : mode === "teacher"
        ? "Teacher Announcements"
        : mode === "parent"
          ? "Announcements"
          : "Student Announcements";

  const pageDescription =
    mode === "admin"
      ? "Create and manage school announcements for parents and students."
      : mode === "teacher"
        ? "Post announcements to your classes and assigned students."
        : mode === "parent"
          ? "Updates relevant to your linked children."
          : "Updates relevant to your classes and grade level.";

  async function loadAnnouncements() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await listAnnouncements(
        canManage
          ? {
              schoolId: mode === "admin" ? selectedSchoolId ?? undefined : undefined,
              audience:
                filters.audience === "ALL" ? undefined : filters.audience,
              classId: filters.classId || undefined,
              gradeLevelId: filters.gradeLevelId || undefined,
              pinned:
                filters.pinned === "ALL"
                  ? undefined
                  : filters.pinned === "PINNED",
              status: filters.status,
              limit: 120,
            }
          : {
              limit: 120,
            },
      );

      const scopedBySchool =
        mode === "teacher" && selectedSchoolId
          ? response.filter((announcement) => announcement.schoolId === selectedSchoolId)
          : response;

      setAnnouncements(scopedBySchool);
    } catch (loadError) {
      setAnnouncements([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load announcements.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAnnouncements();
  }, [mode, filters, selectedSchoolId]);

  useEffect(() => {
    if (!highlightedAnnouncementId || announcements.length === 0 || highlightedOnceRef.current) {
      return;
    }

    const element = document.getElementById(
      `announcement-${highlightedAnnouncementId}`,
    );
    if (!element) {
      return;
    }

    highlightedOnceRef.current = true;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [announcements, highlightedAnnouncementId]);

  useEffect(() => {
    async function loadTargetOptions() {
      if (!canManage) {
        return;
      }

      const activeSchoolId = selectedSchoolId;

      try {
        if (mode === "admin") {
          if (!activeSchoolId) {
            setGradeOptions([]);
            setClassOptions([]);
            setStudentOptions([]);
            return;
          }

          const [grades, classes, students] = await Promise.all([
            listGradeLevels(activeSchoolId),
            listClasses({ schoolId: activeSchoolId }),
            listUsers({ role: "STUDENT" }),
          ]);

          setGradeOptions(
            grades
              .filter((grade) => grade.isActive)
              .sort((left, right) => left.sortOrder - right.sortOrder)
              .map((grade) => ({ id: grade.id, name: grade.name })),
          );

          setClassOptions(
            classes
              .filter((schoolClass) => schoolClass.isActive)
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((schoolClass) => ({
                id: schoolClass.id,
                name: `${schoolClass.name}${schoolClass.gradeLevel?.name ? ` • ${schoolClass.gradeLevel.name}` : ""}`,
              })),
          );

          setStudentOptions(
            students
              .filter((student) => isInSchool(student, activeSchoolId))
              .map((student) => ({
                id: student.id,
                name: `${student.firstName} ${student.lastName}`.trim(),
                detail: student.username,
              }))
              .sort((left, right) => left.name.localeCompare(right.name)),
          );

          return;
        }

        const classes = await listMyClasses();
        const scopedClasses = activeSchoolId
          ? classes.filter((schoolClass) => schoolClass.schoolId === activeSchoolId)
          : classes;

        setClassOptions(
          scopedClasses
            .map((schoolClass) => ({
              id: schoolClass.id,
              name: `${schoolClass.name}${schoolClass.gradeLevel?.name ? ` • ${schoolClass.gradeLevel.name}` : ""}`,
            }))
            .sort((left, right) => left.name.localeCompare(right.name)),
        );

        const gradeMap = new Map<string, string>();
        for (const schoolClass of scopedClasses) {
          if (schoolClass.gradeLevel?.id && schoolClass.gradeLevel.name) {
            gradeMap.set(schoolClass.gradeLevel.id, schoolClass.gradeLevel.name);
          }
        }
        setGradeOptions(
          Array.from(gradeMap.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((left, right) => left.name.localeCompare(right.name)),
        );

        const rosterResponses = await Promise.all(
          scopedClasses.map((schoolClass) => listClassStudents(schoolClass.id)),
        );
        const studentMap = new Map<string, { id: string; name: string; detail: string }>();

        for (const roster of rosterResponses) {
          for (const studentEnrollment of roster) {
            const studentName = `${studentEnrollment.student.firstName} ${studentEnrollment.student.lastName}`.trim();
            studentMap.set(studentEnrollment.studentId, {
              id: studentEnrollment.studentId,
              name: studentName,
              detail: studentEnrollment.student.username,
            });
          }
        }

        setStudentOptions(
          Array.from(studentMap.values()).sort((left, right) =>
            left.name.localeCompare(right.name),
          ),
        );
      } catch {
        setGradeOptions([]);
        setClassOptions([]);
        setStudentOptions([]);
      }
    }

    void loadTargetOptions();
  }, [canManage, mode, selectedSchoolId]);

  const announcementCountLabel = useMemo(
    () => `${announcements.length} announcement${announcements.length === 1 ? "" : "s"}`,
    [announcements.length],
  );

  function resetForm() {
    setForm({
      ...initialFormState,
      includeWholeSchool: canPublishWholeSchool,
    });
    setEditingId(null);
  }

  useEffect(() => {
    if (!canManage) {
      return;
    }

    setForm((current) => {
      if (current.includeWholeSchool || !canPublishWholeSchool) {
        return current;
      }

      return {
        ...current,
        includeWholeSchool: true,
      };
    });
  }, [canManage, canPublishWholeSchool]);

  function beginEdit(announcement: Announcement) {
    setEditingId(announcement.id);

    const includeWholeSchool = announcement.targets.some(
      (target) => target.targetType === "SCHOOL",
    );
    const gradeLevelIds = announcement.targets
      .filter((target) => target.targetType === "GRADE_LEVEL" && target.gradeLevelId)
      .map((target) => target.gradeLevelId as string);
    const classIds = announcement.targets
      .filter((target) => target.targetType === "CLASS" && target.classId)
      .map((target) => target.classId as string);
    const studentIds = announcement.targets
      .filter((target) => target.targetType === "STUDENT" && target.studentId)
      .map((target) => target.studentId as string);

    setForm({
      title: announcement.title,
      body: announcement.body,
      audience: announcement.audience,
      isPinned: announcement.isPinned,
      expiresAtLocal: toLocalDateTimeInput(announcement.expiresAt),
      includeWholeSchool,
      gradeLevelIds,
      classIds,
      studentIds,
    });
  }

  async function handleSubmit() {
    if (!canManage || isSubmitting) {
      return;
    }

    setError(null);
    setSuccessMessage(null);

    const title = form.title.trim();
    const body = form.body.trim();

    if (!title || !body) {
      setError("Title and body are required.");
      return;
    }

    if (
      !form.includeWholeSchool &&
      form.gradeLevelIds.length === 0 &&
      form.classIds.length === 0 &&
      form.studentIds.length === 0
    ) {
      setError("Select at least one target group.");
      return;
    }

    if (!canPublishWholeSchool && form.includeWholeSchool) {
      setError("Teachers cannot publish whole-school announcements.");
      return;
    }

    const expiresAt = toIsoOrNull(form.expiresAtLocal);
    if (form.expiresAtLocal && !expiresAt) {
      setError("Expiry date must be valid.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        title,
        body,
        audience: form.audience,
        isPinned: form.isPinned,
        includeWholeSchool: form.includeWholeSchool,
        gradeLevelIds: form.gradeLevelIds,
        classIds: form.classIds,
        studentIds: form.studentIds,
      };

      if (editingId) {
        await updateAnnouncement(editingId, {
          ...payload,
          expiresAt,
        });
        setSuccessMessage("Announcement updated.");
      } else {
        await createAnnouncement({
          ...(mode === "admin" && selectedSchoolId ? { schoolId: selectedSchoolId } : {}),
          ...payload,
          ...(expiresAt ? { expiresAt } : {}),
        });
        setSuccessMessage("Announcement published.");
      }

      resetForm();
      await loadAnnouncements();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save announcement.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(announcementId: string) {
    if (deletingId) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this announcement? This cannot be undone.",
    );
    if (!confirmed) {
      return;
    }

    setDeletingId(announcementId);
    setError(null);

    try {
      await deleteAnnouncement(announcementId);
      if (editingId === announcementId) {
        resetForm();
      }
      await loadAnnouncements();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete announcement.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={pageTitle}
        description={pageDescription}
        meta={<Badge variant="neutral">{announcementCountLabel}</Badge>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingId ? "Edit Announcement" : "Create Announcement"}
            </CardTitle>
            <CardDescription>
              Keep messaging concise and target only the intended recipients.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field htmlFor="announcement-title" label="Title">
                <Input
                  id="announcement-title"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="School update"
                />
              </Field>

              <Field htmlFor="announcement-audience" label="Audience">
                <Select
                  id="announcement-audience"
                  value={form.audience}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      audience: event.target.value as AnnouncementAudience,
                    }))
                  }
                >
                  <option value="PARENTS_AND_STUDENTS">Parents + Students</option>
                  <option value="PARENTS">Parents only</option>
                  <option value="STUDENTS">Students only</option>
                </Select>
              </Field>
            </div>

            <Field htmlFor="announcement-body" label="Message">
              <Textarea
                id="announcement-body"
                value={form.body}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
                rows={5}
                placeholder="Write your announcement details..."
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field htmlFor="announcement-expires-at" label="Expiry (optional)">
                <Input
                  id="announcement-expires-at"
                  type="datetime-local"
                  value={form.expiresAtLocal}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      expiresAtLocal: event.target.value,
                    }))
                  }
                />
              </Field>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Options</p>
                <CheckboxField
                  checked={form.isPinned}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isPinned: event.target.checked,
                    }))
                  }
                  label="Pin announcement"
                  description="Pinned announcements are shown first."
                />
                <CheckboxField
                  checked={form.includeWholeSchool}
                  disabled={!canPublishWholeSchool}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      includeWholeSchool: event.target.checked,
                    }))
                  }
                  label="Include whole school"
                  description={
                    canPublishWholeSchool
                      ? "Broadcast to all eligible recipients in the school."
                      : "Teachers cannot send whole-school announcements."
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">Grade levels</p>
                <p className="text-xs text-slate-500">Selected: {form.gradeLevelIds.length}</p>
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                  {gradeOptions.map((grade) => (
                    <CheckboxField
                      key={grade.id}
                      checked={form.gradeLevelIds.includes(grade.id)}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          gradeLevelIds: toggleInList(current.gradeLevelIds, grade.id),
                        }))
                      }
                      label={grade.name}
                    />
                  ))}
                  {gradeOptions.length === 0 ? (
                    <p className="text-xs text-slate-500">No grade levels available.</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">Classes</p>
                <p className="text-xs text-slate-500">Selected: {form.classIds.length}</p>
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                  {classOptions.map((schoolClass) => (
                    <CheckboxField
                      key={schoolClass.id}
                      checked={form.classIds.includes(schoolClass.id)}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          classIds: toggleInList(current.classIds, schoolClass.id),
                        }))
                      }
                      label={schoolClass.name}
                    />
                  ))}
                  {classOptions.length === 0 ? (
                    <p className="text-xs text-slate-500">No classes available.</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">Students</p>
                <p className="text-xs text-slate-500">Selected: {form.studentIds.length}</p>
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                  {studentOptions.map((student) => (
                    <CheckboxField
                      key={student.id}
                      checked={form.studentIds.includes(student.id)}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          studentIds: toggleInList(current.studentIds, student.id),
                        }))
                      }
                      label={student.name}
                      description={student.detail}
                    />
                  ))}
                  {studentOptions.length === 0 ? (
                    <p className="text-xs text-slate-500">No students available.</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {editingId ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={resetForm}
                  disabled={isSubmitting}
                >
                  Cancel edit
                </Button>
              ) : null}
              <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
                {isSubmitting
                  ? editingId
                    ? "Saving..."
                    : "Publishing..."
                  : editingId
                    ? "Save changes"
                    : "Publish announcement"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Refine authored announcements.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <Field htmlFor="announcement-filter-audience" label="Audience">
              <Select
                id="announcement-filter-audience"
                value={filters.audience}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    audience: event.target.value as FilterState["audience"],
                  }))
                }
              >
                <option value="ALL">All audiences</option>
                <option value="PARENTS_AND_STUDENTS">Parents + Students</option>
                <option value="PARENTS">Parents</option>
                <option value="STUDENTS">Students</option>
              </Select>
            </Field>

            <Field htmlFor="announcement-filter-class" label="Class">
              <Select
                id="announcement-filter-class"
                value={filters.classId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    classId: event.target.value,
                  }))
                }
              >
                <option value="">All classes</option>
                {classOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="announcement-filter-grade" label="Grade level">
              <Select
                id="announcement-filter-grade"
                value={filters.gradeLevelId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    gradeLevelId: event.target.value,
                  }))
                }
              >
                <option value="">All grades</option>
                {gradeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="announcement-filter-pinned" label="Pinned">
              <Select
                id="announcement-filter-pinned"
                value={filters.pinned}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    pinned: event.target.value as FilterState["pinned"],
                  }))
                }
              >
                <option value="ALL">All</option>
                <option value="PINNED">Pinned</option>
                <option value="UNPINNED">Unpinned</option>
              </Select>
            </Field>

            <Field htmlFor="announcement-filter-status" label="Status">
              <Select
                id="announcement-filter-status"
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value as AnnouncementStatusFilter,
                  }))
                }
              >
                <option value="ACTIVE">Active</option>
                <option value="EXPIRED">Expired</option>
                <option value="ALL">All</option>
              </Select>
            </Field>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Announcement Feed</CardTitle>
          <CardDescription>
            {canManage
              ? "Pinned announcements appear first, then newest first."
              : "Only announcements relevant to your account are shown."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading announcements...</p>
          ) : announcements.length === 0 ? (
            <EmptyState
              compact
              title="No announcements"
              description={
                canManage
                  ? "Create your first announcement to start communicating updates."
                  : "No announcements are currently available for you."
              }
            />
          ) : (
            <div className="space-y-3">
              {announcements.map((announcement) => (
                <article
                  key={announcement.id}
                  id={`announcement-${announcement.id}`}
                  className={`rounded-2xl border bg-white px-4 py-4 shadow-sm ${
                    highlightedAnnouncementId === announcement.id
                      ? "border-blue-400 ring-2 ring-blue-200"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {announcement.isPinned ? (
                          <Badge variant="warning">Pinned</Badge>
                        ) : null}
                        <Badge variant="neutral">
                          {getAudienceLabel(announcement.audience)}
                        </Badge>
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-slate-950">
                        {announcement.title}
                      </h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {announcement.body}
                      </p>
                    </div>

                    {canManage ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => beginEdit(announcement)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={deletingId === announcement.id}
                          onClick={() => void handleDelete(announcement.id)}
                        >
                          {deletingId === announcement.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
                    <p>
                      <span className="font-medium text-slate-700">Author:</span>{" "}
                      {announcement.author.firstName} {announcement.author.lastName} ({formatRoleLabel(announcement.author.role)})
                    </p>
                    <p>
                      <span className="font-medium text-slate-700">Recipients:</span>{" "}
                      {summarizeRecipients(announcement)}
                    </p>
                    <p>
                      <span className="font-medium text-slate-700">Published:</span>{" "}
                      {formatDateTimeLabel(announcement.publishedAt)}
                    </p>
                    <p>
                      <span className="font-medium text-slate-700">Expires:</span>{" "}
                      {announcement.expiresAt
                        ? formatDateTimeLabel(announcement.expiresAt)
                        : "No expiry"}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
