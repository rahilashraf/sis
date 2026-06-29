"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getAccessVisibility } from "@/lib/api/settings";
import { useAuth } from "@/lib/auth/auth-context";
import {
  getDefaultRouteForRole,
  isPathAllowedForRole,
} from "@/lib/auth/role-routing";
import type { SchoolFeatureToggles } from "@/lib/features/school-features";
import type { AccessVisibilitySnapshot } from "@/lib/governance/access-visibility";

const FALLBACK_ALL_FEATURES_ENABLED: SchoolFeatureToggles = {
  INCIDENT_REPORTS: true,
  ATTENDANCE: true,
  GRADEBOOK: true,
  FORMS: true,
  RE_REGISTRATION: true,
  BILLING: true,
  LIBRARY: true,
  UNIFORM_ORDERS: true,
  NOTIFICATIONS: true,
  ANNOUNCEMENTS: true,
};

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, selectedSchoolId, session, status } = useAuth();
  const [featureTogglesBySchoolId, setFeatureTogglesBySchoolId] = useState<
    Record<string, SchoolFeatureToggles>
  >({});
  const [accessVisibilityBySchoolId, setAccessVisibilityBySchoolId] = useState<
    Record<string, AccessVisibilitySnapshot>
  >({});

  const activeFeatureToggles = useMemo(() => {
    if (!selectedSchoolId) {
      return null;
    }

    return featureTogglesBySchoolId[selectedSchoolId] ?? null;
  }, [featureTogglesBySchoolId, selectedSchoolId]);

  const activeAccessVisibility = useMemo(() => {
    if (!selectedSchoolId) {
      return null;
    }

    return accessVisibilityBySchoolId[selectedSchoolId] ?? null;
  }, [accessVisibilityBySchoolId, selectedSchoolId]);

  useEffect(() => {
    if (status !== "authenticated" || !selectedSchoolId) {
      return;
    }

    const schoolId = selectedSchoolId;

    if (featureTogglesBySchoolId[schoolId] && accessVisibilityBySchoolId[schoolId]) {
      return;
    }

    let cancelled = false;

    async function loadAccessVisibility() {
      try {
        const response = await getAccessVisibility(schoolId);
        if (cancelled) {
          return;
        }

        setFeatureTogglesBySchoolId((current) => ({
          ...current,
          [response.schoolId]: response.features,
        }));
        setAccessVisibilityBySchoolId((current) => ({
          ...current,
          [response.schoolId]: response,
        }));
      } catch {
        if (cancelled) {
          return;
        }

        setFeatureTogglesBySchoolId((current) => ({
          ...current,
          [schoolId]: FALLBACK_ALL_FEATURES_ENABLED,
        }));
        setAccessVisibilityBySchoolId((current) => {
          if (!current[schoolId]) {
            return current;
          }

          const next = { ...current };
          delete next[schoolId];
          return next;
        });
      }
    }

    void loadAccessVisibility();

    return () => {
      cancelled = true;
    };
  }, [accessVisibilityBySchoolId, featureTogglesBySchoolId, selectedSchoolId, status]);

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
      !isPathAllowedForRole(session.user.role, pathname, {
        enabledFeatures: activeFeatureToggles,
        accessVisibility: activeAccessVisibility,
      })
    ) {
      router.replace(
        getDefaultRouteForRole(session.user.role, {
          enabledFeatures: activeFeatureToggles,
          accessVisibility: activeAccessVisibility,
        }),
      );
    }
  }, [activeAccessVisibility, activeFeatureToggles, logout, pathname, router, session, status]);

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

  return (
    <AppShell
      user={session.user}
      enabledFeatures={activeFeatureToggles}
      accessVisibility={activeAccessVisibility}
    >
      {children}
    </AppShell>
  );
}
