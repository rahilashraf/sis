"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckboxField, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth/auth-context";
import type { UserRole } from "@/lib/auth/types";
import {
  createNotificationBroadcast,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  resolveNotificationHref,
  type NotificationType,
  type Notification,
} from "@/lib/api/notifications";
import { formatDateTimeLabel } from "@/lib/utils";

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    BILLING_CHARGE_CREATED: "Billing",
    BILLING_PAYMENT_RECORDED: "Billing",
    BILLING_PAYMENT_VOIDED: "Billing",
    FORM_ASSIGNED: "Forms",
    FORM_REMINDER: "Forms",
    FORM_SUBMITTED: "Forms",
    REREGISTRATION_OPENED: "Re-registration",
    ATTENDANCE_ALERT: "Attendance",
    ATTENDANCE_MARKED: "Attendance",
    LOW_GRADE_ALERT: "Progress",
    NEW_PUBLISHED_GRADE: "Grades",
    INCIDENT_CREATED: "Incidents",
    ADMIN_BROADCAST: "Broadcast",
    SYSTEM_ANNOUNCEMENT: "Announcement",
  };
  return labels[type] ?? "Notification";
}

function getTypeVariant(
  type: string,
): "neutral" | "primary" | "success" | "warning" | "danger" {
  if (type.startsWith("BILLING_PAYMENT_VOIDED")) return "danger";
  if (type.startsWith("BILLING")) return "primary";
  if (type.startsWith("FORM")) return "success";
  if (type.startsWith("REREGISTRATION")) return "warning";
  if (type.startsWith("ATTENDANCE")) return "warning";
  if (type.startsWith("LOW_GRADE") || type.startsWith("INCIDENT")) return "danger";
  if (type.startsWith("ADMIN_BROADCAST")) return "primary";
  return "neutral";
}

type NotificationRowProps = {
  notification: Notification;
  onMarkRead: (id: string) => void;
  isMarkingRead: boolean;
};

