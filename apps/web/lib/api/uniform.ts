import { apiFetch } from "./client";

export type UniformOrderStatus =
  | "PENDING"
  | "APPROVED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "COMPLETED"
  | "CANCELLED";

export type UniformItem = {
  id: string;
  schoolId: string;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  price: string;
  availableSizes: string[];
  availableColors: string[];
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  school: {
    id: string;
    name: string;
    shortName: string | null;
  };
};

export type UniformOrderItem = {
  id: string;
  orderId: string;
  uniformItemId: string;
  itemNameSnapshot: string;
  itemSkuSnapshot: string | null;
  selectedSize: string | null;
  selectedColor: string | null;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  createdAt: string;
  updatedAt: string;
  uniformItem: {
    id: string;
    schoolId: string;
    name: string;
    sku: string | null;
    isActive: boolean;
  };
};

export type UniformOrderAdmin = {
  id: string;
  schoolId: string;
  parentId: string;
  studentId: string;
  status: UniformOrderStatus;
  notes: string | null;
  internalNotes: string | null;
  totalAmount: string;
  createdAt: string;
  updatedAt: string;
  school: {
    id: string;
    name: string;
    shortName: string | null;
  };
  parent: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string | null;
    role: string;
  };
  student: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string | null;
    role: string;
  };
  items: UniformOrderItem[];
};

export type UniformOrderParent = {
  id: string;
  schoolId: string;
  parentId: string;
  studentId: string;
  status: UniformOrderStatus;
  notes: string | null;
  totalAmount: string;
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
    role: string;
  };
  items: UniformOrderItem[];
};

export type CreateUniformItemInput = {
  schoolId: string;
  name: string;
  description?: string | null;
  category?: string | null;
  sku?: string | null;
  price: string;
  availableSizes?: string[];
  availableColors?: string[];
  sortOrder?: number;
  isActive?: boolean;
};

export type UpdateUniformItemInput = {
  name?: string;
  description?: string | null;
  category?: string | null;
  sku?: string | null;
  price?: string;
  availableSizes?: string[];
  availableColors?: string[];
  sortOrder?: number;
  isActive?: boolean;
};

export type CreateUniformOrderInput = {
  studentId: string;
  notes?: string | null;
  items: Array<{
    uniformItemId: string;
    selectedSize?: string | null;
    selectedColor?: string | null;
    quantity: number;
  }>;
};

export type UpdateUniformOrderStatusInput = {
  status: UniformOrderStatus;
  internalNotes?: string | null;
};

export type UpdateParentUniformOrderInput = {
  notes?: string | null;
  items: Array<{
    uniformItemId: string;
    selectedSize?: string | null;
    selectedColor?: string | null;
    quantity: number;
  }>;
};

export function formatUniformOrderStatusLabel(status: UniformOrderStatus) {
  const labels: Record<UniformOrderStatus, string> = {
    PENDING: "Pending",
    APPROVED: "Approved",
    PREPARING: "Preparing",
    READY_FOR_PICKUP: "Ready for pickup",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  };

  return labels[status] ?? status;
}

export function formatUniformMoney(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

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

export function listUniformItems(options?: {
  schoolId?: string;
  search?: string;
  category?: string;
  includeInactive?: boolean;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set("schoolId", options.schoolId);
  }

  if (options?.search?.trim()) {
    query.set("search", options.search.trim());
  }

  if (options?.category?.trim()) {
    query.set("category", options.category.trim());
  }

  if (options?.includeInactive !== undefined) {
    query.set("includeInactive", options.includeInactive ? "true" : "false");
  }

  return apiFetch<UniformItem[]>(
    `/uniform-items${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function listParentUniformItems(studentId?: string) {
  const query = new URLSearchParams();

  if (studentId) {
    query.set("studentId", studentId);
  }

  return apiFetch<UniformItem[]>(
    `/uniform-items/parent${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function getUniformItem(itemId: string) {
  return apiFetch<UniformItem>(`/uniform-items/${itemId}`);
}

export function createUniformItem(input: CreateUniformItemInput) {
  return apiFetch<UniformItem>("/uniform-items", {
    method: "POST",
    json: input,
  });
}

export function updateUniformItem(
  itemId: string,
  input: UpdateUniformItemInput,
) {
  return apiFetch<UniformItem>(`/uniform-items/${itemId}`, {
    method: "PATCH",
    json: input,
  });
}

export function archiveUniformItem(itemId: string) {
  return apiFetch<UniformItem>(`/uniform-items/${itemId}/archive`, {
    method: "PATCH",
  });
}

export function activateUniformItem(itemId: string) {
  return apiFetch<UniformItem>(`/uniform-items/${itemId}/activate`, {
    method: "PATCH",
  });
}

export function listUniformOrders(options?: {
  schoolId?: string;
  status?: UniformOrderStatus;
  studentId?: string;
  parentId?: string;
}) {
  const query = new URLSearchParams();

  if (options?.schoolId) {
    query.set("schoolId", options.schoolId);
  }

  if (options?.status) {
    query.set("status", options.status);
  }

  if (options?.studentId) {
    query.set("studentId", options.studentId);
  }

  if (options?.parentId) {
    query.set("parentId", options.parentId);
  }

  return apiFetch<UniformOrderAdmin[]>(
    `/uniform-orders${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function listParentUniformOrders(options?: {
  studentId?: string;
  status?: UniformOrderStatus;
}) {
  const query = new URLSearchParams();

  if (options?.studentId) {
    query.set("studentId", options.studentId);
  }

  if (options?.status) {
    query.set("status", options.status);
  }

  return apiFetch<UniformOrderParent[]>(
    `/uniform-orders/parent${query.size ? `?${query.toString()}` : ""}`,
  );
}

export function getUniformOrder(orderId: string) {
  return apiFetch<UniformOrderAdmin | UniformOrderParent>(
    `/uniform-orders/${orderId}`,
  );
}

export function createUniformOrder(input: CreateUniformOrderInput) {
  return apiFetch<UniformOrderParent>("/uniform-orders", {
    method: "POST",
    json: input,
  });
}

export function updateUniformOrderStatus(
  orderId: string,
  input: UpdateUniformOrderStatusInput,
) {
  return apiFetch<UniformOrderAdmin>(`/uniform-orders/${orderId}/status`, {
    method: "PATCH",
    json: input,
  });
}

export function updateParentUniformOrder(
  orderId: string,
  input: UpdateParentUniformOrderInput,
) {
  return apiFetch<UniformOrderParent>(
    `/uniform-orders/${orderId}/parent-edit`,
    {
      method: "PATCH",
      json: input,
    },
  );
}

export function cancelParentUniformOrder(orderId: string) {
  return apiFetch<UniformOrderParent>(
    `/uniform-orders/${orderId}/parent-cancel`,
    {
      method: "POST",
    },
  );
}
