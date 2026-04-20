"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import {
  getStudentAccountSummary,
  voidBillingPayment,
  type AccountSummaryPayment,
  type PaymentMethod,
} from "@/lib/api/billing";
import { listSchools, type School } from "@/lib/api/schools";
import { listUsers, type ManagedUser } from "@/lib/api/users";
import { formatDateLabel } from "@/lib/utils";

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);
const readRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);

function formatCurrency(value: string) {
  const num = parseFloat(value);
  if (Number.isNaN(num)) return value;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(num);
}

function getMethodLabel(method: PaymentMethod) {
  const labels: Record<PaymentMethod, string> = {
    EFT: "EFT",
    E_TRANSFER: "E-Transfer",
    CASH: "Cash",
    DEBIT_CREDIT: "Debit/Credit",
    CHEQUE: "Cheque",
    INTERAC: "E-Transfer",
    ETRANSFER: "E-Transfer",
    BANK_TRANSFER: "EFT",
    CARD_EXTERNAL: "Debit/Credit",
    CARD: "Debit/Credit",
    OTHER: "EFT",
  };

  return labels[method] ?? method;
}

function getStudentLabel(student: ManagedUser) {
  const fullName = `${student.firstName} ${student.lastName}`.trim();
  return fullName || student.username || student.email || student.id;
}

function userBelongsToSchool(user: ManagedUser, schoolId: string) {
  if (!schoolId) return true;
  if (user.schoolId === schoolId) return true;
  return user.memberships.some((membership) => membership.schoolId === schoolId);
}

