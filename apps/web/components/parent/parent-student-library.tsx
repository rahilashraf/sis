"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import {
  createParentStudentLibraryHold,
  listParentStudentLibraryCatalog,
  listParentStudentLibraryHolds,
  listParentStudentLibraryLoans,
  type LibraryItem,
  type ParentStudentLibraryHoldsResponse,
  type ParentStudentLibraryLoansResponse,
} from "@/lib/api/library";
import { listMyParentStudents } from "@/lib/api/students";
import { formatDateLabel } from "@/lib/utils";

function canPlaceHold(item: LibraryItem) {
  return item.status === "CHECKED_OUT" || item.availableCopies <= 0;
}

export function ParentStudentLibrary({ studentId }: { studentId: string }) {
  const [loanData, setLoanData] =
    useState<ParentStudentLibraryLoansResponse | null>(null);
  const [holdData, setHoldData] =
    useState<ParentStudentLibraryHoldsResponse | null>(null);
  const [catalogItems, setCatalogItems] = useState<LibraryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittingItemId, setSubmittingItemId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [studentLabel, setStudentLabel] = useState("Child");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const [loansResponse, holdsResponse, catalogResponse, studentLinks] =
          await Promise.all([
            listParentStudentLibraryLoans(studentId),
            listParentStudentLibraryHolds(studentId),
            listParentStudentLibraryCatalog(studentId),
            listMyParentStudents(),
          ]);
        setLoanData(loansResponse);
        setHoldData(holdsResponse);
        setCatalogItems(catalogResponse);
        const selectedLink =
          studentLinks.find((entry) => entry.studentId === studentId) ?? null;
        if (selectedLink) {
          const fullName =
            `${selectedLink.student.firstName} ${selectedLink.student.lastName}`.trim();
          setStudentLabel(fullName || "Child");
        } else {
          setStudentLabel("Child");
        }
      } catch (loadError) {
        setLoanData(null);
        setHoldData(null);
        setCatalogItems([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load library data.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [studentId]);

  const activeHoldItemIds = useMemo(() => {
    return new Set(
      holdData?.holds
        .filter((hold) => hold.status === "ACTIVE")
        .map((hold) => hold.itemId) ?? [],
    );
  }, [holdData?.holds]);

  const filteredCatalogItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return catalogItems;
    }

    return catalogItems.filter((item) =>
      [item.title, item.author, item.isbn, item.barcode, item.category]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [catalogItems, searchQuery]);

  async function handlePlaceHold(item: LibraryItem) {
    setSubmittingItemId(item.id);
    setError(null);
    setSuccessMessage(null);

    try {
      const created = await createParentStudentLibraryHold(studentId, {
        itemId: item.id,
      });

      setHoldData((current) => {
        const existingHolds = current?.holds ?? [];
        return {
          studentId,
          holds: [created, ...existingHolds],
        };
      });
      setSuccessMessage(`Hold placed for ${studentLabel}.`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to place hold.",
      );
    } finally {
      setSubmittingItemId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Library"
        description="Currently borrowed library books and due dates."
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href={`/parent/students/${encodeURIComponent(studentId)}`}
          >
            Back to student profile
          </Link>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Borrowed books</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading borrowed books...</p>
          ) : !loanData || loanData.loans.length === 0 ? (
            <EmptyState
              compact
              title="No active library loans"
              description="This student currently has no borrowed library items."
            />
          ) : (
            <div className="space-y-3">
              {loanData.loans.map((loan) => (
                <div
                  className="rounded-xl border border-slate-200 bg-white p-4"
                  key={loan.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {loan.item.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {loan.item.author ?? "Unknown author"}
                      </p>
                    </div>
                    <Badge variant={loan.isOverdue ? "danger" : "warning"}>
                      {loan.isOverdue
                        ? `Overdue (${loan.daysOverdue} day${loan.daysOverdue === 1 ? "" : "s"})`
                        : "Checked out"}
                    </Badge>
                  </div>

                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-900">
                        Checked out:
                      </span>{" "}
                      {formatDateLabel(loan.checkoutDate)}
                    </p>
                    <p
                      className={`text-slate-600 ${loan.isOverdue ? "font-semibold text-red-600" : ""}`}
                    >
                      <span className="font-medium text-slate-900">Due:</span>{" "}
                      {formatDateLabel(loan.dueDate)}
                    </p>
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-900">
                        Item status:
                      </span>{" "}
                      {loan.item.status.replace("_", " ")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catalogue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field htmlFor="parent-library-search" label="Search catalogue">
            <Input
              id="parent-library-search"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Title, author, ISBN, or category"
              value={searchQuery}
            />
          </Field>

          {isLoading ? (
            <p className="text-sm text-slate-500">Loading catalogue...</p>
          ) : filteredCatalogItems.length === 0 ? (
            <EmptyState
              compact
              title={
                catalogItems.length === 0
                  ? "No catalogue items"
                  : "No matching catalogue items"
              }
              description={
                catalogItems.length === 0
                  ? "No library catalogue items are currently available for this student."
                  : "Try a different search term."
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredCatalogItems.map((item) => {
                const holdAllowed = canPlaceHold(item);
                const hasActiveHold = activeHoldItemIds.has(item.id);

                return (
                  <div
                    className="rounded-xl border border-slate-200 bg-white p-4"
                    key={item.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.author ?? "Unknown author"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.category ?? "Uncategorized"} •{" "}
                          {item.availableCopies}/{item.totalCopies} available
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            item.status === "AVAILABLE" ? "primary" : "warning"
                          }
                        >
                          {item.status.replace("_", " ")}
                        </Badge>
                        {hasActiveHold ? (
                          <Badge variant="neutral">Hold active</Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button
                        disabled={
                          !holdAllowed ||
                          hasActiveHold ||
                          submittingItemId === item.id
                        }
                        onClick={() => void handlePlaceHold(item)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        {submittingItemId === item.id
                          ? "Placing..."
                          : hasActiveHold
                            ? "Already requested"
                            : holdAllowed
                              ? `Place Hold for ${studentLabel}`
                              : "Available now"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hold requests</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading holds...</p>
          ) : !holdData || holdData.holds.length === 0 ? (
            <EmptyState
              compact
              title="No hold requests"
              description="This student has not placed any library hold requests."
            />
          ) : (
            <div className="space-y-3">
              {holdData.holds.map((hold) => (
                <div
                  className="rounded-xl border border-slate-200 bg-white p-4"
                  key={hold.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {hold.item.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {hold.item.author ?? "Unknown author"}
                      </p>
                    </div>
                    <Badge
                      variant={hold.status === "ACTIVE" ? "warning" : "neutral"}
                    >
                      {hold.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-900">
                        Requested:
                      </span>{" "}
                      {formatDateLabel(hold.createdAt)}
                    </p>
                    <p className="text-slate-600">
                      <span className="font-medium text-slate-900">
                        Item status:
                      </span>{" "}
                      {hold.item.status.replace("_", " ")}
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
