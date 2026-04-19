import type { UserRole } from "../auth/types";
import { apiFetch } from "./client";
import { apiConfig } from "./config";
import { getStoredSessionSnapshot } from "../auth/storage";

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

// Shape the backend /audit/summary endpoint actually returns
type RawAuditSummary = {
  total: number;
  severityCounts: Array<{ severity: string; _count: { _all: number } }>;
  actionCounts: Array<{ action: string; _count: { _all: number } }>;
  entityCounts: Array<{ entityType: string; _count: { _all: number } }>;
};

function toCountMap<T extends Record<string, unknown>>(
  arr: T[],
  key: keyof T,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of arr) {
    const k = String(item[key]);
    out[k] = (item._count as { _all: number })._all ?? 0;
  }
  return out;
}

export type AuditPurgeResult = {
  success: boolean;
  purgedCount: number;
};

/** Authenticated fetch that returns a Blob — used for file download endpoints. */
async function apiFetchBlob(path: string): Promise<Blob> {
  const session = getStoredSessionSnapshot();
  const headers: Record<string, string> = {};

  if (session?.accessToken) {
    headers["Authorization"] = `Bearer ${session.accessToken}`;
  }

  const url = `${apiConfig.baseUrl}${path}`;
  const res = await fetch(url, { headers });

  if (res.status === 401) {
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    let message = res.statusText || "Export failed";
    try {
      const body = await res.json();
      if (typeof body?.message === "string") message = body.message;
      else if (Array.isArray(body?.message)) message = body.message.join(", ");
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return res.blob();
}

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
  return apiFetch<{ rows: AuditLog[]; total: number; page: number; pageSize: number }>(
    `/audit/logs${queryStr ? `?${queryStr}` : ""}`,
  ).then((raw) => ({
    logs: raw.rows ?? [],
    total: raw.total ?? 0,
    page: raw.page ?? 1,
    pageSize: raw.pageSize ?? 50,
    pageCount: raw.pageSize > 0 ? Math.max(1, Math.ceil((raw.total ?? 0) / raw.pageSize)) : 1,
  }));
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
  return apiFetch<RawAuditSummary>(
    `/audit/summary${queryStr ? `?${queryStr}` : ""}`,
  ).then((raw): AuditSummary => ({
    total: raw.total ?? 0,
    bySeverity: toCountMap(raw.severityCounts ?? [], "severity"),
    byAction: toCountMap(raw.actionCounts ?? [], "action"),
    byEntity: toCountMap(raw.entityCounts ?? [], "entityType"),
  }));
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
  return apiFetchBlob(`/audit/export/pdf${queryStr ? `?${queryStr}` : ""}`);
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
  return apiFetchBlob(`/audit/export/csv${queryStr ? `?${queryStr}` : ""}`);
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
