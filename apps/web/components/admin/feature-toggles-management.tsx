"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { listSchools } from "@/lib/api/schools";
import {
  getSchoolFeatureToggles,
  updateSchoolFeatureToggles,
} from "@/lib/api/settings";
import { useAuth } from "@/lib/auth/auth-context";
import {
  SCHOOL_FEATURE_KEYS,
  SCHOOL_FEATURE_LABELS,
  type SchoolFeatureToggles,
} from "@/lib/features/school-features";

const featureDescriptions: Record<keyof SchoolFeatureToggles, string> = {
  INCIDENT_REPORTS: "Controls incident reports pages and incident APIs.",
  ATTENDANCE: "Controls attendance pages and attendance workflows.",
  GRADEBOOK: "Controls gradebook pages and related grading views.",
  FORMS: "Controls forms pages and form submission workflows.",
  RE_REGISTRATION: "Controls re-registration pages and windows.",
  BILLING: "Controls billing pages and billing workflows.",
  LIBRARY: "Controls library pages and library workflows.",
  UNIFORM_ORDERS: "Controls uniform catalog/order pages.",
  NOTIFICATIONS: "Controls notifications nav entry and notifications page.",
};

export function FeatureTogglesManagement() {
  const { selectedSchoolId, session, setSelectedSchoolId } = useAuth();

  const [schoolOptions, setSchoolOptions] = useState<
    Array<{ id: string; name: string; shortName: string | null }>
  >([]);
  const [localSchoolId, setLocalSchoolId] = useState("");
  const [features, setFeatures] = useState<SchoolFeatureToggles | null>(null);
  const [isLoadingSchools, setIsLoadingSchools] = useState(true);
  const [isLoadingFeatures, setIsLoadingFeatures] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isOwner = session?.user.role === "OWNER";

  useEffect(() => {
    async function loadSchools() {
      setIsLoadingSchools(true);
      setError(null);

      try {
        const schools = await listSchools();
        setSchoolOptions(schools);
        setLocalSchoolId((current) => {
          if (current && schools.some((school) => school.id === current)) {
            return current;
          }

          if (
            selectedSchoolId &&
            schools.some((school) => school.id === selectedSchoolId)
          ) {
            return selectedSchoolId;
          }

          return schools[0]?.id ?? "";
        });
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load schools.",
        );
      } finally {
        setIsLoadingSchools(false);
      }
    }

    void loadSchools();
  }, [selectedSchoolId]);

  useEffect(() => {
    if (!localSchoolId) {
      setFeatures(null);
      return;
    }

    let cancelled = false;

    async function loadFeatureToggles() {
      setIsLoadingFeatures(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const response = await getSchoolFeatureToggles(localSchoolId);
        if (!cancelled) {
          setFeatures(response.features);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load feature toggles.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFeatures(false);
        }
      }
    }

    void loadFeatureToggles();

    return () => {
      cancelled = true;
    };
  }, [localSchoolId]);

  const selectedSchoolLabel = useMemo(() => {
    const selectedSchool = schoolOptions.find((school) => school.id === localSchoolId);
    return selectedSchool?.shortName || selectedSchool?.name || "Selected school";
  }, [localSchoolId, schoolOptions]);

  async function handleSave() {
    if (!localSchoolId || !features) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await updateSchoolFeatureToggles(localSchoolId, features);
      setFeatures(response.features);
      setSuccessMessage(`Feature toggles saved for ${selectedSchoolLabel}.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save feature toggles.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOwner) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="School Feature Toggles"
          description="Owners can enable or disable school modules."
        />
        <Notice
          tone="warning"
          title="Owner access required"
        >
          Only owners can manage school feature toggles.
        </Notice>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Feature Toggles"
        description="Enable or disable modules per school without deleting historical data."
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">School</CardTitle>
          <CardDescription>
            Choose the school whose module access you want to control.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            aria-label="School"
            disabled={isLoadingSchools || schoolOptions.length === 0}
            value={localSchoolId}
            onChange={(event) => {
              const nextSchoolId = event.target.value;
              setLocalSchoolId(nextSchoolId);
              setSelectedSchoolId(nextSchoolId || null);
            }}
          >
            {schoolOptions.map((school) => (
              <option key={school.id} value={school.id}>
                {school.shortName || school.name}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modules</CardTitle>
          <CardDescription>
            Disabled modules are hidden in navigation and blocked from feature
            routes and APIs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoadingFeatures ? (
            <p className="text-sm text-slate-500">Loading feature toggles...</p>
          ) : !features ? (
            <p className="text-sm text-slate-500">
              Select a school to manage feature toggles.
            </p>
          ) : (
            SCHOOL_FEATURE_KEYS.map((featureKey) => (
              <CheckboxField
                key={featureKey}
                checked={features[featureKey]}
                disabled={isSaving}
                label={SCHOOL_FEATURE_LABELS[featureKey]}
                description={featureDescriptions[featureKey]}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setFeatures((current) =>
                    current
                      ? {
                          ...current,
                          [featureKey]: checked,
                        }
                      : current,
                  );
                }}
              />
            ))
          )}

          <div className="pt-2">
            <Button
              disabled={isSaving || isLoadingFeatures || !features || !localSchoolId}
              onClick={handleSave}
              type="button"
            >
              {isSaving ? "Saving..." : "Save feature toggles"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