export function BillingPaymentsManagement() {
  const { session } = useAuth();
  const role = session?.user.role ?? "";

  const [schools, setSchools] = useState<School[]>([]);
  const [students, setStudents] = useState<ManagedUser[]>([]);

  const [schoolId, setSchoolId] = useState("");
  const [studentId, setStudentId] = useState("");

  const [payments, setPayments] = useState<AccountSummaryPayment[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [voidTarget, setVoidTarget] = useState<AccountSummaryPayment | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filteredStudents = useMemo(
    () => students.filter((student) => userBelongsToSchool(student, schoolId)),
    [students, schoolId],
  );

  const canManage = manageRoles.has(role);

  useEffect(() => {
    async function load() {
      if (!role || !readRoles.has(role)) {
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

        const defaultSchoolId = getDefaultSchoolContextId(session?.user) ?? schoolList[0]?.id ?? "";
        const resolvedSchoolId =
          schoolList.find((school) => school.id === defaultSchoolId)?.id ??
          schoolList[0]?.id ??
          "";

        const defaultStudent = userList.find((student) => userBelongsToSchool(student, resolvedSchoolId));

        setSchoolId(resolvedSchoolId);
        setStudentId(defaultStudent?.id ?? "");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load payments view.");
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [role, session?.user]);

  useEffect(() => {
    if (!schoolId) {
      return;
    }

    if (!filteredStudents.some((student) => student.id === studentId)) {
      setStudentId(filteredStudents[0]?.id ?? "");
    }
  }, [filteredStudents, schoolId, studentId]);

  useEffect(() => {
    async function loadPayments() {
      if (!studentId || !schoolId || !role || !readRoles.has(role)) {
        setPayments([]);
        return;
      }

      setIsLoadingPayments(true);
      setError(null);

      try {
        const summary = await getStudentAccountSummary(studentId, { schoolId });
        setPayments(summary.recentPayments);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load payment records.");
      } finally {
        setIsLoadingPayments(false);
      }
    }

    void loadPayments();
  }, [studentId, schoolId, role, refreshNonce]);

  async function handleConfirmVoid() {
    if (!voidTarget) return;

    const reason = window.prompt(
      "Enter an optional void reason (or leave blank and click OK):",
    );

    if (reason === null) {
      setVoidTarget(null);
      setVoidError(null);
      return;
    }

    setIsVoiding(true);
    setVoidError(null);

    try {
      await voidBillingPayment(voidTarget.id, {
        voidReason: reason.trim() || null,
      });
      setSuccessMessage(`Payment ${voidTarget.receiptNumber} was voided.`);
      setVoidTarget(null);
      setRefreshNonce((value) => value + 1);
    } catch (submitError) {
      setVoidError(submitError instanceof Error ? submitError.message : "Unable to void payment.");
    } finally {
      setIsVoiding(false);
    }
  }

  if (!role || !readRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="You do not have permission to view payment records."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading payments...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="View recent billing payments and reverse entries when required."
        actions={
          <div className="flex items-center gap-2">
            {canManage ? (
              <>
                <Link className={buttonClassName({ size: "sm", variant: "secondary" })} href="/admin/billing/payments/new">
                  Record payment
                </Link>
                <Link className={buttonClassName({ size: "sm", variant: "secondary" })} href="/admin/billing/payments/batch">
                  Batch payments
                </Link>
              </>
            ) : null}
            <Link className={buttonClassName({ size: "sm", variant: "secondary" })} href="/admin/billing/charges">
              Charges
            </Link>
          </div>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Payment records</CardTitle>
          <CardDescription>
            Select school and student to view payment entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <Field htmlFor="payments-school" label="School">
              <Select
                id="payments-school"
                value={schoolId}
                onChange={(event) => {
                  setSchoolId(event.target.value);
                  setSuccessMessage(null);
                }}
              >
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="payments-student" label="Student">
              <Select
                disabled={!schoolId}
                id="payments-student"
                value={studentId}
                onChange={(event) => {
                  setStudentId(event.target.value);
                  setSuccessMessage(null);
                }}
              >
                <option value="">Select student</option>
                {filteredStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {getStudentLabel(student)} ({student.username})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent payments</CardTitle>
          <CardDescription>
            Last 10 payments for the selected student.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingPayments ? (
            <div className="px-6 py-5 text-sm text-slate-500">Loading payment records...</div>
          ) : payments.length === 0 ? (
            <div className="px-6 py-5 text-sm text-slate-500">No payment records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Receipt</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Student</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Payment date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                    {canManage ? (
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {payments.map((payment) => {
                    const student = filteredStudents.find((entry) => entry.id === payment.studentId);
                    const studentDisplay =
                      student ? `${getStudentLabel(student)} (${student.username})` : payment.studentId;

                    return (
                      <tr key={payment.id} className={payment.isVoided ? "bg-slate-50 opacity-70" : "hover:bg-slate-50"}>
                        <td className="px-4 py-3 text-sm font-mono text-slate-900">{payment.receiptNumber}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{studentDisplay}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-slate-900">
                          {formatCurrency(payment.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">{getMethodLabel(payment.method)}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{formatDateLabel(payment.paymentDate)}</td>
                        <td className="px-4 py-3 text-sm">
                          {payment.isVoided ? (
                            <Badge variant="danger">Voided</Badge>
                          ) : (
                            <Badge variant="success">Active</Badge>
                          )}
                        </td>
                        {canManage ? (
                          <td className="px-4 py-3 text-right">
                            <Button
                              disabled={payment.isVoided}
                              onClick={() => {
                                setVoidTarget(payment);
                                setVoidError(null);
                              }}
                              size="sm"
                              variant="danger"
                            >
                              Void
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        confirmLabel="Void payment"
        confirmVariant="danger"
        description="This will reverse all allocations linked to this payment and recalculate charge balances."
        errorMessage={voidError}
        isOpen={voidTarget !== null}
        isPending={isVoiding}
        onCancel={() => {
          setVoidTarget(null);
          setVoidError(null);
        }}
        onConfirm={handleConfirmVoid}
        pendingLabel="Voiding..."
        title={voidTarget ? `Void receipt ${voidTarget.receiptNumber}?` : "Void payment?"}
      />
    </div>
  );
}
