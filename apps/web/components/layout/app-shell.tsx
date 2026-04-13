"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthenticatedUser } from "@/lib/auth/types";

type AppShellProps = {
  user: AuthenticatedUser;
  children: React.ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

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
        mobileOpen={mobileOpen}
        onNavigate={closeSidebar}
      />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
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
