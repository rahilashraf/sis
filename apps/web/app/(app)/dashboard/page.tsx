"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { getDefaultRouteForRole } from "@/lib/auth/role-routing";

export default function DashboardResolverPage() {
  const router = useRouter();
  const { session, status } = useAuth();

  useEffect(() => {
    if (status === "authenticated" && session) {
      router.replace(getDefaultRouteForRole(session.user.role));
    }
  }, [router, session, status]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">Resolving dashboard</h1>
      <p className="mt-2 text-sm text-slate-600">
        Redirecting you to the correct workspace.
      </p>
    </section>
  );
}
