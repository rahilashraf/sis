import type { UserRole } from "../auth/types";
import { apiFetch } from "./client";

export type AuditLogSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";

export type AuditLog = {
  id: string;
  createdAt: string;
  actorUserId?: string | null;
  actorNameSnapshot?: string | null;
  actorRoleSnapshot?: UserRole | null;
  schoolId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  severity: AuditLogSeverity;
  summary: string;
  targetDisplay?: string | null;
  changesJson?: Record<string, unknown> | null;
  metadataJson?: Record<string, unknown> | null;
};

export type AuditLogListResult = {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type AuditSummary = {
  total: number;
  byAction: Record<string, number>;
  byEntity: Record<string, number>;
  bySeverity: Record<string, number>;
};

export type AuditPurgeResult = {
  success: boolean;
  purgedCount: number;
};

export function listAuditLogs(options: {
  page?: number;
  pageSize?: number;
  fromDate?: string;
  toDate?: string;
  actorUserId?: string;
  entityType?: string;
  action?: string;
  severity?: AuditLogSeverity;
}) {
  const query = new URLSearchParams();

  if (options.page) {
    query.set("page", String(options.page));
  }
  if (options.pageSize) {
    query.set("pageSize", String(options.pageSize));
  }
  if (options.fromDate) {
    query.set("fromDate", options.fromDate);
  }
  if (options.toDate) {
    query.set("toDate", options.toDate);
  }
  if (options.actorUserId) {
    query.set("actorUserId", options.actorUserId);
  }
  if (options.entityType) {
    query.set("entityType", options.entityType);
  }
  if (options.action) {
    query.set("action", options.action);
  }
  if (options.severity) {
    query.set("severity", options.severity);
  }

  const queryStr = query.toString();
  return apiFetch<AuditLogListResult>(
    `/audit/logs${queryStr ? `?${queryStr}` : ""}`,
  );
}

export function getAuditSummary(options?: {
  fromDate?: string;
  toDate?: string;
  actorUserId?: string;
  entityType?: string;
  action?: string;
  severity?: AuditLogSeverity;
}) {
  const query = new URLSearchParams();

  if (options?.fromDate) {
    query.set("fromDate", options.fromDate);
  }
  if (options?.toDate) {
    query.set("toDate", options.toDate);
  }
  if (options?.actorUserId) {
    query.set("actorUserId", options.actorUserId);
  }
  if (options?.entityType) {
    query.set("entityType", options.entityType);
  }
  if (options?.action) {
    query.set("action", options.action);
  }
  if (options?.severity) {
    query.set("severity", options.severity);
  }

  const queryStr = query.toString();
  return apiFetch<AuditSummary>(
    `/audit/summary${queryStr ? `?${queryStr}` : ""}`,
  );
}

export function exportAuditLogsAsPdf(options: {
  fromDate?: string;
  toDate?: string;
  actorUserId?: string;
  entityType?: string;
  action?: string;
  severity?: AuditLogSeverity;
}) {
  const query = new URLSearchParams();

  if (options.fromDate) {
    query.set("fromDate", options.fromDate);
  }
  if (options.toDate) {
    query.set("toDate", options.toDate);
  }
  if (options.actorUserId) {
    query.set("actorUserId", options.actorUserId);
  }
  if (options.entityType) {
    query.set("entityType", options.entityType);
  }
  if (options.action) {
    query.set("action", options.action);
  }
  if (options.severity) {
    query.set("severity", options.severity);
  }

  const queryStr = query.toString();
  return fetch(
    `/api/audit/export/pdf${queryStr ? `?${queryStr}` : ""}`,
  ).then((res) => {
    if (!res.ok) {
      throw new Error("Failed to export audit logs as PDF");
    }
    return res.blob();
  });
}

export function exportAuditLogsAsCsv(options: {
  fromDate?: string;
  toDate?: string;
  actorUserId?: string;
  entityType?: string;
  action?: string;
  severity?: AuditLogSeverity;
}) {
  const query = new URLSearchParams();

  if (options.fromDate) {
    query.set("fromDate", options.fromDate);
  }
  if (options.toDate) {
    query.set("toDate", options.toDate);
  }
  if (options.actorUserId) {
    query.set("actorUserId", options.actorUserId);
  }
  if (options.entityType) {
    query.set("entityType", options.entityType);
  }
  if (options.action) {
    query.set("action", options.action);
  }
  if (options.severity) {
    query.set("severity", options.severity);
  }

  const queryStr = query.toString();
  return fetch(
    `/api/audit/export/csv${queryStr ? `?${queryStr}` : ""}`,
  ).then((res) => {
    if (!res.ok) {
      throw new Error("Failed to export audit logs as CSV");
    }
    return res.blob();
  });
}

export function purgeAuditLogs(options: {
  fromDate: string;
  toDate: string;
  confirmation: string;
}) {
  return apiFetch<AuditPurgeResult>("/audit/purge", {
    method: "POST",
    json: options,
  });
}
