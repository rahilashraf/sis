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
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import {
  listBillingOverdue,
  type BillingOverdueResponse,
  type BillingOverdueRow,
} from "@/lib/api/billing";
import { listSchools, type School } from "@/lib/api/schools";
import { formatDateLabel } from "@/lib/utils";

const readRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);

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

function isPositiveAmount(value: string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0;
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="mb-1 text-sm text-slate-500">{label}</p>
        <p
          className={`text-2xl font-bold tabular-nums ${
            tone === "danger" ? "text-red-600" : "text-slate-900"
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function getOverdueAgeVariant(oldestDueDate: string) {
  const dueTime = new Date(oldestDueDate).getTime();
  if (!Number.isFinite(dueTime)) {
    return "neutral" as const;
  }

  const daysOverdue = Math.floor(
    (Date.now() - dueTime) / (1000 * 60 * 60 * 24),
  );

  if (daysOverdue >= 60) {
    return "danger" as const;
  }

  if (daysOverdue >= 30) {
    return "warning" as const;
  }

  return "neutral" as const;
}

export function BillingOverdueManagement() {
  const { session } = useAuth();
  const role = session?.user.role ?? "";

  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [search, setSearch] = useState("");
  const [minAmount, setMinAmount] = useState("");

  const [data, setData] = useState<BillingOverdueResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === schoolId) ?? null,
    [schools, schoolId],
  );

  useEffect(() => {
    async function loadSchoolsAndDefaults() {
      if (!readRoles.has(role)) {
        return;
      }

      try {
        const schoolList = await listSchools({ includeInactive: false });
        setSchools(schoolList);

        const defaultSchoolId =
          getDefaultSchoolContextId(session?.user) ?? schoolList[0]?.id ?? "";
        const resolvedSchoolId =
          schoolList.find((school) => school.id === defaultSchoolId)?.id ??
          schoolList[0]?.id ??
          "";

        setSchoolId(resolvedSchoolId);
      } catch {
        setSchools([]);
      }
    }

    void loadSchoolsAndDefaults();
  }, [role, session?.user]);

  useEffect(() => {
    async function loadOverdueRows() {
      if (!readRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await listBillingOverdue({
          schoolId: schoolId || undefined,
          search: search.trim() || undefined,
          minAmount: minAmount.trim() || undefined,
          page: 1,
          limit: 100,
        });

        setData(response);
      } catch (loadError) {
        setData(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load overdue balances.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadOverdueRows();
  }, [role, schoolId, search, minAmount]);

  if (!readRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, ADMIN, and STAFF roles can view overdue balances."
      />
    );
  }

  const rows: BillingOverdueRow[] = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overdue Balances"
        description="Track overdue student balances for collections and follow-up."
        actions={
          <div className="flex items-center gap-2">
            <Link
              className={buttonClassName({ size: "sm", variant: "secondary" })}
              href="/admin/billing/charges"
            >
              Charges
            </Link>
            <Link
              className={buttonClassName({ size: "sm", variant: "secondary" })}
              href="/admin/billing/payments"
            >
              Payments
            </Link>
          </div>
        }
        meta={
          <Badge variant="neutral">
            {selectedSchool?.name ?? "All schools"}
          </Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Overdue Students"
          value={String(data?.summary.totalOverdueStudents ?? 0)}
        />
        <SummaryCard
          label="Total Overdue Balance"
          value={formatCurrency(data?.summary.totalOverdueBalance ?? "0")}
          tone={
            isPositiveAmount(data?.summary.totalOverdueBalance)
              ? "danger"
              : undefined
          }
        />
        <SummaryCard
          label="Overdue Charges"
          value={String(data?.summary.totalOverdueCharges ?? 0)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter overdue rows by school, student, and balance.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field htmlFor="overdue-school" label="School">
            <Select
              id="overdue-school"
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
            >
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field htmlFor="overdue-search" label="Search student">
            <Input
              id="overdue-search"
              placeholder="Name, username, or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>

          <Field htmlFor="overdue-min-amount" label="Min balance (CAD)">
            <Input
              id="overdue-min-amount"
              placeholder="e.g. 100"
              type="number"
              value={minAmount}
              onChange={(event) => setMinAmount(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Overdue accounts</CardTitle>
          <CardDescription>
            Sorted by highest overdue balance, then oldest due date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">
              Loading overdue balances...
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              compact
              title="No overdue balances"
              description="No matching overdue accounts were found for the selected filters."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Student
                      </th>
                      <th className="px-4 py-3 font-semibold text-right text-slate-700">
                        Overdue Amount
                      </th>
                      <th className="px-4 py-3 font-semibold text-right text-slate-700">
                        Overdue Charges
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Oldest Due
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {rows.map((row) => (
                      <tr
                        key={`${row.schoolId}-${row.studentId}`}
                        className="align-top hover:bg-slate-50"
                      >
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-900">
                            {row.studentName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.email ?? row.studentId}
                          </p>
                          {row.classInfo ? (
                            <p className="mt-1 text-xs text-slate-500">
                              Class: {row.classInfo.name}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold tabular-nums text-red-600">
                          {formatCurrency(row.totalOverdue)}
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums text-slate-700">
                          {row.overdueChargeCount}
                        </td>
                        <td className="px-4 py-4 text-slate-700">
                          <div className="flex items-center gap-2">
                            <span>{formatDateLabel(row.oldestDueDate)}</span>
                            <Badge
                              variant={getOverdueAgeVariant(row.oldestDueDate)}
                            >
                              Overdue
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              className={buttonClassName({
                                size: "sm",
                                variant: "secondary",
                              })}
                              href={`/admin/billing/students/${encodeURIComponent(row.studentId)}`}
                            >
                              View account
                            </Link>
                            <Link
                              className={buttonClassName({
                                size: "sm",
                                variant: "secondary",
                              })}
                              href={`/admin/billing/payments/new?studentId=${encodeURIComponent(row.studentId)}`}
                            >
                              Record payment
                            </Link>
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
