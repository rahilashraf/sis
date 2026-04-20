import { apiFetch } from "./client";

export type BillingChargeStatus =
  | "PENDING"
  | "PAID"
  | "PARTIAL"
  | "WAIVED"
  | "CANCELLED"
  | "VOID";

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
  schoolYear:
    | {
        id: string;
        name: string;
        startDate: string;
        endDate: string;
        isActive: boolean;
      }
    | null;
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
  return apiFetch<BillingCategory>(`/billing/categories/${categoryId}/archive`, {
    method: "PATCH",
  });
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
    if (typeof methodString === "string" && methodString !== "[object Object]") {
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

export function createBatchBillingPayments(input: CreateBatchBillingPaymentsInput) {
  return apiFetch<BatchBillingPaymentResult>("/billing/payments/batch", {
    method: "POST",
    json: input,
  });
}

export type VoidBillingPaymentInput = {
  voidReason?: string | null;
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

export function getParentStudentAccountSummary(
  studentId: string,
) {
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