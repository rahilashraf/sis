"use client";

import { useEffect, useState } from "react";
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
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import {
  listNotifications,
  markNotificationAsRead,
  resolveNotificationHref,
  type Notification,
} from "@/lib/api/notifications";
import { formatDateTimeLabel } from "@/lib/utils";

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    BILLING_CHARGE_CREATED: "Billing",
    BILLING_PAYMENT_RECORDED: "Billing",
    BILLING_PAYMENT_VOIDED: "Billing",
    FORM_SUBMITTED: "Forms",
    FORM_PUBLISHED: "Forms",
    RE_REGISTRATION_OPENED: "Re-registration",
    RE_REGISTRATION_SUBMITTED: "Re-registration",
    GENERAL: "General",
  };
  return labels[type] ?? "Notification";
}

function getTypeVariant(
  type: string,
): "neutral" | "primary" | "success" | "warning" | "danger" {
  if (type.startsWith("BILLING_PAYMENT_VOIDED")) return "danger";
  if (type.startsWith("BILLING")) return "primary";
  if (type.startsWith("FORM")) return "success";
  if (type.startsWith("RE_REGISTRATION")) return "warning";
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
  const { session } = useAuth();
  const role = session?.user.role;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    if (!role) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    listNotifications({ limit: 50 })
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
  }, [role]);

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
      await Promise.all(unread.map((n) => markNotificationAsRead(n.id)));
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

      <Card>
        <CardHeader>
          <CardTitle>Recent notifications</CardTitle>
          <CardDescription>
            Showing up to 50 most recent notifications. Click an item to mark it
            as read.
          </CardDescription>
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
