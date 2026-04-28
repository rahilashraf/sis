import { apiFetch } from "./client";
import type { UserRole } from "../auth/types";

export type NotificationType =
  | "BILLING_CHARGE_CREATED"
  | "BILLING_PAYMENT_RECORDED"
  | "BILLING_PAYMENT_VOIDED"
  | "FORM_ASSIGNED"
  | "FORM_REMINDER"
  | "FORM_SUBMITTED"
  | "REREGISTRATION_OPENED"
  | "ATTENDANCE_ALERT"
  | "ATTENDANCE_MARKED"
  | "LOW_GRADE_ALERT"
  | "NEW_PUBLISHED_GRADE"
  | "INCIDENT_CREATED"
  | "ADMIN_BROADCAST"
  | "SYSTEM_ANNOUNCEMENT"
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

export function listNotifications(options?: {
  unreadOnly?: boolean;
  limit?: number;
  type?: NotificationType;
}) {
  const query = new URLSearchParams();
  if (options?.unreadOnly) query.set("unreadOnly", "true");
  if (options?.limit !== undefined) query.set("limit", String(options.limit));
  if (options?.type) query.set("type", options.type);
  const qs = query.size ? `?${query.toString()}` : "";
  return apiFetch<Notification[]>(`/notifications${qs}`);
}

export function getUnreadNotificationsCount() {
  return apiFetch<UnreadCountResult>("/notifications/unread-count");
}

export function markNotificationAsRead(id: string) {
  return apiFetch<Notification>(`/notifications/${id}/read`, {
    method: "POST",
  });
}

export function markAllNotificationsAsRead() {
  return apiFetch<{ count: number }>("/notifications/read-all", {
    method: "POST",
  });
}

export function createStudentNotificationAlert(input: {
  studentId: string;
  type:
    | "FORM_REMINDER"
    | "ATTENDANCE_ALERT"
    | "LOW_GRADE_ALERT"
    | "NEW_PUBLISHED_GRADE";
  title?: string;
  message?: string;
  entityType?: string;
  entityId?: string;
  includeStudent?: boolean;
  includeParents?: boolean;
}) {
  return apiFetch<{
    count: number;
    recipients: number;
    studentId: string;
    type: NotificationType;
  }>("/notifications/alerts/student", {
    method: "POST",
    json: input,
  });
}

export function createNotificationBroadcast(input: {
  schoolId?: string;
  type?: "ADMIN_BROADCAST" | "SYSTEM_ANNOUNCEMENT";
  title: string;
  message: string;
  targetRoles?: UserRole[];
  recipientUserIds?: string[];
}) {
  return apiFetch<{
    count: number;
    recipients: number;
    schoolId: string | null;
    type: NotificationType;
    targetRoles: UserRole[];
  }>("/notifications/broadcast", {
    method: "POST",
    json: input,
  });
}

/**
 * Resolve a best-effort deep link for a notification based on its entityType.
 * Returns null when no specific route is known.
 */
export function resolveNotificationHref(
  notification: Notification,
): string | null {
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

  if (entityType === "Student" || entityType === "StudentAlert") {
    return `/notifications`;
  }

  if (entityType === "Broadcast") {
    return `/notifications`;
  }

  return null;
}
