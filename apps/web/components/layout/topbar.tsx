"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { getActiveSchoolMemberships, getPrimarySchoolName } from "@/lib/auth/school-membership";
import { formatRoleLabel, getInitials } from "@/lib/utils";
import { getUnreadNotificationsCount } from "@/lib/api/notifications";

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
    schoolMemberships.find((membership) => membership.schoolId === selectedSchoolId)?.school.name ??
    getPrimarySchoolName(user);
  const hasMultipleSchools = schoolMemberships.length > 1;

  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    function fetchCount() {
      getUnreadNotificationsCount()
        .then(({ count }) => {
          if (!cancelled) setUnreadCount(count);
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
            <span className="text-sm font-semibold text-slate-900">AIOK SIS</span>
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
                  className="h-8 min-w-[180px] text-xs"
                  value={selectedSchoolId ?? ""}
                  onChange={(event) => onSchoolChange(event.target.value || null)}
                >
                  {schoolMemberships.map((membership) => (
                    <option key={membership.schoolId} value={membership.schoolId}>
                      {membership.school.shortName || membership.school.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </div>

          <Link
            href="/notifications"
            aria-label="Notifications"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
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
          </Link>

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
