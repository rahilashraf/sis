"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
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
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getLibraryItem,
  listLibraryHolds,
  listLibraryLoans,
  updateLibraryItem,
  type LibraryItem,
  type LibraryItemStatus,
} from "@/lib/api/library";

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);

type LibraryItemFormState = {
  title: string;
  author: string;
  isbn: string;
  barcode: string;
  category: string;
  totalCopies: string;
  status: LibraryItemStatus;
};

function toFormState(item: LibraryItem): LibraryItemFormState {
  return {
    title: item.title,
    author: item.author ?? "",
    isbn: item.isbn ?? "",
    barcode: item.barcode ?? "",
    category: item.category ?? "",
    totalCopies: String(item.totalCopies),
    status: item.status,
  };
}

function statusLabel(status: LibraryItemStatus) {
  if (status === "AVAILABLE") {
    return "Available";
  }

  if (status === "CHECKED_OUT") {
    return "Checked out";
  }

  if (status === "ARCHIVED") {
    return "Archived";
  }

  return "Lost";
}

export function LibraryItemForm({ itemId }: { itemId: string }) {
  const router = useRouter();
  const { session } = useAuth();
  const role = session?.user.role ?? "";

  const [item, setItem] = useState<LibraryItem | null>(null);
  const [form, setForm] = useState<LibraryItemFormState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeLoanCount, setActiveLoanCount] = useState(0);
  const [activeHoldCount, setActiveHoldCount] = useState(0);
  const [confirmOverrideConflict, setConfirmOverrideConflict] = useState(false);

  useEffect(() => {
    async function loadItem() {
      if (!manageRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const [response, activeLoans, activeHolds] = await Promise.all([
          getLibraryItem(itemId),
          listLibraryLoans({ itemId, activeOnly: true }),
          listLibraryHolds({ itemId, status: "ACTIVE" }),
        ]);
        setItem(response);
        setForm(toFormState(response));
        setActiveLoanCount(activeLoans.length);
        setActiveHoldCount(activeHolds.length);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load library item.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadItem();
  }, [itemId, role]);

  const parsedTotalCopies = Number(form?.totalCopies ?? "0");
  const isValidTotalCopies =
    Number.isInteger(parsedTotalCopies) && parsedTotalCopies > 0;
  const copyCountConflict =
    isValidTotalCopies && parsedTotalCopies < activeLoanCount;
  const statusConflict = Boolean(
    form &&
    ((form.status === "AVAILABLE" && activeLoanCount > 0) ||
      (form.status === "CHECKED_OUT" && activeLoanCount === 0) ||
      ((form.status === "LOST" || form.status === "ARCHIVED") &&
        (activeLoanCount > 0 || activeHoldCount > 0))),
  );

  useEffect(() => {
    setConfirmOverrideConflict(false);
  }, [statusConflict, copyCountConflict, form?.status, form?.totalCopies]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!item || !form) {
      return;
    }

    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }

    if (!isValidTotalCopies) {
      setError("Total copies must be a positive whole number.");
      return;
    }

    if (copyCountConflict) {
      setError(
        `Total copies cannot be less than active checkouts (${activeLoanCount}).`,
      );
      return;
    }

    if (statusConflict && !confirmOverrideConflict) {
      setError("Please confirm the status override conflict before saving.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await updateLibraryItem(item.id, {
        title: form.title.trim(),
        author: form.author.trim() || null,
        isbn: form.isbn.trim() || null,
        barcode: form.barcode.trim() || null,
        category: form.category.trim() || null,
        totalCopies: parsedTotalCopies,
        status: form.status,
      });

      const [refreshedItem, activeLoans, activeHolds] = await Promise.all([
        getLibraryItem(item.id),
        listLibraryLoans({ itemId: item.id, activeOnly: true }),
        listLibraryHolds({ itemId: item.id, status: "ACTIVE" }),
      ]);

      setItem(refreshedItem);
      setForm(toFormState(refreshedItem));
      setActiveLoanCount(activeLoans.length);
      setActiveHoldCount(activeHolds.length);
      setSuccessMessage("Library item overrides saved.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to update library item.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!manageRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, ADMIN, and STAFF roles can manage library items."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading item...</p>
        </CardContent>
      </Card>
    );
  }

  if (!item || !form) {
    return (
      <EmptyState
        title="Item unavailable"
        description="The requested library item could not be loaded."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Library Item"
        description="Update item metadata, status overrides, and copy counts while preserving history."
        actions={
          <div className="flex gap-2">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/admin/library/items"
            >
              Back to items
            </Link>
            <Button
              onClick={() => router.push("/admin/library/items?updated=1")}
              type="button"
              variant="secondary"
            >
              Done
            </Button>
          </div>
        }
        meta={<Badge variant="neutral">{item.school.name}</Badge>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      {copyCountConflict ? (
        <Notice tone="warning" title="Copy count conflict">
          This item currently has {activeLoanCount} active checkout(s). Total
          copies cannot be set below that count.
        </Notice>
      ) : null}

      {statusConflict ? (
        <Notice tone="warning" title="Status override conflict">
          The selected status may conflict with active records (
          {activeLoanCount} active checkout(s), {activeHoldCount} active
          hold(s)). Confirm below to continue.
        </Notice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Item details</CardTitle>
          <CardDescription>
            Adjust metadata and apply manual status/copy overrides when needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <Field htmlFor="library-item-title" label="Title">
              <Input
                id="library-item-title"
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, title: event.target.value }
                      : current,
                  )
                }
                value={form.title}
              />
            </Field>

            <Field htmlFor="library-item-author" label="Author">
              <Input
                id="library-item-author"
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, author: event.target.value }
                      : current,
                  )
                }
                value={form.author}
              />
            </Field>

            <Field htmlFor="library-item-isbn" label="ISBN">
              <Input
                id="library-item-isbn"
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, isbn: event.target.value }
                      : current,
                  )
                }
                value={form.isbn}
              />
            </Field>

            <Field htmlFor="library-item-barcode" label="Barcode">
              <Input
                id="library-item-barcode"
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, barcode: event.target.value }
                      : current,
                  )
                }
                value={form.barcode}
              />
            </Field>

            <Field htmlFor="library-item-category" label="Category">
              <Input
                id="library-item-category"
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, category: event.target.value }
                      : current,
                  )
                }
                value={form.category}
              />
            </Field>

            <Field htmlFor="library-item-status" label="Item status override">
              <Select
                id="library-item-status"
                value={form.status}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          status: event.target.value as LibraryItemStatus,
                        }
                      : current,
                  )
                }
              >
                <option value="AVAILABLE">Available</option>
                <option value="CHECKED_OUT">Checked out</option>
                <option value="LOST">Lost</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </Field>

            <Field htmlFor="library-item-total-copies" label="Total copies">
              <Input
                id="library-item-total-copies"
                min={1}
                step={1}
                type="number"
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, totalCopies: event.target.value }
                      : current,
                  )
                }
                value={form.totalCopies}
              />
            </Field>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>
                Copies: {item.availableCopies} available / {item.totalCopies}{" "}
                total
              </p>
              <p>Status: {statusLabel(item.status)}</p>
              <p>Active checkouts: {activeLoanCount}</p>
              <p>Active holds: {activeHoldCount}</p>
            </div>

            <div className="md:col-span-2">
              <CheckboxField
                checked={confirmOverrideConflict}
                label="I understand and want to apply this override despite active record conflicts"
                disabled={!statusConflict}
                onChange={(event) =>
                  setConfirmOverrideConflict(event.target.checked)
                }
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-2">
              <Link
                className={buttonClassName({ variant: "secondary" })}
                href="/admin/library/items"
              >
                Cancel
              </Link>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
