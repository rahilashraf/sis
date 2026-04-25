"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getNavigationItems } from "@/lib/auth/role-routing";
import type { NavigationItem } from "@/lib/auth/role-routing";
import { listParentStudents } from "@/lib/api/students";
import { getReRegistrationWindowStatus } from "@/lib/api/re-registration";
import { listSchoolYears } from "@/lib/api/schools";
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultSchoolContextId } from "@/lib/auth/school-membership";
import type { UserRole } from "@/lib/auth/types";
import { parseDateOnly } from "@/lib/date";
import { cn, formatRoleLabel } from "@/lib/utils";

type SidebarProps = {
  role: UserRole;
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: () => void;
  onToggleCollapsed: () => void;
};

const exactMatchRoutes = new Set([
  "/dashboard",
  "/admin",
  "/teacher",
  "/parent",
  "/student",
]);

function isNavigationItemActive(pathname: string, href: string) {
  if (exactMatchRoutes.has(href)) {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function getActiveNavigationHref(
  pathname: string,
  navigationItems: NavigationItem[],
) {
  const childItems = navigationItems.flatMap((item) => item.children ?? []);

  const activeChildItems = childItems
    .filter((item) => isNavigationItemActive(pathname, item.href))
    .sort((left, right) => right.href.length - left.href.length);

  if (activeChildItems.length > 0) {
    return activeChildItems[0].href;
  }

  const activeItems = navigationItems
    .filter((item) => isNavigationItemActive(pathname, item.href))
    .sort((left, right) => right.href.length - left.href.length);

  if (activeItems.length > 0) {
    return activeItems[0].href;
  }

  for (const item of navigationItems) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      return item.href;
    }
  }

  return null;
}

function getDefaultExpandedItems(
  pathname: string,
  navigationItems: NavigationItem[],
) {
  const expanded: Record<string, boolean> = {};

  for (const item of navigationItems) {
    if (!item.children?.length) {
      continue;
    }

    if (
      item.children.some((child) =>
        isNavigationItemActive(pathname, child.href),
      )
    ) {
      expanded[item.href] = true;
    }
  }

  return expanded;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "h-4 w-4 transition-transform",
        open ? "rotate-90" : "rotate-0",
      )}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
    </svg>
  );
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      {collapsed ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="m15 5-7 7 7 7" />
      )}
    </svg>
  );
}

