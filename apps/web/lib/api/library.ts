import { apiFetch } from './client';

export type LibraryItemStatus = 'AVAILABLE' | 'CHECKED_OUT' | 'LOST' | 'ARCHIVED';
export type LibraryLoanStatus = 'ACTIVE' | 'RETURNED' | 'LOST' | 'OVERDUE';

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
