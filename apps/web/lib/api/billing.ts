import { getStoredSessionSnapshot } from "../auth/storage";
import { apiConfig } from "./config";
import { apiFetch } from "./client";

export type BillingChargeStatus =
  | "PENDING"
  | "PAID"
  | "PARTIAL"
  | "WAIVED"
  | "CANCELLED"
  | "VOID";

export type LibraryFineReason = "LATE" | "LOST" | "UNCLAIMED_HOLD" | "MANUAL";
export type LibraryFineStatus = "OPEN" | "WAIVED" | "PAID" | "VOID";

export type BillingCategory = {
  id: string;
  schoolId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingCharge = {
  id: string;
  schoolId: string;
  schoolYearId: string | null;
  studentId: string;
  categoryId: string;
  createdById: string;
  title: string;
  description: string | null;
  amount: string;
  amountPaid: string;
  amountDue: string;
  status: BillingChargeStatus;
  sourceType: "MANUAL" | "SYSTEM";
  issuedAt: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string | null;
  };
  category: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
  };
  schoolYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  } | null;
  libraryFine: {
    id: string;
    reason: LibraryFineReason;
    status: LibraryFineStatus;
    assessedAt: string;
  } | null;
};

export type CreateBillingChargeInput = {
  schoolId: string;
  schoolYearId?: string | null;
  studentId: string;
  categoryId: string;
  title: string;
  description?: string | null;
  amount: string;
  dueDate?: string | null;
  sourceType?: "MANUAL" | "SYSTEM";
  sendNotifications?: boolean;
};

export type BulkChargeTargetMode = "SELECTED" | "CLASS" | "GRADE";

export type CreateBulkBillingChargeInput = {
  schoolId: string;
  schoolYearId?: string | null;
  categoryId: string;
  title: string;
  description?: string | null;
  amount: string;
  dueDate?: string | null;
  sourceType?: "MANUAL" | "SYSTEM";
  targetMode: BulkChargeTargetMode;
  studentIds?: string[];
  classId?: string;
  gradeLevel?: string;
  sendNotifications?: boolean;
};

export type BulkBillingChargeResult = {
  totalTargeted: number;
  createdCount: number;
  skippedCount: number;
  createdStudentIds: string[];
  skipped: Array<{
    studentId: string;
    reason: string;
  }>;
};

export type UpdateBillingChargeInput = {
  categoryId?: string | null;
  title?: string;
  description?: string | null;
  amount?: string;
  dueDate?: string | null;
};

export type VoidBillingChargeInput = {
  voidReason?: string | null;
};

