"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getStudentAccountSummary,
  voidBillingPayment,
  type AccountSummaryCharge,
  type AccountSummaryPayment,
  type BillingChargeStatus,
  type PaymentMethod,
  type StudentAccountSummary,
} from "@/lib/api/billing";
import { formatDateLabel } from "@/lib/utils";

// ── Formatting helpers ───────────────────────────────────────────────────────

function formatCurrency(value: string) {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(num);
}

function getStatusVariant(status: BillingChargeStatus) {
  if (status === "PAID") return "success" as const;
  if (status === "PARTIAL") return "warning" as const;
  if (status === "VOID") return "danger" as const;
  if (status === "WAIVED") return "primary" as const;
  return "neutral" as const;
}

function getStatusLabel(status: BillingChargeStatus) {
  const labels: Record<BillingChargeStatus, string> = {
    PENDING: "Pending",
    PARTIAL: "Partial",
    PAID: "Paid",
    WAIVED: "Waived",
    CANCELLED: "Cancelled",
    VOID: "Void",
  };
  return labels[status] ?? status;
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

// ── Charges table ────────────────────────────────────────────────────────────

function ChargesTable({
  charges,
  emptyMessage,
}: {
  charges: AccountSummaryCharge[];
  emptyMessage: string;
}) {
  if (charges.length === 0) {
    return (
      <EmptyState
        title={emptyMessage}
        description="No charges to display."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Title
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Category
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
              Amount
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
              Paid
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
              Balance
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Due Date
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-100">
          {charges.map((charge) => (
            <tr key={charge.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm font-medium text-slate-900">
                {charge.title}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {charge.category?.name ?? "—"}
              </td>
              <td className="px-4 py-3 text-sm text-slate-900 text-right tabular-nums">
                {formatCurrency(charge.amount)}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600 text-right tabular-nums">
                {formatCurrency(charge.amountPaid)}
              </td>
              <td className="px-4 py-3 text-sm font-medium text-slate-900 text-right tabular-nums">
                {formatCurrency(charge.amountDue)}
              </td>
              <td className="px-4 py-3 text-sm">
                <Badge variant={getStatusVariant(charge.status)}>
                  {getStatusLabel(charge.status)}
                </Badge>
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {charge.dueDate
                  ? formatDateLabel(charge.dueDate)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Payments table ───────────────────────────────────────────────────────────

function PaymentsTable({
  payments,
  canManage,
  onVoid,
}: {
  payments: AccountSummaryPayment[];
  canManage: boolean;
  onVoid: (payment: AccountSummaryPayment) => void;
}) {
  if (payments.length === 0) {
    return (
      <EmptyState
        title="No recent payments"
        description="No payments have been recorded yet."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Receipt #
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Date
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
              Amount
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Method
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Reference
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Status
            </th>
            {canManage && (
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-100">
          {payments.map((payment) => (
            <tr key={payment.id} className={payment.isVoided ? "opacity-60 bg-slate-50" : "hover:bg-slate-50"}>
              <td className="px-4 py-3 text-sm font-mono text-slate-900">
                {payment.receiptNumber}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {formatDateLabel(payment.paymentDate)}
              </td>
              <td className="px-4 py-3 text-sm font-medium text-slate-900 text-right tabular-nums">
                {formatCurrency(payment.amount)}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {getMethodLabel(payment.method)}
              </td>
              <td className="px-4 py-3 text-sm text-slate-500 font-mono">
                {payment.referenceNumber ?? "—"}
              </td>
              <td className="px-4 py-3 text-sm">
                {payment.isVoided ? (
                  <Badge variant="danger">Voided</Badge>
                ) : (
                  <Badge variant="success">Active</Badge>
                )}
              </td>
              {canManage && (
                <td className="px-4 py-3 text-right">
                  {!payment.isVoided && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => onVoid(payment)}
                    >
                      Void
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Summary stat card ────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone?: "default" | "danger" | "success";
}) {
  const valueClass =
    tone === "danger"
      ? "text-red-600"
      : tone === "success"
        ? "text-green-600"
        : "text-slate-900";

  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-slate-500 mb-1">{title}</p>
        <p className={`text-2xl font-bold tabular-nums ${valueClass}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);
const readRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);

export function StudentBillingAccount({ studentId }: { studentId: string }) {
  const searchParams = useSearchParams();
  const { session } = useAuth();
  const role = session?.user?.role ?? "";
  const paymentRecorded = searchParams.get("paymentRecorded") === "1";

  const [summary, setSummary] = useState<StudentAccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Void payment state
  const [voidTarget, setVoidTarget] = useState<AccountSummaryPayment | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidSuccessMessage, setVoidSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!readRoles.has(role)) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getStudentAccountSummary(studentId)
      .then((data) => {
        if (!cancelled) {
          setSummary(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load billing account.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [studentId, role, refreshNonce]);

  if (!readRoles.has(role)) {
    return (
      <div className="p-6">
        <Notice tone="danger">You do not have permission to view billing data.</Notice>
      </div>
    );
  }

  const canManage = manageRoles.has(role);

  async function handleConfirmVoidPayment() {
    if (!voidTarget) return;

    const reason = window.prompt(
      "Enter an optional void reason (or leave blank and click OK):",
    );

    if (reason === null) {
      // User cancelled the prompt
      setVoidTarget(null);
      return;
    }

    setIsVoiding(true);
    setVoidError(null);

    try {
      await voidBillingPayment(voidTarget.id, {
        voidReason: reason.trim() || null,
      });
      setVoidSuccessMessage(
        `Payment ${voidTarget.receiptNumber} has been voided and charges updated.`,
      );
      setVoidTarget(null);
      setRefreshNonce((n) => n + 1);
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : "Unable to void payment.");
    } finally {
      setIsVoiding(false);
    }
  }

  const studentName = summary
    ? `${summary.student.firstName} ${summary.student.lastName}`.trim() ||
      summary.student.username
    : "Student";

  const pageActions = (
    <div className="flex items-center gap-2">
      {canManage && (
        <>
          <Link
            href={`/admin/billing/charges/new`}
            className={buttonClassName({ variant: "primary", size: "sm" })}
          >
            Add charge
          </Link>
          <Link
            href={`/admin/billing/payments/new?studentId=${studentId}`}
            className={buttonClassName({ variant: "secondary", size: "sm" })}
          >
            Record payment
          </Link>
        </>
      )}
      <Link
        href="/admin/billing/charges"
        className={buttonClassName({ variant: "secondary", size: "sm" })}
      >
        All charges
      </Link>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader
          title="Student Billing Account"
          description="Loading account details…"
        />
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading billing data…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Student Billing Account" />
        <Notice tone="danger">{error}</Notice>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Student Billing Account" />
        <EmptyState
          title="Billing account unavailable"
          description="No billing account data could be loaded for this student."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={`${studentName} — Billing Account`}
        description={
          summary.student.email
            ? summary.student.email
            : `@${summary.student.username}`
        }
        actions={pageActions}
      />

      {paymentRecorded ? (
        <Notice tone="success">Payment recorded successfully.</Notice>
      ) : null}

      {voidSuccessMessage ? (
        <Notice tone="success">{voidSuccessMessage}</Notice>
      ) : null}

      {/* Summary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Current balance"
          value={formatCurrency(summary.totalOutstanding)}
          tone={parseFloat(summary.totalOutstanding) > 0 ? "danger" : "default"}
        />
        <StatCard
          title="Overdue balance"
          value={formatCurrency(summary.totalOverdue)}
          tone={parseFloat(summary.totalOverdue) > 0 ? "danger" : "default"}
        />
        <StatCard
          title="Total paid"
          value={formatCurrency(summary.totalPaid)}
          tone="success"
        />
      </div>

      {/* Outstanding charges */}
      <Card>
        <CardHeader>
          <CardTitle>Outstanding charges</CardTitle>
          <CardDescription>
            Charges with a remaining balance (excluding voided).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ChargesTable
            charges={summary.outstandingCharges}
            emptyMessage="No outstanding charges"
          />
        </CardContent>
      </Card>

      {/* Overdue charges */}
      {summary.overdueCharges.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Overdue charges</CardTitle>
              <Badge variant="danger">{summary.overdueCharges.length}</Badge>
            </div>
            <CardDescription>
              Outstanding charges past their due date.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ChargesTable
              charges={summary.overdueCharges}
              emptyMessage="No overdue charges"
            />
          </CardContent>
        </Card>
      )}

      {/* Recent payments */}
      <Card>
        <CardHeader>
          <CardTitle>Recent payments</CardTitle>
          <CardDescription>Last 10 payments recorded for this student.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <PaymentsTable
            payments={summary.recentPayments}
            canManage={canManage}
            onVoid={setVoidTarget}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        confirmLabel="Void payment"
        confirmVariant="danger"
        description={`This will reverse payment ${voidTarget?.receiptNumber ?? ""} and recalculate all affected charge balances. This cannot be undone.`}
        errorMessage={voidError}
        isOpen={voidTarget !== null}
        isPending={isVoiding}
        onCancel={() => {
          setVoidTarget(null);
          setVoidError(null);
        }}
        onConfirm={handleConfirmVoidPayment}
        pendingLabel="Voiding..."
        title="Void payment?"
      />
    </div>
  );
}
