"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  createBillingPayment,
  getStudentAccountSummary,
  type AccountSummaryCharge,
  type PaymentMethod,
} from "@/lib/api/billing";
import {
  listSchools,
  listSchoolYears,
  type School,
  type SchoolYear,
} from "@/lib/api/schools";
import { listUsers, type ManagedUser } from "@/lib/api/users";

// ── Constants ────────────────────────────────────────────────────────────────

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);

const paymentMethods: Array<{ value: PaymentMethod; label: string }> = [
  { value: "EFT", label: "EFT" },
  { value: "E_TRANSFER", label: "E-Transfer" },
  { value: "CASH", label: "Cash" },
  { value: "DEBIT_CREDIT", label: "Debit/Credit" },
  { value: "CHEQUE", label: "Cheque" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: string) {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(num);
}

function getStudentLabel(student: ManagedUser) {
  const fullName = `${student.firstName} ${student.lastName}`.trim();
  return fullName || student.username || student.email || student.id;
}

function userBelongsToSchool(user: ManagedUser, schoolId: string) {
  if (!schoolId) return true;
  if (user.schoolId === schoolId) return true;
  return user.memberships.some((m) => m.schoolId === schoolId);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ── Types ────────────────────────────────────────────────────────────────────

type AllocationMode = "auto" | "manual";

type FormState = {
  schoolId: string;
  schoolYearId: string;
  studentId: string;
  paymentDate: string;
  amount: string;
  method: PaymentMethod;
  referenceNumber: string;
  notes: string;
  sendNotifications: boolean;
};

type FieldErrors = Partial<Record<keyof FormState | "allocations", string>>;

// Keyed by chargeId → amount string entered by staff
type AllocationDraft = Record<string, string>;

// ── Validation ───────────────────────────────────────────────────────────────

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.schoolId) errors.schoolId = "School is required.";
  if (!form.studentId) errors.studentId = "Student is required.";
  if (!form.paymentDate) errors.paymentDate = "Payment date is required.";
  if (!form.amount.trim()) {
    errors.amount = "Amount is required.";
  } else if (!/^\d+(\.\d{1,2})?$/.test(form.amount.trim())) {
    errors.amount = "Amount must be a positive number with up to 2 decimals.";
  }
  if (!form.method) errors.method = "Payment method is required.";

  return errors;
}

function validateAllocations(
  amount: string,
  draft: AllocationDraft,
  charges: AccountSummaryCharge[],
): string | null {
  const paymentAmt = parseFloat(amount);
  if (isNaN(paymentAmt) || paymentAmt <= 0) return null; // caught by main validation

  let total = 0;
  for (const charge of charges) {
    const raw = draft[charge.id] ?? "";
    if (!raw.trim()) continue;
    if (!/^\d+(\.\d{1,2})?$/.test(raw.trim())) {
      return `Allocation for "${charge.title}" must be a valid decimal number.`;
    }
    const val = parseFloat(raw);
    const due = parseFloat(charge.amountDue);
    if (val > due) {
      return `Allocation for "${charge.title}" (${formatCurrency(raw)}) exceeds balance due (${formatCurrency(charge.amountDue)}).`;
    }
    total += val;
  }

  const totalFixed = parseFloat(total.toFixed(2));
  const payFixed = parseFloat(paymentAmt.toFixed(2));

  if (Math.abs(totalFixed - payFixed) > 0.001) {
    return `Allocations total ${formatCurrency(totalFixed.toFixed(2))} but payment amount is ${formatCurrency(amount)}. They must match.`;
  }

  return null;
}

// ── Component ────────────────────────────────────────────────────────────────

