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
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import {
  exportBillingChargesReportCsv,
  exportBillingOutstandingReportCsv,
  exportBillingPaymentsReportCsv,
  exportBillingSummaryReportCsv,
  getBillingChargesReport,
  getBillingOutstandingReport,
  getBillingPaymentsReport,
  getBillingSummaryReport,
  listBillingCategories,
  type BillingCategory,
  type BillingChargeStatus,
  type BillingChargesReport,
  type BillingOutstandingReport,
  type BillingPaymentsReport,
  type BillingSummaryReport,
  type PaymentMethod,
} from "@/lib/api/billing";
import { listSchools, type School } from "@/lib/api/schools";
import { listUsers, type ManagedUser } from "@/lib/api/users";
import { formatDateLabel } from "@/lib/utils";

const readRoles = new Set(["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"]);
const chargeStatusOptions: BillingChargeStatus[] = [
  "PENDING",
  "PARTIAL",
  "PAID",
  "WAIVED",
  "CANCELLED",
  "VOID",
];
const paymentMethodOptions: PaymentMethod[] = [
  "EFT",
  "E_TRANSFER",
  "CASH",
  "DEBIT_CREDIT",
  "CHEQUE",
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

function isPositiveAmount(value: string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

function getStudentLabel(student: ManagedUser) {
  const fullName = `${student.firstName} ${student.lastName}`.trim();
  return fullName || student.username || student.email || student.id;
}

function userBelongsToSchool(user: ManagedUser, schoolId: string) {
  if (!schoolId) return true;
  if (user.schoolId === schoolId) return true;
  return user.memberships.some((membership) => membership.schoolId === schoolId);
}

function methodLabel(method: string) {
  if (method === "E_TRANSFER") return "E-Transfer";
  if (method === "DEBIT_CREDIT") return "Debit/Credit";
  return method;
}

function SummaryMetric({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="mb-1 text-sm text-slate-500">{label}</p>
        <p className={`text-2xl font-bold tabular-nums ${tone === "danger" ? "text-red-600" : "text-slate-900"}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export function BillingReportsManagement() {
  const { session } = useAuth();
  const role = session?.user.role ?? "";

  const [schools, setSchools] = useState<School[]>([]);
  const [students, setStudents] = useState<ManagedUser[]>([]);
  const [categories, setCategories] = useState<BillingCategory[]>([]);
  const [schoolId, setSchoolId] = useState("");

  const [paymentsFilters, setPaymentsFilters] = useState({
    dateFrom: "",
    dateTo: "",
    method: "",
    studentId: "",
    includeVoided: false,
  });
  const [chargesFilters, setChargesFilters] = useState({
    dateFrom: "",
    dateTo: "",
    categoryId: "",
    status: "",
    studentId: "",
  });
  const [outstandingFilters, setOutstandingFilters] = useState({
    minBalance: "",
  });
  const [summaryFilters, setSummaryFilters] = useState({
    dateFrom: "",
    dateTo: "",
  });

  const [paymentsReport, setPaymentsReport] = useState<BillingPaymentsReport | null>(null);
  const [chargesReport, setChargesReport] = useState<BillingChargesReport | null>(null);
  const [outstandingReport, setOutstandingReport] = useState<BillingOutstandingReport | null>(null);
  const [summaryReport, setSummaryReport] = useState<BillingSummaryReport | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const [isLoadingCharges, setIsLoadingCharges] = useState(true);
  const [isLoadingOutstanding, setIsLoadingOutstanding] = useState(true);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  const filteredStudents = useMemo(
    () => students.filter((student) => userBelongsToSchool(student, schoolId)),
    [students, schoolId],
  );

  useEffect(() => {
    async function loadOptions() {
      if (!readRoles.has(role)) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [schoolList, studentList] = await Promise.all([
          listSchools({ includeInactive: false }),
          listUsers({ role: "STUDENT" }),
        ]);

        setSchools(schoolList);
        setStudents(studentList);

        const defaultSchoolId = getDefaultSchoolContextId(session?.user) ?? schoolList[0]?.id ?? "";
        const resolvedSchoolId =
          schoolList.find((school) => school.id === defaultSchoolId)?.id ?? schoolList[0]?.id ?? "";

        setSchoolId(resolvedSchoolId);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load report filters.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadOptions();
  }, [role, session?.user]);

  useEffect(() => {
    async function loadCategories() {
      if (!schoolId || !readRoles.has(role)) {
        setCategories([]);
        return;
      }

      try {
        const items = await listBillingCategories({ schoolId });
        setCategories(items);
      } catch {
        setCategories([]);
      }
    }

    void loadCategories();
  }, [role, schoolId]);

  useEffect(() => {
    if (!schoolId) {
      return;
    }

    if (!filteredStudents.some((student) => student.id === paymentsFilters.studentId)) {
      setPaymentsFilters((current) => ({ ...current, studentId: "" }));
    }

    if (!filteredStudents.some((student) => student.id === chargesFilters.studentId)) {
      setChargesFilters((current) => ({ ...current, studentId: "" }));
    }
  }, [chargesFilters.studentId, filteredStudents, paymentsFilters.studentId, schoolId]);

  useEffect(() => {
    async function loadPayments() {
      if (!readRoles.has(role)) return;

      setIsLoadingPayments(true);
      try {
        const report = await getBillingPaymentsReport({
          schoolId: schoolId || undefined,
          dateFrom: paymentsFilters.dateFrom || undefined,
          dateTo: paymentsFilters.dateTo || undefined,
          method: paymentsFilters.method || undefined,
          studentId: paymentsFilters.studentId || undefined,
          includeVoided: paymentsFilters.includeVoided,
        });
        setPaymentsReport(report);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load payments report.");
      } finally {
        setIsLoadingPayments(false);
      }
    }

    void loadPayments();
  }, [paymentsFilters, role, schoolId]);

  useEffect(() => {
    async function loadCharges() {
      if (!readRoles.has(role)) return;

      setIsLoadingCharges(true);
      try {
        const report = await getBillingChargesReport({
          schoolId: schoolId || undefined,
          dateFrom: chargesFilters.dateFrom || undefined,
          dateTo: chargesFilters.dateTo || undefined,
          categoryId: chargesFilters.categoryId || undefined,
          status: chargesFilters.status || undefined,
          studentId: chargesFilters.studentId || undefined,
        });
        setChargesReport(report);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load charges report.");
      } finally {
        setIsLoadingCharges(false);
      }
    }

    void loadCharges();
  }, [chargesFilters, role, schoolId]);

  useEffect(() => {
    async function loadOutstanding() {
      if (!readRoles.has(role)) return;

      setIsLoadingOutstanding(true);
      try {
        const report = await getBillingOutstandingReport({
          schoolId: schoolId || undefined,
          minBalance: outstandingFilters.minBalance || undefined,
        });
        setOutstandingReport(report);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load outstanding report.");
      } finally {
        setIsLoadingOutstanding(false);
      }
    }

    void loadOutstanding();
  }, [outstandingFilters, role, schoolId]);

  useEffect(() => {
    async function loadSummary() {
      if (!readRoles.has(role)) return;

      setIsLoadingSummary(true);
      try {
        const report = await getBillingSummaryReport({
          schoolId: schoolId || undefined,
          dateFrom: summaryFilters.dateFrom || undefined,
          dateTo: summaryFilters.dateTo || undefined,
        });
        setSummaryReport(report);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load summary report.");
      } finally {
        setIsLoadingSummary(false);
      }
    }

    void loadSummary();
  }, [role, schoolId, summaryFilters]);

  async function handleExport(key: string, loader: () => Promise<Blob>, fileName: string) {
    setExportingKey(key);
    try {
      const blob = await loader();
      downloadBlob(blob, fileName);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export CSV.");
    } finally {
      setExportingKey(null);
    }
  }

  if (!readRoles.has(role)) {
    return (
      <EmptyState
        title="Restricted"
        description="Only OWNER, SUPER_ADMIN, ADMIN, and STAFF roles can view billing reports."
      />
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-slate-500">Loading billing reports...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing Reports"
        description="Review payment, charge, outstanding, and summary report snapshots with CSV export."
        actions={
          <div className="flex items-center gap-2">
            <Link className={buttonClassName({ size: "sm", variant: "secondary" })} href="/admin/billing/charges">
              Charges
            </Link>
            <Link className={buttonClassName({ size: "sm", variant: "secondary" })} href="/admin/billing/payments">
              Payments
            </Link>
          </div>
        }
        meta={
          <Badge variant="neutral">
            {schools.find((school) => school.id === schoolId)?.name ?? "All schools"}
          </Badge>
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card>
        <CardHeader>
          <CardTitle>School Scope</CardTitle>
          <CardDescription>Apply a school filter across all billing reports on this page.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-sm">
          <Field htmlFor="billing-reports-school" label="School">
            <Select id="billing-reports-school" value={schoolId} onChange={(event) => setSchoolId(event.target.value)}>
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Summary</CardTitle>
              <CardDescription>Headline totals for charges, payments, and current balances.</CardDescription>
            </div>
            <Button
              disabled={exportingKey === "summary"}
              onClick={() =>
                void handleExport(
                  "summary",
                  () =>
                    exportBillingSummaryReportCsv({
                      schoolId: schoolId || undefined,
                      dateFrom: summaryFilters.dateFrom || undefined,
                      dateTo: summaryFilters.dateTo || undefined,
                    }),
                  "billing-summary-report.csv",
                )
              }
              variant="secondary"
            >
              {exportingKey === "summary" ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field htmlFor="summary-from" label="Date from">
              <Input id="summary-from" type="date" value={summaryFilters.dateFrom} onChange={(event) => setSummaryFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
            </Field>
            <Field htmlFor="summary-to" label="Date to">
              <Input id="summary-to" type="date" value={summaryFilters.dateTo} onChange={(event) => setSummaryFilters((current) => ({ ...current, dateTo: event.target.value }))} />
            </Field>
          </div>

          {isLoadingSummary || !summaryReport ? (
            <p className="text-sm text-slate-500">Loading summary...</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <SummaryMetric label="Charges Issued" value={formatCurrency(summaryReport.totalChargesIssued)} />
              <SummaryMetric label="Payments Received" value={formatCurrency(summaryReport.totalPaymentsReceived)} />
              <SummaryMetric label="Voided Payments" value={formatCurrency(summaryReport.totalVoidedPayments)} />
              <SummaryMetric
                label="Current Outstanding"
                value={formatCurrency(summaryReport.currentOutstanding)}
                tone={isPositiveAmount(summaryReport.currentOutstanding) ? "danger" : undefined}
              />
              <SummaryMetric
                label="Current Overdue"
                value={formatCurrency(summaryReport.currentOverdue)}
                tone={isPositiveAmount(summaryReport.currentOverdue) ? "danger" : undefined}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Payments Report</CardTitle>
              <CardDescription>Payment activity by receipt, student, method, and status.</CardDescription>
            </div>
            <Button
              disabled={exportingKey === "payments"}
              onClick={() =>
                void handleExport(
                  "payments",
                  () =>
                    exportBillingPaymentsReportCsv({
                      schoolId: schoolId || undefined,
                      dateFrom: paymentsFilters.dateFrom || undefined,
                      dateTo: paymentsFilters.dateTo || undefined,
                      method: paymentsFilters.method || undefined,
                      studentId: paymentsFilters.studentId || undefined,
                      includeVoided: paymentsFilters.includeVoided,
                    }),
                  "billing-payments-report.csv",
                )
              }
              variant="secondary"
            >
              {exportingKey === "payments" ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field htmlFor="payments-from" label="Date from">
              <Input id="payments-from" type="date" value={paymentsFilters.dateFrom} onChange={(event) => setPaymentsFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
            </Field>
            <Field htmlFor="payments-to" label="Date to">
              <Input id="payments-to" type="date" value={paymentsFilters.dateTo} onChange={(event) => setPaymentsFilters((current) => ({ ...current, dateTo: event.target.value }))} />
            </Field>
            <Field htmlFor="payments-method" label="Method">
              <Select id="payments-method" value={paymentsFilters.method} onChange={(event) => setPaymentsFilters((current) => ({ ...current, method: event.target.value }))}>
                <option value="">All methods</option>
                {paymentMethodOptions.map((method) => (
                  <option key={method} value={method}>
                    {methodLabel(method)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="payments-student" label="Student">
              <Select id="payments-student" value={paymentsFilters.studentId} onChange={(event) => setPaymentsFilters((current) => ({ ...current, studentId: event.target.value }))}>
                <option value="">All students</option>
                {filteredStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {getStudentLabel(student)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="payments-include-voided" label="Include voided">
              <Select id="payments-include-voided" value={paymentsFilters.includeVoided ? "true" : "false"} onChange={(event) => setPaymentsFilters((current) => ({ ...current, includeVoided: event.target.value === "true" }))}>
                <option value="false">Active only</option>
                <option value="true">Include voided</option>
              </Select>
            </Field>
          </div>

          {isLoadingPayments || !paymentsReport ? (
            <p className="text-sm text-slate-500">Loading payments report...</p>
          ) : paymentsReport.items.length === 0 ? (
            <EmptyState compact title="No payment rows" description="No payment records matched the selected filters." />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                <Badge variant="neutral">{paymentsReport.totals.count} rows</Badge>
                <Badge variant="neutral">Total {formatCurrency(paymentsReport.totals.totalAmount)}</Badge>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate-700">Payment Date</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Receipt</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Student</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Method</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Reference</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {paymentsReport.items.slice(0, 20).map((item) => (
                        <tr key={`${item.receiptNumber}-${item.paymentDate}`} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-700">{formatDateLabel(item.paymentDate)}</td>
                          <td className="px-4 py-3 font-mono text-slate-900">{item.receiptNumber}</td>
                          <td className="px-4 py-3 text-slate-700">{item.studentName}</td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">{formatCurrency(item.amount)}</td>
                          <td className="px-4 py-3 text-slate-700">{methodLabel(item.method)}</td>
                          <td className="px-4 py-3 text-slate-700">{item.referenceNumber ?? "—"}</td>
                          <td className="px-4 py-3">
                            <Badge variant={item.status === "VOIDED" ? "danger" : "success"}>{item.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Charges Report</CardTitle>
              <CardDescription>Charges issued by date, student, category, and status.</CardDescription>
            </div>
            <Button
              disabled={exportingKey === "charges"}
              onClick={() =>
                void handleExport(
                  "charges",
                  () =>
                    exportBillingChargesReportCsv({
                      schoolId: schoolId || undefined,
                      dateFrom: chargesFilters.dateFrom || undefined,
                      dateTo: chargesFilters.dateTo || undefined,
                      categoryId: chargesFilters.categoryId || undefined,
                      status: chargesFilters.status || undefined,
                      studentId: chargesFilters.studentId || undefined,
                    }),
                  "billing-charges-report.csv",
                )
              }
              variant="secondary"
            >
              {exportingKey === "charges" ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Field htmlFor="charges-from" label="Date from">
              <Input id="charges-from" type="date" value={chargesFilters.dateFrom} onChange={(event) => setChargesFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
            </Field>
            <Field htmlFor="charges-to" label="Date to">
              <Input id="charges-to" type="date" value={chargesFilters.dateTo} onChange={(event) => setChargesFilters((current) => ({ ...current, dateTo: event.target.value }))} />
            </Field>
            <Field htmlFor="charges-category" label="Category">
              <Select id="charges-category" value={chargesFilters.categoryId} onChange={(event) => setChargesFilters((current) => ({ ...current, categoryId: event.target.value }))}>
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="charges-status" label="Status">
              <Select id="charges-status" value={chargesFilters.status} onChange={(event) => setChargesFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="">All statuses</option>
                {chargeStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="charges-student" label="Student">
              <Select id="charges-student" value={chargesFilters.studentId} onChange={(event) => setChargesFilters((current) => ({ ...current, studentId: event.target.value }))}>
                <option value="">All students</option>
                {filteredStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {getStudentLabel(student)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {isLoadingCharges || !chargesReport ? (
            <p className="text-sm text-slate-500">Loading charges report...</p>
          ) : chargesReport.items.length === 0 ? (
            <EmptyState compact title="No charge rows" description="No charges matched the selected filters." />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                <Badge variant="neutral">{chargesReport.totals.count} rows</Badge>
                <Badge variant="neutral">Issued {formatCurrency(chargesReport.totals.totalAmount)}</Badge>
                <Badge variant="neutral">Due {formatCurrency(chargesReport.totals.totalDue)}</Badge>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate-700">Issued</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Due</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Student</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Title</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Category</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Paid</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Due</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {chargesReport.items.slice(0, 20).map((item) => (
                        <tr key={`${item.issuedAt}-${item.studentName}-${item.title}`} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-700">{formatDateLabel(item.issuedAt)}</td>
                          <td className="px-4 py-3 text-slate-700">{item.dueDate ? formatDateLabel(item.dueDate) : "—"}</td>
                          <td className="px-4 py-3 text-slate-700">{item.studentName}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{item.title}</td>
                          <td className="px-4 py-3 text-slate-700">{item.category}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-900">{formatCurrency(item.amount)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatCurrency(item.amountPaid)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatCurrency(item.amountDue)}</td>
                          <td className="px-4 py-3"><Badge variant="neutral">{item.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Outstanding Report</CardTitle>
              <CardDescription>Student-level outstanding and overdue balances.</CardDescription>
            </div>
            <Button
              disabled={exportingKey === "outstanding"}
              onClick={() =>
                void handleExport(
                  "outstanding",
                  () =>
                    exportBillingOutstandingReportCsv({
                      schoolId: schoolId || undefined,
                      minBalance: outstandingFilters.minBalance || undefined,
                    }),
                  "billing-outstanding-report.csv",
                )
              }
              variant="secondary"
            >
              {exportingKey === "outstanding" ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field htmlFor="outstanding-min-balance" label="Min balance (CAD)">
              <Input id="outstanding-min-balance" type="number" value={outstandingFilters.minBalance} onChange={(event) => setOutstandingFilters({ minBalance: event.target.value })} placeholder="e.g. 100" />
            </Field>
          </div>

          {isLoadingOutstanding || !outstandingReport ? (
            <p className="text-sm text-slate-500">Loading outstanding report...</p>
          ) : outstandingReport.items.length === 0 ? (
            <EmptyState compact title="No outstanding rows" description="No students matched the outstanding balance filters." />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                <Badge variant="neutral">{outstandingReport.totals.studentCount} students</Badge>
                <Badge variant="neutral">Outstanding {formatCurrency(outstandingReport.totals.totalOutstanding)}</Badge>
                <Badge variant="neutral">Overdue {formatCurrency(outstandingReport.totals.totalOverdue)}</Badge>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate-700">Student</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Outstanding</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Overdue</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700">Overdue Charges</th>
                        <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {outstandingReport.items.slice(0, 20).map((item) => (
                        <tr key={`${item.schoolId}-${item.studentId}`} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{item.studentName}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-900">{formatCurrency(item.totalOutstanding)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-red-600">{formatCurrency(item.totalOverdue)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">{item.overdueChargeCount}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <Link className={buttonClassName({ size: "sm", variant: "secondary" })} href={`/admin/billing/students/${encodeURIComponent(item.studentId)}`}>
                                View account
                              </Link>
                              <Link className={buttonClassName({ size: "sm", variant: "secondary" })} href={`/admin/billing/payments/new?studentId=${encodeURIComponent(item.studentId)}`}>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