export function listBillingCategories(options?: {
  schoolId?: string;
  includeInactive?: boolean;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set("schoolId", options.schoolId);
  }

  if (options?.includeInactive) {
    query.set("includeInactive", "true");
  }

  return apiFetch<BillingCategory[]>(
    `/billing/categories${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function listBillingCharges(options?: {
  schoolId?: string;
  studentId?: string;
  categoryId?: string;
  status?: BillingChargeStatus;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set("schoolId", options.schoolId);
  }

  if (options?.studentId) {
    query.set("studentId", options.studentId);
  }

  if (options?.categoryId) {
    query.set("categoryId", options.categoryId);
  }

  if (options?.status) {
    query.set("status", options.status);
  }

  return apiFetch<BillingCharge[]>(
    `/billing/charges${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function createBillingCharge(input: CreateBillingChargeInput) {
  return apiFetch<BillingCharge>("/billing/charges", {
    method: "POST",
    json: input,
  });
}

export function createBulkBillingCharges(input: CreateBulkBillingChargeInput) {
  return apiFetch<BulkBillingChargeResult>("/billing/charges/bulk", {
    method: "POST",
    json: input,
  });
}

export function getBillingCharge(chargeId: string) {
  return apiFetch<BillingCharge>(`/billing/charges/${chargeId}`);
}

export function updateBillingCharge(
  chargeId: string,
  input: UpdateBillingChargeInput,
) {
  return apiFetch<BillingCharge>(`/billing/charges/${chargeId}`, {
    method: "PATCH",
    json: input,
  });
}

export function voidBillingCharge(
  chargeId: string,
  input?: VoidBillingChargeInput,
) {
  return apiFetch<BillingCharge>(`/billing/charges/${chargeId}/void`, {
    method: "POST",
    json: input ?? {},
  });
}

export type CreateBillingCategoryInput = {
  schoolId: string;
  name: string;
  description?: string | null;
};

export type UpdateBillingCategoryInput = {
  name?: string;
  description?: string | null;
  isActive?: boolean;
};

export function createBillingCategory(input: CreateBillingCategoryInput) {
  return apiFetch<BillingCategory>("/billing/categories", {
    method: "POST",
    json: input,
  });
}

export function updateBillingCategory(
  categoryId: string,
  input: UpdateBillingCategoryInput,
) {
  return apiFetch<BillingCategory>(`/billing/categories/${categoryId}`, {
    method: "PATCH",
    json: input,
  });
}

export function archiveBillingCategory(categoryId: string) {
  return apiFetch<BillingCategory>(
    `/billing/categories/${categoryId}/archive`,
    {
      method: "PATCH",
    },
  );
}

// ── Student account summary ────────────────────────────────────────────────

export type PaymentMethod =
  | "EFT"
  | "E_TRANSFER"
  | "CASH"
  | "DEBIT_CREDIT"
  | "CHEQUE"
  // Legacy compatibility
  | "INTERAC"
  | "ETRANSFER"
  | "BANK_TRANSFER"
  | "CARD_EXTERNAL"
  | "CARD"
  | "OTHER";

export type AccountSummaryCharge = {
  id: string;
  schoolId: string;
  schoolYearId: string | null;
  studentId: string;
  categoryId: string;
  title: string;
  amount: string;
  amountPaid: string;
  amountDue: string;
  status: BillingChargeStatus;
  issuedAt: string;
  dueDate: string | null;
  category: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
  };
  schoolYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  } | null;
  libraryFine: {
    id: string;
    reason: LibraryFineReason;
    status: LibraryFineStatus;
    assessedAt: string;
  } | null;
};

export type AccountSummaryPayment = {
  id: string;
  schoolId: string;
  schoolYearId: string | null;
  studentId: string;
  receiptNumber: string;
  method: PaymentMethod;
  amount: string;
  paymentDate: string;
  referenceNumber: string | null;
  isVoided: boolean;
  schoolYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  } | null;
};

export type StudentAccountSummary = {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string | null;
  };
  totalOutstanding: string;
  totalOverdue: string;
  totalPaid: string;
  outstandingCharges: AccountSummaryCharge[];
  overdueCharges: AccountSummaryCharge[];
  recentPayments: AccountSummaryPayment[];
};

type DecimalLikeObject = {
  s?: unknown;
  e?: unknown;
  d?: unknown;
  toString?: () => string;
};

function trimTrailingZeros(value: string) {
  if (!value.includes(".")) {
    return value;
  }

  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function decimalLikeObjectToString(value: DecimalLikeObject) {
  const sign = value.s;
  const exponent = value.e;
  const digits = value.d;

  if (
    typeof sign !== "number" ||
    typeof exponent !== "number" ||
    !Array.isArray(digits) ||
    digits.some((entry) => typeof entry !== "number")
  ) {
    return null;
  }

  if (digits.length === 0) {
    return "0";
  }

  const chunks = digits
    .map((entry, index) =>
      index === 0 ? String(entry) : String(entry).padStart(7, "0"),
    )
    .join("")
    .replace(/^0+/, "");

  if (!chunks) {
    return "0";
  }

  const decimalIndex = exponent + 1;
  let normalized = "";

  if (decimalIndex <= 0) {
    normalized = `0.${"0".repeat(Math.abs(decimalIndex))}${chunks}`;
  } else if (decimalIndex >= chunks.length) {
    normalized = `${chunks}${"0".repeat(decimalIndex - chunks.length)}`;
  } else {
    normalized = `${chunks.slice(0, decimalIndex)}.${chunks.slice(decimalIndex)}`;
  }

  const withSign = sign < 0 ? `-${normalized}` : normalized;
  return trimTrailingZeros(withSign);
}

export function normalizeBillingMoneyValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "0";
  }

  if (value && typeof value === "object") {
    const decimalLike = value as DecimalLikeObject;

    const methodString = decimalLike.toString?.();
    if (
      typeof methodString === "string" &&
      methodString !== "[object Object]"
    ) {
      const parsed = Number(methodString);
      if (Number.isFinite(parsed)) {
        return methodString;
      }
    }

    const converted = decimalLikeObjectToString(decimalLike);
    if (converted !== null) {
      return converted;
    }
  }

  return "0";
}

