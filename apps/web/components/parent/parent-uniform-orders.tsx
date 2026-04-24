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
import { listMyParentStudents, type ParentStudentLink } from "@/lib/api/students";
import {
  formatUniformMoney,
  formatUniformOrderStatusLabel,
  listParentUniformOrders,
  type UniformOrderParent,
  type UniformOrderStatus,
} from "@/lib/api/uniform";
import { formatDateTimeLabel } from "@/lib/utils";

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

function getStudentLabel(link: ParentStudentLink) {
  const fullName = `${link.student.firstName} ${link.student.lastName}`.trim();
  if (fullName) {
    return fullName;
  }

  return link.student.username || link.student.email || link.student.id;
}

export function ParentUniformOrders() {
  const { session } = useAuth();

  const [links, setLinks] = useState<ParentStudentLink[]>([]);
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState<"" | UniformOrderStatus>("");

  const [orders, setOrders] = useState<UniformOrderParent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStudent = useMemo(
    () => links.find((entry) => entry.studentId === studentId) ?? null,
    [links, studentId],
  );

  useEffect(() => {
    async function loadStudents() {
      if (!session?.user.id) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await listMyParentStudents();
        setLinks(response);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load linked children.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadStudents();
  }, [session?.user.id]);

  useEffect(() => {
    async function loadOrders() {
      if (!session?.user.id) {
        return;
      }

      setIsRefreshing(true);
      setError(null);

      try {
        const response = await listParentUniformOrders({
          studentId: studentId || undefined,
          status: status || undefined,
        });
        setOrders(response);
      } catch (loadError) {
        setOrders([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load orders.",
        );
      } finally {
        setIsRefreshing(false);
      }
    }

    void loadOrders();
  }, [session?.user.id, status, studentId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Uniform Order History"
        description="Track order status updates and view submitted order details."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className={buttonClassName({ variant: "secondary" })} href="/parent/uniform">
              New order
            </Link>
            <Link className={buttonClassName({ variant: "secondary" })} href="/parent">
              Back to parent portal
            </Link>
          </div>
        }
        meta={
          <Badge variant="neutral">
            {selectedStudent ? getStudentLabel(selectedStudent) : "All linked students"}
          </Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Loading linked children...</p>
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && links.length === 0 ? (
        <EmptyState
          title="No linked children"
          description="No student records are linked to this parent account."
        />
      ) : null}

      {!isLoading && links.length > 0 ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
              <CardDescription>Filter by child and order status.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field htmlFor="parent-uniform-orders-student" label="Student">
                <Select
                  id="parent-uniform-orders-student"
                  onChange={(event) => setStudentId(event.target.value)}
                  value={studentId}
                >
                  <option value="">All linked students</option>
                  {links.map((link) => (
                    <option key={link.studentId} value={link.studentId}>
                      {getStudentLabel(link)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field htmlFor="parent-uniform-orders-status" label="Status">
                <Select
                  id="parent-uniform-orders-status"
                  onChange={(event) => setStatus(event.target.value as "" | UniformOrderStatus)}
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
                {isRefreshing ? "Refreshing..." : `${orders.length} order${orders.length === 1 ? "" : "s"}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <EmptyState
                  compact
                  title="No orders"
                  description="No uniform orders found for these filters."
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50/80">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-slate-700">Order</th>
                          <th className="px-4 py-3 font-semibold text-slate-700">Student</th>
                          <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                          <th className="px-4 py-3 font-semibold text-slate-700">Total</th>
                          <th className="px-4 py-3 font-semibold text-slate-700">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {orders.map((order) => (
                          <tr className="align-top hover:bg-slate-50" key={order.id}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">#{order.id.slice(0, 8)}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {formatDateTimeLabel(order.createdAt)}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {`${order.student.firstName} ${order.student.lastName}`.trim() || order.student.username}
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
                                className={buttonClassName({ size: "sm", variant: "secondary" })}
                                href={`/parent/uniform/orders/${encodeURIComponent(order.id)}`}
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
        </>
      ) : null}
    </div>
  );
}
