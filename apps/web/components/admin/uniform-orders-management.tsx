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
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import { listSchools, type School } from "@/lib/api/schools";
import {
  formatUniformMoney,
  formatUniformOrderStatusLabel,
  listUniformOrders,
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

export function UniformOrdersManagement() {
  const { session } = useAuth();
  const role = session?.user.role ?? "";

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [status, setStatus] = useState<"" | UniformOrderStatus>("");

  const [orders, setOrders] = useState<UniformOrderAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          getDefaultSchoolContextId(session?.user) ??
          schoolResponse[0]?.id ??
          "";
        const resolvedSchoolId =
          schoolResponse.find((school) => school.id === defaultSchoolId)?.id ??
          schoolResponse[0]?.id ??
          "";

        setSchoolId(resolvedSchoolId);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load schools.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadInitial();
  }, [role, session?.user]);

  useEffect(() => {
    async function loadOrders() {
      if (!manageRoles.has(role)) {
        return;
      }

      setIsRefreshing(true);
      setError(null);

      try {
        const response = await listUniformOrders({
          schoolId: schoolId || undefined,
          status: status || undefined,
        });
        setOrders(response);
      } catch (loadError) {
        setOrders([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load uniform orders.",
        );
      } finally {
        setIsRefreshing(false);
      }
    }

    void loadOrders();
  }, [role, schoolId, status]);

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
          <p className="text-sm text-slate-500">Loading orders...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Uniform Orders"
        description="Review parent orders and track fulfillment status."
        meta={
          <Badge variant="neutral">
            {selectedSchool?.name ?? "All schools"}
          </Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by school and status.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field htmlFor="uniform-orders-school" label="School">
            <Select
              id="uniform-orders-school"
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

          <Field htmlFor="uniform-orders-status" label="Status">
            <Select
              id="uniform-orders-status"
              onChange={(event) =>
                setStatus(event.target.value as "" | UniformOrderStatus)
              }
              value={status}
            >
              <option value="">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
          <CardDescription>
            {isRefreshing
              ? "Refreshing..."
              : `${orders.length} order${orders.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <EmptyState
              compact
              title="No orders"
              description="No uniform orders found in this scope."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Order
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Student
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Parent
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Status
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Total
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {orders.map((order) => (
                      <tr
                        className="align-top hover:bg-slate-50"
                        key={order.id}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">
                            #{order.id.slice(0, 8)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDateTimeLabel(order.createdAt)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {getPersonLabel(order.student)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {getPersonLabel(order.parent)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={getStatusVariant(order.status)}>
                            {formatUniformOrderStatusLabel(order.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {formatUniformMoney(order.totalAmount)}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            className={buttonClassName({
                              size: "sm",
                              variant: "secondary",
                            })}
                            href={`/admin/uniform/orders/${encodeURIComponent(order.id)}`}
                          >
                            View
                          </Link>
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
