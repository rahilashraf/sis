"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import { listSchools, type School } from "@/lib/api/schools";
import {
  activateUniformItem,
  archiveUniformItem,
  formatUniformMoney,
  listUniformItems,
  type UniformItem,
} from "@/lib/api/uniform";

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);

export function UniformItemsManagement() {
  const { session } = useAuth();
  const role = session?.user.role ?? "";

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [items, setItems] = useState<UniformItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === schoolId) ?? null,
    [schools, schoolId],
  );

  useEffect(() => {
    async function loadInitial() {
      if (!manageRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const schoolResponse = await listSchools({ includeInactive: false });
        setSchools(schoolResponse);

        const defaultSchoolId =
          getDefaultSchoolContextId(session?.user) ?? schoolResponse[0]?.id ?? "";
        const resolvedSchoolId =
          schoolResponse.find((school) => school.id === defaultSchoolId)?.id ??
          schoolResponse[0]?.id ??
          "";

        setSchoolId(resolvedSchoolId);
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
      if (!manageRoles.has(role)) {
        return;
      }

      setIsRefreshing(true);
      setError(null);

      try {
        const response = await listUniformItems({
          schoolId: schoolId || undefined,
          search: search.trim() || undefined,
          includeInactive,
        });
        setItems(response);
      } catch (loadError) {
        setItems([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load uniform items.",
        );
      } finally {
        setIsRefreshing(false);
      }
    }

    void loadItems();
  }, [includeInactive, role, schoolId, search]);

  async function handleToggleActive(item: UniformItem) {
    setError(null);
    setSuccessMessage(null);

    try {
      if (item.isActive) {
        await archiveUniformItem(item.id);
        setSuccessMessage(`Archived “${item.name}”.`);
      } else {
        await activateUniformItem(item.id);
        setSuccessMessage(`Reactivated “${item.name}”.`);
      }

      const refreshed = await listUniformItems({
        schoolId: schoolId || undefined,
        search: search.trim() || undefined,
        includeInactive,
      });
      setItems(refreshed);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update item state.",
      );
    }
  }

  if (!manageRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, ADMIN, and STAFF roles can manage uniform items."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading uniform catalog...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Uniform Items"
        description="Manage school uniform catalog items and availability."
        actions={
          <Link className={buttonClassName({ variant: "primary" })} href="/admin/uniform/items/new">
            Add item
          </Link>
        }
        meta={<Badge variant="neutral">{selectedSchool?.name ?? "All schools"}</Badge>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by school or search item details.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field htmlFor="uniform-items-school" label="School">
            <Select
              id="uniform-items-school"
              onChange={(event) => setSchoolId(event.target.value)}
              value={schoolId}
            >
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="uniform-items-search" label="Search">
            <Input
              id="uniform-items-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, category, SKU"
              value={search}
            />
          </Field>

          <div className="flex items-end">
            <CheckboxField
              checked={includeInactive}
              label="Include inactive"
              onChange={(event) => setIncludeInactive(event.target.checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catalog</CardTitle>
          <CardDescription>
            {isRefreshing ? "Refreshing..." : `${items.length} item${items.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <EmptyState
              compact
              title="No items"
              description="No uniform items match the selected filters."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">Item</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Category</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Price</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Options</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {items.map((item) => (
                      <tr className="align-top hover:bg-slate-50" key={item.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{item.name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.sku ? `SKU: ${item.sku}` : "No SKU"}
                          </p>
                          {item.description ? (
                            <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{item.category || "—"}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {formatUniformMoney(item.price)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p>Sizes: {item.availableSizes.length ? item.availableSizes.join(", ") : "—"}</p>
                          <p className="mt-1">
                            Colors: {item.availableColors.length ? item.availableColors.join(", ") : "—"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={item.isActive ? "success" : "neutral"}>
                            {item.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              className={buttonClassName({ size: "sm", variant: "secondary" })}
                              href={`/admin/uniform/items/${encodeURIComponent(item.id)}/edit`}
                            >
                              Edit
                            </Link>
                            <button
                              className={buttonClassName({ size: "sm", variant: "secondary" })}
                              onClick={() => void handleToggleActive(item)}
                              type="button"
                            >
                              {item.isActive ? "Archive" : "Activate"}
                            </button>
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
