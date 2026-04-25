"use client";

import { useEffect, useState } from "react";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getPaymentReceipt,
  getParentPaymentReceipt,
  type PaymentReceipt,
} from "@/lib/api/billing";
import { formatDateTimeLabel } from "@/lib/utils";

function formatCurrency(value: string | number) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return value;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(num);
}

type PaymentReceiptProps = {
  paymentId: string;
  isParent?: boolean;
};

function formatMethod(method: string): string {
  const labels: Record<string, string> = {
    CASH: "Cash",
    CHEQUE: "Cheque",
    EFT: "EFT",
    E_TRANSFER: "E-Transfer",
    DEBIT_CREDIT: "Debit/Credit Card",
    INTERAC: "E-Transfer",
    ETRANSFER: "E-Transfer",
    BANK_TRANSFER: "EFT",
    CARD_EXTERNAL: "Card",
    CARD: "Card",
    OTHER: "Other",
  };
  return labels[method] ?? method;
}

export function PaymentReceiptView({
  paymentId,
  isParent = false,
}: PaymentReceiptProps) {
  const { session } = useAuth();
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    let cancelled = false;

    const fetchReceipt = isParent ? getParentPaymentReceipt : getPaymentReceipt;

    fetchReceipt(paymentId)
      .then((data) => {
        if (!cancelled) {
          setReceipt(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to load receipt",
          );
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [paymentId, session, isParent]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payment Receipt" description="Loading receipt..." />
        <div className="text-center text-sm text-slate-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Payment Receipt"
          description="Receipt not found or access denied"
        />
        <Notice tone="danger">{error}</Notice>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payment Receipt" description="Receipt not found" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Receipt"
        description={`Receipt for ${receipt.student.firstName} ${receipt.student.lastName}`}
        actions={
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4m16 0a2 2 0 00-2-2h-.5a2 2 0 00-2 2m0 0a2 2 0 00-2-2h-.5a2 2 0 00-2 2m0 0V7a2 2 0 010-4h.5a2 2 0 012 2v11"
              />
            </svg>
            Print
          </button>
        }
      />

      <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
        {/* Header */}
        <div className="border-b border-slate-200 pb-6 print:pb-4">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-slate-900">RECEIPT</h1>
            <p className="mt-1 text-sm text-slate-500">
              Receipt #{receipt.receiptNumber || receipt.id.slice(0, 8)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-sm font-semibold text-slate-700">School</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {receipt.school?.name || "School"}
              </p>
              {receipt.school?.shortName && (
                <p className="text-xs text-slate-500">
                  {receipt.school.shortName}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-700">
                Payment Date
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {formatDateTimeLabel(receipt.paymentDate, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Voided Notice */}
        {receipt.isVoided && (
          <div className="my-6 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800">VOIDED RECEIPT</p>
            <p className="mt-1 text-xs text-red-700">
              Voided on {formatDateTimeLabel(receipt.voidedAt || "", {})}
              {receipt.voidReason && ` — Reason: ${receipt.voidReason}`}
            </p>
          </div>
        )}

        {/* Student Information */}
        <div className="my-6 rounded-lg bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase text-slate-600">
            Received From
          </p>
          <p className="mt-2 text-base font-semibold text-slate-900">
            {receipt.student.firstName} {receipt.student.lastName}
          </p>
          <p className="text-xs text-slate-600">{receipt.student.username}</p>
        </div>

        {/* Payment Details */}
        <div className="my-6 space-y-3">
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <span className="text-sm text-slate-600">Payment Method</span>
            <span className="text-sm font-medium text-slate-900">
              {formatMethod(receipt.method)}
            </span>
          </div>

          {receipt.referenceNumber && (
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-sm text-slate-600">Reference Number</span>
              <span className="text-sm font-medium text-slate-900">
                {receipt.referenceNumber}
              </span>
            </div>
          )}

          {receipt.notes && (
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-sm text-slate-600">Notes</span>
              <span className="text-sm text-slate-600">{receipt.notes}</span>
            </div>
          )}

          {receipt.recordedBy && (
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-sm text-slate-600">Recorded By</span>
              <span className="text-sm font-medium text-slate-900">
                {receipt.recordedBy.firstName} {receipt.recordedBy.lastName}
              </span>
            </div>
          )}
        </div>

        {/* Allocations */}
        {receipt.allocations.length > 0 && (
          <div className="my-6">
            <p className="mb-3 text-sm font-semibold text-slate-900">
              Allocation of Payment
            </p>
            <table className="w-full text-sm">
              <tbody>
                {receipt.allocations.map((allocation) => (
                  <tr key={allocation.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-700">
                      {allocation.charge.title}
                    </td>
                    <td className="py-2 text-right font-medium text-slate-900">
                      {formatCurrency(allocation.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Total */}
        <div className="border-t-2 border-slate-900 pt-4">
          <div className="flex justify-between">
            <span className="text-lg font-semibold text-slate-900">
              Total Paid
            </span>
            <span className="text-lg font-bold text-slate-900">
              {formatCurrency(receipt.amount)}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t border-slate-200 pt-6 text-center text-xs text-slate-500 print:mt-6 print:pt-4">
          <p>This is an official receipt. Please keep for your records.</p>
        </div>
      </div>
    </div>
  );
}