function NotificationRow({
  notification,
  onMarkRead,
  isMarkingRead,
}: NotificationRowProps) {
  const router = useRouter();
  const href = resolveNotificationHref(notification);

  function handleClick() {
    if (!notification.isRead) {
      onMarkRead(notification.id);
    }
    if (href) {
      router.push(href);
    }
  }

  return (
    <div
      className={`flex items-start gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0 transition-colors ${
        notification.isRead ? "bg-white" : "bg-blue-50/40 hover:bg-blue-50/60"
      } ${href || !notification.isRead ? "cursor-pointer hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1" : ""}`}
      onClick={href || !notification.isRead ? handleClick : undefined}
      role={href || !notification.isRead ? "button" : undefined}
      tabIndex={href || !notification.isRead ? 0 : undefined}
      onKeyDown={(e) => {
        if (
          (e.key === "Enter" || e.key === " ") &&
          (href || !notification.isRead)
        ) {
          handleClick();
        }
      }}
    >
      {/* Unread dot */}
      <div className="mt-1.5 shrink-0">
        {notification.isRead ? (
          <div className="h-2.5 w-2.5 rounded-full border border-slate-300 bg-white" />
        ) : (
          <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getTypeVariant(notification.type)}>
            {getTypeLabel(notification.type)}
          </Badge>
          {!notification.isRead && (
            <span className="text-xs font-semibold text-blue-600">New</span>
          )}
        </div>
        <p className="mt-1 text-sm font-semibold text-slate-900">
          {notification.title}
        </p>
        {notification.message !== notification.title ? (
          <p className="mt-0.5 text-sm text-slate-600">
            {notification.message}
          </p>
        ) : null}
        <p className="mt-1.5 text-xs text-slate-400">
          {formatDateTimeLabel(notification.createdAt, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>

      {/* Mark as read button */}
      {!notification.isRead && (
        <div className="shrink-0">
          <Button
            disabled={isMarkingRead}
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead(notification.id);
            }}
            type="button"
            variant="secondary"
            size="sm"
          >
            <span className="hidden sm:inline">
              {isMarkingRead ? "..." : "Mark read"}
            </span>
            <span className="sm:hidden">{isMarkingRead ? "..." : "✓"}</span>
          </Button>
        </div>
      )}
    </div>
  );
}

export function NotificationsList() {
  const { session, selectedSchoolId } = useAuth();
  const role = session?.user.role;
  const isAdminRole =
    role === "OWNER" || role === "SUPER_ADMIN" || role === "ADMIN";

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"ALL" | NotificationType>("ALL");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastAudience, setBroadcastAudience] = useState<
    "ALL" | "PARENT" | "STUDENT" | "TEACHER" | "STAFF" | "ADMIN"
  >("ALL");
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const availableTypes = useMemo(() => {
    const found = new Set<NotificationType>(notifications.map((n) => n.type));
    return Array.from(found).sort();
  }, [notifications]);

  useEffect(() => {
    if (!role) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listNotifications({
      limit: 50,
      unreadOnly,
      type: typeFilter === "ALL" ? undefined : typeFilter,
    })
      .then((data) => {
        if (!cancelled) {
          setNotifications(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load notifications.",
          );
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [role, unreadOnly, typeFilter, refreshTick]);

  async function handleMarkRead(id: string) {
    if (markingReadId) return;
    setMarkingReadId(id);
    try {
      await markNotificationAsRead(id);
      setNotifications((current) =>
        current.map((n) =>
          n.id === id
            ? { ...n, isRead: true, readAt: new Date().toISOString() }
            : n,
        ),
      );
    } catch {
      // silently ignore — user can retry
    } finally {
      setMarkingReadId(null);
    }
  }

  async function handleMarkAllRead() {
    const unread = notifications.filter((n) => !n.isRead);
    if (unread.length === 0 || isMarkingAllRead) return;

    setIsMarkingAllRead(true);
    try {
      await markAllNotificationsAsRead();
      setNotifications((current) =>
        current.map((n) => ({
          ...n,
          isRead: true,
          readAt: new Date().toISOString(),
        })),
      );
    } catch {
      // silently ignore
    } finally {
      setIsMarkingAllRead(false);
    }
  }

  async function handleBroadcastSubmit() {
    if (!isAdminRole || isSendingBroadcast) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSendingBroadcast(true);

    try {
      const title = broadcastTitle.trim();
      const message = broadcastMessage.trim();
      if (!title || !message) {
        throw new Error("Broadcast title and message are required.");
      }

      const targetRoles: UserRole[] =
        broadcastAudience === "ALL"
          ? ["PARENT", "STUDENT", "TEACHER", "SUPPLY_TEACHER", "STAFF", "ADMIN"]
          : broadcastAudience === "TEACHER"
            ? ["TEACHER", "SUPPLY_TEACHER"]
            : [broadcastAudience];

      const result = await createNotificationBroadcast({
        schoolId: selectedSchoolId ?? undefined,
        title,
        message,
        targetRoles,
      });

      setBroadcastTitle("");
      setBroadcastMessage("");
      setSuccessMessage(
        `Broadcast sent to ${result.recipients} user${result.recipients === 1 ? "" : "s"}.`,
      );
      setRefreshTick((current) => current + 1);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send broadcast.",
      );
    } finally {
      setIsSendingBroadcast(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Your recent alerts and updates from across the system."
        actions={
          unreadCount > 0 ? (
            <Button
              disabled={isMarkingAllRead}
              onClick={handleMarkAllRead}
              type="button"
              variant="secondary"
              size="sm"
            >
              <span className="hidden sm:inline">
                {isMarkingAllRead
                  ? "Marking..."
                  : `Mark all read (${unreadCount})`}
              </span>
              <span className="sm:hidden">
                {isMarkingAllRead ? "..." : `Mark all (${unreadCount})`}
              </span>
            </Button>
          ) : null
        }
        meta={
          unreadCount > 0 ? (
            <Badge variant="primary">{unreadCount} unread</Badge>
          ) : null
        }
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      {isAdminRole ? (
        <Card>
          <CardHeader>
            <CardTitle>Admin Broadcast</CardTitle>
            <CardDescription>
              Send a notice to users in the current school context.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field htmlFor="broadcast-title" label="Title">
              <Input
                id="broadcast-title"
                maxLength={160}
                onChange={(event) => setBroadcastTitle(event.target.value)}
                placeholder="School update"
                value={broadcastTitle}
              />
            </Field>
            <Field htmlFor="broadcast-audience" label="Audience">
              <Select
                id="broadcast-audience"
                onChange={(event) =>
                  setBroadcastAudience(
                    event.target.value as
                      | "ALL"
                      | "PARENT"
                      | "STUDENT"
                      | "TEACHER"
                      | "STAFF"
                      | "ADMIN",
                  )
                }
                value={broadcastAudience}
              >
                <option value="ALL">All school roles</option>
                <option value="PARENT">Parents</option>
                <option value="STUDENT">Students</option>
                <option value="TEACHER">Teachers</option>
                <option value="STAFF">Staff</option>
                <option value="ADMIN">Admins</option>
              </Select>
            </Field>
            <Field className="md:col-span-2" htmlFor="broadcast-message" label="Message">
              <Textarea
                id="broadcast-message"
                maxLength={1000}
                onChange={(event) => setBroadcastMessage(event.target.value)}
                placeholder="Add your announcement details."
                rows={4}
                value={broadcastMessage}
              />
            </Field>
            <div className="md:col-span-2 flex justify-end">
              <Button
                disabled={isSendingBroadcast}
                onClick={() => {
                  void handleBroadcastSubmit();
                }}
                type="button"
              >
                {isSendingBroadcast ? "Sending..." : "Send broadcast"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recent notifications</CardTitle>
          <CardDescription>
            Showing up to 50 most recent notifications. Click an item to mark it
            as read.
          </CardDescription>
          <div className="grid gap-3 md:grid-cols-3">
            <Field htmlFor="notifications-type-filter" label="Type">
              <Select
                id="notifications-type-filter"
                onChange={(event) =>
                  setTypeFilter(event.target.value as "ALL" | NotificationType)
                }
                value={typeFilter}
              >
                <option value="ALL">All types</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {getTypeLabel(type)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <CheckboxField
                checked={unreadOnly}
                label="Unread only"
                onChange={(event) => setUnreadOnly(event.target.checked)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-5">
              <EmptyState
                compact
                title="No notifications yet"
                description="You'll receive billing alerts, form updates, and other system notifications here."
              />
            </div>
          ) : (
            <div>
              {notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  isMarkingRead={markingReadId === notification.id}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
