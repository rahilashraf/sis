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
  createBillingCharge,
  listBillingCategories,
  type BillingCategory,
} from "@/lib/api/billing";
import {
  listSchools,
  listSchoolYears,
  type School,
  type SchoolYear,
} from "@/lib/api/schools";
import { listUsers, type ManagedUser } from "@/lib/api/users";

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);

type CreateChargeFormState = {
  schoolId: string;
  schoolYearId: string;
  studentId: string;
  categoryId: string;
  title: string;
  description: string;
  amount: string;
  dueDate: string;
  sourceType: "MANUAL" | "SYSTEM";
  sendNotifications: boolean;
};

const emptyForm: CreateChargeFormState = {
  schoolId: "",
  schoolYearId: "",
  studentId: "",
  categoryId: "",
  title: "",
  description: "",
  amount: "",
  dueDate: "",
  sourceType: "MANUAL",
  sendNotifications: false,
};

type FieldErrors = Partial<Record<keyof CreateChargeFormState, string>>;

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

function validate(form: CreateChargeFormState): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.schoolId) {
    errors.schoolId = "School is required.";
  }

  if (!form.studentId) {
    errors.studentId = "Student is required.";
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

  return errors;
}

export function BillingChargeCreateForm() {
  const router = useRouter();
  const { session } = useAuth();
  const role = session?.user.role;

  const [form, setForm] = useState<CreateChargeFormState>(emptyForm);
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [students, setStudents] = useState<ManagedUser[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSchoolMeta, setIsLoadingSchoolMeta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const filteredStudents = useMemo(
    () =>
      students.filter((student) => userBelongsToSchool(student, form.schoolId)),
    [students, form.schoolId],
  );

  useEffect(() => {
    async function load() {
      if (!role || !manageRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [schoolResponse, userResponse] = await Promise.all([
          listSchools({ includeInactive: false }),
          listUsers({ role: "STUDENT" }),
        ]);

        setSchools(schoolResponse);
        setStudents(userResponse);

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
        return;
      }

      setIsLoadingSchoolMeta(true);

      try {
        const [categoryResponse, schoolYearResponse] = await Promise.all([
          listBillingCategories({ schoolId: form.schoolId }),
          listSchoolYears(form.schoolId, { includeInactive: false }),
        ]);

        setCategories(categoryResponse);
        setSchoolYears(schoolYearResponse);

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
        }));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load school-specific billing options.",
        );
        setCategories([]);
        setSchoolYears([]);
      } finally {
        setIsLoadingSchoolMeta(false);
      }
    }

    void loadSchoolContextOptions();
  }, [form.schoolId, role]);

  useEffect(() => {
    if (!form.schoolId) {
      return;
    }

    if (!filteredStudents.some((student) => student.id === form.studentId)) {
      setForm((current) => ({
        ...current,
        studentId: filteredStudents[0]?.id ?? "",
      }));
    }
  }, [filteredStudents, form.schoolId, form.studentId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!role || !manageRoles.has(role)) {
      return;
    }

    const nextErrors = validate(form);
    setFieldErrors(nextErrors);
    setError(null);

    if (Object.keys(nextErrors).length > 0) {
      setError("Please correct the highlighted fields and try again.");
      return;
    }

    setIsSubmitting(true);

    try {
      await createBillingCharge({
        schoolId: form.schoolId,
        schoolYearId: form.schoolYearId || undefined,
        studentId: form.studentId,
        categoryId: form.categoryId,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        amount: form.amount.trim(),
        dueDate: form.dueDate || undefined,
        sourceType: form.sourceType,
        sendNotifications: form.sendNotifications,
      });

      router.push("/admin/billing/charges?created=1");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create charge.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function fieldClassName(field: keyof CreateChargeFormState) {
    return fieldErrors[field]
      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/15"
      : undefined;
  }

  if (!role || !manageRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, and ADMIN roles can create billing charges."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading charge form...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Billing Charge"
        description="Create a non-tuition charge for an individual student."
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/admin/billing/charges"
          >
            Back to charges
          </Link>
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

      <Card>
        <CardHeader>
          <CardTitle>Charge details</CardTitle>
          <CardDescription>
            Enter billing details and submit to create the charge.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <Field htmlFor="create-charge-school" label="School">
              <Select
                className={fieldClassName("schoolId")}
                id="create-charge-school"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    schoolId: event.target.value,
                    categoryId: "",
                    schoolYearId: "",
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

            <Field htmlFor="create-charge-student" label="Student">
              <Select
                className={fieldClassName("studentId")}
                disabled={!form.schoolId}
                id="create-charge-student"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    studentId: event.target.value,
                  }))
                }
                value={form.studentId}
              >
                <option value="">Select student</option>
                {filteredStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {getStudentLabel(student)} ({student.username})
                  </option>
                ))}
              </Select>
              {fieldErrors.studentId ? (
                <p className="mt-1 text-xs text-rose-600">
                  {fieldErrors.studentId}
                </p>
              ) : null}
            </Field>

            <Field htmlFor="create-charge-category" label="Category">
              <Select
                className={fieldClassName("categoryId")}
                disabled={!form.schoolId || isLoadingSchoolMeta}
                id="create-charge-category"
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
              htmlFor="create-charge-school-year"
              label="School year (optional)"
              description="Optional context for reporting"
            >
              <Select
                disabled={!form.schoolId || isLoadingSchoolMeta}
                id="create-charge-school-year"
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

            <Field htmlFor="create-charge-title" label="Title">
              <Input
                className={fieldClassName("title")}
                id="create-charge-title"
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

            <Field htmlFor="create-charge-amount" label="Amount">
              <Input
                className={fieldClassName("amount")}
                id="create-charge-amount"
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

            <Field htmlFor="create-charge-due-date" label="Due date (optional)">
              <Input
                id="create-charge-due-date"
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

            <Field htmlFor="create-charge-source" label="Source type">
              <Select
                id="create-charge-source"
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
              htmlFor="create-charge-description"
              label="Description (optional)"
            >
              <Input
                id="create-charge-description"
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

            <CheckboxField
              className="md:col-span-2"
              id="create-charge-notify"
              label="Notify parents when charge is created"
              checked={form.sendNotifications}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sendNotifications: event.target.checked,
                }))
              }
            />

            <div className="md:col-span-2 flex justify-end gap-2">
              <Link
                className={buttonClassName({ variant: "secondary" })}
                href="/admin/billing/charges"
              >
                Cancel
              </Link>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? "Creating..." : "Create charge"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
