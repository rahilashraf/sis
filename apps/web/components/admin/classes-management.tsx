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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth/auth-context";
import {
  createClass,
  deleteClass,
  listClasses,
  type SchoolClass,
} from "@/lib/api/classes";
import {
  listSchools,
  listSchoolYears,
  type School,
  type SchoolYear,
} from "@/lib/api/schools";
import { listGradeLevels, type GradeLevel } from "@/lib/api/grade-levels";
import {
  listEnrollmentSubjectOptions,
  type EnrollmentSubjectOption,
} from "@/lib/api/enrollment-history";

const adminManageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);

type CreateClassFormState = {
  schoolId: string;
  schoolYearId: string;
  gradeLevelId: string;
  subjectOptionId: string;
  name: string;
  isHomeroom: boolean;
};

const emptyCreateForm: CreateClassFormState = {
  schoolId: "",
  schoolYearId: "",
  gradeLevelId: "",
  subjectOptionId: "",
  name: "",
  isHomeroom: false,
};

export function ClassesManagement({ embedded = false }: { embedded?: boolean } = {}) {
  const { session } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<EnrollmentSubjectOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [selectedGradeLevelFilterId, setSelectedGradeLevelFilterId] = useState("");
  const [selectedSubjectFilterId, setSelectedSubjectFilterId] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const [createForm, setCreateForm] = useState<CreateClassFormState>(emptyCreateForm);
  const [deleteTarget, setDeleteTarget] = useState<SchoolClass | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
        const [classResponse, schoolResponse, subjectOptionResponse] = await Promise.all([
          listClasses({ includeInactive: showRemoved }),
          listSchools(),
          listEnrollmentSubjectOptions({ includeInactive: false }),
        ]);

        setClasses(classResponse);
        setSchools(schoolResponse);
        setSubjectOptions(subjectOptionResponse.filter((entry) => entry.isActive));

        const initialSchoolId = schoolResponse[0]?.id ?? "";
        setSelectedSchoolId(initialSchoolId);
        setCreateForm((current) => ({
          ...current,
          schoolId: current.schoolId || initialSchoolId,
        }));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load classes.");
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [showRemoved]);

  useEffect(() => {
    async function loadSchoolYearsAndGradeLevels() {
      if (!createForm.schoolId) {
        setSchoolYears([]);
        setGradeLevels([]);
        return;
      }

      try {
        const [years, levels] = await Promise.all([
          listSchoolYears(createForm.schoolId),
          listGradeLevels(createForm.schoolId, { includeInactive: false }),
        ]);
        setSchoolYears(years);
        setGradeLevels(levels.filter((gradeLevel) => gradeLevel.isActive));
        setCreateForm((current) => ({
          ...current,
          schoolYearId:
            years.find((year) => year.id === current.schoolYearId)?.id ??
            years.find((year) => year.isActive)?.id ??
            years[0]?.id ??
            "",
          gradeLevelId:
            levels.find((gradeLevel) => gradeLevel.id === current.gradeLevelId)?.id ??
            levels[0]?.id ??
            "",
          subjectOptionId:
            subjectOptions.find((option) => option.id === current.subjectOptionId)?.id ??
            subjectOptions[0]?.id ??
            "",
        }));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load school setup options.",
        );
      }
    }

    void loadSchoolYearsAndGradeLevels();
  }, [createForm.schoolId, subjectOptions]);

  async function refreshClasses() {
    const classResponse = await listClasses({ includeInactive: showRemoved });
    setClasses(classResponse);
  }

  async function handleDeleteClass() {
    if (!deleteTarget || !canManageClasses) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await deleteClass(deleteTarget.id);
      await refreshClasses();
      setSuccessMessage(
        result.removalMode === "deleted"
          ? "Class deleted permanently."
          : "Class removed from active admin workflows.",
      );
      setDeleteTarget(null);
    } catch (deletionError) {
      setDeleteError(
        deletionError instanceof Error
          ? deletionError.message
          : "Unable to remove class.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleCreateClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageClasses) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await createClass({
        schoolId: createForm.schoolId,
        schoolYearId: createForm.schoolYearId,
        gradeLevelId: createForm.gradeLevelId,
        subjectOptionId: createForm.subjectOptionId,
        name: createForm.name.trim(),
        isHomeroom: createForm.isHomeroom,
      });

      await refreshClasses();
      setCreateForm((current) => ({
        ...emptyCreateForm,
        schoolId: current.schoolId,
        schoolYearId: current.schoolYearId,
        gradeLevelId: current.gradeLevelId,
        subjectOptionId: current.subjectOptionId,
      }));
      setSuccessMessage("Class created successfully.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to create class.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const filteredClasses = classes.filter((schoolClass) => {
    if (selectedSchoolId && schoolClass.schoolId !== selectedSchoolId) {
      return false;
    }

    if (selectedGradeLevelFilterId && schoolClass.gradeLevelId !== selectedGradeLevelFilterId) {
      return false;
    }

    if (selectedSubjectFilterId && schoolClass.subjectOptionId !== selectedSubjectFilterId) {
      return false;
    }

    return true;
  });

  const activeClassesCount = useMemo(
    () => classes.filter((schoolClass) => schoolClass.isActive).length,
    [classes],
  );

  const availableGradeLevelOptions = useMemo(() => {
    const map = new Map<string, string>();

    for (const schoolClass of classes) {
      if (selectedSchoolId && schoolClass.schoolId !== selectedSchoolId) {
        continue;
      }

      if (!schoolClass.gradeLevelId) {
        continue;
      }

      const label = schoolClass.gradeLevel?.name ?? `Grade level ${schoolClass.gradeLevelId}`;
      map.set(schoolClass.gradeLevelId, label);
    }

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [classes, selectedSchoolId]);

  const availableSubjectOptions = useMemo(() => {
    const map = new Map<string, string>();

    for (const schoolClass of classes) {
      if (selectedSchoolId && schoolClass.schoolId !== selectedSchoolId) {
        continue;
      }

      if (!schoolClass.subjectOptionId) {
        continue;
      }

      const label = schoolClass.subjectOption?.name ?? schoolClass.subject ?? "Unknown subject";
      map.set(schoolClass.subjectOptionId, label);
    }

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [classes, selectedSchoolId]);

  return (
    <div className="space-y-6">
      {!embedded ? (
        <PageHeader
          title="Classes"
          description="Review class structure, manage teacher coverage, and keep school-year groupings accurate."
          meta={
            <>
              <Badge variant="neutral">
                {showRemoved ? `${classes.length} visible classes` : `${classes.length} active classes`}
              </Badge>
              <Badge variant="neutral">{activeClassesCount} active</Badge>
            </>
          }
        />
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      {canManageClasses ? (
        <Card>
          <CardHeader>
            <CardTitle>Create Class</CardTitle>
            <CardDescription>
              Add a new class for the selected school and school year without changing existing assignments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateClass}>
              <Field htmlFor="create-class-school" label="School">
                <Select
                  id="create-class-school"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      schoolId: event.target.value,
                      schoolYearId: "",
                    }))
                  }
                  value={createForm.schoolId}
                >
                  <option value="">Select school</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field htmlFor="create-class-school-year" label="School year">
                <Select
                  id="create-class-school-year"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      schoolYearId: event.target.value,
                    }))
                  }
                  value={createForm.schoolYearId}
                >
                  <option value="">Select school year</option>
                  {schoolYears.map((schoolYear) => (
                    <option key={schoolYear.id} value={schoolYear.id}>
                      {schoolYear.name}
                      {schoolYear.isActive ? " (Active)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field htmlFor="create-class-name" label="Class name">
                <Input
                  id="create-class-name"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  required
                  value={createForm.name}
                />
              </Field>

              <Field htmlFor="create-class-grade-level" label="Grade level">
                <Select
                  id="create-class-grade-level"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      gradeLevelId: event.target.value,
                    }))
                  }
                  value={createForm.gradeLevelId}
                >
                  <option value="">Select grade level</option>
                  {gradeLevels.map((gradeLevel) => (
                    <option key={gradeLevel.id} value={gradeLevel.id}>
                      {gradeLevel.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field htmlFor="create-class-subject-option" label="Subject">
                <Select
                  id="create-class-subject-option"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      subjectOptionId: event.target.value,
                    }))
                  }
                  value={createForm.subjectOptionId}
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
                checked={createForm.isHomeroom}
                className="md:col-span-2"
                description="Use this when the class should represent a homeroom or advisory group."
                label="Homeroom class"
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    isHomeroom: event.target.checked,
                  }))
                }
              />

              <div className="md:col-span-2 flex justify-end">
                <Button
                  disabled={
                    isSubmitting ||
                    !createForm.schoolId ||
                    !createForm.schoolYearId ||
                    !createForm.gradeLevelId ||
                    !createForm.subjectOptionId
                  }
                  type="submit"
                >
                  {isSubmitting ? "Saving..." : "Create class"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Notice tone="info">
          You can review classes and attendance from this screen, but only admin-level
          roles can create new classes.
        </Notice>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Class Directory</CardTitle>
            <CardDescription>
              Open a class to update details, manage teacher assignments, review enrollment,
              or remove it from active admin workflows.
            </CardDescription>
          </div>

          <div className="flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
            <CheckboxField
              checked={showRemoved}
              className="rounded-xl border border-slate-200 px-3 py-2 sm:max-w-xs"
              description="Include inactive classes that were removed from normal admin workflows."
              label="Show removed classes"
              onChange={(event) => setShowRemoved(event.target.checked)}
            />
            <div className="w-full max-w-sm">
              <Field htmlFor="classes-filter-school" label="Filter by school">
                <Select
                  id="classes-filter-school"
                  onChange={(event) => {
                    setSelectedSchoolId(event.target.value);
                    setSelectedGradeLevelFilterId("");
                    setSelectedSubjectFilterId("");
                  }}
                  value={selectedSchoolId}
                >
                  <option value="">All schools</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-full max-w-sm">
              <Field htmlFor="classes-filter-grade-level" label="Filter by grade level">
                <Select
                  id="classes-filter-grade-level"
                  onChange={(event) => setSelectedGradeLevelFilterId(event.target.value)}
                  value={selectedGradeLevelFilterId}
                >
                  <option value="">All grade levels</option>
                  {availableGradeLevelOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-full max-w-sm">
              <Field htmlFor="classes-filter-subject" label="Filter by subject">
                <Select
                  id="classes-filter-subject"
                  onChange={(event) => setSelectedSubjectFilterId(event.target.value)}
                  value={selectedSubjectFilterId}
                >
                  <option value="">All subjects</option>
                  {availableSubjectOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700">Class</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Grade level</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">School</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">School year</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Teachers</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredClasses.map((schoolClass) => (
                    <tr className="align-top hover:bg-slate-50" key={schoolClass.id}>
                      <td className="px-4 py-4">
                        <p className="font-medium text-slate-900">{schoolClass.name}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant="neutral">
                            {schoolClass.subjectOption?.name ?? schoolClass.subject ?? "No subject"}
                          </Badge>
                          {schoolClass.isHomeroom ? (
                            <Badge variant="warning">Homeroom</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {schoolClass.gradeLevel?.name ?? "Not set"}
                      </td>
                      <td className="px-4 py-4 text-slate-600">{schoolClass.school.name}</td>
                      <td className="px-4 py-4 text-slate-600">
                        {schoolClass.schoolYear.name}
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {schoolClass.teachers.length > 0 ? (
                          schoolClass.teachers
                            .map(
                              (assignment) =>
                                `${assignment.teacher.firstName} ${assignment.teacher.lastName}`,
                            )
                            .join(", ")
                        ) : (
                          <span className="text-slate-500">No teachers assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={schoolClass.isActive ? "success" : "neutral"}>
                          {schoolClass.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            className={buttonClassName({ size: "sm", variant: "secondary" })}
                            href={`/admin/classes/${schoolClass.id}`}
                          >
                            Open class
                          </Link>
                          {canManageClasses ? (
                            <Button
                              disabled={isDeleting || isSubmitting}
                              onClick={() => {
                                setDeleteTarget(schoolClass);
                                setDeleteError(null);
                                setError(null);
                                setSuccessMessage(null);
                              }}
                              size="sm"
                              type="button"
                              variant="danger"
                            >
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && filteredClasses.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8" colSpan={7}>
                        <EmptyState
                          compact
                          description={
                            selectedSchoolId
                              ? "No classes match the selected school filter yet."
                              : "Create a class to start organizing teachers and students."
                          }
                          title="No classes found"
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

      <ConfirmDialog
        confirmLabel="Remove class"
        description={
          deleteTarget
            ? `Remove ${deleteTarget.name} from active admin workflows? Empty classes are deleted permanently. Classes with enrollments, staffing, grades, or attendance links are archived instead.`
            : ""
        }
        errorMessage={deleteError}
        isOpen={deleteTarget !== null}
        isPending={isDeleting}
        onCancel={() => {
          if (!isDeleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={handleDeleteClass}
        pendingLabel="Removing..."
        title="Remove class"
      />
    </div>
  );
}
