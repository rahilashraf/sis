import { apiFetch } from './client';

export type LibraryItemStatus = 'AVAILABLE' | 'CHECKED_OUT' | 'LOST' | 'ARCHIVED';
export type LibraryLoanStatus = 'ACTIVE' | 'RETURNED' | 'LOST' | 'OVERDUE';
export type LibraryFineReason = 'LATE' | 'LOST' | 'UNCLAIMED_HOLD' | 'MANUAL';
export type LibraryFineStatus = 'OPEN' | 'WAIVED' | 'PAID' | 'VOID';
export type LibraryLateFineFrequency = 'PER_DAY' | 'FLAT';

export type LibraryItem = {
  id: string;
  schoolId: string;
  title: string;
  author: string | null;
  isbn: string | null;
  barcode: string | null;
  category: string | null;
  status: LibraryItemStatus;
  totalCopies: number;
  availableCopies: number;
  createdAt: string;
  updatedAt: string;
  school: {
    id: string;
    name: string;
    shortName: string | null;
  };
};

export type LibraryLoan = {
  id: string;
  schoolId: string;
  itemId: string;
  studentId: string;
  checkedOutByUserId: string;
  checkoutDate: string;
  dueDate: string;
  returnedAt: string | null;
  receivedByUserId: string | null;
  status: LibraryLoanStatus;
  createdAt: string;
  updatedAt: string;
  item: {
    id: string;
    title: string;
    author: string | null;
    isbn: string | null;
    barcode: string | null;
    category: string | null;
    status: LibraryItemStatus;
  };
  student: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string | null;
  };
  checkedOutBy: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
  };
  receivedBy: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
  } | null;
  school: {
    id: string;
    name: string;
    shortName: string | null;
  };
};

export type LibraryOverdueLoan = LibraryLoan & {
  daysOverdue: number;
};

export type ParentStudentLibraryLoansResponse = {
  studentId: string;
  loans: Array<
    LibraryLoan & {
      isOverdue: boolean;
      daysOverdue: number;
    }
  >;
};

export type CreateLibraryItemInput = {
  schoolId: string;
  title: string;
  author?: string | null;
  isbn?: string | null;
  barcode?: string | null;
  category?: string | null;
  totalCopies?: number;
  availableCopies?: number;
  status?: LibraryItemStatus;
};

export type UpdateLibraryItemInput = Partial<
  Pick<
    CreateLibraryItemInput,
    'title' | 'author' | 'isbn' | 'barcode' | 'category' | 'totalCopies' | 'availableCopies' | 'status'
  >
>;

export type CheckoutLibraryLoanInput = {
  schoolId: string;
  itemId: string;
  studentId: string;
  dueDate: string;
  checkoutDate?: string;
};

export type MarkLibraryLoanLostInput = {
  description?: string | null;
  dueDate?: string | null;
};

export type MarkLibraryLoanFoundResult = {
  loan: LibraryLoan;
  lostFine: {
    id: string;
    status: LibraryFineStatus;
    amount: string;
    billingChargeId: string | null;
    billingCharge: {
      id: string;
      status: string;
      amountDue: string;
      title: string;
    } | null;
  } | null;
  fineRequiresReview: boolean;
};

export type LibraryFineSettings = {
  id: string;
  schoolId: string;
  lateFineAmount: string;
  lostItemFineAmount: string;
  unclaimedHoldFineAmount: string;
  lateFineGraceDays: number;
  lateFineFrequency: LibraryLateFineFrequency;
  createdAt: string;
  updatedAt: string;
  school: {
    id: string;
    name: string;
    shortName: string | null;
  };
};

export type UpsertLibraryFineSettingsInput = {
  schoolId: string;
  lateFineAmount: string;
  lostItemFineAmount: string;
  unclaimedHoldFineAmount: string;
  lateFineGraceDays: number;
  lateFineFrequency: LibraryLateFineFrequency;
};

export type LibraryFine = {
  id: string;
  schoolId: string;
  studentId: string;
  libraryItemId: string | null;
  checkoutId: string | null;
  holdReference: string | null;
  reason: LibraryFineReason;
  status: LibraryFineStatus;
  amount: string;
  description: string | null;
  assessedAt: string;
  waivedAt: string | null;
  waivedById: string | null;
  billingChargeId: string | null;
  createdAt: string;
  updatedAt: string;
  school: {
    id: string;
    name: string;
    shortName: string | null;
  };
  student: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string | null;
  };
  libraryItem: {
    id: string;
    title: string;
    barcode: string | null;
    category: string | null;
  } | null;
  checkout: {
    id: string;
    dueDate: string;
    checkoutDate: string;
    status: LibraryLoanStatus;
  } | null;
  waivedBy: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
  } | null;
  billingCharge: {
    id: string;
    title: string;
    status: string;
    amount: string;
    amountPaid: string;
    amountDue: string;
    category: {
      id: string;
      name: string;
    } | null;
  } | null;
};

export type CreateManualLibraryFineInput = {
  schoolId: string;
  studentId: string;
  reason?: LibraryFineReason;
  amount?: string;
  description?: string | null;
  libraryItemId?: string | null;
  checkoutId?: string | null;
  holdReference?: string | null;
  dueDate?: string | null;
};

export type WaiveLibraryFineInput = {
  reason?: string | null;
};

export type AssessLibraryOverdueFinesInput = {
  schoolId: string;
  studentId?: string;
};

export type AssessLibraryOverdueFinesResult = {
  schoolId: string;
  evaluatedLoans: number;
  createdCount: number;
  skippedCount: number;
  duplicateCount: number;
};

