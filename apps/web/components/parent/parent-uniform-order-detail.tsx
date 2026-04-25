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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelParentUniformOrder,
  formatUniformMoney,
  formatUniformOrderStatusLabel,
  getUniformOrder,
  listParentUniformItems,
  updateParentUniformOrder,
  type UniformItem,
  type UniformOrderParent,
  type UniformOrderStatus,
} from "@/lib/api/uniform";
import { formatDateTimeLabel } from "@/lib/utils";

type LineState = {
  quantity: string;
  selectedSize: string;
  selectedColor: string;
};

const parentEditableStatuses = new Set<UniformOrderStatus>([
  "PENDING",
  "APPROVED",
]);

function normalizeQuantity(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed));
}

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

export function ParentUniformOrderDetail({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<UniformOrderParent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isLoadingEditData, setIsLoadingEditData] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editableItems, setEditableItems] = useState<UniformItem[]>([]);
  const [lineByItemId, setLineByItemId] = useState<Record<string, LineState>>(
    {},
  );
  const [missingEditableItems, setMissingEditableItems] = useState<string[]>(
    [],
  );

  const isParentMutable = useMemo(() => {
    if (!order) {
      return false;
    }

    return parentEditableStatuses.has(order.status);
  }, [order]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const response = await getUniformOrder(orderId);

        if ("parent" in response) {
          throw new Error("Order detail is unavailable.");
        }

        setOrder(response);
        setEditNotes(response.notes ?? "");
      } catch (loadError) {
        setOrder(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load order.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [orderId]);

  useEffect(() => {
    async function loadEditableCatalog() {
      if (!order || !isParentMutable) {
        setEditableItems([]);
        setLineByItemId({});
        setMissingEditableItems([]);
        setIsEditing(false);
        return;
      }

      setIsLoadingEditData(true);
      setEditError(null);

      try {
        const availableItems = await listParentUniformItems(order.student.id);
        const availableById = new Map(
          availableItems.map((entry) => [entry.id, entry]),
        );

        const nextLines: Record<string, LineState> = {};
        for (const item of availableItems) {
          nextLines[item.id] = {
            quantity: "0",
            selectedSize: "",
            selectedColor: "",
          };
        }

        for (const line of order.items) {
          if (!nextLines[line.uniformItemId]) {
            continue;
          }

          nextLines[line.uniformItemId] = {
            quantity: String(line.quantity),
            selectedSize: line.selectedSize ?? "",
            selectedColor: line.selectedColor ?? "",
          };
        }

        const missingItemNames = order.items
          .filter((line) => !availableById.has(line.uniformItemId))
          .map((line) => line.itemNameSnapshot);

        setEditableItems(availableItems);
        setLineByItemId(nextLines);
        setMissingEditableItems(missingItemNames);
      } catch (loadError) {
        setEditableItems([]);
        setLineByItemId({});
        setMissingEditableItems([]);
        setEditError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load editable order items.",
        );
      } finally {
        setIsLoadingEditData(false);
      }
    }

    void loadEditableCatalog();
  }, [isParentMutable, order]);

  async function handleSaveEdit() {
    if (!order) {
      return;
    }

    if (missingEditableItems.length > 0) {
      setEditError(
        "This order contains unavailable catalog items and cannot be edited online. Contact the school office.",
      );
      return;
    }

    setEditError(null);
    setSuccessMessage(null);

    const lines = editableItems
      .map((item) => {
        const line = lineByItemId[item.id];
        const quantity = normalizeQuantity(line?.quantity ?? "0");

        if (quantity <= 0) {
          return null;
        }

        const selectedSize = line?.selectedSize?.trim() || null;
        const selectedColor = line?.selectedColor?.trim() || null;

        if (item.availableSizes.length > 0 && !selectedSize) {
          throw new Error(`Select a size for ${item.name}.`);
        }

        if (item.availableColors.length > 0 && !selectedColor) {
          throw new Error(`Select a color for ${item.name}.`);
        }

        return {
          uniformItemId: item.id,
          selectedSize,
          selectedColor,
          quantity,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (lines.length === 0) {
      setEditError("Select at least one item quantity greater than zero.");
      return;
    }

    setIsSubmittingEdit(true);

    try {
      const updated = await updateParentUniformOrder(order.id, {
        notes: editNotes.trim() || null,
        items: lines,
      });

      setOrder(updated);
      setIsEditing(false);
      setSuccessMessage("Order updated.");
    } catch (submitError) {
      setEditError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to update order.",
      );
    } finally {
      setIsSubmittingEdit(false);
    }
  }

  async function handleCancelOrder() {
    if (!order) {
      return;
    }

    if (
      !globalThis.confirm(
        "Cancel this order? You will not be able to edit or re-open it afterwards.",
      )
    ) {
      return;
    }

    setError(null);
    setEditError(null);
    setSuccessMessage(null);
    setIsCancelling(true);

    try {
      const updated = await cancelParentUniformOrder(order.id);
      setOrder(updated);
      setIsEditing(false);
      setSuccessMessage("Order cancelled.");
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "Unable to cancel order.",
      );
    } finally {
      setIsCancelling(false);
    }
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
        description="Review order details and current fulfillment status."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/parent/uniform/orders"
            >
              Back to order history
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/parent/uniform"
            >
              Place another order
            </Link>
            {isParentMutable ? (
              <>
                <Button
                  disabled={
                    isLoadingEditData || missingEditableItems.length > 0
                  }
                  onClick={() => setIsEditing((current) => !current)}
                  type="button"
                  variant="secondary"
                >
                  {isEditing ? "Close edit" : "Edit order"}
                </Button>
                <Button
                  disabled={isCancelling}
                  onClick={() => void handleCancelOrder()}
                  type="button"
                  variant="danger"
                >
                  {isCancelling ? "Cancelling..." : "Cancel order"}
                </Button>
              </>
            ) : null}
          </div>
        }
        meta={
          <Badge variant={getStatusVariant(order.status)}>
            {formatUniformOrderStatusLabel(order.status)}
          </Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {editError ? <Notice tone="danger">{editError}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      {!isParentMutable ? (
        <Notice tone="info">
          Editing and cancellation are disabled once an order reaches Preparing.
        </Notice>
      ) : null}

      {isParentMutable && missingEditableItems.length > 0 ? (
        <Notice tone="warning">
          This order contains unavailable catalog items (
          {missingEditableItems.join(", ")}), so online editing is disabled.
          Contact the school office for adjustments.
        </Notice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Order summary</CardTitle>
          <CardDescription>
            Submitted {formatDateTimeLabel(order.createdAt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
          <p>
            <span className="font-medium text-slate-900">School:</span>{" "}
            {order.school.name}
          </p>
          <p>
            <span className="font-medium text-slate-900">Student:</span>{" "}
            {`${order.student.firstName} ${order.student.lastName}`.trim() ||
              order.student.username}
          </p>
          <p>
            <span className="font-medium text-slate-900">Status:</span>{" "}
            {formatUniformOrderStatusLabel(order.status)}
          </p>
          <p>
            <span className="font-medium text-slate-900">Total:</span>{" "}
            {formatUniformMoney(order.totalAmount)}
          </p>
          <p className="md:col-span-2">
            <span className="font-medium text-slate-900">Your notes:</span>{" "}
            {order.notes || "—"}
          </p>
        </CardContent>
      </Card>

      {isEditing ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit order</CardTitle>
            <CardDescription>
              Update quantities/options while status is Pending or Approved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              htmlFor="parent-uniform-edit-notes"
              label="Order notes (optional)"
            >
              <Textarea
                id="parent-uniform-edit-notes"
                onChange={(event) => setEditNotes(event.target.value)}
                rows={3}
                value={editNotes}
              />
            </Field>

            {isLoadingEditData ? (
              <p className="text-sm text-slate-500">
                Loading editable catalog...
              </p>
            ) : editableItems.length === 0 ? (
              <EmptyState
                compact
                title="No editable items"
                description="No active uniform items are currently available for this student."
              />
            ) : (
              <div className="space-y-4">
                {editableItems.map((item) => {
                  const line = lineByItemId[item.id] ?? {
                    quantity: "0",
                    selectedSize: "",
                    selectedColor: "",
                  };

                  return (
                    <div
                      className="rounded-xl border border-slate-200 p-4"
                      key={item.id}
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="text-base font-semibold text-slate-900">
                            {item.name}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {item.category || "Uniform item"}
                          </p>
                          <p className="mt-2 text-sm font-medium text-slate-900">
                            {formatUniformMoney(item.price)}
                          </p>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                          <Field
                            htmlFor={`uniform-edit-item-qty-${item.id}`}
                            label="Quantity"
                          >
                            <Input
                              id={`uniform-edit-item-qty-${item.id}`}
                              inputMode="numeric"
                              min={0}
                              onChange={(event) =>
                                setLineByItemId((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...line,
                                    quantity: event.target.value,
                                  },
                                }))
                              }
                              type="number"
                              value={line.quantity}
                            />
                          </Field>

                          <Field
                            htmlFor={`uniform-edit-item-size-${item.id}`}
                            label="Size"
                          >
                            <Select
                              disabled={item.availableSizes.length === 0}
                              id={`uniform-edit-item-size-${item.id}`}
                              onChange={(event) =>
                                setLineByItemId((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...line,
                                    selectedSize: event.target.value,
                                  },
                                }))
                              }
                              value={line.selectedSize}
                            >
                              <option value="">
                                {item.availableSizes.length
                                  ? "Select size"
                                  : "N/A"}
                              </option>
                              {item.availableSizes.map((size) => (
                                <option key={size} value={size}>
                                  {size}
                                </option>
                              ))}
                            </Select>
                          </Field>

                          <Field
                            htmlFor={`uniform-edit-item-color-${item.id}`}
                            label="Color"
                          >
                            <Select
                              disabled={item.availableColors.length === 0}
                              id={`uniform-edit-item-color-${item.id}`}
                              onChange={(event) =>
                                setLineByItemId((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...line,
                                    selectedColor: event.target.value,
                                  },
                                }))
                              }
                              value={line.selectedColor}
                            >
                              <option value="">
                                {item.availableColors.length
                                  ? "Select color"
                                  : "N/A"}
                              </option>
                              {item.availableColors.map((color) => (
                                <option key={color} value={color}>
                                  {color}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setIsEditing(false)}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                disabled={isSubmittingEdit || isLoadingEditData}
                onClick={() => void handleSaveEdit()}
                type="button"
              >
                {isSubmittingEdit ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
          <CardDescription>{order.items.length} line item(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Item
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Size
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Color
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Unit
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Qty
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700">
                      Line total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {order.items.map((line) => (
                    <tr className="align-top" key={line.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">
                          {line.itemNameSnapshot}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {line.itemSkuSnapshot
                            ? `SKU: ${line.itemSkuSnapshot}`
                            : "No SKU"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {line.selectedSize || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {line.selectedColor || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatUniformMoney(line.unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {line.quantity}
                      </td>
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
    </div>
  );
}
