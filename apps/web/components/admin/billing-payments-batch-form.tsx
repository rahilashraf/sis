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
import { Field, CheckboxField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import {
  createBatchBillingPayments,
  type BatchBillingPaymentEntryInput,
  type BatchBillingPaymentResult,
  type PaymentMethod,
} from "@/lib/api/billing";
import { listSchools, type School } from "@/lib/api/schools";
import { listUsers, type ManagedUser } from "@/lib/api/users";

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);

const paymentMethods: Array<{ value: PaymentMethod; label: string }> = [
  { value: "EFT", label: "EFT" },
  { value: "E_TRANSFER", label: "E-Transfer" },
  { value: "CASH", label: "Cash" },
  { value: "DEBIT_CREDIT", label: "Debit/Credit" },
  { value: "CHEQUE", label: "Cheque" },
];

type BatchPaymentRow = {
  id: string;
  studentId: string;
  paymentDate: string;
  amount: string;
  method: PaymentMethod;
  referenceNumber: string;
  notes: string;
};

type RowErrors = Partial<Record<keyof Omit<BatchPaymentRow, "id">, string>>;

function makeRow(index: number): BatchPaymentRow {
  return {
    id: `row-${Date.now()}-${index}`,
    studentId: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: "",
    method: "CASH",
    referenceNumber: "",
    notes: "",
  };
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

function validateRow(row: BatchPaymentRow): RowErrors {
  const errors: RowErrors = {};

  if (!row.studentId) {
    errors.studentId = "Student is required.";
  }

  if (!row.paymentDate) {
    errors.paymentDate = "Payment date is required.";
  }

  if (!row.amount.trim()) {
    errors.amount = "Amount is required.";
  } else if (!/^\d+(\.\d{1,2})?$/.test(row.amount.trim())) {
    errors.amount = "Use a valid amount (up to 2 decimals).";
  }

  if (!row.method) {
    errors.method = "Method is required.";
  }

  return errors;
}

export function BillingPaymentsBatchForm() {
  const { session } = useAuth();
  const role = session?.user?.role ?? "";

  const [schoolId, setSchoolId] = useState("");
  const [rows, setRows] = useState<BatchPaymentRow[]>([makeRow(0)]);
  const [schools, setSchools] = useState<School[]>([]);
  const [students, setStudents] = useState<ManagedUser[]>([]);
  const [sendNotifications, setSendNotifications] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, RowErrors>>({});
  const [result, setResult] = useState<BatchBillingPaymentResult | null>(null);

  const filteredStudents = useMemo(
    () => students.filter((student) => userBelongsToSchool(student, schoolId)),
    [students, schoolId],
  );

  useEffect(() => {
    async function load() {
      if (!role || !manageRoles.has(role)) {
        return;
      }

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

        setSchoolId(resolvedSchoolId);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load batch payment form options.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [role, session?.user]);

  useEffect(() => {
    if (!schoolId || filteredStudents.length === 0) {
      return;
    }

    const validStudentIds = new Set(filteredStudents.map((s) => s.id));

    setRows((current) =>
      current.map((row) => ({
        ...row,
        studentId: validStudentIds.has(row.studentId)
          ? row.studentId
          : filteredStudents[0]?.id ?? "",
      })),
    );
  }, [schoolId, filteredStudents]);

  function updateRow(rowId: string, updater: (row: BatchPaymentRow) => BatchPaymentRow) {
    setRows((current) => current.map((row) => (row.id === rowId ? updater(row) : row)));
  }

  function addRow() {
    setRows((current) => [...current, makeRow(current.length)]);
  }

  function removeRow(rowId: string) {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== rowId) : current));
    setRowErrors((current) => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!role || !manageRoles.has(role)) {
      return;
    }

    if (!schoolId) {
      setError("School is required.");
      return;
    }

    const nextErrors: Record<string, RowErrors> = {};
    for (const row of rows) {
      const rowError = validateRow(row);
      if (Object.keys(rowError).length > 0) {
        nextErrors[row.id] = rowError;
      }
    }

    setRowErrors(nextErrors);
    setError(null);
    setResult(null);

    if (Object.keys(nextErrors).length > 0) {
      setError("Please fix row errors and try again.");
      return;
    }

    const entries: BatchBillingPaymentEntryInput[] = rows.map((row) => ({
      studentId: row.studentId,
      paymentDate: row.paymentDate,
      amount: row.amount.trim(),
      method: row.method,
      referenceNumber: row.referenceNumber.trim() || undefined,
      notes: row.notes.trim() || undefined,
    }));

    setIsSubmitting(true);

    try {
      const response = await createBatchBillingPayments({
        schoolId,
        entries,
        sendNotifications,
      });
      setResult(response);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit batch payments.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!role || !manageRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, and ADMIN roles can record batch payments."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading batch payment form...</p>
        </CardContent>
      </Card>
    );
  }

  const selectedSchool = schools.find((school) => school.id === schoolId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batch Payment Entry"
        description="Enter multiple payment rows. Each row creates its own payment and receipt."
        actions={
          <Link className={buttonClassName({ variant: "secondary" })} href="/admin/billing/charges">
            Back to charges
          </Link>
        }
        meta={selectedSchool ? <Badge variant="neutral">{selectedSchool.name}</Badge> : null}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {result ? (
        <Notice tone="success">
          Processed {result.totalRows} row(s): {result.successCount} succeeded, {result.failedCount} failed.
        </Notice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Batch rows</CardTitle>
          <CardDescription>
            Enter one payment per row. Manual allocations are optional and omitted in v1.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <Field htmlFor="batch-payment-school" label="School">
              <Select
                id="batch-payment-school"
                value={schoolId}
                onChange={(event) => setSchoolId(event.target.value)}
              >
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Student</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Amount</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Method</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Reference</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Notes</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {rows.map((row) => {
                    const errorsForRow = rowErrors[row.id] ?? {};

                    return (
                      <tr key={row.id}>
                        <td className="px-3 py-2 align-top min-w-56">
                          <Select
                            className={errorsForRow.studentId ? "border-rose-400" : undefined}
                            value={row.studentId}
                            onChange={(event) =>
                              updateRow(row.id, (current) => ({
                                ...current,
                                studentId: event.target.value,
                              }))
                            }
                          >
                            <option value="">Select student</option>
                            {filteredStudents.map((student) => (
                              <option key={student.id} value={student.id}>
                                {getStudentLabel(student)} ({student.username})
                              </option>
                            ))}
                          </Select>
                          {errorsForRow.studentId ? (
                            <p className="mt-1 text-xs text-rose-600">{errorsForRow.studentId}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 align-top min-w-40">
                          <Input
                            className={errorsForRow.paymentDate ? "border-rose-400" : undefined}
                            type="date"
                            value={row.paymentDate}
                            onChange={(event) =>
                              updateRow(row.id, (current) => ({
                                ...current,
                                paymentDate: event.target.value,
                              }))
                            }
                          />
                          {errorsForRow.paymentDate ? (
                            <p className="mt-1 text-xs text-rose-600">{errorsForRow.paymentDate}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 align-top min-w-40">
                          <Input
                            className={errorsForRow.amount ? "border-rose-400" : undefined}
                            inputMode="decimal"
                            placeholder="0.00"
                            value={row.amount}
                            onChange={(event) =>
                              updateRow(row.id, (current) => ({
                                ...current,
                                amount: event.target.value,
                              }))
                            }
                          />
                          {errorsForRow.amount ? (
                            <p className="mt-1 text-xs text-rose-600">{errorsForRow.amount}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 align-top min-w-44">
                          <Select
                            className={errorsForRow.method ? "border-rose-400" : undefined}
                            value={row.method}
                            onChange={(event) =>
                              updateRow(row.id, (current) => ({
                                ...current,
                                method: event.target.value as PaymentMethod,
                              }))
                            }
                          >
                            {paymentMethods.map((method) => (
                              <option key={method.value} value={method.value}>
                                {method.label}
                              </option>
                            ))}
                          </Select>
                          {errorsForRow.method ? (
                            <p className="mt-1 text-xs text-rose-600">{errorsForRow.method}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 align-top min-w-44">
                          <Input
                            value={row.referenceNumber}
                            onChange={(event) =>
                              updateRow(row.id, (current) => ({
                                ...current,
                                referenceNumber: event.target.value,
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 align-top min-w-56">
                          <Input
                            value={row.notes}
                            onChange={(event) =>
                              updateRow(row.id, (current) => ({
                                ...current,
                                notes: event.target.value,
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          <Button
                            disabled={rows.length <= 1}
                            onClick={() => removeRow(row.id)}
                            type="button"
                            variant="danger"
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button onClick={addRow} type="button" variant="secondary">
                Add row
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? "Processing..." : "Submit batch"}
              </Button>
            </div>

            <CheckboxField
              id="batch-notify"
              label="Notify parents for successful payments"
              checked={sendNotifications}
              onChange={(event) => setSendNotifications(event.target.checked)}
            />
          </form>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Batch results</CardTitle>
            <CardDescription>
              Success/failure outcome for each submitted row.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Row</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Student</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Receipt</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {result.results.map((row) => (
                    <tr key={`${row.rowIndex}-${row.studentId}-${row.success ? "ok" : "err"}`}>
                      <td className="px-3 py-2 text-sm text-slate-600">{row.rowIndex + 1}</td>
                      <td className="px-3 py-2 text-sm font-mono text-slate-700">{row.studentId}</td>
                      <td className="px-3 py-2 text-sm">
                        {row.success ? (
                          <Badge variant="success">Success</Badge>
                        ) : (
                          <Badge variant="danger">Failed</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm font-mono text-slate-700">{row.receiptNumber ?? "—"}</td>
                      <td className="px-3 py-2 text-sm text-rose-700">{row.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
