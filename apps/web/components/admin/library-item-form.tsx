"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getLibraryItem,
  updateLibraryItem,
  type LibraryItem,
} from "@/lib/api/library";

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);

type LibraryItemFormState = {
  title: string;
  author: string;
  isbn: string;
  barcode: string;
  category: string;
  isArchived: boolean;
};

function toFormState(item: LibraryItem): LibraryItemFormState {
  return {
    title: item.title,
    author: item.author ?? "",
    isbn: item.isbn ?? "",
    barcode: item.barcode ?? "",
    category: item.category ?? "",
    isArchived: item.status === "ARCHIVED",
  };
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

  useEffect(() => {
    async function loadItem() {
      if (!manageRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await getLibraryItem(itemId);
        setItem(response);
        setForm(toFormState(response));
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load library item.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadItem();
  }, [itemId, role]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!item || !form) {
      return;
    }

    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const nextStatus = form.isArchived
        ? "ARCHIVED"
        : item.status === "ARCHIVED"
          ? "AVAILABLE"
          : item.status;

      await updateLibraryItem(item.id, {
        title: form.title.trim(),
        author: form.author.trim() || null,
        isbn: form.isbn.trim() || null,
        barcode: form.barcode.trim() || null,
        category: form.category.trim() || null,
        status: nextStatus,
      });

      router.push("/admin/library/items?updated=1");
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
        description="Update basic library metadata while preserving school scope and loan history."
        actions={
          <Link className={buttonClassName({ variant: "secondary" })} href="/admin/library/items">
            Back to items
          </Link>
        }
        meta={<Badge variant="neutral">{item.school.name}</Badge>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Item details</CardTitle>
          <CardDescription>Edit safe metadata fields for this item.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <Field htmlFor="library-item-title" label="Title">
              <Input
                id="library-item-title"
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, title: event.target.value } : current,
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
                    current ? { ...current, author: event.target.value } : current,
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
                    current ? { ...current, isbn: event.target.value } : current,
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
                    current ? { ...current, barcode: event.target.value } : current,
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
                    current ? { ...current, category: event.target.value } : current,
                  )
                }
                value={form.category}
              />
            </Field>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>
                Copies: {item.availableCopies} available / {item.totalCopies} total
              </p>
              <p>Status: {item.status.replace("_", " ")}</p>
            </div>

            <div className="md:col-span-2">
              <CheckboxField
                checked={form.isArchived}
                label="Archive this item (inactive)"
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, isArchived: event.target.checked } : current,
                  )
                }
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-2">
              <Link className={buttonClassName({ variant: "secondary" })} href="/admin/library/items">
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
