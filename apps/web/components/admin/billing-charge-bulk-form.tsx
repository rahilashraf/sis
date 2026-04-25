"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Field, CheckboxField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import {
  createBulkBillingCharges,
  listBillingCategories,
  type BillingCategory,
  type BulkBillingChargeResult,
  type BulkChargeTargetMode,
} from "@/lib/api/billing";
import { listClasses, type SchoolClass } from "@/lib/api/classes";
import { listGradeLevels, type GradeLevel } from "@/lib/api/grade-levels";
import {
  listSchools,
  listSchoolYears,
  type School,
  type SchoolYear,
} from "@/lib/api/schools";
import { listUsers, type ManagedUser } from "@/lib/api/users";

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);

type BulkChargeFormState = {
  schoolId: string;
  schoolYearId: string;
  categoryId: string;
  title: string;
  description: string;
  amount: string;
  dueDate: string;
  sourceType: "MANUAL" | "SYSTEM";
  targetMode: BulkChargeTargetMode;
  studentIds: string[];
  classId: string;
  gradeLevel: string;
  sendNotifications: boolean;
};

const emptyForm: BulkChargeFormState = {
  schoolId: "",
  schoolYearId: "",
  categoryId: "",
  title: "",
  description: "",
  amount: "",
  dueDate: "",
  sourceType: "MANUAL",
  targetMode: "SELECTED",
  studentIds: [],
  classId: "",
  gradeLevel: "",
  sendNotifications: false,
};

type FieldErrors = Partial<
  Record<
    | "schoolId"
    | "categoryId"
    | "title"
    | "amount"
    | "studentIds"
    | "classId"
    | "gradeLevel",
    string
  >
>;

function getStudentLabel(student: ManagedUser) {
  const fullName = `${student.firstName} ${student.lastName}`.trim();
  if (fullName) {
    return fullName;
  }

  return student.username || student.email || student.id;
}

function userBelongsToSchool(user: ManagedUser, schoolId: string) {
  if (!schoolId) {
    return true;
  }

  if (user.schoolId === schoolId) {
    return true;
  }

  return user.memberships.some(
    (membership) => membership.schoolId === schoolId,
  );
}

function validate(form: BulkChargeFormState): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.schoolId) {
    errors.schoolId = "School is required.";
  }

  if (!form.categoryId) {
    errors.categoryId = "Category is required.";
  }

  if (!form.title.trim()) {
    errors.title = "Title is required.";
  }

  if (!form.amount.trim()) {
    errors.amount = "Amount is required.";
  } else if (!/^\d+(\.\d{1,2})?$/.test(form.amount.trim())) {
    errors.amount = "Amount must be a positive number with up to 2 decimals.";
  }

  if (form.targetMode === "SELECTED" && form.studentIds.length === 0) {
    errors.studentIds = "Select at least one student.";
  }

  if (form.targetMode === "CLASS" && !form.classId) {
    errors.classId = "Class is required for class mode.";
  }

  if (form.targetMode === "GRADE" && !form.gradeLevel) {
    errors.gradeLevel = "Grade level is required for grade mode.";
  }

  return errors;
}

