"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth/auth-context";
import {
  listAuditLogs,
  getAuditSummary,
  exportAuditLogsAsPdf,
  exportAuditLogsAsCsv,
  purgeAuditLogs,
  type AuditLog,
  type AuditSummary,
  type AuditLogSeverity,
} from "@/lib/api/audit";
import { getAuditSettings, updateAuditSettings } from "@/lib/api/settings";
import { listUsers, type ManagedUser } from "@/lib/api/users";

type FilterState = {
  fromDate: string;
  toDate: string;
  actorUserId: string;
  entityType: string;
  action: string;
  severity: string;
  page: number;
  pageSize: number;
};

const ENTITY_TYPES = [
  "User",
  "Auth",
  "AccessControl",
  "Attendance",
  "Grade",
  "BillingReport",
  "StudentDocument",
  "BehaviorAttachment",
  "BehaviorRecord",
  "SchoolYear",
  "ReportingPeriod",
  "School",
  "Form",
  "Class",
  "AuditLog",
];

const ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "ARCHIVE",
  "ACTIVATE",
  "DEACTIVATE",
  "BULK_UPDATE",
  "ASSIGN",
  "UNASSIGN",
  "ADD",
  "REMOVE",
  "EXPORT",
  "EXPORT_ATTEMPT",
  "PURGE",
  "RETENTION_PURGE",
  "LOCK",
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGIN_THROTTLED",
  "ROLE_ACCESS_DENIED",
  "DOWNLOAD",
];

const SEVERITIES: AuditLogSeverity[] = ["INFO", "WARNING", "HIGH", "CRITICAL"];

function severityColor(severity: AuditLogSeverity) {
  switch (severity) {
    case "INFO":
      return "bg-blue-100 text-blue-800";
    case "WARNING":
      return "bg-yellow-100 text-yellow-800";
    case "HIGH":
      return "bg-orange-100 text-orange-800";
    case "CRITICAL":
      return "bg-red-100 text-red-800";
  }
}

