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
import { useAuth } from "@/lib/auth/auth-context";
import {
  listMyParentStudents,
  type ParentStudentLink,
} from "@/lib/api/students";
import {
  createUniformOrder,
  formatUniformMoney,
  listParentUniformItems,
  type UniformItem,
} from "@/lib/api/uniform";

type LineState = {
  quantity: string;
  selectedSize: string;
  selectedColor: string;
};

function normalizeQuantity(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.floor(parsed));
}

function getStudentLabel(link: ParentStudentLink) {
  const fullName = `${link.student.firstName} ${link.student.lastName}`.trim();
  if (fullName) {
    return fullName;
  }

  return link.student.username || link.student.email || link.student.id;
}

export function ParentUniformCatalog() {
  const { session } = useAuth();
  const [links, setLinks] = useState<ParentStudentLink[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [items, setItems] = useState<UniformItem[]>([]);
  const [lineByItemId, setLineByItemId] = useState<Record<string, LineState>>(
    {},
  );
  const [notes, setNotes] = useState("");
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStudents() {
      if (!session?.user.id) {
        return;
      }

      setIsLoadingStudents(true);
      setError(null);

      try {
        const response = await listMyParentStudents();
        setLinks(response);
        setSelectedStudentId(response[0]?.studentId ?? "");
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load linked children.",
        );
      } finally {
        setIsLoadingStudents(false);
      }
    }

    void loadStudents();
  }, [session?.user.id]);

  useEffect(() => {
    async function loadItems() {
      if (!selectedStudentId) {
        setItems([]);
        setLineByItemId({});
        return;
      }

      setIsLoadingItems(true);
      setError(null);

      try {
        const response = await listParentUniformItems(selectedStudentId);
        setItems(response);

        setLineByItemId((current) => {
          const next: Record<string, LineState> = {};

          for (const item of response) {
            const previous = current[item.id];
            next[item.id] = {
              quantity: previous?.quantity ?? "0",
              selectedSize: previous?.selectedSize ?? "",
              selectedColor: previous?.selectedColor ?? "",
            };
          }

          return next;
        });
      } catch (loadError) {
        setItems([]);
        setLineByItemId({});
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load uniform catalog.",
        );
      } finally {
        setIsLoadingItems(false);
      }
    }

    void loadItems();
  }, [selectedStudentId]);

  const selectedLink = useMemo(
    () => links.find((entry) => entry.studentId === selectedStudentId) ?? null,
    [links, selectedStudentId],
  );

  const selectedLineCount = useMemo(() => {
    return items.reduce((count, item) => {
      const line = lineByItemId[item.id];
      if (!line) {
        return count;
      }

      return count + (normalizeQuantity(line.quantity) > 0 ? 1 : 0);
    }, 0);
  }, [items, lineByItemId]);

  async function handleSubmitOrder() {
    if (!selectedStudentId) {
      setError("Select a student before placing an order.");
      return;
    }

    setError(null);
    setCreatedOrderId(null);

    const lines = items
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
      setError("Select at least one item quantity greater than zero.");
      return;
    }

    setIsSubmitting(true);

    try {
      const created = await createUniformOrder({
        studentId: selectedStudentId,
        notes: notes.trim() || null,
        items: lines,
      });

      setCreatedOrderId(created.id);
      setNotes("");
      setLineByItemId((current) => {
        const next: Record<string, LineState> = { ...current };
        for (const item of items) {
          next[item.id] = {
            quantity: "0",
            selectedSize: "",
            selectedColor: "",
          };
        }
        return next;
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to place order.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Uniform Ordering"
        description="Select items for your child and submit a school-scoped order."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/parent/uniform/orders"
            >
              Order history
            </Link>
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/parent"
            >
              Back to parent portal
            </Link>
          </div>
        }
        meta={
          <Badge variant="neutral">{selectedLineCount} selected item(s)</Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {createdOrderId ? (
        <Notice tone="success">
          Order submitted successfully. View details in{" "}
          <Link
            className="underline"
            href={`/parent/uniform/orders/${encodeURIComponent(createdOrderId)}`}
          >
            order #{createdOrderId.slice(0, 8)}
          </Link>
          .
        </Notice>
      ) : null}

      {isLoadingStudents ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading linked children...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoadingStudents && links.length === 0 ? (
        <EmptyState
          title="No linked children"
          description="No student records are linked to this parent account."
        />
      ) : null}

      {!isLoadingStudents && links.length > 0 ? (
        <>
          <Card>
            <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
              <Field htmlFor="parent-uniform-student" label="Student">
                <Select
                  id="parent-uniform-student"
                  onChange={(event) => setSelectedStudentId(event.target.value)}
                  value={selectedStudentId}
                >
                  {links.map((link) => (
                    <option key={link.studentId} value={link.studentId}>
                      {getStudentLabel(link)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                htmlFor="parent-uniform-notes"
                label="Order notes (optional)"
              >
                <Textarea
                  id="parent-uniform-notes"
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Any pickup details or notes for school office"
                  rows={3}
                  value={notes}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Catalog</CardTitle>
              <CardDescription>
                {selectedLink
                  ? `Ordering for ${getStudentLabel(selectedLink)}.`
                  : "Select a student."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingItems ? (
                <p className="text-sm text-slate-500">
                  Loading available items...
                </p>
              ) : items.length === 0 ? (
                <EmptyState
                  compact
                  title="No items available"
                  description="No active uniform items are currently available for this student."
                />
              ) : (
                <div className="space-y-4">
                  {items.map((item) => {
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
                            {item.description ? (
                              <p className="mt-2 text-sm text-slate-600">
                                {item.description}
                              </p>
                            ) : null}
                            <p className="mt-2 text-sm font-medium text-slate-900">
                              {formatUniformMoney(item.price)}
                            </p>
                          </div>

                          <div className="grid gap-3 md:grid-cols-3">
                            <Field
                              htmlFor={`uniform-item-qty-${item.id}`}
                              label="Quantity"
                            >
                              <Input
                                id={`uniform-item-qty-${item.id}`}
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
                              htmlFor={`uniform-item-size-${item.id}`}
                              label="Size"
                            >
                              <Select
                                disabled={item.availableSizes.length === 0}
                                id={`uniform-item-size-${item.id}`}
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
                              htmlFor={`uniform-item-color-${item.id}`}
                              label="Color"
                            >
                              <Select
                                disabled={item.availableColors.length === 0}
                                id={`uniform-item-color-${item.id}`}
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

                  <div className="flex justify-end">
                    <Button
                      disabled={isSubmitting || !selectedStudentId}
                      onClick={() => void handleSubmitOrder()}
                      type="button"
                    >
                      {isSubmitting ? "Submitting..." : "Place order"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
