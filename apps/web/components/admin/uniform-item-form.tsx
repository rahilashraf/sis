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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import { listSchools, type School } from "@/lib/api/schools";
import {
  createUniformItem,
  getUniformItem,
  updateUniformItem,
  type UniformItem,
} from "@/lib/api/uniform";

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);

type UniformItemFormState = {
  schoolId: string;
  name: string;
  description: string;
  category: string;
  sku: string;
  price: string;
  availableSizesText: string;
  availableColorsText: string;
  sortOrder: string;
  isActive: boolean;
};

const emptyForm: UniformItemFormState = {
  schoolId: "",
  name: "",
  description: "",
  category: "",
  sku: "",
  price: "",
  availableSizesText: "",
  availableColorsText: "",
  sortOrder: "0",
  isActive: true,
};

function normalizeCsv(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function toFormState(item: UniformItem): UniformItemFormState {
  const normalizedPrice =
    typeof item.price === "string" || typeof item.price === "number"
      ? String(item.price)
      : "";

  return {
    schoolId: item.schoolId,
    name: item.name,
    description: item.description ?? "",
    category: item.category ?? "",
    sku: item.sku ?? "",
    price: normalizedPrice,
    availableSizesText: item.availableSizes.join(", "),
    availableColorsText: item.availableColors.join(", "),
    sortOrder: String(item.sortOrder),
    isActive: item.isActive,
  };
}

export function UniformItemForm({ itemId }: { itemId?: string }) {
  const router = useRouter();
  const { session } = useAuth();
  const role = session?.user.role ?? "";

  const [schools, setSchools] = useState<School[]>([]);
  const [item, setItem] = useState<UniformItem | null>(null);
  const [form, setForm] = useState<UniformItemFormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = Boolean(itemId);

  useEffect(() => {
    async function load() {
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

        if (!itemId) {
          setForm((current) => ({
            ...current,
            schoolId:
              schoolResponse.find((school) => school.id === defaultSchoolId)?.id ??
              schoolResponse[0]?.id ??
              "",
          }));
          return;
        }

        const loadedItem = await getUniformItem(itemId);
        setItem(loadedItem);
        setForm(toFormState(loadedItem));
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load item form.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [itemId, role, session?.user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!manageRoles.has(role)) {
      return;
    }

    setError(null);

    if (!form.schoolId) {
      setError("School is required.");
      return;
    }

    if (!form.name.trim()) {
      setError("Item name is required.");
      return;
    }

    if (!/^\d+(\.\d{1,2})?$/.test(form.price.trim())) {
      setError("Price must be a positive number with up to 2 decimals.");
      return;
    }

    const parsedSortOrder = Number(form.sortOrder || "0");
    if (!Number.isInteger(parsedSortOrder) || parsedSortOrder < 0) {
      setError("Sort order must be a whole number 0 or higher.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        sku: form.sku.trim() || null,
        price: form.price.trim(),
        availableSizes: normalizeCsv(form.availableSizesText),
        availableColors: normalizeCsv(form.availableColorsText),
        sortOrder: parsedSortOrder,
        isActive: form.isActive,
      };

      if (isEditMode && itemId) {
        await updateUniformItem(itemId, payload);
        router.push("/admin/uniform/items?updated=1");
      } else {
        await createUniformItem({
          schoolId: form.schoolId,
          ...payload,
        });
        router.push("/admin/uniform/items?created=1");
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save uniform item.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!manageRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, ADMIN, and STAFF roles can manage uniform catalog items."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading form...</p>
        </CardContent>
      </Card>
    );
  }

  if (isEditMode && !item) {
    return (
      <EmptyState
        title="Item unavailable"
        description="The requested uniform item could not be loaded."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditMode ? "Edit Uniform Item" : "Create Uniform Item"}
        description="Keep catalog details simple and school-scoped for parent ordering."
        actions={
          <Link className={buttonClassName({ variant: "secondary" })} href="/admin/uniform/items">
            Back to catalog
          </Link>
        }
        meta={
          <Badge variant="neutral">
            {isEditMode ? item?.school.name ?? "" : schools.find((school) => school.id === form.schoolId)?.name ?? ""}
          </Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Item details</CardTitle>
          <CardDescription>Provide name, pricing, and simple size/color options.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <Field htmlFor="uniform-item-school" label="School">
              <Select
                disabled={isEditMode}
                id="uniform-item-school"
                onChange={(event) =>
                  setForm((current) => ({ ...current, schoolId: event.target.value }))
                }
                value={form.schoolId}
              >
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field htmlFor="uniform-item-name" label="Name">
              <Input
                id="uniform-item-name"
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                value={form.name}
              />
            </Field>

            <Field htmlFor="uniform-item-price" label="Price">
              <Input
                id="uniform-item-price"
                inputMode="decimal"
                onChange={(event) =>
                  setForm((current) => ({ ...current, price: event.target.value }))
                }
                placeholder="0.00"
                required
                value={form.price}
              />
            </Field>

            <Field htmlFor="uniform-item-sort-order" label="Sort order">
              <Input
                id="uniform-item-sort-order"
                inputMode="numeric"
                onChange={(event) =>
                  setForm((current) => ({ ...current, sortOrder: event.target.value }))
                }
                value={form.sortOrder}
              />
            </Field>

            <Field htmlFor="uniform-item-category" label="Category (optional)">
              <Input
                id="uniform-item-category"
                onChange={(event) =>
                  setForm((current) => ({ ...current, category: event.target.value }))
                }
                placeholder="Shirt, Pants, Sweater"
                value={form.category}
              />
            </Field>

            <Field htmlFor="uniform-item-sku" label="SKU / code (optional)">
              <Input
                id="uniform-item-sku"
                onChange={(event) =>
                  setForm((current) => ({ ...current, sku: event.target.value }))
                }
                value={form.sku}
              />
            </Field>

            <Field
              className="md:col-span-2"
              htmlFor="uniform-item-description"
              label="Description (optional)"
            >
              <Textarea
                id="uniform-item-description"
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={3}
                value={form.description}
              />
            </Field>

            <Field
              htmlFor="uniform-item-sizes"
              label="Available sizes (comma-separated)"
            >
              <Input
                id="uniform-item-sizes"
                onChange={(event) =>
                  setForm((current) => ({ ...current, availableSizesText: event.target.value }))
                }
                placeholder="XS, S, M, L"
                value={form.availableSizesText}
              />
            </Field>

            <Field
              htmlFor="uniform-item-colors"
              label="Available colors (comma-separated)"
            >
              <Input
                id="uniform-item-colors"
                onChange={(event) =>
                  setForm((current) => ({ ...current, availableColorsText: event.target.value }))
                }
                placeholder="Black, Navy, White"
                value={form.availableColorsText}
              />
            </Field>

            {isEditMode ? (
              <div className="md:col-span-2">
                <CheckboxField
                  checked={form.isActive}
                  label="Item is active"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, isActive: event.target.checked }))
                  }
                />
              </div>
            ) : null}

            <div className="md:col-span-2 flex justify-end gap-2">
              <Link className={buttonClassName({ variant: "secondary" })} href="/admin/uniform/items">
                Cancel
              </Link>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting
                  ? "Saving..."
                  : isEditMode
                    ? "Save changes"
                    : "Create item"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