function normalizeStudentAccountSummary(
  summary: StudentAccountSummary,
): StudentAccountSummary {
  return {
    ...summary,
    totalOutstanding: normalizeBillingMoneyValue(summary.totalOutstanding),
    totalOverdue: normalizeBillingMoneyValue(summary.totalOverdue),
    totalPaid: normalizeBillingMoneyValue(summary.totalPaid),
    outstandingCharges: summary.outstandingCharges.map((charge) => ({
      ...charge,
      amount: normalizeBillingMoneyValue(charge.amount),
      amountPaid: normalizeBillingMoneyValue(charge.amountPaid),
      amountDue: normalizeBillingMoneyValue(charge.amountDue),
    })),
    overdueCharges: summary.overdueCharges.map((charge) => ({
      ...charge,
      amount: normalizeBillingMoneyValue(charge.amount),
      amountPaid: normalizeBillingMoneyValue(charge.amountPaid),
      amountDue: normalizeBillingMoneyValue(charge.amountDue),
    })),
    recentPayments: summary.recentPayments.map((payment) => ({
      ...payment,
      amount: normalizeBillingMoneyValue(payment.amount),
    })),
  };
}

export type BillingPayment = {
  id: string;
  schoolId: string;
  schoolYearId: string | null;
  studentId: string;
  recordedById: string;
  paymentDate: string;
  amount: string;
  method: PaymentMethod;
  referenceNumber: string | null;
  notes: string | null;
  receiptNumber: string;
  isVoided: boolean;
};

export type CreateBillingPaymentInput = {
  schoolId: string;
  schoolYearId?: string | null;
  studentId: string;
  paymentDate: string;
  amount: string;
  method: PaymentMethod;
  referenceNumber?: string | null;
  notes?: string | null;
  allocations?: Array<{ chargeId: string; amount: string }>;
  sendNotifications?: boolean;
};

export type BatchBillingPaymentEntryInput = {
  studentId: string;
  schoolYearId?: string | null;
  paymentDate: string;
  amount: string;
  method: PaymentMethod;
  referenceNumber?: string | null;
  notes?: string | null;
  allocations?: Array<{ chargeId: string; amount: string }>;
};

export type CreateBatchBillingPaymentsInput = {
  schoolId: string;
  entries: BatchBillingPaymentEntryInput[];
  sendNotifications?: boolean;
};

export type BatchBillingPaymentResultRow = {
  rowIndex: number;
  studentId: string;
  success: boolean;
  paymentId?: string;
  receiptNumber?: string;
  error?: string;
};

export type BatchBillingPaymentResult = {
  schoolId: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  results: BatchBillingPaymentResultRow[];
};

export function createBillingPayment(input: CreateBillingPaymentInput) {
  return apiFetch<BillingPayment>("/billing/payments", {
    method: "POST",
    json: input,
  });
}

export function createBatchBillingPayments(
  input: CreateBatchBillingPaymentsInput,
) {
  return apiFetch<BatchBillingPaymentResult>("/billing/payments/batch", {
    method: "POST",
    json: input,
  });
}

export type VoidBillingPaymentInput = {
  voidReason?: string | null;
  sendNotifications?: boolean;
};

export function voidBillingPayment(
  paymentId: string,
  input?: VoidBillingPaymentInput,
) {
  return apiFetch<BillingPayment>(`/billing/payments/${paymentId}/void`, {
    method: "POST",
    json: input ?? {},
  });
}

export function getParentStudentAccountSummary(studentId: string) {
  return apiFetch<StudentAccountSummary>(
    `/billing/parent/students/${studentId}/account-summary`,
  ).then(normalizeStudentAccountSummary);
}

export function getStudentAccountSummary(
  studentId: string,
  options?: { schoolId?: string },
) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set("schoolId", options.schoolId);
  }

  return apiFetch<StudentAccountSummary>(
    `/billing/students/${studentId}/account-summary${query.size ? `?${query.toString()}` : ""}`,
  ).then(normalizeStudentAccountSummary);
}