export function BillingPaymentCreateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session } = useAuth();
  const role = session?.user?.role ?? "";

  const prefillStudentId = searchParams.get("studentId") ?? "";

  const [form, setForm] = useState<FormState>({
    schoolId: "",
    schoolYearId: "",
    studentId: prefillStudentId,
    paymentDate: todayIso(),
    amount: "",
    method: "CASH",
    referenceNumber: "",
    notes: "",
    sendNotifications: false,
  });

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [students, setStudents] = useState<ManagedUser[]>([]);

  const [allocationMode, setAllocationMode] = useState<AllocationMode>("auto");
  const [outstandingCharges, setOutstandingCharges] = useState<
    AccountSummaryCharge[]
  >([]);
  const [allocationDraft, setAllocationDraft] = useState<AllocationDraft>({});
  const [isLoadingCharges, setIsLoadingCharges] = useState(false);
  const [chargesError, setChargesError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSchoolMeta, setIsLoadingSchoolMeta] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // ── Initial load: schools + students ──────────────────────────────────────

  useEffect(() => {
    async function load() {
      if (!role || !manageRoles.has(role)) return;

      setIsLoading(true);
      setError(null);

      try {
        const [schoolList, userList] = await Promise.all([
          listSchools({ includeInactive: false }),
          listUsers({ role: "STUDENT" }),
        ]);

        setSchools(schoolList);
        setStudents(userList);

        const defaultSchoolId =
          getDefaultSchoolContextId(session?.user) ?? schoolList[0]?.id ?? "";
        const resolvedSchoolId =
          schoolList.find((s) => s.id === defaultSchoolId)?.id ??
          schoolList[0]?.id ??
          "";

        // If prefillStudentId given, find their school
        let resolvedStudentSchoolId = resolvedSchoolId;
        if (prefillStudentId) {
          const prefillUser = userList.find((u) => u.id === prefillStudentId);
          if (prefillUser) {
            const memberSchool =
              prefillUser.memberships[0]?.schoolId ?? prefillUser.schoolId;
            if (memberSchool) {
              resolvedStudentSchoolId =
                schoolList.find((s) => s.id === memberSchool)?.id ??
                resolvedSchoolId;
            }
          }
        }

        setForm((f) => ({
          ...f,
          schoolId: resolvedStudentSchoolId,
          studentId: prefillStudentId || f.studentId,
        }));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Unable to load form options.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  // ── School-contextual: school years ───────────────────────────────────────

  useEffect(() => {
    async function loadSchoolMeta() {
      if (!form.schoolId || !role || !manageRoles.has(role)) {
        setSchoolYears([]);
        return;
      }

      setIsLoadingSchoolMeta(true);

      try {
        const syList = await listSchoolYears(form.schoolId, {
          includeInactive: false,
        });
        setSchoolYears(syList);
        setForm((f) => ({
          ...f,
          schoolYearId: syList.find((sy) => sy.id === f.schoolYearId)?.id ?? "",
        }));
      } catch {
        setSchoolYears([]);
      } finally {
        setIsLoadingSchoolMeta(false);
      }
    }

    void loadSchoolMeta();
  }, [form.schoolId, role]);

  // ── Reset studentId when filtered list changes ────────────────────────────

  const filteredStudents = useMemo(
    () => students.filter((s) => userBelongsToSchool(s, form.schoolId)),
    [students, form.schoolId],
  );

  useEffect(() => {
    if (!form.schoolId) return;
    if (filteredStudents.length === 0) return;
    if (!filteredStudents.some((s) => s.id === form.studentId)) {
      setForm((f) => ({ ...f, studentId: filteredStudents[0]?.id ?? "" }));
    }
  }, [filteredStudents, form.schoolId, form.studentId]);

  // ── Load outstanding charges for manual allocation ────────────────────────

  useEffect(() => {
    if (allocationMode !== "manual" || !form.studentId || !form.schoolId) {
      setOutstandingCharges([]);
      setAllocationDraft({});
      return;
    }

    let cancelled = false;
    setIsLoadingCharges(true);
    setChargesError(null);

    getStudentAccountSummary(form.studentId, { schoolId: form.schoolId })
      .then((summary) => {
        if (cancelled) return;
        setOutstandingCharges(summary.outstandingCharges);
        // Seed draft with empty strings
        const draft: AllocationDraft = {};
        for (const c of summary.outstandingCharges) {
          draft[c.id] = "";
        }
        setAllocationDraft(draft);
        setIsLoadingCharges(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setChargesError(
          err instanceof Error ? err.message : "Failed to load charges.",
        );
        setIsLoadingCharges(false);
      });

    return () => {
      cancelled = true;
    };
  }, [allocationMode, form.studentId, form.schoolId]);

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role || !manageRoles.has(role)) return;

    const nextErrors = validate(form);
    setFieldErrors(nextErrors);
    setError(null);

    if (Object.keys(nextErrors).length > 0) {
      setError("Please correct the highlighted fields and try again.");
      return;
    }

    // Validate manual allocations
    if (allocationMode === "manual") {
      const allocErr = validateAllocations(
        form.amount,
        allocationDraft,
        outstandingCharges,
      );
      if (allocErr) {
        setFieldErrors((e) => ({ ...e, allocations: allocErr }));
        setError("Please fix the allocation amounts before submitting.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Build allocations payload
      const allocations =
        allocationMode === "manual"
          ? Object.entries(allocationDraft)
              .filter(([, v]) => v.trim() && parseFloat(v) > 0)
              .map(([chargeId, amount]) => ({
                chargeId,
                amount: parseFloat(amount).toFixed(2),
              }))
          : undefined;

      await createBillingPayment({
        schoolId: form.schoolId,
        schoolYearId: form.schoolYearId || null,
        studentId: form.studentId,
        paymentDate: form.paymentDate,
        amount: form.amount.trim(),
        method: form.method,
        referenceNumber: form.referenceNumber.trim() || null,
        notes: form.notes.trim() || null,
        allocations,
        sendNotifications: form.sendNotifications,
      });

      if (form.studentId) {
        router.push(
          `/admin/billing/students/${form.studentId}?paymentRecorded=1`,
        );
      } else {
        router.push("/admin/billing/charges?paymentRecorded=1");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to record payment.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function fieldCls(field: keyof FormState) {
    return fieldErrors[field]
      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/15"
      : undefined;
  }

  // ── Access guard ──────────────────────────────────────────────────────────

  if (!role || !manageRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, and ADMIN roles can record payments."
      />
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading payment form…</p>
        </CardContent>
      </Card>
    );
  }

  const selectedSchool = schools.find((s) => s.id === form.schoolId);

  const cancelHref = prefillStudentId
    ? `/admin/billing/students/${prefillStudentId}`
    : "/admin/billing/charges";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Record Payment"
        description="Record a payment against a student's billing account."
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href={cancelHref}
          >
            Cancel
          </Link>
        }
        meta={
          selectedSchool ? (
            <Badge variant="neutral">{selectedSchool.name}</Badge>
          ) : null
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <form className="space-y-6" onSubmit={handleSubmit}>
        {/* ── Core payment details ── */}
        <Card>
          <CardHeader>
            <CardTitle>Payment details</CardTitle>
            <CardDescription>
              Enter the payment information below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {/* School */}
              <Field htmlFor="pay-school" label="School">
                <Select
                  className={fieldCls("schoolId")}
                  id="pay-school"
                  value={form.schoolId}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      schoolId: e.target.value,
                      studentId: "",
                      schoolYearId: "",
                    }))
                  }
                >
                  <option value="">Select school</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                {fieldErrors.schoolId && (
                  <p className="mt-1 text-xs text-rose-600">
                    {fieldErrors.schoolId}
                  </p>
                )}
              </Field>

              {/* Student */}
              <Field htmlFor="pay-student" label="Student">
                <Select
                  className={fieldCls("studentId")}
                  disabled={!form.schoolId}
                  id="pay-student"
                  value={form.studentId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, studentId: e.target.value }))
                  }
                >
                  <option value="">Select student</option>
                  {filteredStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {getStudentLabel(s)} ({s.username})
                    </option>
                  ))}
                </Select>
                {fieldErrors.studentId && (
                  <p className="mt-1 text-xs text-rose-600">
                    {fieldErrors.studentId}
                  </p>
                )}
              </Field>

              {/* Payment date */}
              <Field htmlFor="pay-date" label="Payment date">
                <Input
                  className={fieldCls("paymentDate")}
                  id="pay-date"
                  type="date"
                  value={form.paymentDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, paymentDate: e.target.value }))
                  }
                />
                {fieldErrors.paymentDate && (
                  <p className="mt-1 text-xs text-rose-600">
                    {fieldErrors.paymentDate}
                  </p>
                )}
              </Field>

              {/* Amount */}
              <Field htmlFor="pay-amount" label="Amount">
                <Input
                  className={fieldCls("amount")}
                  id="pay-amount"
                  inputMode="decimal"
                  placeholder="125.00"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
                {fieldErrors.amount && (
                  <p className="mt-1 text-xs text-rose-600">
                    {fieldErrors.amount}
                  </p>
                )}
              </Field>

              {/* Method */}
              <Field htmlFor="pay-method" label="Payment method">
                <Select
                  className={fieldCls("method")}
                  id="pay-method"
                  value={form.method}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      method: e.target.value as PaymentMethod,
                    }))
                  }
                >
                  {paymentMethods.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
                {fieldErrors.method && (
                  <p className="mt-1 text-xs text-rose-600">
                    {fieldErrors.method}
                  </p>
                )}
              </Field>

              {/* School year (optional) */}
              <Field
                htmlFor="pay-school-year"
                label="School year (optional)"
                description="Optional context for reporting"
              >
                <Select
                  disabled={!form.schoolId || isLoadingSchoolMeta}
                  id="pay-school-year"
                  value={form.schoolYearId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, schoolYearId: e.target.value }))
                  }
                >
                  <option value="">No school year</option>
                  {schoolYears.map((sy) => (
                    <option key={sy.id} value={sy.id}>
                      {sy.name}
                    </option>
                  ))}
                </Select>
              </Field>

              {/* Reference number */}
              <Field htmlFor="pay-ref" label="Reference number (optional)">
                <Input
                  id="pay-ref"
                  placeholder="Cheque #, transaction ID, etc."
                  value={form.referenceNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, referenceNumber: e.target.value }))
                  }
                />
              </Field>

              {/* Notes */}
              <Field htmlFor="pay-notes" label="Notes (optional)">
                <Input
                  id="pay-notes"
                  placeholder="Internal note for this payment"
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* ── Allocation mode ── */}
        <Card>
          <CardHeader>
            <CardTitle>Allocation</CardTitle>
            <CardDescription>
              Choose how this payment is applied to outstanding charges.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mode toggle */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setAllocationMode("auto")}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  allocationMode === "auto"
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Auto-apply
              </button>
              <button
                type="button"
                onClick={() => setAllocationMode("manual")}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  allocationMode === "manual"
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Manual allocation
              </button>
            </div>

            {allocationMode === "auto" && (
              <p className="text-sm text-slate-500">
                Payment will be automatically applied to the student&apos;s
                oldest outstanding charges first (by due date, then issue date).
              </p>
            )}

            {allocationMode === "manual" && (
              <>
                {!form.studentId || !form.schoolId ? (
                  <Notice tone="info">
                    Select a school and student above to see their outstanding
                    charges.
                  </Notice>
                ) : isLoadingCharges ? (
                  <p className="text-sm text-slate-500">
                    Loading outstanding charges…
                  </p>
                ) : chargesError ? (
                  <Notice tone="danger">{chargesError}</Notice>
                ) : outstandingCharges.length === 0 ? (
                  <EmptyState
                    title="No outstanding charges"
                    description="This student has no outstanding charges to allocate against."
                  />
                ) : (
                  <>
                    {fieldErrors.allocations && (
                      <Notice tone="danger">{fieldErrors.allocations}</Notice>
                    )}
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Charge
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Category
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Balance due
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                              Allocate
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                          {outstandingCharges.map((charge) => (
                            <tr key={charge.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3 text-sm font-medium text-slate-900">
                                {charge.title}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-600">
                                {charge.category?.name ?? "—"}
                              </td>
                              <td className="px-4 py-3 text-sm text-right tabular-nums text-slate-900">
                                {formatCurrency(charge.amountDue)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Input
                                  className="w-28 text-right tabular-nums"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  value={allocationDraft[charge.id] ?? ""}
                                  onChange={(e) =>
                                    setAllocationDraft((d) => ({
                                      ...d,
                                      [charge.id]: e.target.value,
                                    }))
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50">
                          <tr>
                            <td
                              colSpan={3}
                              className="px-4 py-3 text-sm font-medium text-slate-700 text-right"
                            >
                              Allocations total
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-right tabular-nums text-slate-900">
                              {formatCurrency(
                                Object.values(allocationDraft)
                                  .reduce(
                                    (sum, v) => sum + (parseFloat(v) || 0),
                                    0,
                                  )
                                  .toFixed(2),
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="text-xs text-slate-500">
                      Allocations must total exactly the payment amount above.
                      Leave a row blank to skip that charge.
                    </p>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <CheckboxField
          id="payment-notify"
          label="Notify parents when payment is recorded"
          checked={form.sendNotifications}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              sendNotifications: event.target.checked,
            }))
          }
        />

        {/* ── Actions ── */}
        <div className="flex justify-end gap-2">
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href={cancelHref}
          >
            Cancel
          </Link>
          <Button disabled={isSubmitting} type="submit" variant="primary">
            {isSubmitting ? "Recording…" : "Record payment"}
          </Button>
        </div>
      </form>
    </div>
  );
}
