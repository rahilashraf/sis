export type AuditLogLevel = 'critical' | 'standard' | 'verbose';

export const AUDIT_RETENTION_RUN_INTERVAL_MS = 60 * 60 * 1000;
export const AUDIT_PURGE_CONFIRMATION_TEXT = 'PURGE AUDIT LOGS';
export const AUDIT_EXPORT_MAX_ROWS = 10000;

const BOOLEAN_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const BOOLEAN_FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const AUDIT_LOG_LEVELS: AuditLogLevel[] = ['critical', 'standard', 'verbose'];
const DEFAULT_AUDIT_RETENTION_DAYS = 30;

function normalizeEnvValue(value: string | undefined) {
  return value?.trim().toLowerCase();
}

export function resolveAuditLogsEnabled() {
  const normalized = normalizeEnvValue(process.env.AUDIT_LOGS_ENABLED);

  if (!normalized) {
    return (process.env.NODE_ENV ?? 'development') === 'production';
  }

  if (BOOLEAN_TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (BOOLEAN_FALSE_VALUES.has(normalized)) {
    return false;
  }

  return (process.env.NODE_ENV ?? 'development') === 'production';
}

export function resolveAuditLogLevel(): AuditLogLevel {
  const normalized = normalizeEnvValue(process.env.AUDIT_LOG_LEVEL);

  if (!normalized) {
    return 'critical';
  }

  return AUDIT_LOG_LEVELS.includes(normalized as AuditLogLevel)
    ? (normalized as AuditLogLevel)
    : 'critical';
}

export function resolveAuditRetentionDays() {
  const raw = process.env.AUDIT_LOG_RETENTION_DAYS?.trim();

  if (!raw) {
    return DEFAULT_AUDIT_RETENTION_DAYS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_AUDIT_RETENTION_DAYS;
  }

  return parsed;
}
