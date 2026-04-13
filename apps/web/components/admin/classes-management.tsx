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

const adminManageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);

type CreateClassFormState = {
  schoolId: string;
  schoolYearId: string;
  name: string;
  subject: string;
  isHomeroom: boolean;
};

const emptyCreateForm: CreateClassFormState = {
  schoolId: "",
  schoolYearId: "",
  name: "",
  subject: "",
  isHomeroom: false,
};

export function ClassesManagement({ embedded = false }: { embedded?: boolean } = {}) {
  const { session } = useAuth();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
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
        const [classResponse, schoolResponse] = await Promise.all([
          listClasses({ includeInactive: showRemoved }),
          listSchools(),
        ]);

        setClasses(classResponse);
        setSchools(schoolResponse);

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
    async function loadSchoolYears() {
      if (!createForm.schoolId) {
        setSchoolYears([]);
        return;
      }

      try {
        const years = await listSchoolYears(createForm.schoolId);
        setSchoolYears(years);
        setCreateForm((current) => ({
          ...current,
          schoolYearId:
            years.find((year) => year.id === current.schoolYearId)?.id ??
            years.find((year) => year.isActive)?.id ??
            years[0]?.id ??
            "",
        }));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load school years.",
        );
      }
    }

    void loadSchoolYears();
  }, [createForm.schoolId]);

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
        name: createForm.name.trim(),
        subject: createForm.subject.trim() || undefined,
        isHomeroom: createForm.isHomeroom,
      });

      await refreshClasses();
      setCreateForm((current) => ({
        ...emptyCreateForm,
        schoolId: current.schoolId,
        schoolYearId: current.schoolYearId,
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

  const filteredClasses = selectedSchoolId
    ? classes.filter((schoolClass) => schoolClass.schoolId === selectedSchoolId)
    : classes;

  const activeClassesCount = useMemo(
    () => classes.filter((schoolClass) => schoolClass.isActive).length,
    [classes],
  );

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

              <Field htmlFor="create-class-subject" label="Subject">
                <Input
                  id="create-class-subject"
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      subject: event.target.value,
                    }))
                  }
                  placeholder="Optional subject"
                  value={createForm.subject}
                />
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
                <Button disabled={isSubmitting} type="submit">
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

          <div className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
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
                  onChange={(event) => setSelectedSchoolId(event.target.value)}
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
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700">Class</th>
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
                            {schoolClass.subject || "No subject"}
                          </Badge>
                          {schoolClass.isHomeroom ? (
                            <Badge variant="warning">Homeroom</Badge>
                          ) : null}
                        </div>
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
                      <td className="px-4 py-8" colSpan={6}>
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
