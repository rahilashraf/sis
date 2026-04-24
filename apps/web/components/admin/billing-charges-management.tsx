"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth/auth-context";
import {
  listBillingCategories,
  listBillingCharges,
  voidBillingCharge,
  type BillingCategory,
  type BillingCharge,
  type BillingChargeStatus,
} from "@/lib/api/billing";
import { listSchools, type School } from "@/lib/api/schools";
import { formatDateLabel } from "@/lib/utils";

const readRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);
const statusOptions: Array<{ value: BillingChargeStatus; label: string }> = [
  { value: "PENDING", label: "Pending" },
  { value: "PARTIAL", label: "Partial" },
  { value: "PAID", label: "Paid" },
  { value: "WAIVED", label: "Waived" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "VOID", label: "Void" },
];

function formatCurrency(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function getStatusLabel(status: BillingChargeStatus) {
  const labels: Record<BillingChargeStatus, string> = {
    PENDING: "Pending",
    PARTIAL: "Partial",
    PAID: "Paid",
    WAIVED: "Waived",
    CANCELLED: "Cancelled",
    VOID: "Void",
  };

  return labels[status] ?? status;
}

function getStudentLabel(charge: BillingCharge) {
  const fullName = `${charge.student.firstName} ${charge.student.lastName}`.trim();

  if (fullName) {
    return fullName;
  }

  return charge.student.username || charge.student.email || charge.student.id;
}

function getStatusVariant(status: BillingChargeStatus) {
  if (status === "PAID") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "warning" as const;
  }

  if (status === "VOID") {
    return "danger" as const;
  }

  if (status === "WAIVED") {
    return "primary" as const;
  }

  return "neutral" as const;
}

