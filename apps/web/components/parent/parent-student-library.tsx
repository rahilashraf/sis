"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { listParentStudentLibraryLoans, type ParentStudentLibraryLoansResponse } from "@/lib/api/library";
import { formatDateLabel } from "@/lib/utils";

export function ParentStudentLibrary({ studentId }: { studentId: string }) {
  const [data, setData] = useState<ParentStudentLibraryLoansResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await listParentStudentLibraryLoans(studentId);
        setData(response);
      } catch (loadError) {
        setData(null);
        setError(loadError instanceof Error ? loadError.message : "Unable to load library loans.");
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [studentId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Library"
        description="Currently borrowed library books and due dates."
        actions={
          <Link className={buttonClassName({ variant: "secondary" })} href={`/parent/students/${encodeURIComponent(studentId)}`}>
            Back to student profile
          </Link>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Borrowed books</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading borrowed books...</p>
          ) : !data || data.loans.length === 0 ? (
            <EmptyState
              compact
              title="No active library loans"
              description="This student currently has no borrowed library items."
            />
          ) : (
            <div className="space-y-3">
              {data.loans.map((loan) => (
                <div className="rounded-xl border border-slate-200 bg-white p-4" key={loan.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{loan.item.title}</p>
                      <p className="text-xs text-slate-500">{loan.item.author ?? "Unknown author"}</p>
                    </div>
                    <Badge variant={loan.isOverdue ? "danger" : "warning"}>
                      {loan.isOverdue ? `Overdue (${loan.daysOverdue} day${loan.daysOverdue === 1 ? "" : "s"})` : "Checked out"}
                    </Badge>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-900">Checked out:</span> {formatDateLabel(loan.checkoutDate)}
                    </p>
                    <p className={`text-slate-600 ${loan.isOverdue ? "font-semibold text-red-600" : ""}`}>
                      <span className="font-medium text-slate-900">Due:</span> {formatDateLabel(loan.dueDate)}
                    </p>
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-900">Item status:</span> {loan.item.status.replace("_", " ")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
