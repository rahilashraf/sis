"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import { formatRoleLabel } from "@/lib/utils";

const workspaceLinks = [
  {
    href: "/admin/users",
    title: "User Management",
    description: "Create accounts, adjust roles, and control active access.",
  },
  {
    href: "/admin/schools",
    title: "Schools",
    description: "Review school records and remove empty schools or school years safely.",
  },
  {
    href: "/admin/classes",
    title: "Class Management",
    description: "Review class structure, assignments, and enrollment details.",
  },
  {
    href: "/admin/forms",
    title: "Forms",
    description: "Create parent-facing forms and review submitted responses.",
  },
  {
    href: "/admin/gradebook",
    title: "Gradebook",
    description: "Create assessments, enter grades, and control parent visibility.",
  },
  {
    href: "/admin/attendance",
    title: "Attendance",
    description: "Review sessions by date and update class attendance records.",
  },
];

export function AdminOverview() {
  const { session } = useAuth();
  const user = session?.user;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Dashboard"
        description="Use this workspace to manage operational records, maintain class structure, and review attendance activity across the school."
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/admin/attendance"
          >
            Open attendance
          </Link>
        }
        meta={
          user ? (
            <>
              <Badge variant="neutral">{formatRoleLabel(user.role)}</Badge>
              <Badge variant="neutral">
                {user.memberships.length > 0
                  ? `${user.memberships.length} school${user.memberships.length === 1 ? "" : "s"}`
                  : "No school memberships"}
              </Badge>
            </>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        {workspaceLinks.map((link) => (
          <Link href={link.href} key={link.href}>
            <Card className="h-full transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
              <CardHeader>
                <CardTitle>{link.title}</CardTitle>
                <CardDescription>{link.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span
                  className={buttonClassName({
                    className: "pointer-events-none",
                    size: "sm",
                    variant: "secondary",
                  })}
                >
                  Open module
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account Summary</CardTitle>
            <CardDescription>
              Current access context for this admin session.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Signed In As
              </p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {user ? `${user.firstName} ${user.lastName}` : "Unavailable"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {user?.email ?? user?.username ?? "No account details available"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                School Access
              </p>
              <div className="mt-2 space-y-2">
                {user?.memberships.length ? (
                  user.memberships.map((membership) => (
                    <p className="text-sm text-slate-700" key={membership.id}>
                      {membership.school.name}
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No school memberships assigned.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operational Focus</CardTitle>
            <CardDescription>
              Recommended sequence for day-to-day SIS maintenance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm leading-6 text-slate-700">
              <li>1. Confirm users and role assignments before opening new workflows.</li>
              <li>2. Review class structure and teacher assignment for the active school year.</li>
              <li>3. Use attendance to verify current-day rosters and resolve missing records.</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
