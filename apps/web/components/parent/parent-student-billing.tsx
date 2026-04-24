"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import {
  getParentStudentAccountSummary,
  normalizeBillingMoneyValue,
  type AccountSummaryCharge,
  type AccountSummaryPayment,
  type BillingChargeStatus,
  type PaymentMethod,
  type StudentAccountSummary,
} from "@/lib/api/billing";
import { formatDateLabel } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMoneyNumber(value: unknown) {
  const normalized = normalizeBillingMoneyValue(value);
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function formatCurrency(value: unknown) {
  const num = getMoneyNumber(value);
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

// ── Stat card ────────────────────────────────────────────────────────────────

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
        <p className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ── Charges table ────────────────────────────────────────────────────────────

function OutstandingChargesTable({ charges }: { charges: AccountSummaryCharge[] }) {
  if (charges.length === 0) {
    return (
      <EmptyState
        title="No outstanding charges"
        description="Your child has no outstanding charges at this time."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Description
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
              Due date
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-100">
          {charges.map((charge) => (
            <tr key={charge.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm font-medium text-slate-900">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{charge.title}</span>
                  {charge.libraryFine ? <Badge variant="primary">Library fine</Badge> : null}
                </div>
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
                {charge.dueDate ? formatDateLabel(charge.dueDate) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Payments table ───────────────────────────────────────────────────────────

function PaymentHistoryTable({ payments }: { payments: AccountSummaryPayment[] }) {
  if (payments.length === 0) {
    return (
      <EmptyState
        title="No payment history"
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
              Receipt
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
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-100">
          {payments.map((payment) => (
            <tr key={payment.id} className="hover:bg-slate-50">
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ParentStudentBilling({ studentId }: { studentId: string }) {
  const [summary, setSummary] = useState<StudentAccountSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getParentStudentAccountSummary(studentId)
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to load billing information.");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const studentName = summary
    ? `${summary.student.firstName} ${summary.student.lastName}`.trim() ||
      summary.student.username
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="View your child's outstanding charges and payment history."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/parent"
            >
              Back to my students
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href={`/parent/students/${encodeURIComponent(studentId)}`}
            >
              Student profile
            </Link>
          </div>
        }
        meta={
          studentName ? (
            <Badge variant="neutral">{studentName}</Badge>
          ) : null
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading billing information…</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && summary ? (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              title="Amount due"
              value={formatCurrency(summary.totalOutstanding)}
              tone={getMoneyNumber(summary.totalOutstanding) > 0 ? "danger" : "default"}
            />
            <StatCard
              title="Overdue"
              value={formatCurrency(summary.totalOverdue)}
              tone={getMoneyNumber(summary.totalOverdue) > 0 ? "danger" : "default"}
            />
          </div>

          {/* Outstanding charges */}
          <Card>
            <CardHeader>
              <CardTitle>Outstanding charges</CardTitle>
              <CardDescription>
                Charges with a remaining balance on your child&apos;s account.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <OutstandingChargesTable charges={summary.outstandingCharges} />
            </CardContent>
          </Card>

          {/* Overdue notice */}
          {summary.overdueCharges.length > 0 ? (
            <Notice tone="danger">
              {summary.overdueCharges.length === 1
                ? "1 charge is past its due date."
                : `${summary.overdueCharges.length} charges are past their due date.`}{" "}
              Please contact the school office if you have questions.
            </Notice>
          ) : null}

          {/* Payment history */}
          <Card>
            <CardHeader>
              <CardTitle>Payment history</CardTitle>
              <CardDescription>
                Recent payments recorded against your child&apos;s account.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <PaymentHistoryTable payments={summary.recentPayments} />
            </CardContent>
          </Card>
        </>
      ) : null}

      {!isLoading && !error && !summary ? (
        <EmptyState
          title="Billing information unavailable"
          description="No billing data could be loaded for this student."
        />
      ) : null}
    </div>
  );
}
