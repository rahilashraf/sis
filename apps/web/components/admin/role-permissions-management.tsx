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
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { listSchools } from "@/lib/api/schools";
import {
  getRolePermissions,
  updateRolePermissions,
  type RolePermissionEntry,
} from "@/lib/api/settings";
import { useAuth } from "@/lib/auth/auth-context";
import { formatRoleLabel } from "@/lib/utils";
import {
  ROLE_PERMISSION_ACTION_LABELS,
  ROLE_PERMISSION_ACTIONS,
  ROLE_PERMISSION_RESOURCE_LABELS,
  ROLE_PERMISSION_RESOURCES,
  ROLE_PERMISSION_TARGET_ROLES,
  type PermissionActionKey,
  type PermissionResourceKey,
  type RolePermissionTargetRole,
} from "@/lib/permissions/role-permissions";

type PermissionMatrix = Record<
  PermissionResourceKey,
  Record<PermissionActionKey, RolePermissionEntry>
>;

function buildPermissionMatrix(entries: RolePermissionEntry[]): PermissionMatrix {
  const matrix = {} as PermissionMatrix;

  for (const resource of ROLE_PERMISSION_RESOURCES) {
    matrix[resource] = {} as Record<PermissionActionKey, RolePermissionEntry>;

    for (const action of ROLE_PERMISSION_ACTIONS) {
      const found = entries.find(
        (entry) => entry.resource === resource && entry.action === action,
      );

      matrix[resource][action] =
        found ??
        ({
          resource,
          action,
          allowed: false,
          source: "fallback",
        } as RolePermissionEntry);
    }
  }

  return matrix;
}

export function RolePermissionsManagement() {
  const { selectedSchoolId, session, setSelectedSchoolId } = useAuth();

  const [schools, setSchools] = useState<
    Array<{ id: string; name: string; shortName: string | null }>
  >([]);
  const [schoolId, setSchoolId] = useState("");
  const [role, setRole] = useState<RolePermissionTargetRole>("ADMIN");
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [isLoadingSchools, setIsLoadingSchools] = useState(true);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canManage =
    session?.user.role === "OWNER" ||
    session?.user.role === "SUPER_ADMIN" ||
    session?.user.role === "ADMIN";

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
    if (!schoolId || !role || !canManage) {
      setMatrix(null);
      return;
    }

    let cancelled = false;

    async function loadPermissions() {
      setIsLoadingPermissions(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const response = await getRolePermissions({ schoolId, role });
        if (cancelled) {
          return;
        }

        setMatrix(buildPermissionMatrix(response.permissions));
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load role permissions.",
        );
      } finally {
        if (!cancelled) {
          setIsLoadingPermissions(false);
        }
      }
    }

    void loadPermissions();

    return () => {
      cancelled = true;
    };
  }, [canManage, role, schoolId]);

  const selectedSchoolLabel = useMemo(() => {
    const school = schools.find((entry) => entry.id === schoolId);
    return school?.shortName || school?.name || "selected school";
  }, [schoolId, schools]);

  const isOwnerRole = role === "OWNER";

  async function handleSave() {
    if (!canManage || !schoolId || !role || !matrix || isOwnerRole) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const permissions = ROLE_PERMISSION_RESOURCES.flatMap((resource) =>
        ROLE_PERMISSION_ACTIONS.map((action) => ({
          resource,
          action,
          allowed: matrix[resource][action].allowed,
        })),
      );

      const response = await updateRolePermissions({
        schoolId,
        role,
        permissions,
      });

      setMatrix(buildPermissionMatrix(response.permissions));
      setSuccessMessage(
        `Updated ${formatRoleLabel(role)} permissions for ${selectedSchoolLabel}.`,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save role permissions.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Role Permissions"
          description="Configure role permissions by school, resource, and action."
        />
        <Notice tone="warning" title="Access required">
          Only owners, super admins, and admins can manage role permissions.
        </Notice>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Role Permissions"
        description="Configure role permissions per school and role. Missing entries fall back to existing RBAC behavior."
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
          <CardTitle className="text-base">Scope</CardTitle>
          <CardDescription>
            Select school and role to review or edit effective permissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
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
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Role</p>
            <Select
              aria-label="Role"
              value={role}
              onChange={(event) => {
                setRole(event.target.value as RolePermissionTargetRole);
              }}
            >
              {ROLE_PERMISSION_TARGET_ROLES.map((entry) => (
                <option key={entry} value={entry}>
                  {formatRoleLabel(entry)}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permission Matrix</CardTitle>
          <CardDescription>
            Feature toggle enforcement happens first. These permissions apply
            second.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isOwnerRole ? (
            <Notice tone="info" title="Owner access is always full">
              Owner permissions are locked and cannot be reduced.
            </Notice>
          ) : null}

          {isLoadingPermissions ? (
            <p className="text-sm text-slate-500">Loading role permissions...</p>
          ) : !matrix ? (
            <p className="text-sm text-slate-500">
              Select a school and role to load permissions.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">
                      Resource
                    </th>
                    {ROLE_PERMISSION_ACTIONS.map((action) => (
                      <th
                        key={action}
                        className="px-2 py-2 text-center font-semibold text-slate-700"
                      >
                        {ROLE_PERMISSION_ACTION_LABELS[action]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {ROLE_PERMISSION_RESOURCES.map((resource) => (
                    <tr key={resource}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">
                        {ROLE_PERMISSION_RESOURCE_LABELS[resource]}
                      </td>
                      {ROLE_PERMISSION_ACTIONS.map((action) => {
                        const entry = matrix[resource][action];
                        const sourceToneClass =
                          entry.source === "custom"
                            ? "text-slate-700"
                            : entry.source === "fallback"
                              ? "text-slate-400"
                              : "text-slate-500";

                        return (
                          <td key={`${resource}-${action}`} className="px-2 py-2 text-center">
                            <label className="inline-flex items-center justify-center">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-4 focus:ring-slate-950/10"
                                checked={entry.allowed}
                                disabled={isSaving || isOwnerRole}
                                onChange={(event) => {
                                  const checked = event.currentTarget.checked;
                                  setMatrix((current) => {
                                    if (!current) {
                                      return current;
                                    }

                                    return {
                                      ...current,
                                      [resource]: {
                                        ...current[resource],
                                        [action]: {
                                          ...current[resource][action],
                                          allowed: checked,
                                          source: "custom",
                                        },
                                      },
                                    };
                                  });
                                }}
                              />
                            </label>
                            <div className={`mt-1 text-[10px] ${sourceToneClass}`}>
                              {entry.source}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <Button
              type="button"
              disabled={
                isSaving ||
                isLoadingPermissions ||
                !matrix ||
                !schoolId ||
                isOwnerRole
              }
              onClick={handleSave}
            >
              {isSaving ? "Saving..." : "Save permissions"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