export type BillingOverdueRow = {
  studentId: string;
  studentName: string;
  schoolId: string;
  totalOverdue: string;
  overdueChargeCount: number;
  oldestDueDate: string;
  latestDueDate: string | null;
  email: string | null;
  classInfo: {
    id: string;
    name: string;
  } | null;
};

export type BillingOverdueSummary = {
  totalOverdueStudents: number;
  totalOverdueBalance: string;
  totalOverdueCharges: number;
};

export type BillingOverdueResponse = {
  items: BillingOverdueRow[];
  page: number;
  limit: number;
  total: number;
  summary: BillingOverdueSummary;
  sorting: string;
};

function normalizeBillingOverdueResponse(
  response: BillingOverdueResponse,
): BillingOverdueResponse {
  return {
    ...response,
    items: response.items.map((row) => ({
      ...row,
      totalOverdue: normalizeBillingMoneyValue(row.totalOverdue),
    })),
    summary: {
      ...response.summary,
      totalOverdueBalance: normalizeBillingMoneyValue(
        response.summary.totalOverdueBalance,
      ),
    },
  };
}

export function listBillingOverdue(options?: {
  schoolId?: string;
  search?: string;
  minAmount?: string;
  classId?: string;
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set("schoolId", options.schoolId);
  }

  if (options?.search) {
    query.set("search", options.search);
  }

  if (options?.minAmount) {
    query.set("minAmount", options.minAmount);
  }

  if (options?.classId) {
    query.set("classId", options.classId);
  }

  if (options?.page) {
    query.set("page", String(options.page));
  }

  if (options?.limit) {
    query.set("limit", String(options.limit));
  }

  return apiFetch<BillingOverdueResponse>(
    `/billing/overdue${query.size ? `?${query.toString()}` : ""}`,
  ).then(normalizeBillingOverdueResponse);
}

export type SendBillingOverdueRemindersInput = {
  schoolId?: string;
  search?: string;
  minAmount?: string;
  classId?: string;
  cooldownDays?: number;
  dryRun?: boolean;
};

export type SendBillingOverdueRemindersResult = {
  dryRun: boolean;
  cooldownDays: number;
  studentsEvaluated: number;
  linkedParents: number;
  remindersSent: number;
  skippedNoParents: number;
  skippedRecentReminder: number;
};

export function sendBillingOverdueReminders(
  input: SendBillingOverdueRemindersInput,
) {
  const query = new URLSearchParams();

  if (input.schoolId) query.set("schoolId", input.schoolId);
  if (input.search) query.set("search", input.search);
  if (input.minAmount) query.set("minAmount", input.minAmount);
  if (input.classId) query.set("classId", input.classId);

  return apiFetch<SendBillingOverdueRemindersResult>(
    `/billing/overdue/reminders${query.size ? `?${query.toString()}` : ""}`,
    {
      method: "POST",
      json: {
        cooldownDays: input.cooldownDays,
        dryRun: input.dryRun,
      },
    },
  );
}

async function apiFetchBlob(path: string): Promise<Blob> {
  const session = getStoredSessionSnapshot();
  const headers: Record<string, string> = {};

  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const url = `${apiConfig.baseUrl}${path}`;
  const response = await fetch(url, { headers });

  if (response.status === 401) {
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }

  return response.blob();
}

export type BillingPaymentsReportRow = {
  paymentDate: string;
  receiptNumber: string;
  studentName: string;
  amount: string;
  method: string;
  referenceNumber: string | null;
  status: string;
};

export type BillingPaymentsReport = {
  items: BillingPaymentsReportRow[];
  totals: {
    count: number;
    totalAmount: string;
  };
};

export type BillingChargesReportRow = {
  issuedAt: string;
  dueDate: string | null;
  studentName: string;
  title: string;
  category: string;
  amount: string;
  amountPaid: string;
  amountDue: string;
  status: string;
};

export type BillingChargesReport = {
  items: BillingChargesReportRow[];
  totals: {
    count: number;
    totalAmount: string;
    totalDue: string;
  };
};

export type BillingOutstandingReportRow = {
  schoolId: string;
  studentId: string;
  studentName: string;
  totalOutstanding: string;
  totalOverdue: string;
  overdueChargeCount: number;
};

export type BillingOutstandingReport = {
  items: BillingOutstandingReportRow[];
  totals: {
    studentCount: number;
    totalOutstanding: string;
    totalOverdue: string;
  };
};