export type AssessUnclaimedHoldFineInput = {
  schoolId: string;
  studentId: string;
  holdReference: string;
  libraryItemId?: string | null;
  description?: string | null;
  dueDate?: string | null;
};

export function listLibraryItems(options?: {
  schoolId?: string;
  search?: string;
  category?: string;
  status?: LibraryItemStatus;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set('schoolId', options.schoolId);
  }

  if (options?.search?.trim()) {
    query.set('search', options.search.trim());
  }

  if (options?.category?.trim()) {
    query.set('category', options.category.trim());
  }

  if (options?.status) {
    query.set('status', options.status);
  }

  return apiFetch<LibraryItem[]>(`/library/items${query.size ? `?${query.toString()}` : ''}`);
}

export function createLibraryItem(input: CreateLibraryItemInput) {
  return apiFetch<LibraryItem>('/library/items', {
    method: 'POST',
    json: input,
  });
}

export function getLibraryItem(itemId: string) {
  return apiFetch<LibraryItem>(`/library/items/${itemId}`);
}

export function updateLibraryItem(itemId: string, input: UpdateLibraryItemInput) {
  return apiFetch<LibraryItem>(`/library/items/${itemId}`, {
    method: 'PATCH',
    json: input,
  });
}

export function listLibraryLoans(options?: {
  schoolId?: string;
  studentId?: string;
  itemId?: string;
  status?: LibraryLoanStatus;
  activeOnly?: boolean;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set('schoolId', options.schoolId);
  }

  if (options?.studentId) {
    query.set('studentId', options.studentId);
  }

  if (options?.itemId) {
    query.set('itemId', options.itemId);
  }

  if (options?.status) {
    query.set('status', options.status);
  }

  if (options?.activeOnly !== undefined) {
    query.set('activeOnly', options.activeOnly ? 'true' : 'false');
  }

  return apiFetch<LibraryLoan[]>(`/library/loans${query.size ? `?${query.toString()}` : ''}`);
}

export function checkoutLibraryLoan(input: CheckoutLibraryLoanInput) {
  return apiFetch<LibraryLoan>('/library/loans/checkout', {
    method: 'POST',
    json: input,
  });
}

export function returnLibraryLoan(loanId: string, options?: { returnedAt?: string }) {
  return apiFetch<LibraryLoan>(`/library/loans/${loanId}/return`, {
    method: 'POST',
    json: options ?? {},
  });
}

export function markLibraryLoanLost(
  loanId: string,
  input?: MarkLibraryLoanLostInput,
) {
  return apiFetch<{
    loan: LibraryLoan;
    fine: LibraryFine | null;
    fineCreated: boolean;
  }>(`/library/loans/${loanId}/mark-lost`, {
    method: 'POST',
    json: input ?? {},
  });
}

export function markLibraryLoanFound(loanId: string) {
  return apiFetch<MarkLibraryLoanFoundResult>(`/library/loans/${loanId}/mark-found`, {
    method: 'POST',
    json: {},
  });
}

export function listLibraryOverdue(options?: {
  schoolId?: string;
  studentId?: string;
  search?: string;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set('schoolId', options.schoolId);
  }

  if (options?.studentId) {
    query.set('studentId', options.studentId);
  }

  if (options?.search?.trim()) {
    query.set('search', options.search.trim());
  }

  return apiFetch<LibraryOverdueLoan[]>(`/library/overdue${query.size ? `?${query.toString()}` : ''}`);
}

export function listParentStudentLibraryLoans(studentId: string) {
  return apiFetch<ParentStudentLibraryLoansResponse>(
    `/library/parent/students/${encodeURIComponent(studentId)}/loans`,
  );
}

export function getLibraryFineSettings(schoolId: string) {
  const query = new URLSearchParams({ schoolId });
  return apiFetch<LibraryFineSettings>(`/library/fine-settings?${query.toString()}`);
}

export function upsertLibraryFineSettings(input: UpsertLibraryFineSettingsInput) {
  return apiFetch<LibraryFineSettings>('/library/fine-settings', {
    method: 'PATCH',
    json: input,
  });
}

export function listLibraryFines(options?: {
  schoolId?: string;
  studentId?: string;
  status?: LibraryFineStatus;
  reason?: LibraryFineReason;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set('schoolId', options.schoolId);
  }

  if (options?.studentId) {
    query.set('studentId', options.studentId);
  }

  if (options?.status) {
    query.set('status', options.status);
  }

  if (options?.reason) {
    query.set('reason', options.reason);
  }

  return apiFetch<LibraryFine[]>(`/library/fines${query.size ? `?${query.toString()}` : ''}`);
}

export function createManualLibraryFine(input: CreateManualLibraryFineInput) {
  return apiFetch<LibraryFine>('/library/fines/manual', {
    method: 'POST',
    json: input,
  });
}

export function waiveLibraryFine(fineId: string, input?: WaiveLibraryFineInput) {
  return apiFetch<LibraryFine>(`/library/fines/${fineId}/waive`, {
    method: 'POST',
    json: input ?? {},
  });
}

export function assessLibraryOverdueFines(input: AssessLibraryOverdueFinesInput) {
  return apiFetch<AssessLibraryOverdueFinesResult>('/library/fines/assess-overdue', {
    method: 'POST',
    json: input,
  });
}

export function assessUnclaimedHoldFine(input: AssessUnclaimedHoldFineInput) {
  return apiFetch<LibraryFine>('/library/fines/assess-unclaimed-hold', {
    method: 'POST',
    json: input,
  });
}
