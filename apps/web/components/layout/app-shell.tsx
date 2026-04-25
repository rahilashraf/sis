"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthenticatedUser } from "@/lib/auth/types";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "sis.sidebarCollapsed";

type AppShellProps = {
  user: AuthenticatedUser;
  children: React.ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  const router = useRouter();
  const { logout, selectedSchoolId, setSelectedSchoolId } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        String(sidebarCollapsed),
      );
    } catch {
      // Ignore storage access issues.
    }
  }, [sidebarCollapsed]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  function closeSidebar() {
    setMobileOpen(false);
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar
        role={user.role}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onNavigate={closeSidebar}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
      />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          selectedSchoolId={selectedSchoolId}
          onSchoolChange={setSelectedSchoolId}
          onLogout={handleLogout}
          onToggleSidebar={() => setMobileOpen((current) => !current)}
        />
        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