export type BillingSummaryReport = {
  totalChargesIssued: string;
  totalPaymentsReceived: string;
  totalVoidedPayments: string;
  currentOutstanding: string;
  currentOverdue: string;
};

function normalizePaymentsReport(
  report: BillingPaymentsReport,
): BillingPaymentsReport {
  return {
    ...report,
    items: report.items.map((item) => ({
      ...item,
      amount: normalizeBillingMoneyValue(item.amount),
    })),
    totals: {
      ...report.totals,
      totalAmount: normalizeBillingMoneyValue(report.totals.totalAmount),
    },
  };
}

function normalizeChargesReport(
  report: BillingChargesReport,
): BillingChargesReport {
  return {
    ...report,
    items: report.items.map((item) => ({
      ...item,
      amount: normalizeBillingMoneyValue(item.amount),
      amountPaid: normalizeBillingMoneyValue(item.amountPaid),
      amountDue: normalizeBillingMoneyValue(item.amountDue),
    })),
    totals: {
      ...report.totals,
      totalAmount: normalizeBillingMoneyValue(report.totals.totalAmount),
      totalDue: normalizeBillingMoneyValue(report.totals.totalDue),
    },
  };
}

function normalizeOutstandingReport(
  report: BillingOutstandingReport,
): BillingOutstandingReport {
  return {
    ...report,
    items: report.items.map((item) => ({
      ...item,
      totalOutstanding: normalizeBillingMoneyValue(item.totalOutstanding),
      totalOverdue: normalizeBillingMoneyValue(item.totalOverdue),
    })),
    totals: {
      ...report.totals,
      totalOutstanding: normalizeBillingMoneyValue(
        report.totals.totalOutstanding,
      ),
      totalOverdue: normalizeBillingMoneyValue(report.totals.totalOverdue),
    },
  };
}

function normalizeSummaryReport(
  report: BillingSummaryReport,
): BillingSummaryReport {
  return {
    totalChargesIssued: normalizeBillingMoneyValue(report.totalChargesIssued),
    totalPaymentsReceived: normalizeBillingMoneyValue(
      report.totalPaymentsReceived,
    ),
    totalVoidedPayments: normalizeBillingMoneyValue(report.totalVoidedPayments),
    currentOutstanding: normalizeBillingMoneyValue(report.currentOutstanding),
    currentOverdue: normalizeBillingMoneyValue(report.currentOverdue),
  };
}

export function getBillingPaymentsReport(options?: {
  schoolId?: string;
  dateFrom?: string;
  dateTo?: string;
  method?: string;
  studentId?: string;
  includeVoided?: boolean;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) query.set("schoolId", options.schoolId);
  if (options?.dateFrom) query.set("dateFrom", options.dateFrom);
  if (options?.dateTo) query.set("dateTo", options.dateTo);
  if (options?.method) query.set("method", options.method);
  if (options?.studentId) query.set("studentId", options.studentId);
  if (options?.includeVoided) query.set("includeVoided", "true");

  return apiFetch<BillingPaymentsReport>(
    `/billing/reports/payments${query.size ? `?${query.toString()}` : ""}`,
  ).then(normalizePaymentsReport);
}

export function exportBillingPaymentsReportCsv(options?: {
  schoolId?: string;
  dateFrom?: string;
  dateTo?: string;
  method?: string;
  studentId?: string;
  includeVoided?: boolean;
}) {
  const query = new URLSearchParams();
  query.set("format", "csv");

  if (options?.schoolId) query.set("schoolId", options.schoolId);
  if (options?.dateFrom) query.set("dateFrom", options.dateFrom);
  if (options?.dateTo) query.set("dateTo", options.dateTo);
  if (options?.method) query.set("method", options.method);
  if (options?.studentId) query.set("studentId", options.studentId);
  if (options?.includeVoided) query.set("includeVoided", "true");

  return apiFetchBlob(`/billing/reports/payments?${query.toString()}`);
}

export function getBillingChargesReport(options?: {
  schoolId?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  status?: string;
  studentId?: string;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) query.set("schoolId", options.schoolId);
  if (options?.dateFrom) query.set("dateFrom", options.dateFrom);
  if (options?.dateTo) query.set("dateTo", options.dateTo);
  if (options?.categoryId) query.set("categoryId", options.categoryId);
  if (options?.status) query.set("status", options.status);
  if (options?.studentId) query.set("studentId", options.studentId);

  return apiFetch<BillingChargesReport>(
    `/billing/reports/charges${query.size ? `?${query.toString()}` : ""}`,
  ).then(normalizeChargesReport);
}

