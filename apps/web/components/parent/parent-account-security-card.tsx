"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { getMySecurity, type MySecurityInfo } from "@/lib/api/auth";
import { formatDateTimeLabel, formatRoleLabel } from "@/lib/utils";

export function ParentAccountSecurityCard() {
  const [security, setSecurity] = useState<MySecurityInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSecurity() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getMySecurity();
        setSecurity(response);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load account security details.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadSecurity();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security overview</CardTitle>
        <CardDescription>
          Basic account identity and security visibility for this parent account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading security details...</p>
        ) : security ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Username
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {security.username}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Email
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {security.email || "No email on file"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Role
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {formatRoleLabel(security.role)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Linked children
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {security.linkedChildrenCount}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant={security.mfaEnabled ? "success" : "neutral"}>
                MFA {security.mfaEnabled ? "enabled" : "not enabled"}
              </Badge>
              <Badge
                variant={security.activeSessionsTracked ? "success" : "neutral"}
              >
                Session tracking{" "}
                {security.activeSessionsTracked ? "enabled" : "not enabled"}
              </Badge>
            </div>

            <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-2">
              <p>Account created: {formatDateTimeLabel(security.createdAt)}</p>
              <p>Last profile update: {formatDateTimeLabel(security.updatedAt)}</p>
            </div>
          </div>
        ) : (
          <Notice tone="info">No security details are available.</Notice>
        )}
      </CardContent>
    </Card>
  );
}
