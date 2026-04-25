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
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import {
  createStudentLibraryHold,
  listMyStudentLibraryHolds,
  listStudentLibraryCatalog,
  type LibraryHold,
  type LibraryItem,
} from "@/lib/api/library";
import { formatDateLabel } from "@/lib/utils";

function canPlaceHold(item: LibraryItem) {
  return item.status === "CHECKED_OUT" || item.availableCopies <= 0;
}

export function StudentLibraryCatalog() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [holds, setHolds] = useState<LibraryHold[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [submittingItemId, setSubmittingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const [catalogResponse, holdsResponse] = await Promise.all([
          listStudentLibraryCatalog(),
          listMyStudentLibraryHolds(),
        ]);

        setItems(catalogResponse);
        setHolds(holdsResponse);
      } catch (loadError) {
        setItems([]);
        setHolds([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load library catalogue.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, []);

  const activeHoldItemIds = useMemo(
    () =>
      new Set(
        holds
          .filter((hold) => hold.status === "ACTIVE")
          .map((hold) => hold.itemId),
      ),
    [holds],
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) =>
      [item.title, item.author, item.isbn, item.barcode, item.category]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [items, searchQuery]);

  async function handlePlaceHold(item: LibraryItem) {
    setSubmittingItemId(item.id);
    setError(null);
    setSuccessMessage(null);

    try {
      const created = await createStudentLibraryHold({ itemId: item.id });
      setHolds((current) => [created, ...current]);
      setSuccessMessage(`Hold placed for “${item.title}”.`);
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
        description="Browse library catalogue items and place hold requests when items are unavailable."
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/student"
          >
            Back to dashboard
          </Link>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Catalogue</CardTitle>
          <CardDescription>
            Place a hold when an item has no available copies.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field htmlFor="student-library-search" label="Search">
            <Input
              id="student-library-search"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Title, author, ISBN, or category"
              value={searchQuery}
            />
          </Field>

          {isLoading ? (
            <p className="text-sm text-slate-500">Loading catalogue...</p>
          ) : filteredItems.length === 0 ? (
            <EmptyState
              compact
              title={
                items.length === 0
                  ? "No catalogue items"
                  : "No matching catalogue items"
              }
              description={
                items.length === 0
                  ? "No library items are currently available for your school access."
                  : "Try a different search term."
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item) => {
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
                        variant="secondary"
                        type="button"
                      >
                        {submittingItemId === item.id
                          ? "Placing..."
                          : hasActiveHold
                            ? "Already requested"
                            : holdAllowed
                              ? "Place hold"
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
          <CardTitle>My Holds</CardTitle>
          <CardDescription>Track your hold request status.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading holds...</p>
          ) : holds.length === 0 ? (
            <EmptyState
              compact
              title="No hold requests"
              description="You do not have any library hold requests yet."
            />
          ) : (
            <div className="space-y-3">
              {holds.map((hold) => (
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
                        Requested {formatDateLabel(hold.createdAt)}
                      </p>
                    </div>
                    <Badge
                      variant={hold.status === "ACTIVE" ? "warning" : "neutral"}
                    >
                      {hold.status.replace("_", " ")}
                    </Badge>
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
