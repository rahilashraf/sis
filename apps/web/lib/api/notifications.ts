import { apiFetch } from "./client";

export type NotificationType =
  | "BILLING_CHARGE_CREATED"
  | "BILLING_PAYMENT_RECORDED"
  | "BILLING_PAYMENT_VOIDED"
  | "FORM_SUBMITTED"
  | "FORM_PUBLISHED"
  | "RE_REGISTRATION_OPENED"
  | "RE_REGISTRATION_SUBMITTED"
  | "GENERAL"
  | string;

export type Notification = {
  id: string;
  schoolId: string | null;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export type UnreadCountResult = {
  count: number;
};

export function listNotifications(options?: { unreadOnly?: boolean; limit?: number }) {
  const query = new URLSearchParams();
  if (options?.unreadOnly) query.set("unreadOnly", "true");
  if (options?.limit !== undefined) query.set("limit", String(options.limit));
  const qs = query.size ? `?${query.toString()}` : "";
  return apiFetch<Notification[]>(`/notifications${qs}`);
}

export function getUnreadNotificationsCount() {
  return apiFetch<UnreadCountResult>("/notifications/unread-count");
}

export function markNotificationAsRead(id: string) {
  return apiFetch<Notification>(`/notifications/${id}/read`, { method: "POST" });
}

/**
 * Resolve a best-effort deep link for a notification based on its entityType.
 * Returns null when no specific route is known.
 */
export function resolveNotificationHref(notification: Notification): string | null {
  const { entityType, entityId } = notification;

  if (!entityType || !entityId) return null;

  if (entityType === "BillingCharge") {
    return `/admin/billing/charges`;
  }

  if (entityType === "BillingPayment") {
    return `/admin/billing/payments`;
  }

  if (entityType === "Form") {
    return `/admin/forms`;
  }

  return null;
}