export function exportBillingChargesReportCsv(options?: {
  schoolId?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  status?: string;
  studentId?: string;
}) {
  const query = new URLSearchParams();
  query.set("format", "csv");

  if (options?.schoolId) query.set("schoolId", options.schoolId);
  if (options?.dateFrom) query.set("dateFrom", options.dateFrom);
  if (options?.dateTo) query.set("dateTo", options.dateTo);
  if (options?.categoryId) query.set("categoryId", options.categoryId);
  if (options?.status) query.set("status", options.status);
  if (options?.studentId) query.set("studentId", options.studentId);

  return apiFetchBlob(`/billing/reports/charges?${query.toString()}`);
}

export function getBillingOutstandingReport(options?: {
  schoolId?: string;
  minBalance?: string;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) query.set("schoolId", options.schoolId);
  if (options?.minBalance) query.set("minBalance", options.minBalance);

  return apiFetch<BillingOutstandingReport>(
    `/billing/reports/outstanding${query.size ? `?${query.toString()}` : ""}`,
  ).then(normalizeOutstandingReport);
}

export function exportBillingOutstandingReportCsv(options?: {
  schoolId?: string;
  minBalance?: string;
}) {
  const query = new URLSearchParams();
  query.set("format", "csv");

  if (options?.schoolId) query.set("schoolId", options.schoolId);
  if (options?.minBalance) query.set("minBalance", options.minBalance);

  return apiFetchBlob(`/billing/reports/outstanding?${query.toString()}`);
}

export function getBillingSummaryReport(options?: {
  schoolId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) query.set("schoolId", options.schoolId);
  if (options?.dateFrom) query.set("dateFrom", options.dateFrom);
  if (options?.dateTo) query.set("dateTo", options.dateTo);

  return apiFetch<BillingSummaryReport>(
    `/billing/reports/summary${query.size ? `?${query.toString()}` : ""}`,
  ).then(normalizeSummaryReport);
}

export function exportBillingSummaryReportCsv(options?: {
  schoolId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const query = new URLSearchParams();
  query.set("format", "csv");

  if (options?.schoolId) query.set("schoolId", options.schoolId);
  if (options?.dateFrom) query.set("dateFrom", options.dateFrom);
  if (options?.dateTo) query.set("dateTo", options.dateTo);

  return apiFetchBlob(`/billing/reports/summary?${query.toString()}`);
}

export type PaymentReceipt = {
  id: string;
  schoolId: string | null;
  receiptNumber: string | null;
  paymentDate: string;
  amount: string;
  method: PaymentMethod;
  referenceNumber: string | null;
  notes: string | null;
  isVoided: boolean;
  voidedAt: string | null;
  voidReason: string | null;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
  };
  recordedBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  allocations: Array<{
    id: string;
    chargeId: string;
    amount: string;
    charge: {
      id: string;
      title: string;
      amount: string;
    };
  }>;
  school: {
    id: string;
    name: string;
    shortName: string | null;
  } | null;
};

export function getPaymentReceipt(paymentId: string): Promise<PaymentReceipt> {
  return apiFetch(`/billing/payments/${paymentId}/receipt`);
}

export function getParentPaymentReceipt(
  paymentId: string,
): Promise<PaymentReceipt> {
  return apiFetch(`/billing/parent/payments/${paymentId}/receipt`);
}

export type StudentStatement = {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string | null;
  };
  school: {
    id: string;
    name: string;
    shortName: string | null;
  } | null;
  generatedAt: string;
  currentBalance: string;
  overdueBalance: string;
  allCharges: BillingCharge[];
  allPayments: AccountSummaryPayment[];
};

export function getStudentStatement(
  studentId: string,
  options?: { schoolId?: string },
): Promise<StudentStatement> {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set("schoolId", options.schoolId);
  }

  return apiFetch(
    `/billing/students/${studentId}/statement${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function getParentStudentStatement(
  studentId: string,
): Promise<StudentStatement> {
  return apiFetch(`/billing/parent/students/${studentId}/statement`);
}