export function BillingChargesManagement() {
  const searchParams = useSearchParams();
  const { session } = useAuth();
  const role = session?.user.role;
  const canManage = role ? ["OWNER", "SUPER_ADMIN", "ADMIN"].includes(role) : false;

  const [schools, setSchools] = useState<School[]>([]);
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [charges, setCharges] = useState<BillingCharge[]>([]);

  const [schoolId, setSchoolId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<"" | BillingChargeStatus>("");

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<BillingCharge | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === schoolId) ?? null,
    [schools, schoolId],
  );

  const created = searchParams.get("created") === "1";
  const edited = searchParams.get("edited") === "1";
  const voided = searchParams.get("voided") === "1";
  const paymentRecorded = searchParams.get("paymentRecorded") === "1";

  useEffect(() => {
    async function loadSchools() {
      if (!role || !readRoles.has(role)) {
        return;
      }

      try {
        const schoolResponse = await listSchools({ includeInactive: false });
        setSchools(schoolResponse);
      } catch {
        // Keep filter optional even if schools fail to load.
      }
    }

    void loadSchools();
  }, [role]);

  useEffect(() => {
    async function loadCategories() {
      if (!role || !readRoles.has(role)) {
        return;
      }

      setIsLoadingCategories(true);

      try {
        const categoryResponse = await listBillingCategories({
          schoolId: schoolId || undefined,
        });
        setCategories(categoryResponse);

        if (categoryId && !categoryResponse.some((entry) => entry.id === categoryId)) {
          setCategoryId("");
        }
      } catch {
        setCategories([]);
      } finally {
        setIsLoadingCategories(false);
      }
    }

    void loadCategories();
  }, [categoryId, role, schoolId]);

  useEffect(() => {
    async function loadCharges() {
      if (!role || !readRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await listBillingCharges({
          schoolId: schoolId || undefined,
          studentId: studentId.trim() || undefined,
          categoryId: categoryId || undefined,
          status: status || undefined,
        });
        setCharges(response);
      } catch (loadError) {
        setCharges([]);
        setError(loadError instanceof Error ? loadError.message : "Unable to load charges.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadCharges();
  }, [categoryId, refreshNonce, role, schoolId, status, studentId]);

  async function handleConfirmVoid() {
    if (!voidTarget) {
      return;
    }

    setIsVoiding(true);
    setVoidError(null);
    setError(null);
    setSuccessMessage(null);

    try {
      const promptValue = window.prompt("Optional void reason", "");
      if (promptValue === null) {
        setIsVoiding(false);
        return;
      }

      await voidBillingCharge(voidTarget.id, {
        voidReason: promptValue.trim() || undefined,
      });

      setVoidTarget(null);
      setRefreshNonce((current) => current + 1);
      setSuccessMessage("Charge voided successfully.");
    } catch (voidActionError) {
      setVoidError(
        voidActionError instanceof Error
          ? voidActionError.message
          : "Unable to void charge.",
      );
    } finally {
      setIsVoiding(false);
    }
  }

  if (!role || !readRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, ADMIN, and STAFF roles can view billing charges."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading billing charges...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing Charges"
        description="Review and filter non-tuition charges for student accounts."
        actions={
          canManage ? (
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/admin/billing/charges/new"
            >
              Create charge
            </Link>
          ) : null
        }
        meta={
          <>
            <Badge variant="neutral">{selectedSchool?.name ?? "All schools"}</Badge>
            <Badge variant="neutral">{charges.length} charges</Badge>
          </>
        }
      />

      {created ? <Notice tone="success">Charge created successfully.</Notice> : null}
      {edited ? <Notice tone="success">Charge updated successfully.</Notice> : null}
      {voided ? <Notice tone="success">Charge voided successfully.</Notice> : null}
      {paymentRecorded ? <Notice tone="success">Payment recorded successfully.</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Use filters to narrow charge records.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field htmlFor="billing-charges-school" label="School">
            <Select
              id="billing-charges-school"
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

          <Field
            htmlFor="billing-charges-student-id"
            label="Student ID"
            description="Exact student ID"
          >
            <Input
              id="billing-charges-student-id"
              onChange={(event) => setStudentId(event.target.value)}
              placeholder="Enter student ID"
              value={studentId}
            />
          </Field>

          <Field htmlFor="billing-charges-category" label="Category">
            <Select
              disabled={isLoadingCategories}
              id="billing-charges-category"
              onChange={(event) => setCategoryId(event.target.value)}
              value={categoryId}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="billing-charges-status" label="Status">
            <Select
              id="billing-charges-status"
              onChange={(event) => setStatus(event.target.value as "" | BillingChargeStatus)}
              value={status}
            >
              <option value="">All statuses</option>
              {statusOptions.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Charges</CardTitle>
          <CardDescription>
            Outstanding, partial, paid, and voided charge records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {charges.length === 0 ? (
            <EmptyState
              compact
              title="No charges found"
              description="Try adjusting filters or create a charge from the billing workflow."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">Student</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Category</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Title</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Amount</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Paid</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Balance</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Due date</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Issued date</th>
                      <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {charges.map((charge) => (
                      <tr className="align-top hover:bg-slate-50" key={charge.id}>
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-900">{getStudentLabel(charge)}</p>
                          <p className="mt-1 text-xs text-slate-500">{charge.studentId}</p>
                        </td>
                        <td className="px-4 py-4 text-slate-700">{charge.category.name}</td>
                        <td className="px-4 py-4 text-slate-700">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-900">{charge.title}</p>
                            {charge.libraryFine ? <Badge variant="primary">Library fine</Badge> : null}
                          </div>
                          {charge.schoolYear ? (
                            <p className="mt-1 text-xs text-slate-500">{charge.schoolYear.name}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-slate-700">{formatCurrency(charge.amount)}</td>
                        <td className="px-4 py-4 text-slate-700">{formatCurrency(charge.amountPaid)}</td>
                        <td className="px-4 py-4 text-slate-700">{formatCurrency(charge.amountDue)}</td>
                        <td className="px-4 py-4">
                          <Badge variant={getStatusVariant(charge.status)}>
                            {getStatusLabel(charge.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-slate-700">{formatDateLabel(charge.dueDate)}</td>
                        <td className="px-4 py-4 text-slate-700">{formatDateLabel(charge.issuedAt)}</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              className={buttonClassName({ size: "sm", variant: "secondary" })}
                              href={`/admin/billing/students/${encodeURIComponent(charge.studentId)}`}
                            >
                              Account
                            </Link>
                            {canManage ? (
                              <>
                                <Link
                                  className={buttonClassName({ size: "sm", variant: "ghost" })}
                                  href={`/admin/billing/charges/${encodeURIComponent(charge.id)}/edit`}
                                >
                                  Edit
                                </Link>
                                <Button
                                  disabled={charge.status === "VOID" || isVoiding}
                                  size="sm"
                                  type="button"
                                  variant="danger"
                                  onClick={() => {
                                    setVoidError(null);
                                    setVoidTarget(charge);
                                  }}
                                >
                                  Void
                                </Button>
                                <Link
                                  className={buttonClassName({ size: "sm", variant: "ghost" })}
                                  href={`/admin/billing/payments/new?studentId=${encodeURIComponent(charge.studentId)}`}
                                >
                                  Record payment
                                </Link>
                              </>
                            ) : null}
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

      <ConfirmDialog
        title="Void charge"
        description={
          voidTarget
            ? `Void "${voidTarget.title}" for ${getStudentLabel(voidTarget)}? This action cannot be undone.`
            : "Void this charge?"
        }
        confirmLabel="Void charge"
        pendingLabel="Voiding..."
        confirmVariant="danger"
        isOpen={Boolean(voidTarget)}
        isPending={isVoiding}
        errorMessage={voidError}
        onCancel={() => {
          if (isVoiding) {
            return;
          }

          setVoidTarget(null);
          setVoidError(null);
        }}
        onConfirm={handleConfirmVoid}
      />
    </div>
  );
}
