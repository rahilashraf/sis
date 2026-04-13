"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/api/auth";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthenticatedUser } from "@/lib/auth/types";

type DashboardPlaceholderProps = {
  title: string;
  roleLabel: string;
};

export function DashboardPlaceholder({
  title,
  roleLabel,
}: DashboardPlaceholderProps) {
  const { session, updateUser } = useAuth();
  const [apiUser, setApiUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verifySession() {
      setIsLoading(true);
      setError(null);

      try {
        const currentUser = await getCurrentUser();
        setApiUser(currentUser);
        updateUser(currentUser);
      } catch (verificationError) {
        const message =
          verificationError instanceof Error
            ? verificationError.message
            : "Unable to verify session";

        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    void verifySession();
  }, [updateUser]);

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Signed in as <span className="font-medium">{session?.user.role}</span>.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Placeholder workspace for {roleLabel.toLowerCase()} users.
        </p>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Auth Check
        </h2>

        {isLoading ? (
          <p className="mt-3 text-sm text-slate-500">Calling protected endpoint...</p>
        ) : null}

        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

        {apiUser ? (
          <div className="mt-3 space-y-1 text-sm text-slate-700">
            <p>
              Authenticated as {apiUser.firstName} {apiUser.lastName}
            </p>
            <p>Username: {apiUser.username}</p>
            <p>Role: {apiUser.role}</p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
