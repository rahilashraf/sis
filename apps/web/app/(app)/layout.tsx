"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getDefaultRouteForRole,
  isPathAllowedForRole,
} from "@/lib/auth/role-routing";

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, session, status } = useAuth();

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (status === "unauthenticated") {
      router.replace("/login");
      const fallbackRedirect = window.setTimeout(() => {
        window.location.assign("/login");
      }, 1200);

      return () => window.clearTimeout(fallbackRedirect);
    }

    if (!session?.user?.role) {
      logout();
      router.replace("/login");
      return;
    }

    if (
      status === "authenticated" &&
      session &&
      !isPathAllowedForRole(session.user.role, pathname)
    ) {
      router.replace(getDefaultRouteForRole(session.user.role));
    }
  }, [logout, pathname, router, session, status]);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="space-y-2 text-center">
          <p className="text-sm text-slate-500">Checking session...</p>
          <Link
            className="text-sm font-medium text-slate-700 underline"
            href="/login"
          >
            Continue to login
          </Link>
        </div>
      </main>
    );
  }

  if (status === "unauthenticated" || !session?.user?.role) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="space-y-2 text-center">
          <p className="text-sm text-slate-500">Redirecting to sign in…</p>
          <Link
            className="text-sm font-medium text-slate-700 underline"
            href="/login"
          >
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  return <AppShell user={session.user}>{children}</AppShell>;
}
