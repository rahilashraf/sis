"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { AuthenticatedUser } from "@/lib/auth/types";
import {
  getActiveSchoolMemberships,
  getPrimarySchoolName,
} from "@/lib/auth/school-membership";
import { formatRoleLabel, getInitials } from "@/lib/utils";
import {
  getUnreadNotificationsCount,
  listNotifications,
  markNotificationAsRead,
  resolveNotificationHref,
  type Notification,
} from "@/lib/api/notifications";

type TopbarProps = {
  user: AuthenticatedUser;
  selectedSchoolId: string | null;
  onSchoolChange: (schoolId: string | null) => void;
  onLogout: () => void;
  onToggleSidebar: () => void;
};

export function Topbar({
  user,
  selectedSchoolId,
  onSchoolChange,
  onLogout,
  onToggleSidebar,
}: TopbarProps) {
  const schoolMemberships = getActiveSchoolMemberships(user);
  const selectedSchoolName =
    schoolMemberships.find(
      (membership) => membership.schoolId === selectedSchoolId,
    )?.school.name ?? getPrimarySchoolName(user);
  const hasMultipleSchools = schoolMemberships.length > 1;

  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<Notification[]>(
    [],
  );

  const notificationPanelRef = useRef<HTMLDivElement | null>(null);

  async function refreshUnreadCount() {
    try {
      const { count } = await getUnreadNotificationsCount();
      setUnreadCount(count);
    } catch {
      // ignore refresh errors
    }
  }

  async function refreshRecentNotifications() {
    setIsLoadingNotifications(true);
    try {
      const [notificationList, unread] = await Promise.all([
        listNotifications({ limit: 8 }),
        getUnreadNotificationsCount(),
      ]);
      setRecentNotifications(notificationList);
      setUnreadCount(unread.count);
    } catch {
      // ignore refresh errors
    } finally {
      setIsLoadingNotifications(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    function fetchCount() {
      refreshUnreadCount()
        .then(() => {
          if (cancelled) {
            return;
          }
        })
        .catch(() => {});
    }

    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isNotificationsOpen) {
      return;
    }

    void refreshRecentNotifications();
  }, [isNotificationsOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isNotificationsOpen &&
        notificationPanelRef.current &&
        !notificationPanelRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isNotificationsOpen]);

  async function handleNotificationClick(notification: Notification) {
    if (!notification.isRead) {
      try {
        await markNotificationAsRead(notification.id);
      } catch {
        // ignore mark read errors
      }
    }

    setRecentNotifications((current) =>
      current.map((entry) =>
        entry.id === notification.id ? { ...entry, isRead: true } : entry,
      ),
    );
    void refreshUnreadCount();
    setIsNotificationsOpen(false);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 md:hidden"
            onClick={onToggleSidebar}
            type="button"
          >
            Menu
          </button>

          <Link
            href="/dashboard"
            className="flex items-center gap-2 transition hover:opacity-80 md:hidden"
          >
            <Image
              src="/aiok-logo.png"
              alt="AIOK SIS"
              width={32}
              height={32}
              className="h-8 w-auto object-contain"
              priority
            />
            <span className="text-sm font-semibold text-slate-900">
              AIOK SIS
            </span>
          </Link>

          <Link
            href="/dashboard"
            className="hidden items-center gap-2 transition hover:opacity-80 md:flex"
          >
            <Image
              src="/aiok-logo.png"
              alt="AIOK SIS"
              width={40}
              height={40}
              className="h-8 w-auto object-contain"
              priority
            />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-900">AIOK SIS</p>
              <p className="text-xs text-slate-500 -mt-0.5">
                {selectedSchoolName ?? "Student Information System"}
              </p>
            </div>
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-slate-900">
              {user.firstName} {user.lastName}
            </p>
            <div className="mt-1 flex items-center justify-end gap-2">
              <Badge variant="neutral">{formatRoleLabel(user.role)}</Badge>
            </div>
            {hasMultipleSchools ? (
              <div className="mt-2">
                <Select
                  aria-label="School context"
                  className="h-8 min-w-45 text-xs"
                  value={selectedSchoolId ?? ""}
                  onChange={(event) =>
                    onSchoolChange(event.target.value || null)
                  }
                >
                  {schoolMemberships.map((membership) => (
                    <option
                      key={membership.schoolId}
                      value={membership.schoolId}
                    >
                      {membership.school.shortName || membership.school.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </div>

          <div className="relative" ref={notificationPanelRef}>
            <button
              aria-expanded={isNotificationsOpen}
              aria-label="Notifications"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
              onClick={() => setIsNotificationsOpen((current) => !current)}
              type="button"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 ? (
                <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </button>

            {isNotificationsOpen ? (
              <div className="absolute right-0 mt-2 w-[22rem] max-w-[90vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-900">
                    Notifications
                  </p>
                  <Link
                    className="text-xs font-medium text-slate-600 hover:text-slate-900"
                    href="/notifications"
                    onClick={() => setIsNotificationsOpen(false)}
                  >
                    View all
                  </Link>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {isLoadingNotifications ? (
                    <p className="px-3 py-6 text-center text-sm text-slate-500">
                      Loading...
                    </p>
                  ) : recentNotifications.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-slate-500">
                      No notifications yet.
                    </p>
                  ) : (
                    recentNotifications.map((notification) => {
                      const href =
                        resolveNotificationHref(notification) ??
                        "/notifications";
                      return (
                        <Link
                          className={`block border-b border-slate-100 px-3 py-3 text-sm last:border-b-0 ${
                            notification.isRead
                              ? "bg-white"
                              : "bg-blue-50/40 hover:bg-blue-50/60"
                          }`}
                          href={href}
                          key={notification.id}
                          onClick={() => {
                            void handleNotificationClick(notification);
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
                                notification.isRead
                                  ? "bg-slate-300"
                                  : "bg-blue-500"
                              }`}
                            />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">
                                {notification.title}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-600">
                                {notification.message}
                              </p>
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
            {getInitials(user.firstName, user.lastName)}
          </div>

          <Button onClick={onLogout} type="button" variant="secondary">
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
