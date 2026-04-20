"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getBillingCharge,
  listBillingCategories,
  updateBillingCharge,
  type BillingCategory,
  type BillingCharge,
  type UpdateBillingChargeInput,
} from "@/lib/api/billing";
import { normalizeDateOnlyPayload } from "@/lib/date";

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN"]);

type EditChargeFormState = {
  categoryId: string;
  title: string;
  description: string;
  amount: string;
  dueDate: string;
};

type FieldErrors = Partial<Record<keyof EditChargeFormState, string>>;

function buildForm(charge: BillingCharge): EditChargeFormState {
  return {
    categoryId: charge.categoryId,
    title: charge.title,
    description: charge.description ?? "",
    amount: charge.amount,
    dueDate: normalizeDateOnlyPayload(charge.dueDate),
  };
}

function validate(form: EditChargeFormState): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.categoryId) {
    errors.categoryId = "Category is required.";
  }

  if (!form.title.trim()) {
    errors.title = "Title is required.";
  }

  if (!form.amount.trim()) {
    errors.amount = "Amount is required.";
  } else if (!/^\d+(\.\d{1,2})?$/.test(form.amount.trim())) {
    errors.amount = "Amount must be a positive number with up to 2 decimals.";
  }

  return errors;
}

export function BillingChargeEditForm({ chargeId }: { chargeId: string }) {
  const router = useRouter();
  const { session } = useAuth();
  const role = session?.user.role;

  const [charge, setCharge] = useState<BillingCharge | null>(null);
  const [form, setForm] = useState<EditChargeFormState | null>(null);
  const [categories, setCategories] = useState<BillingCategory[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const hasPayments = useMemo(() => {
    if (!charge) {
      return false;
    }

    return Number(charge.amountPaid) > 0;
  }, [charge]);

  // Statuses where the backend will reject any edits
  const isFullyLocked = useMemo(() => {
    if (!charge) {
      return false;
    }

    return (
      charge.status === "PAID" ||
      charge.status === "VOID" ||
      charge.status === "WAIVED" ||
      charge.status === "CANCELLED"
    );
  }, [charge]);

  useEffect(() => {
    async function load() {
      if (!role || !manageRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const loadedCharge = await getBillingCharge(chargeId);
        setCharge(loadedCharge);
        setForm(buildForm(loadedCharge));

        const categoryResponse = await listBillingCategories({
          schoolId: loadedCharge.schoolId,
          includeInactive: true,
        });
        setCategories(categoryResponse);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load charge.");
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [chargeId, role]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form || !charge || !role || !manageRoles.has(role) || isFullyLocked) {
      return;
    }

    const nextErrors = validate(form);

    if (hasPayments) {
      delete nextErrors.amount;
    }

    setFieldErrors(nextErrors);
    setError(null);

    if (Object.keys(nextErrors).length > 0) {
      setError("Please correct the highlighted fields and try again.");
      return;
    }

    const payload: UpdateBillingChargeInput = {};

    if (form.categoryId !== charge.categoryId) {
      payload.categoryId = form.categoryId;
    }

    if (form.title.trim() !== charge.title) {
      payload.title = form.title.trim();
    }

    if ((form.description.trim() || null) !== (charge.description ?? null)) {
      payload.description = form.description.trim() || null;
    }

    const normalizedDueDate = form.dueDate || null;
    const originalDueDate = normalizeDateOnlyPayload(charge.dueDate) || null;
    if (normalizedDueDate !== originalDueDate) {
      payload.dueDate = normalizedDueDate;
    }

    if (!hasPayments && form.amount.trim() !== charge.amount) {
      payload.amount = form.amount.trim();
    }

    if (Object.keys(payload).length === 0) {
      router.push("/admin/billing/charges");
      return;
    }

    setIsSubmitting(true);

    try {
      await updateBillingCharge(charge.id, payload);
      router.push("/admin/billing/charges?edited=1");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update charge.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function fieldClassName(field: keyof EditChargeFormState) {
    return fieldErrors[field]
      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/15"
      : undefined;
  }

  if (!role || !manageRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, and ADMIN roles can edit charges."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading charge...</p>
        </CardContent>
      </Card>
    );
  }

  if (!charge || !form) {
    return (
      <EmptyState
        title="Charge unavailable"
        description="The requested charge could not be loaded."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Billing Charge"
        description="Update category, title, description, due date, or amount."
        actions={
          <Link className={buttonClassName({ variant: "secondary" })} href="/admin/billing/charges">
            Back to charges
          </Link>
        }
        meta={<Badge variant="neutral">{charge.id.slice(0, 8)}</Badge>}
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {isFullyLocked ? (
        <Notice tone="warning">
          <strong>Fully paid charges cannot be edited.</strong> Reverse payments
          first if changes are required.
        </Notice>
      ) : hasPayments ? (
        <Notice tone="info">
          This charge has recorded payments. Amount cannot be changed.
        </Notice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Charge details</CardTitle>
          <CardDescription>Update fields and save changes.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <Field htmlFor="edit-charge-category" label="Category">
              <Select
                className={fieldClassName("categoryId")}
                disabled={isFullyLocked}
                id="edit-charge-category"
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, categoryId: event.target.value } : current,
                  )
                }
                value={form.categoryId}
              >
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              {fieldErrors.categoryId ? (
                <p className="mt-1 text-xs text-rose-600">{fieldErrors.categoryId}</p>
              ) : null}
            </Field>

            <Field htmlFor="edit-charge-title" label="Title">
              <Input
                className={fieldClassName("title")}
                disabled={isFullyLocked}
                id="edit-charge-title"
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, title: event.target.value } : current,
                  )
                }
                value={form.title}
              />
              {fieldErrors.title ? (
                <p className="mt-1 text-xs text-rose-600">{fieldErrors.title}</p>
              ) : null}
            </Field>

            <Field htmlFor="edit-charge-amount" label="Amount">
              <Input
                className={fieldClassName("amount")}
                disabled={isFullyLocked || hasPayments}
                id="edit-charge-amount"
                inputMode="decimal"
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, amount: event.target.value } : current,
                  )
                }
                value={form.amount}
              />
              {fieldErrors.amount ? (
                <p className="mt-1 text-xs text-rose-600">{fieldErrors.amount}</p>
              ) : null}
            </Field>

            <Field htmlFor="edit-charge-due-date" label="Due date (optional)">
              <Input
                disabled={isFullyLocked}
                id="edit-charge-due-date"
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, dueDate: event.target.value } : current,
                  )
                }
                type="date"
                value={form.dueDate}
              />
            </Field>

            <Field className="md:col-span-2" htmlFor="edit-charge-description" label="Description (optional)">
              <Input
                disabled={isFullyLocked}
                id="edit-charge-description"
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, description: event.target.value } : current,
                  )
                }
                value={form.description}
              />
            </Field>

            <div className="md:col-span-2 flex justify-end gap-2">
              <Link className={buttonClassName({ variant: "secondary" })} href="/admin/billing/charges">
                Cancel
              </Link>
              <Button disabled={isSubmitting || isFullyLocked} type="submit">
                {isSubmitting ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