export function AuditManagement() {
  const { user } = useAuth();
  const canManageAuditSettings =
    user?.role === "OWNER" || user?.role === "SUPER_ADMIN";
  const canViewAuditLogs =
    user?.role === "OWNER" ||
    user?.role === "SUPER_ADMIN" ||
    user?.role === "ADMIN";
  const canExportAuditLogs = user?.role === "OWNER";
  const canPurgeAuditLogs = user?.role === "OWNER";

  const [filters, setFilters] = useState<FilterState>({
    fromDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    toDate: new Date().toISOString().split("T")[0],
    actorUserId: "",
    entityType: "",
    action: "",
    severity: "",
    page: 1,
    pageSize: 50,
  });

  const emptySummary: AuditSummary = {
    total: 0,
    bySeverity: {},
    byAction: {},
    byEntity: {},
  };
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [summary, setSummary] = useState<AuditSummary>(emptySummary);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actors, setActors] = useState<ManagedUser[]>([]);
  const [exporting, setExporting] = useState(false);
  const [showPurgeDialog, setShowPurgeDialog] = useState(false);
  const [purgeConfirmation, setPurgeConfirmation] = useState("");
  const [purging, setPurging] = useState(false);
  const [auditEnabled, setAuditEnabled] = useState<boolean | null>(null);
  const [loadingAuditSetting, setLoadingAuditSetting] = useState(false);
  const [savingAuditSetting, setSavingAuditSetting] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!canManageAuditSettings) {
      return;
    }

    setLoadingAuditSetting(true);
    setSettingsError(null);

    getAuditSettings()
      .then((result) => {
        setAuditEnabled(result.enabled);
      })
      .catch((loadError) => {
        setSettingsError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load audit setting",
        );
      })
      .finally(() => {
        setLoadingAuditSetting(false);
      });
  }, [canManageAuditSettings]);

  // Load actors on mount
  useEffect(() => {
    if (!canViewAuditLogs) {
      return;
    }

    listUsers({ sort: "name" }).then(setActors).catch(console.error);
  }, [canViewAuditLogs]);

  // Load logs and summary
  useEffect(() => {
    if (!canViewAuditLogs) {
      return;
    }

    (async () => {
      await loadLogs();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewAuditLogs, filters]);

  async function loadLogs() {
    setLoading(true);
    setError(null);

    try {
      const [logsResult, summaryResult] = await Promise.all([
        listAuditLogs({
          page: filters.page,
          pageSize: filters.pageSize,
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          actorUserId: filters.actorUserId || undefined,
          entityType: filters.entityType || undefined,
          action: filters.action || undefined,
          severity: (filters.severity as AuditLogSeverity) || undefined,
        }),
        getAuditSummary({
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          actorUserId: filters.actorUserId || undefined,
          entityType: filters.entityType || undefined,
          action: filters.action || undefined,
          severity: (filters.severity as AuditLogSeverity) || undefined,
        }),
      ]);

      setLogs(logsResult.logs ?? []);
      setTotal(logsResult.total ?? 0);
      setPageCount(logsResult.pageCount ?? 1);
      setSummary(summaryResult);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load audit logs",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange<K extends keyof FilterState>(
    key: K,
    value: string | number,
  ) {
    setFilters((prev) => {
      const newValue =
        key === "pageSize"
          ? Number(value)
          : key === "page"
            ? Number(value)
            : String(value);

      return {
        ...prev,
        [key]: newValue,
        page: key === "page" ? Number(value) : 1,
      };
    });
  }

  async function handleExport(format: "pdf" | "csv") {
    if (!canExportAuditLogs) {
      setError("Only account owners can export audit logs.");
      return;
    }

    setExporting(true);
    try {
      const exporter =
        format === "pdf" ? exportAuditLogsAsPdf : exportAuditLogsAsCsv;
      const blob = await exporter({
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        actorUserId: filters.actorUserId || undefined,
        entityType: filters.entityType || undefined,
        action: filters.action || undefined,
        severity: (filters.severity as AuditLogSeverity) || undefined,
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split("T")[0]}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Failed to export ${format}`,
      );
    } finally {
      setExporting(false);
    }
  }

  async function persistAuditEnabled(nextEnabled: boolean) {
    const previousValue = auditEnabled;

    setSavingAuditSetting(true);
    setSettingsError(null);
    setSettingsSuccess(null);
    setAuditEnabled(nextEnabled);

    try {
      const result = await updateAuditSettings({
        enabled: nextEnabled,
      });
      setAuditEnabled(result.enabled);
      setSettingsSuccess(
        result.enabled ? "Audit logs enabled." : "Audit logs disabled.",
      );
      return true;
    } catch (saveError) {
      setAuditEnabled(previousValue);
      setSettingsError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update audit setting",
      );
      return false;
    } finally {
      setSavingAuditSetting(false);
    }
  }

  function handleEnableAuditLogs() {
    if (auditEnabled === null || auditEnabled || savingAuditSetting) {
      return;
    }

    void persistAuditEnabled(true);
  }

  function handleDisableAuditLogsRequest() {
    if (auditEnabled !== true || savingAuditSetting) {
      return;
    }

    setShowDisableDialog(true);
  }

  async function handleDisableAuditLogsConfirm() {
    const success = await persistAuditEnabled(false);
    if (success) {
      setShowDisableDialog(false);
    }
  }

  async function handlePurge() {
    if (!canPurgeAuditLogs) {
      setError("Only account owners can purge audit logs.");
      return;
    }

    if (purgeConfirmation !== "PURGE AUDIT LOGS") {
      setError("Confirmation text must be exactly 'PURGE AUDIT LOGS'");
      return;
    }

    setPurging(true);
    try {
      const result = await purgeAuditLogs({
        fromDate: filters.fromDate,
        toDate: filters.toDate,
        confirmation: purgeConfirmation,
      });

      if (result.success) {
        setShowPurgeDialog(false);
        setPurgeConfirmation("");
        await loadLogs();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to purge audit logs",
      );
    } finally {
      setPurging(false);
    }
  }

  if (!user || (!canManageAuditSettings && !canViewAuditLogs)) {
    return (
      <Notice tone="danger" title="Access Denied">
        Only owners, super admins, and admins can access audit logs.
      </Notice>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="View and manage system audit logs for compliance and monitoring."
      />

      {canManageAuditSettings ? (
        <>
          {settingsError ? (
            <Notice tone="danger" title="Settings Error">
              {settingsError}
            </Notice>
          ) : null}
          {settingsSuccess ? <Notice tone="success">{settingsSuccess}</Notice> : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Security / System Settings</CardTitle>
              <CardDescription>
                Audit Logs: Record critical system actions for accountability.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="text-sm text-slate-600">Status</div>
                <Badge variant={auditEnabled ? "success" : "danger"}>
                  {loadingAuditSetting
                    ? "Loading..."
                    : auditEnabled
                      ? "ON"
                      : "OFF"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  disabled={
                    loadingAuditSetting ||
                    savingAuditSetting ||
                    auditEnabled === null ||
                    auditEnabled === true
                  }
                  onClick={handleEnableAuditLogs}
                  variant={auditEnabled ? "secondary" : "primary"}
                >
                  {savingAuditSetting && auditEnabled !== true ? "Saving..." : "ON"}
                </Button>
                <Button
                  disabled={
                    loadingAuditSetting ||
                    savingAuditSetting ||
                    auditEnabled === null ||
                    auditEnabled !== true
                  }
                  onClick={handleDisableAuditLogsRequest}
                  variant={auditEnabled ? "danger" : "secondary"}
                >
                  {savingAuditSetting && auditEnabled !== false ? "Saving..." : "OFF"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Notice tone="info" title="Owner / Super Admin Settings">
          Audit logging can only be enabled or disabled by account owners and
          super admins.
        </Notice>
      )}

      {canViewAuditLogs ? (
        <>
          {error && (
        <Notice tone="danger" title="Error">
          {error}
        </Notice>
          )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.bySeverity?.["CRITICAL"] ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">High</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.bySeverity?.["HIGH"] ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Warning</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.bySeverity?.["WARNING"] ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="From Date">
              <Input
                type="date"
                value={filters.fromDate}
                onChange={(e) => handleFilterChange("fromDate", e.target.value)}
              />
            </Field>

            <Field label="To Date">
              <Input
                type="date"
                value={filters.toDate}
                onChange={(e) => handleFilterChange("toDate", e.target.value)}
              />
            </Field>

            <Field label="Actor">
              <Select
                value={filters.actorUserId}
                onChange={(e) =>
                  handleFilterChange("actorUserId", e.target.value)
                }
              >
                <option value="">All actors</option>
                {actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.firstName} {actor.lastName}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Entity Type">
              <Select
                value={filters.entityType}
                onChange={(e) =>
                  handleFilterChange("entityType", e.target.value)
                }
              >
                <option value="">All entities</option>
                {ENTITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Action">
              <Select
                value={filters.action}
                onChange={(e) => handleFilterChange("action", e.target.value)}
              >
                <option value="">All actions</option>
                {ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Severity">
              <Select
                value={filters.severity}
                onChange={(e) => handleFilterChange("severity", e.target.value)}
              >
                <option value="">All severities</option>
                {SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => {
                setFilters((prev) => ({
                  ...prev,
                  fromDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split("T")[0],
                  toDate: new Date().toISOString().split("T")[0],
                  actorUserId: "",
                  entityType: "",
                  action: "",
                  severity: "",
                  page: 1,
                }));
              }}
            >
              Reset
            </Button>
            <Button
              disabled={exporting || !canExportAuditLogs}
              onClick={() => handleExport("pdf")}
            >
              {exporting ? "Exporting..." : "Export PDF"}
            </Button>
            <Button
              disabled={exporting || !canExportAuditLogs}
              onClick={() => handleExport("csv")}
            >
              {exporting ? "Exporting..." : "Export CSV"}
            </Button>
            {canPurgeAuditLogs ? (
              <Button variant="danger" onClick={() => setShowPurgeDialog(true)}>
                Purge Logs
              </Button>
            ) : null}
          </div>
          {!canExportAuditLogs ? (
            <Notice tone="info" title="Owner-only Actions">
              Export and purge are restricted to account owners.
            </Notice>
          ) : null}
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Audit Logs {total > 0 && `(${total})`}
          </CardTitle>
          <CardDescription>
            Page {filters.page} of {pageCount}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : logs.length === 0 ? (
            <EmptyState
              title="No audit logs"
              description="No logs found for the selected filters."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium">Time</th>
                    <th className="text-left py-3 px-2 font-medium">Actor</th>
                    <th className="text-left py-3 px-2 font-medium">Entity</th>
                    <th className="text-left py-3 px-2 font-medium">Action</th>
                    <th className="text-left py-3 px-2 font-medium">
                      Severity
                    </th>
                    <th className="text-left py-3 px-2 font-medium">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-2 whitespace-nowrap text-xs">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-2 whitespace-nowrap">
                        {log.actorNameSnapshot ? (
                          <div>
                            <div className="font-medium">
                              {log.actorNameSnapshot}
                            </div>
                            {log.actorRoleSnapshot && (
                              <div className="text-xs text-gray-500">
                                {log.actorRoleSnapshot}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">System</span>
                        )}
                      </td>
                      <td className="py-3 px-2 whitespace-nowrap">
                        <div className="font-medium">{log.entityType}</div>
                        {log.targetDisplay && (
                          <div className="text-xs text-gray-500">
                            {log.targetDisplay}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2 whitespace-nowrap">
                        <Badge variant="neutral">{log.action}</Badge>
                      </td>
                      <td className="py-3 px-2 whitespace-nowrap">
                        <Badge className={severityColor(log.severity)}>
                          {log.severity}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">
                        <div className="max-w-xs truncate text-gray-700">
                          {log.summary}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-gray-600">
                Page size:{" "}
                <Select
                  value={String(filters.pageSize)}
                  onChange={(e) =>
                    handleFilterChange("pageSize", Number(e.target.value))
                  }
                  className="w-20 inline-block"
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={filters.page === 1}
                  onClick={() => handleFilterChange("page", filters.page - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm flex items-center px-2">
                  {filters.page} / {pageCount}
                </span>
                <Button
                  disabled={filters.page >= pageCount}
                  onClick={() => handleFilterChange("page", filters.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Purge Dialog */}
      {showPurgeDialog && (
        <ConfirmDialog
          title="Purge Audit Logs"
          description={`Delete logs from ${filters.fromDate} to ${filters.toDate}? This action cannot be undone.`}
          isOpen={showPurgeDialog}
          isPending={purging}
          onCancel={() => setShowPurgeDialog(false)}
          onConfirm={handlePurge}
          confirmVariant="danger"
          confirmLabel="Purge"
          pendingLabel="Purging..."
          errorMessage={error}
        />
      )}

      {/* Purge Confirmation Modal */}
      {showPurgeDialog && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Confirm Purge</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Notice tone="warning">
                <strong>This action is permanent.</strong> Purging will delete
                audit logs but keep a record in archive history.
              </Notice>
              <Field label="Type this to confirm: PURGE AUDIT LOGS">
                <Input
                  type="text"
                  value={purgeConfirmation}
                  onChange={(e) => setPurgeConfirmation(e.target.value)}
                  placeholder="PURGE AUDIT LOGS"
                />
              </Field>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="secondary"
                  disabled={purging}
                  onClick={() => setShowPurgeDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={purging || purgeConfirmation !== "PURGE AUDIT LOGS"}
                  onClick={handlePurge}
                >
                  {purging ? "Purging..." : "Purge"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
        </>
      ) : (
        <Notice tone="info" title="Owner Access">
          Viewing is restricted to OWNER, SUPER_ADMIN, and ADMIN. Export and
          purge remain owner-only.
        </Notice>
      )}

      <ConfirmDialog
        title="Disable audit logs?"
        description="This will stop recording future audit events until re-enabled."
        isOpen={showDisableDialog}
        isPending={savingAuditSetting}
        onCancel={() => setShowDisableDialog(false)}
        onConfirm={handleDisableAuditLogsConfirm}
        confirmVariant="danger"
        confirmLabel="Disable"
        pendingLabel="Disabling..."
      />
    </div>
  );
}
