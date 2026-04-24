"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import {
  createLibraryItem,
  listLibraryItems,
  updateLibraryItem,
  type LibraryItem,
  type LibraryItemStatus,
} from "@/lib/api/library";
import { listSchools, type School } from "@/lib/api/schools";

const readRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);

type ItemForm = {
  title: string;
  author: string;
  isbn: string;
  barcode: string;
  category: string;
  totalCopies: string;
};

const emptyForm: ItemForm = {
  title: "",
  author: "",
  isbn: "",
  barcode: "",
  category: "",
  totalCopies: "1",
};

function getStatusVariant(status: LibraryItemStatus): "neutral" | "primary" | "warning" | "danger" {
  if (status === "LOST") {
    return "danger";
  }

  if (status === "ARCHIVED") {
    return "neutral";
  }

  if (status === "CHECKED_OUT") {
    return "warning";
  }

  return "primary";
}

function statusLabel(status: LibraryItemStatus) {
  if (status === "CHECKED_OUT") {
    return "Checked out";
  }

  if (status === "AVAILABLE") {
    return "Available";
  }

  if (status === "ARCHIVED") {
    return "Archived";
  }

  return "Lost";
}

export function LibraryItemsManagement() {
  const { session } = useAuth();
  const role = session?.user.role ?? "";

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [search, setSearch] = useState("");

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [form, setForm] = useState<ItemForm>(emptyForm);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === schoolId) ?? null,
    [schoolId, schools],
  );

  useEffect(() => {
    async function loadInitial() {
      if (!readRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const schoolList = await listSchools({ includeInactive: false });
        setSchools(schoolList);

        const defaultSchoolId = getDefaultSchoolContextId(session?.user) ?? schoolList[0]?.id ?? "";
        const resolved = schoolList.find((school) => school.id === defaultSchoolId)?.id ?? schoolList[0]?.id ?? "";
        setSchoolId(resolved);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load schools.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadInitial();
  }, [role, session?.user]);

  useEffect(() => {
    async function loadItems() {
      if (!readRoles.has(role)) {
        return;
      }

      setIsRefreshing(true);
      setError(null);

      try {
        const response = await listLibraryItems({
          schoolId: schoolId || undefined,
          search: search.trim() || undefined,
        });
        setItems(response);
      } catch (loadError) {
        setItems([]);
        setError(loadError instanceof Error ? loadError.message : "Unable to load library items.");
      } finally {
        setIsRefreshing(false);
      }
    }

    void loadItems();
  }, [role, schoolId, search]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!schoolId) {
      setError("Select a school first.");
      return;
    }

    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }

    const parsedTotal = Number(form.totalCopies);
    if (!Number.isInteger(parsedTotal) || parsedTotal < 1) {
      setError("Total copies must be at least 1.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await createLibraryItem({
        schoolId,
        title: form.title.trim(),
        author: form.author.trim() || undefined,
        isbn: form.isbn.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        category: form.category.trim() || undefined,
        totalCopies: parsedTotal,
      });

      setForm(emptyForm);
      setSuccessMessage("Library item created.");

      const refreshed = await listLibraryItems({ schoolId, search: search.trim() || undefined });
      setItems(refreshed);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create library item.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleQuickArchive(item: LibraryItem) {
    setError(null);
    setSuccessMessage(null);

    try {
      await updateLibraryItem(item.id, { status: "ARCHIVED" });
      setSuccessMessage(`Archived “${item.title}”.`);
      const refreshed = await listLibraryItems({ schoolId: schoolId || undefined, search: search.trim() || undefined });
      setItems(refreshed);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Unable to archive item.");
    }
  }

  if (!readRoles.has(role)) {
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
          <p className="text-sm text-slate-500">Loading library items...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Library Items"
        description="Manage library books and inventory availability."
        meta={<Badge variant="neutral">{selectedSchool?.name ?? "All schools"}</Badge>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Add item</CardTitle>
          <CardDescription>Create a new library item with copy counts.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={handleCreate}>
            <Field htmlFor="library-items-school" label="School">
              <Select id="library-items-school" value={schoolId} onChange={(event) => setSchoolId(event.target.value)}>
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="library-items-title" label="Title">
              <Input
                id="library-items-title"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              />
            </Field>

            <Field htmlFor="library-items-author" label="Author">
              <Input
                id="library-items-author"
                value={form.author}
                onChange={(event) => setForm((current) => ({ ...current, author: event.target.value }))}
              />
            </Field>

            <Field htmlFor="library-items-isbn" label="ISBN">
              <Input
                id="library-items-isbn"
                value={form.isbn}
                onChange={(event) => setForm((current) => ({ ...current, isbn: event.target.value }))}
              />
            </Field>

            <Field htmlFor="library-items-barcode" label="Barcode">
              <Input
                id="library-items-barcode"
                value={form.barcode}
                onChange={(event) => setForm((current) => ({ ...current, barcode: event.target.value }))}
              />
            </Field>

            <Field htmlFor="library-items-category" label="Category">
              <Input
                id="library-items-category"
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              />
            </Field>

            <Field htmlFor="library-items-total" label="Total copies">
              <Input
                id="library-items-total"
                min={1}
                step={1}
                type="number"
                value={form.totalCopies}
                onChange={(event) => setForm((current) => ({ ...current, totalCopies: event.target.value }))}
              />
            </Field>

            <div className="md:col-span-2 flex items-end justify-end">
              <Button disabled={isSaving} type="submit">
                {isSaving ? "Saving..." : "Add item"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>Availability and item status by school.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field htmlFor="library-items-search" label="Search">
            <Input
              id="library-items-search"
              placeholder="Title, author, ISBN, barcode"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>

          {isRefreshing ? (
            <p className="text-sm text-slate-500">Loading items...</p>
          ) : items.length === 0 ? (
            <EmptyState
              compact
              title="No items found"
              description="Try another filter or add your first library item."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">Title</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Category</th>
                      <th className="px-4 py-3 font-semibold text-right text-slate-700">Available</th>
                      <th className="px-4 py-3 font-semibold text-right text-slate-700">Total</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {items.map((item) => (
                      <tr key={item.id} className="align-top hover:bg-slate-50">
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-900">{item.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.author ?? "Unknown author"}
                            {item.isbn ? ` • ISBN ${item.isbn}` : ""}
                          </p>
                          {item.barcode ? <p className="mt-1 text-xs text-slate-500">Barcode: {item.barcode}</p> : null}
                        </td>
                        <td className="px-4 py-4 text-slate-700">{item.category ?? "—"}</td>
                        <td className="px-4 py-4 text-right tabular-nums font-semibold text-slate-900">{item.availableCopies}</td>
                        <td className="px-4 py-4 text-right tabular-nums text-slate-700">{item.totalCopies}</td>
                        <td className="px-4 py-4">
                          <Badge variant={getStatusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              className={buttonClassName({ size: "sm", variant: "secondary" })}
                              href={`/admin/library/items/${encodeURIComponent(item.id)}/edit`}
                            >
                              Edit
                            </Link>
                            {item.status !== "ARCHIVED" ? (
                              <Button size="sm" variant="secondary" onClick={() => void handleQuickArchive(item)}>
                                Archive
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-500">Archived</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
