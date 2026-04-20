"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getNavigationItems } from "@/lib/auth/role-routing";
import type { NavigationItem } from "@/lib/auth/role-routing";
import type { UserRole } from "@/lib/auth/types";
import { cn, formatRoleLabel } from "@/lib/utils";

type SidebarProps = {
  role: UserRole;
  mobileOpen: boolean;
  onNavigate: () => void;
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

export function Sidebar({ role, mobileOpen, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const navigationItems = getNavigationItems(role);
  const activeHref = getActiveNavigationHref(pathname, navigationItems);

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
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white p-5 transition md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="rounded-2xl bg-slate-950 px-4 py-4 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
            AIOK (Darul Ilm) SIS
          </p>
          <p className="mt-2 text-base font-semibold text-white">
            Official System
          </p>
          <p className="mt-1 text-sm text-slate-300">
            {formatRoleLabel(role)} access
          </p>
        </div>

        <div className="mt-6 px-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Navigation
          </p>
        </div>

        <nav className="mt-3 flex-1 space-y-1.5">
          {navigationItems.map((item) => {
            const activeChildHref =
              item.children?.find((child) => child.href === activeHref)?.href ?? null;
            const isActive = activeHref === item.href || Boolean(activeChildHref);

            return (
              <div key={item.href} className="space-y-1">
                <Link
                  aria-current={isActive ? "page" : undefined}
                  data-active={isActive ? "true" : "false"}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group flex min-h-11 items-center rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-slate-950/10",
                    isActive
                      ? "bg-slate-950 text-white shadow-sm hover:bg-slate-950"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
                  )}
                >
                  <span
                    className={cn(
                      "truncate transition-colors",
                      isActive
                        ? "text-white"
                        : "text-slate-700 group-hover:text-slate-950",
                    )}
                    data-sidebar-label
                  >
                    {item.label}
                  </span>
                </Link>

                {item.children && item.children.length > 0 ? (
                  <div className="ml-5 border-l border-slate-200 pl-3">
                    <div className="space-y-1">
                      {item.children.map((child) => {
                        const isChildActive = activeHref === child.href;

                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={onNavigate}
                            aria-current={isChildActive ? "page" : undefined}
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

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <p className="text-sm font-medium text-slate-900">Keep workflows stable</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Use the menu to navigate throughout the system. If you encounter any issues, please contact support.
          </p>
        </div>
      </aside>
    </>
  );
}