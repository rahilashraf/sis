"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { listSchools } from "@/lib/api/schools";
import {
  getSchoolGovernanceSettings,
  updateSchoolGovernanceSettings,
} from "@/lib/api/settings";
import { useAuth } from "@/lib/auth/auth-context";
import {
  GOVERNANCE_VISIBILITY_KEYS,
  GOVERNANCE_VISIBILITY_LABELS,
  type GovernanceVisibilityKey,
  type GovernanceVisibilitySettings,
} from "@/lib/governance/governance-settings";

type SchoolOption = {
  id: string;
  name: string;
  shortName: string | null;
};

export function GovernanceManagement() {
  const { selectedSchoolId, session, setSelectedSchoolId } = useAuth();

  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [settings, setSettings] = useState<GovernanceVisibilitySettings | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isHealthy, setIsHealthy] = useState(true);
  const [isLoadingSchools, setIsLoadingSchools] = useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canView =
    session?.user.role === "OWNER" ||
    session?.user.role === "SUPER_ADMIN" ||
    session?.user.role === "ADMIN";
  const canEdit = session?.user.role === "OWNER";

  useEffect(() => {
    async function loadSchools() {
      setIsLoadingSchools(true);
      setError(null);

      try {
        const response = await listSchools();
        setSchools(response);
        setSchoolId((current) => {
          if (current && response.some((school) => school.id === current)) {
            return current;
          }

          if (
            selectedSchoolId &&
            response.some((school) => school.id === selectedSchoolId)
          ) {
            return selectedSchoolId;
          }

          return response[0]?.id ?? "";
        });
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load schools.",
        );
      } finally {
        setIsLoadingSchools(false);
      }
    }

    if (!canView) {
      return;
    }

    void loadSchools();
  }, [canView, selectedSchoolId]);

  useEffect(() => {
    if (!canView || !schoolId) {
      return;
    }

    let cancelled = false;

    async function loadSettings() {
      setIsLoadingSettings(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const response = await getSchoolGovernanceSettings(schoolId);
        if (cancelled) {
          return;
        }

        setSettings(response.visibility);
        setWarnings(response.warnings);
        setIsHealthy(
          response.health.hasPrivilegedUsers && response.health.hasCoreSettingsAccess,
        );
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load governance settings.",
        );
      } finally {
        if (!cancelled) {
          setIsLoadingSettings(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [canView, schoolId]);

  const selectedSchoolLabel = useMemo(() => {
    const school = schools.find((entry) => entry.id === schoolId);
    return school?.shortName || school?.name || "selected school";
  }, [schoolId, schools]);

  async function handleSave() {
    if (!canEdit || !schoolId || !settings) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await updateSchoolGovernanceSettings(schoolId, settings);
      setSettings(response.visibility);
      setWarnings(response.warnings);
      setIsHealthy(
        response.health.hasPrivilegedUsers && response.health.hasCoreSettingsAccess,
      );
      setSuccessMessage(`Saved governance settings for ${selectedSchoolLabel}.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save governance settings.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Governance"
          description="Governance controls are restricted to owner, super admin, and admin users."
        />
        <Notice tone="warning" title="Access required">
          You do not have access to governance settings.
        </Notice>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Governance"
        description="Hardened settings for safe access-control operations."
      />

      {error ? (
        <Notice tone="danger" title="Error">
          {error}
        </Notice>
      ) : null}
      {successMessage ? (
        <Notice tone="success" title="Saved">
          {successMessage}
        </Notice>
      ) : null}

      {!isHealthy ? (
        <Notice tone="warning" title="Governance warning">
          Core settings access health checks detected a potential governance access risk.
        </Notice>
      ) : null}

      {warnings.length > 0 ? (
        <Notice tone="warning" title="Safety warnings">
          <ul className="list-disc pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scope</CardTitle>
          <CardDescription>Choose a school before reviewing governance controls.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-sm">
            <p className="text-sm font-medium text-slate-700">School</p>
            <Select
              aria-label="School"
              disabled={isLoadingSchools || schools.length === 0}
              value={schoolId}
              onChange={(event) => {
                const nextSchoolId = event.target.value;
                setSchoolId(nextSchoolId);
                setSelectedSchoolId(nextSchoolId || null);
              }}
            >
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.shortName || school.name}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parent/Student Visibility Foundations</CardTitle>
          <CardDescription>
            These controls govern future and incremental visibility behavior without replacing current portal logic.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingSettings ? (
            <p className="text-sm text-slate-500">Loading governance settings...</p>
          ) : !settings ? (
            <p className="text-sm text-slate-500">Select a school to load settings.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {GOVERNANCE_VISIBILITY_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <span className="text-sm text-slate-800">
                    {GOVERNANCE_VISIBILITY_LABELS[key as GovernanceVisibilityKey]}
                  </span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-4 focus:ring-slate-950/10"
                    checked={settings[key as GovernanceVisibilityKey]}
                    disabled={!canEdit || isSaving}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setSettings((current) =>
                        current
                          ? {
                              ...current,
                              [key]: checked,
                            }
                          : current,
                      );
                    }}
                  />
                </label>
              ))}
            </div>
          )}

          {canEdit ? (
            <div>
              <Button
                type="button"
                disabled={isSaving || isLoadingSettings || !settings || !schoolId}
                onClick={handleSave}
              >
                {isSaving ? "Saving..." : "Save governance settings"}
              </Button>
            </div>
          ) : (
            <Notice tone="info" title="Read-only mode">
              Only owner users can update governance settings.
            </Notice>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Linked Controls</CardTitle>
          <CardDescription>
            Continue to core governance surfaces for module-level and role-level controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link className={buttonClassName({ variant: "secondary" })} href="/admin/schools/features">
            Feature Toggles
          </Link>
          <Link className={buttonClassName({ variant: "secondary" })} href="/admin/schools/permissions">
            Role Permissions
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
