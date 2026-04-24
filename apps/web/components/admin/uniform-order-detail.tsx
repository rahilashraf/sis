"use client";

import Link from "next/link";
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
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth/auth-context";
import {
  formatUniformMoney,
  formatUniformOrderStatusLabel,
  getUniformOrder,
  updateUniformOrderStatus,
  type UniformOrderAdmin,
  type UniformOrderStatus,
} from "@/lib/api/uniform";
import { formatDateTimeLabel } from "@/lib/utils";

const manageRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);

const statusOptions: Array<{ label: string; value: UniformOrderStatus }> = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "PREPARING", label: "Preparing" },
  { value: "READY_FOR_PICKUP", label: "Ready for pickup" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

function getStatusVariant(status: UniformOrderStatus) {
  if (status === "COMPLETED") {
    return "success" as const;
  }

  if (status === "PREPARING" || status === "READY_FOR_PICKUP") {
    return "warning" as const;
  }

  if (status === "CANCELLED") {
    return "danger" as const;
  }

  return "neutral" as const;
}

function getPersonLabel(person: {
  firstName: string;
  lastName: string;
  username: string;
  email: string | null;
}) {
  const fullName = `${person.firstName} ${person.lastName}`.trim();
  if (fullName) {
    return fullName;
  }

  return person.email || person.username;
}

export function UniformOrderDetail({ orderId }: { orderId: string }) {
  const { session } = useAuth();
  const role = session?.user.role ?? "";

  const [order, setOrder] = useState<UniformOrderAdmin | null>(null);
  const [status, setStatus] = useState<UniformOrderStatus>("PENDING");
  const [internalNotes, setInternalNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!manageRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const response = await getUniformOrder(orderId);

        if (!("parent" in response)) {
          throw new Error("Order detail is unavailable.");
        }

        setOrder(response);
        setStatus(response.status);
        setInternalNotes(response.internalNotes ?? "");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load order.");
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [orderId, role]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!order) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updated = await updateUniformOrderStatus(order.id, {
        status,
        internalNotes: internalNotes.trim() || null,
      });

      setOrder(updated);
      setStatus(updated.status);
      setInternalNotes(updated.internalNotes ?? "");
      setSuccessMessage("Order status updated.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to update order status.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!manageRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, ADMIN, and STAFF roles can manage uniform orders."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading order...</p>
        </CardContent>
      </Card>
    );
  }

  if (!order) {
    return (
      <EmptyState
        title="Order unavailable"
        description="The requested order could not be loaded."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Order #${order.id.slice(0, 8)}`}
        description="Review order lines and update fulfillment status."
        actions={
          <Link className={buttonClassName({ variant: "secondary" })} href="/admin/uniform/orders">
            Back to orders
          </Link>
        }
        meta={
          <Badge variant={getStatusVariant(order.status)}>
            {formatUniformOrderStatusLabel(order.status)}
          </Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Order summary</CardTitle>
          <CardDescription>Submitted {formatDateTimeLabel(order.createdAt)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
          <p>
            <span className="font-medium text-slate-900">School:</span> {order.school.name}
          </p>
          <p>
            <span className="font-medium text-slate-900">Student:</span> {getPersonLabel(order.student)}
          </p>
          <p>
            <span className="font-medium text-slate-900">Parent:</span> {getPersonLabel(order.parent)}
          </p>
          <p>
            <span className="font-medium text-slate-900">Total:</span> {formatUniformMoney(order.totalAmount)}
          </p>
          <p className="md:col-span-2">
            <span className="font-medium text-slate-900">Parent notes:</span> {order.notes || "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order items</CardTitle>
          <CardDescription>{order.items.length} line item(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700">Item</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Size</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Color</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Unit</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Qty</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {order.items.map((line) => (
                    <tr className="align-top" key={line.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{line.itemNameSnapshot}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {line.itemSkuSnapshot ? `SKU: ${line.itemSkuSnapshot}` : "No SKU"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{line.selectedSize || "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{line.selectedColor || "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{formatUniformMoney(line.unitPrice)}</td>
                      <td className="px-4 py-3 text-slate-700">{line.quantity}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {formatUniformMoney(line.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status workflow</CardTitle>
          <CardDescription>Update fulfillment state and add optional internal notes.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <Field htmlFor="uniform-order-status" label="Status">
              <Select
                id="uniform-order-status"
                onChange={(event) => setStatus(event.target.value as UniformOrderStatus)}
                value={status}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              className="md:col-span-2"
              htmlFor="uniform-order-internal-notes"
              label="Internal notes (optional)"
            >
              <Textarea
                id="uniform-order-internal-notes"
                onChange={(event) => setInternalNotes(event.target.value)}
                rows={4}
                value={internalNotes}
              />
            </Field>

            <div className="md:col-span-2 flex justify-end gap-2">
              <Link className={buttonClassName({ variant: "secondary" })} href="/admin/uniform/orders">
                Cancel
              </Link>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? "Saving..." : "Update status"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