function getCompactItemIndicator(label: string) {
  const words = label
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return "•";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function Sidebar({
  role,
  collapsed,
  mobileOpen,
  onNavigate,
  onToggleCollapsed,
}: SidebarProps) {
  const { session } = useAuth();
  const pathname = usePathname();
  const baseNavigationItems = getNavigationItems(role);
  const parentUserId = role === "PARENT" ? (session?.user.id ?? null) : null;
  const [parentReRegistrationItem, setParentReRegistrationItem] =
    useState<NavigationItem | null>(null);

  useEffect(() => {
    if (!parentUserId) {
      return;
    }

    const userId = parentUserId;

    let cancelled = false;

    async function loadParentReRegistrationLink() {
      try {
        const links = await listParentStudents(userId);
        const schoolYearCache = new Map<
          string,
          Awaited<ReturnType<typeof listSchoolYears>>
        >();
        const now = new Date();

        for (const link of links) {
          const schoolId = getDefaultSchoolContextId(link.student) ?? "";
          if (!schoolId) {
            continue;
          }

          let schoolYears = schoolYearCache.get(schoolId);
          if (!schoolYears) {
            schoolYears = await listSchoolYears(schoolId, {
              includeInactive: true,
            });
            schoolYearCache.set(schoolId, schoolYears);
          }

          const targetSchoolYear =
            schoolYears
              .filter((year) => {
                const startDate = parseDateOnly(year.startDate);
                return startDate ? startDate > now : false;
              })
              .sort((left, right) => {
                const leftStart =
                  parseDateOnly(left.startDate)?.getTime() ??
                  Number.MAX_SAFE_INTEGER;
                const rightStart =
                  parseDateOnly(right.startDate)?.getTime() ??
                  Number.MAX_SAFE_INTEGER;
                return leftStart - rightStart;
              })[0] ??
            schoolYears.find((year) => year.isActive) ??
            schoolYears[0];

          if (!targetSchoolYear) {
            continue;
          }

          const status = await getReRegistrationWindowStatus({
            schoolId,
            schoolYearId: targetSchoolYear.id,
          });

          if (status.isOpen) {
            if (!cancelled) {
              setParentReRegistrationItem({
                href: `/parent/students/${encodeURIComponent(link.studentId)}/re-registration`,
                label: "Re-Registration",
              });
            }
            return;
          }
        }

        if (!cancelled) {
          setParentReRegistrationItem(null);
        }
      } catch {
        if (!cancelled) {
          setParentReRegistrationItem(null);
        }
      }
    }

    void loadParentReRegistrationLink();

    return () => {
      cancelled = true;
    };
  }, [parentUserId]);

  const navigationItems = useMemo(() => {
    if (role !== "PARENT" || !parentUserId || !parentReRegistrationItem) {
      return baseNavigationItems;
    }

    return [
      baseNavigationItems[0],
      parentReRegistrationItem,
      ...baseNavigationItems.slice(1),
    ];
  }, [baseNavigationItems, parentReRegistrationItem, parentUserId, role]);

  const activeHref = getActiveNavigationHref(pathname, navigationItems);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(
    {},
  );
  const forcedExpandedItems = getDefaultExpandedItems(
    pathname,
    navigationItems,
  );

  return (
    <>
      <button
        aria-label="Close navigation"
        className={`fixed inset-0 z-30 bg-slate-950/45 md:hidden ${
          mobileOpen ? "block" : "hidden"
        }`}
        onClick={onNavigate}
        type="button"
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white p-5 transition-[transform,width,padding] duration-200 md:static md:translate-x-0 ${
          collapsed ? "md:w-20 md:p-3" : "md:w-72 md:p-5"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div
          className={cn(
            "rounded-2xl bg-slate-950 px-4 py-4 text-white shadow-sm",
            collapsed && "md:px-2.5 md:py-3",
          )}
        >
          <p
            className={cn(
              "text-xs font-semibold uppercase tracking-[0.2em] text-slate-300",
              collapsed && "md:text-center md:tracking-[0.12em]",
            )}
          >
            {collapsed ? "AIOK" : "AIOK (Darul Ilm) SIS"}
          </p>
          <p
            className={cn(
              "mt-2 text-base font-semibold text-white",
              collapsed && "md:hidden",
            )}
          >
            Official System
          </p>
          <p
            className={cn(
              "mt-1 text-sm text-slate-300",
              collapsed && "md:hidden",
            )}
          >
            {formatRoleLabel(role)} access
          </p>
        </div>

        <button
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          className={cn(
            "mt-3 hidden h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-slate-950/10 md:inline-flex",
            collapsed ? "justify-center px-0" : "justify-between",
          )}
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand menu" : "Collapse menu"}
          type="button"
        >
          <span className={cn("truncate", collapsed && "md:hidden")}>Menu</span>
          <SidebarToggleIcon collapsed={collapsed} />
        </button>

        <div className={cn("mt-6 px-2", collapsed && "md:mt-4 md:px-0")}>
          <p
            className={cn(
              "text-xs font-semibold uppercase tracking-[0.18em] text-slate-500",
              collapsed && "md:hidden",
            )}
          >
            Navigation
          </p>
        </div>

        <nav className="mt-3 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {navigationItems.map((item) => {
            const activeChildHref =
              item.children?.find((child) => child.href === activeHref)?.href ??
              null;
            const isActive =
              activeHref === item.href || Boolean(activeChildHref);
            const hasChildren = Boolean(item.children?.length);
            const isExpanded = hasChildren
              ? Boolean(forcedExpandedItems[item.href]) ||
                Boolean(expandedItems[item.href])
              : false;

            return (
              <div key={item.href} className="space-y-1">
                <div
                  className={cn(
                    "group flex min-h-11 items-center rounded-xl text-sm font-semibold transition-colors",
                    isActive
                      ? "bg-slate-950 text-white shadow-sm"
                      : "text-slate-700",
                  )}
                >
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    data-active={isActive ? "true" : "false"}
                    href={item.href}
                    onClick={() => {
                      if (hasChildren) {
                        setExpandedItems((current) => ({
                          ...current,
                          [item.href]: true,
                        }));
                      }
                      onNavigate();
                    }}
                    className={cn(
                      "flex min-h-11 flex-1 items-center rounded-xl px-3.5 py-2.5 outline-none transition-colors focus-visible:ring-4 focus-visible:ring-slate-950/10",
                      collapsed && "md:justify-center md:px-2",
                      isActive
                        ? "text-white hover:bg-slate-950"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "hidden h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold uppercase tracking-wide md:inline-flex",
                        collapsed ? "md:inline-flex" : "md:hidden",
                        isActive
                          ? "border-white/50 bg-white/10 text-white"
                          : "border-slate-300 bg-slate-50 text-slate-700",
                      )}
                    >
                      {getCompactItemIndicator(item.label)}
                    </span>
                    <span
                      className={cn(
                        "truncate transition-colors",
                        collapsed && "md:hidden",
                        isActive
                          ? "text-white"
                          : "text-slate-700 group-hover:text-slate-950",
                      )}
                      data-sidebar-label
                    >
                      {item.label}
                    </span>
                  </Link>

                  {hasChildren ? (
                    <button
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.label}`}
                      className={cn(
                        "mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-4 focus-visible:ring-slate-950/10",
                        collapsed && "md:hidden",
                        isActive
                          ? "text-white hover:bg-slate-900"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-950",
                      )}
                      onClick={() =>
                        setExpandedItems((current) => ({
                          ...current,
                          [item.href]: !isExpanded,
                        }))
                      }
                      type="button"
                    >
                      <ChevronIcon open={isExpanded} />
                    </button>
                  ) : null}
                </div>

                {hasChildren && isExpanded ? (
                  <div
                    className={cn(
                      "ml-5 border-l border-slate-200 pl-3",
                      collapsed && "md:hidden",
                    )}
                  >
                    <div className="space-y-1">
                      {item.children?.map((child) => {
                        const isChildActive = activeHref === child.href;

                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={onNavigate}
                            aria-current={isChildActive ? "page" : undefined}
                            title={collapsed ? child.label : undefined}
                            className={cn(
                              "group flex min-h-9 items-center rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-4 focus-visible:ring-slate-950/10",
                              isChildActive
                                ? "bg-slate-100 text-slate-950"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                            )}
                          >
                            <span className="truncate" data-sidebar-label>
                              {child.label}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div
          className={cn(
            "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4",
            collapsed && "md:px-2 md:py-3",
          )}
          title={
            collapsed
              ? "Use the menu to navigate throughout the system. If you encounter any issues, please contact support."
              : undefined
          }
        >
          <p
            className={cn(
              "text-sm font-medium text-slate-900",
              collapsed && "md:hidden",
            )}
          >
            Keep workflows stable
          </p>
          <p
            className={cn(
              "mt-1 text-sm leading-6 text-slate-500",
              collapsed && "md:hidden",
            )}
          >
            Use the menu to navigate throughout the system. If you encounter any
            issues, please contact support.
          </p>
          <span
            aria-hidden="true"
            className={cn(
              "hidden h-8 w-full items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold uppercase tracking-wider text-slate-600",
              collapsed && "md:flex",
            )}
          >
            Help
          </span>
        </div>
      </aside>
    </>
  );
}
