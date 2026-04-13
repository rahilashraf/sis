"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { formatRoleLabel, getInitials } from "@/lib/utils";

type TopbarProps = {
  user: AuthenticatedUser;
  onLogout: () => void;
  onToggleSidebar: () => void;
};

export function Topbar({ user, onLogout, onToggleSidebar }: TopbarProps) {
  const primarySchoolName = user.memberships[0]?.school.name;

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-6">
        <button
          className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 md:hidden"
          onClick={onToggleSidebar}
          type="button"
        >
          Menu
        </button>

        <div className="hidden md:block">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Workspace
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            School operations and attendance management
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-slate-900">
              {user.firstName} {user.lastName}
            </p>
            <div className="mt-1 flex items-center justify-end gap-2">
              {primarySchoolName ? (
                <p className="text-xs text-slate-500">{primarySchoolName}</p>
              ) : null}
              <Badge variant="neutral">{formatRoleLabel(user.role)}</Badge>
            </div>
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
