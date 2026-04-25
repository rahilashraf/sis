"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getStudentStatement,
  getParentStudentStatement,
  type StudentStatement,
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

type StatementViewProps = {
  studentId: string;
  isParent?: boolean;
  schoolId?: string;
};

export function StudentStatementView({
  studentId,
  isParent = false,
  schoolId,
}: StatementViewProps) {
  const { session } = useAuth();
  const [statement, setStatement] = useState<StudentStatement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    let cancelled = false;

    const fetchStatement = isParent
      ? () => getParentStudentStatement(studentId)
      : () => getStudentStatement(studentId, { schoolId });

    fetchStatement()
      .then((data) => {
        if (!cancelled) {
          setStatement(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to load statement",
          );
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [studentId, session, isParent, schoolId]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Account Statement"
          description="Loading statement..."
        />
        <div className="text-center text-sm text-slate-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Account Statement"
          description="Statement not found or access denied"
        />
        <Notice tone="danger">{error}</Notice>
      </div>
    );
  }

  if (!statement) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Account Statement"
          description="Statement not found"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account Statement"
        description={`${statement.student.firstName} ${statement.student.lastName}`}
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

      <div className="mx-auto max-w-4xl space-y-6 rounded-lg border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
        {/* Header */}
        <div className="border-b border-slate-200 pb-6 print:pb-4">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-slate-900">
              ACCOUNT STATEMENT
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Generated{" "}
              {formatDateTimeLabel(statement.generatedAt, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-sm font-semibold text-slate-700">School</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {statement.school?.name || "School"}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Student</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {statement.student.firstName} {statement.student.lastName}
              </p>
              <p className="text-xs text-slate-500">
                {statement.student.username}
              </p>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-600">
              Current Balance
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatCurrency(statement.currentBalance)}
            </p>
          </div>
          <div className="rounded-lg bg-red-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-600">
              Overdue Balance
            </p>
            <p className="mt-2 text-2xl font-bold text-red-600">
              {formatCurrency(statement.overdueBalance)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase text-slate-600">
              Total Charges
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {statement.allCharges.length}
            </p>
          </div>
        </div>

        {/* Charges Section */}
        {statement.allCharges.length > 0 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Charges
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                      Due Date
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                      Paid
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                      Due
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {statement.allCharges.map((charge) => (
                    <tr
                      key={charge.id}
                      className="border-b border-slate-100 hover:bg-slate-50 print:hover:bg-white"
                    >
                      <td className="px-4 py-3 text-slate-900">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{charge.title}</span>
                          {charge.libraryFine ? (
                            <Badge variant="primary">Library fine</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {charge.dueDate
                          ? formatDateTimeLabel(charge.dueDate, {
                              month: "short",
                              day: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {formatCurrency(charge.amount)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {formatCurrency(charge.amountPaid)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {formatCurrency(charge.amountDue)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                            charge.status === "PAID"
                              ? "bg-green-100 text-green-700"
                              : charge.status === "WAIVED"
                                ? "bg-gray-100 text-gray-700"
                                : charge.status === "PARTIAL"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                          }`}
                        >
                          {charge.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payments Section */}
        {statement.allPayments.length > 0 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Recent Payments
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                      Payment Date
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                      Method
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">
                      Reference
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {statement.allPayments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b border-slate-100 hover:bg-slate-50 print:hover:bg-white"
                    >
                      <td className="px-4 py-3 text-slate-900">
                        {formatDateTimeLabel(payment.paymentDate, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {payment.method}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {payment.referenceNumber || "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {formatCurrency(payment.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-200 pt-6 text-center text-xs text-slate-500 print:border-t-0 print:pt-4">
          <p>
            This is an official account statement. Please contact the school for
            any questions.
          </p>
        </div>
      </div>
    </div>
  );
}