export function BillingChargeBulkForm() {
  const router = useRouter();
  const { session } = useAuth();
  const role = session?.user.role;

  const [form, setForm] = useState<BulkChargeFormState>(emptyForm);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [students, setStudents] = useState<ManagedUser[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSchoolMeta, setIsLoadingSchoolMeta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<BulkBillingChargeResult | null>(null);

  const filteredStudents = useMemo(
    () =>
      students.filter((student) => userBelongsToSchool(student, form.schoolId)),
    [students, form.schoolId],
  );

  const filteredClasses = useMemo(
    () =>
      classes.filter((schoolClass) => schoolClass.schoolId === form.schoolId),
    [classes, form.schoolId],
  );

  const selectedClass = useMemo(
    () =>
      filteredClasses.find((schoolClass) => schoolClass.id === form.classId) ??
      null,
    [filteredClasses, form.classId],
  );

  const previewTargetCount = useMemo(() => {
    if (form.targetMode === "SELECTED") {
      return form.studentIds.length;
    }

    if (form.targetMode === "CLASS") {
      return selectedClass?._count?.students ?? null;
    }

    return null;
  }, [form.targetMode, form.studentIds.length, selectedClass]);

  useEffect(() => {
    async function load() {
      if (!role || !manageRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [schoolResponse, userResponse, classResponse] = await Promise.all(
          [
            listSchools({ includeInactive: false }),
            listUsers({ role: "STUDENT" }),
            listClasses({ includeInactive: false }),
          ],
        );

        setSchools(schoolResponse);
        setStudents(userResponse);
        setClasses(classResponse);

        const defaultSchoolId =
          getDefaultSchoolContextId(session?.user) ??
          schoolResponse[0]?.id ??
          "";

        const schoolId =
          schoolResponse.find((school) => school.id === defaultSchoolId)?.id ??
          schoolResponse[0]?.id ??
          "";

        setForm((current) => ({
          ...current,
          schoolId,
        }));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load form options.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [role, session?.user]);

  useEffect(() => {
    async function loadSchoolContextOptions() {
      if (!form.schoolId || !role || !manageRoles.has(role)) {
        setCategories([]);
        setSchoolYears([]);
        setGradeLevels([]);
        return;
      }

      setIsLoadingSchoolMeta(true);

      try {
        const [categoryResponse, schoolYearResponse, gradeLevelResponse] =
          await Promise.all([
            listBillingCategories({ schoolId: form.schoolId }),
            listSchoolYears(form.schoolId, { includeInactive: false }),
            listGradeLevels(form.schoolId, { includeInactive: false }),
          ]);

        setCategories(categoryResponse);
        setSchoolYears(schoolYearResponse);
        setGradeLevels(gradeLevelResponse);

        setForm((current) => ({
          ...current,
          categoryId:
            categoryResponse.find((entry) => entry.id === current.categoryId)
              ?.id ??
            categoryResponse[0]?.id ??
            "",
          schoolYearId:
            schoolYearResponse.find(
              (entry) => entry.id === current.schoolYearId,
            )?.id ?? "",
          gradeLevel:
            gradeLevelResponse.find((entry) => entry.id === current.gradeLevel)
              ?.id ?? "",
        }));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load school-specific billing options.",
        );
        setCategories([]);
        setSchoolYears([]);
        setGradeLevels([]);
      } finally {
        setIsLoadingSchoolMeta(false);
      }
    }

    void loadSchoolContextOptions();
  }, [form.schoolId, role]);

  useEffect(() => {
    const validStudentIds = new Set(
      filteredStudents.map((student) => student.id),
    );

    setForm((current) => ({
      ...current,
      studentIds: current.studentIds.filter((studentId) =>
        validStudentIds.has(studentId),
      ),
      classId:
        filteredClasses.find(
          (schoolClass) => schoolClass.id === current.classId,
        )?.id ?? "",
    }));
  }, [filteredStudents, filteredClasses]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!role || !manageRoles.has(role)) {
      return;
    }

    const nextErrors = validate(form);
    setFieldErrors(nextErrors);
    setError(null);
    setResult(null);

    if (Object.keys(nextErrors).length > 0) {
      setError("Please correct the highlighted fields and try again.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await createBulkBillingCharges({
        schoolId: form.schoolId,
        schoolYearId: form.schoolYearId || undefined,
        categoryId: form.categoryId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        amount: form.amount.trim(),
        dueDate: form.dueDate || undefined,
        sourceType: form.sourceType,
        targetMode: form.targetMode,
        studentIds:
          form.targetMode === "SELECTED" ? form.studentIds : undefined,
        classId: form.targetMode === "CLASS" ? form.classId : undefined,
        gradeLevel: form.targetMode === "GRADE" ? form.gradeLevel : undefined,
        sendNotifications: form.sendNotifications,
      });

      setResult(response);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to bulk create charges.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function fieldClassName(field: keyof FieldErrors) {
    return fieldErrors[field]
      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/15"
      : undefined;
  }

  function toggleStudent(studentId: string) {
    setForm((current) => {
      const exists = current.studentIds.includes(studentId);
      return {
        ...current,
        studentIds: exists
          ? current.studentIds.filter((id) => id !== studentId)
          : [...current.studentIds, studentId],
      };
    });
  }

  if (!role || !manageRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, and ADMIN roles can create bulk billing charges."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading bulk charge form...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk Billing Charges"
        description="Assign the same non-tuition charge to many students in one action."
        actions={
          <div className="flex items-center gap-2">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/admin/billing/charges"
            >
              Back to charges
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/admin/billing/charges/new"
            >
              Single charge
            </Link>
          </div>
        }
        meta={
          schools.find((school) => school.id === form.schoolId) ? (
            <Badge variant="neutral">
              {schools.find((school) => school.id === form.schoolId)?.name}
            </Badge>
          ) : null
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {result ? (
        <Notice tone="success">
          Bulk charge completed. Targeted: {result.totalTargeted}, Created:{" "}
          {result.createdCount}, Skipped: {result.skippedCount}.
        </Notice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Bulk charge details</CardTitle>
          <CardDescription>
            Choose a target mode, set shared charge fields, then create charges
            in bulk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <Field htmlFor="bulk-charge-school" label="School">
              <Select
                className={fieldClassName("schoolId")}
                id="bulk-charge-school"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    schoolId: event.target.value,
                    categoryId: "",
                    schoolYearId: "",
                    classId: "",
                    gradeLevel: "",
                    studentIds: [],
                  }))
                }
                value={form.schoolId}
              >
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
              {fieldErrors.schoolId ? (
                <p className="mt-1 text-xs text-rose-600">
                  {fieldErrors.schoolId}
                </p>
              ) : null}
            </Field>

            <Field htmlFor="bulk-charge-target-mode" label="Target mode">
              <Select
                id="bulk-charge-target-mode"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetMode: event.target.value as BulkChargeTargetMode,
                    studentIds: [],
                    classId: "",
                    gradeLevel: "",
                  }))
                }
                value={form.targetMode}
              >
                <option value="SELECTED">Selected students</option>
                <option value="CLASS">Class</option>
                <option value="GRADE">Grade level</option>
              </Select>
            </Field>

            {form.targetMode === "CLASS" ? (
              <Field htmlFor="bulk-charge-class" label="Class">
                <Select
                  className={fieldClassName("classId")}
                  disabled={!form.schoolId}
                  id="bulk-charge-class"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      classId: event.target.value,
                    }))
                  }
                  value={form.classId}
                >
                  <option value="">Select class</option>
                  {filteredClasses.map((schoolClass) => (
                    <option key={schoolClass.id} value={schoolClass.id}>
                      {schoolClass.name}
                    </option>
                  ))}
                </Select>
                {fieldErrors.classId ? (
                  <p className="mt-1 text-xs text-rose-600">
                    {fieldErrors.classId}
                  </p>
                ) : null}
              </Field>
            ) : null}

            {form.targetMode === "GRADE" ? (
              <Field htmlFor="bulk-charge-grade-level" label="Grade level">
                <Select
                  className={fieldClassName("gradeLevel")}
                  disabled={!form.schoolId || isLoadingSchoolMeta}
                  id="bulk-charge-grade-level"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      gradeLevel: event.target.value,
                    }))
                  }
                  value={form.gradeLevel}
                >
                  <option value="">Select grade level</option>
                  {gradeLevels.map((gradeLevel) => (
                    <option key={gradeLevel.id} value={gradeLevel.id}>
                      {gradeLevel.name}
                    </option>
                  ))}
                </Select>
                {fieldErrors.gradeLevel ? (
                  <p className="mt-1 text-xs text-rose-600">
                    {fieldErrors.gradeLevel}
                  </p>
                ) : null}
              </Field>
            ) : null}

            <Field htmlFor="bulk-charge-category" label="Category">
              <Select
                className={fieldClassName("categoryId")}
                disabled={!form.schoolId || isLoadingSchoolMeta}
                id="bulk-charge-category"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    categoryId: event.target.value,
                  }))
                }
                value={form.categoryId}
              >
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              {fieldErrors.categoryId ? (
                <p className="mt-1 text-xs text-rose-600">
                  {fieldErrors.categoryId}
                </p>
              ) : null}
            </Field>

            <Field
              htmlFor="bulk-charge-school-year"
              label="School year (optional)"
            >
              <Select
                disabled={!form.schoolId || isLoadingSchoolMeta}
                id="bulk-charge-school-year"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    schoolYearId: event.target.value,
                  }))
                }
                value={form.schoolYearId}
              >
                <option value="">No school year</option>
                {schoolYears.map((schoolYear) => (
                  <option key={schoolYear.id} value={schoolYear.id}>
                    {schoolYear.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="bulk-charge-title" label="Title">
              <Input
                className={fieldClassName("title")}
                id="bulk-charge-title"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Lab materials fee"
                value={form.title}
              />
              {fieldErrors.title ? (
                <p className="mt-1 text-xs text-rose-600">
                  {fieldErrors.title}
                </p>
              ) : null}
            </Field>

            <Field htmlFor="bulk-charge-amount" label="Amount">
              <Input
                className={fieldClassName("amount")}
                id="bulk-charge-amount"
                inputMode="decimal"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
                placeholder="125.00"
                value={form.amount}
              />
              {fieldErrors.amount ? (
                <p className="mt-1 text-xs text-rose-600">
                  {fieldErrors.amount}
                </p>
              ) : null}
            </Field>

            <Field htmlFor="bulk-charge-due-date" label="Due date (optional)">
              <Input
                id="bulk-charge-due-date"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
                type="date"
                value={form.dueDate}
              />
            </Field>

            <Field htmlFor="bulk-charge-source" label="Source type">
              <Select
                id="bulk-charge-source"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sourceType: event.target.value as "MANUAL" | "SYSTEM",
                  }))
                }
                value={form.sourceType}
              >
                <option value="MANUAL">Manual</option>
                <option value="SYSTEM">System</option>
              </Select>
            </Field>

            <Field
              className="md:col-span-2"
              htmlFor="bulk-charge-description"
              label="Description (optional)"
            >
              <Input
                id="bulk-charge-description"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Optional internal or parent-facing note"
                value={form.description}
              />
            </Field>

            {form.targetMode === "SELECTED" ? (
              <Field
                className="md:col-span-2"
                htmlFor="bulk-charge-students"
                label="Students"
              >
                <div
                  className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 p-3"
                  id="bulk-charge-students"
                >
                  {filteredStudents.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No students found for this school.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {filteredStudents.map((student) => (
                        <label
                          key={student.id}
                          className="flex items-center gap-2 text-sm text-slate-700"
                        >
                          <input
                            checked={form.studentIds.includes(student.id)}
                            className="h-4 w-4 rounded border-slate-300"
                            onChange={() => toggleStudent(student.id)}
                            type="checkbox"
                          />
                          <span>
                            {getStudentLabel(student)} ({student.username})
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {fieldErrors.studentIds ? (
                  <p className="mt-1 text-xs text-rose-600">
                    {fieldErrors.studentIds}
                  </p>
                ) : null}
              </Field>
            ) : null}

            <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-700">Preview</p>
              <p className="mt-1 text-sm text-slate-600">
                Mode:{" "}
                {form.targetMode === "SELECTED"
                  ? "Selected students"
                  : form.targetMode === "CLASS"
                    ? "Class"
                    : "Grade level"}
              </p>
              <p className="text-sm text-slate-600">
                Target count: {previewTargetCount ?? "—"}
              </p>
            </div>

            <CheckboxField
              className="md:col-span-2"
              id="bulk-charge-notify"
              label="Notify parents for created charges"
              checked={form.sendNotifications}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sendNotifications: event.target.checked,
                }))
              }
            />

            <div className="md:col-span-2 flex justify-end gap-2">
              <Button
                onClick={() => router.push("/admin/billing/charges")}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? "Creating..." : "Create bulk charges"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {result?.skipped.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Skipped items</CardTitle>
            <CardDescription>
              {result.skipped.length} student(s) were skipped.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-slate-700">
              {result.skipped.slice(0, 20).map((item) => (
                <li key={`${item.studentId}-${item.reason}`}>
                  <span className="font-mono text-xs text-slate-500">
                    {item.studentId}
                  </span>{" "}
                  — {item.reason}
                </li>
              ))}
              {result.skipped.length > 20 ? (
                <li className="text-slate-500">
                  + {result.skipped.length - 20} more
                </li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
