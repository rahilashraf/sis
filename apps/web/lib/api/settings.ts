import { apiFetch } from "./client";
import {
  type SchoolFeatureToggles,
  withDefaultSchoolFeatureToggles,
} from "@/lib/features/school-features";
import type {
  PermissionActionKey,
  PermissionResourceKey,
  RolePermissionTargetRole,
} from "@/lib/permissions/role-permissions";
import type { UserRole } from "@/lib/auth/types";
import {
  withDefaultGovernanceVisibilitySettings,
  type GovernanceVisibilitySettings,
} from "@/lib/governance/governance-settings";
import type { AccessVisibilitySnapshot } from "@/lib/governance/access-visibility";

export type AuditSettings = {
  enabled: boolean;
};

export type SchoolFeatureTogglesResponse = {
  schoolId: string;
  features: SchoolFeatureToggles;
};

export type RolePermissionEntry = {
  resource: PermissionResourceKey;
  action: PermissionActionKey;
  allowed: boolean;
  source: "owner" | "custom" | "fallback";
};

export type RolePermissionsResponse = {
  schoolId: string;
  role: RolePermissionTargetRole;
  permissions: RolePermissionEntry[];
};

export type SchoolGovernanceSettingsResponse = {
  schoolId: string;
  visibility: GovernanceVisibilitySettings;
  health: {
    hasPrivilegedUsers: boolean;
    hasCoreSettingsAccess: boolean;
  };
  warnings: string[];
};

export type AccessVisibilityResponse = AccessVisibilitySnapshot & {
  role: UserRole;
};

export function getAuditSettings() {
  return apiFetch<AuditSettings>("/settings/audit");
}

export function updateAuditSettings(input: { enabled: boolean }) {
  return apiFetch<AuditSettings>("/settings/audit", {
    method: "PATCH",
    json: input,
  });
}

export async function getSchoolFeatureToggles(schoolId?: string | null) {
  const query = new URLSearchParams();

  if (schoolId) {
    query.set("schoolId", schoolId);
  }

  const response = await apiFetch<SchoolFeatureTogglesResponse>(
    `/settings/feature-toggles${query.size ? `?${query.toString()}` : ""}`,
  );

  return {
    schoolId: response.schoolId,
    features: withDefaultSchoolFeatureToggles(response.features),
  };
}

export async function updateSchoolFeatureToggles(
  schoolId: string,
  input: Partial<SchoolFeatureToggles>,
) {
  const response = await apiFetch<SchoolFeatureTogglesResponse>(
    `/settings/feature-toggles/${encodeURIComponent(schoolId)}`,
    {
      method: "PATCH",
      json: input,
    },
  );

  return {
    schoolId: response.schoolId,
    features: withDefaultSchoolFeatureToggles(response.features),
  };
}

export function getRolePermissions(options: {
  schoolId: string;
  role: RolePermissionTargetRole;
}) {
  const query = new URLSearchParams({
    schoolId: options.schoolId,
    role: options.role,
  });

  return apiFetch<RolePermissionsResponse>(
    `/settings/role-permissions?${query.toString()}`,
  );
}

export function updateRolePermissions(options: {
  schoolId: string;
  role: RolePermissionTargetRole;
  permissions: Array<{
    resource: PermissionResourceKey;
    action: PermissionActionKey;
    allowed: boolean;
  }>;
}) {
  return apiFetch<RolePermissionsResponse>(
    `/settings/role-permissions/${encodeURIComponent(options.schoolId)}/${encodeURIComponent(options.role)}`,
    {
      method: "PATCH",
      json: {
        permissions: options.permissions,
      },
    },
  );
}

export async function getSchoolGovernanceSettings(schoolId?: string | null) {
  const query = new URLSearchParams();
  if (schoolId) {
    query.set("schoolId", schoolId);
  }

  const response = await apiFetch<SchoolGovernanceSettingsResponse>(
    `/settings/governance${query.size ? `?${query.toString()}` : ""}`,
  );

  return {
    ...response,
    visibility: withDefaultGovernanceVisibilitySettings(response.visibility),
  };
}

export async function updateSchoolGovernanceSettings(
  schoolId: string,
  input: Partial<GovernanceVisibilitySettings>,
) {
  const response = await apiFetch<SchoolGovernanceSettingsResponse>(
    `/settings/governance/${encodeURIComponent(schoolId)}`,
    {
      method: "PATCH",
      json: input,
    },
  );

  return {
    ...response,
    visibility: withDefaultGovernanceVisibilitySettings(response.visibility),
  };
}

export async function getAccessVisibility(schoolId?: string | null) {
  const query = new URLSearchParams();
  if (schoolId) {
    query.set("schoolId", schoolId);
  }

  const response = await apiFetch<AccessVisibilityResponse>(
    `/settings/governance/visibility${query.size ? `?${query.toString()}` : ""}`,
  );

  return {
    ...response,
    governanceVisibility: withDefaultGovernanceVisibilitySettings(
      response.governanceVisibility,
    ),
  };
}
