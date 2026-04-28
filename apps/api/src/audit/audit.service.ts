import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  AuditArchiveAction,
  AuditLogSeverity,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_SETTING_KEY_AUDIT_LOGS_ENABLED } from '../settings/settings.constants';
import {
  AUDIT_EXPORT_MAX_ROWS,
  AUDIT_PURGE_CONFIRMATION_TEXT,
  AUDIT_RETENTION_RUN_INTERVAL_MS,
  resolveAuditLogLevel,
  resolveAuditLogsEnabled,
  resolveAuditRetentionDays,
} from './audit.constants';
import { createSimplePdf } from './pdf/simple-pdf';
import { ExportAuditLogsQueryDto } from './dto/export-audit-logs-query.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { PurgeAuditLogsDto } from './dto/purge-audit-logs.dto';

type AuditFilters = {
  actorUserId?: string;
  entityType?: string;
  action?: string;
  severity?: AuditLogSeverity;
};

export type AuditLogInput = {
  actor?: AuthenticatedUser | null;
  schoolId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  severity?: AuditLogSeverity;
  summary: string;
  targetDisplay?: string | null;
  changesJson?: Prisma.InputJsonValue | Record<string, unknown> | null;
  metadataJson?: Prisma.InputJsonValue | Record<string, unknown> | null;
};

type ResolvedDateRange = {
  fromDate: Date;
  toDate: Date;
};

function truncate(value: string | null | undefined, max = 240) {
  if (!value) {
    return null;
  }

  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1)}…`;
}

function toCsvValue(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  const serialized =
    typeof value === 'string' ? value : JSON.stringify(value);
  const escaped = serialized.replace(/"/g, '""');
  return `"${escaped}"`;
}

function parseBooleanSettingValue(value: string) {
  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return null;
}

const STANDARD_WRITE_ACTION_PREFIXES = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'ARCHIVE',
  'ACTIVATE',
  'DEACTIVATE',
  'LOCK',
  'UNLOCK',
  'VOID',
  'ENROLL',
  'UNENROLL',
  'ASSIGN',
  'REMOVE',
  'RE_REGISTER',
  'MEMBERSHIP_CHANGED',
  'ROLE_CHANGED',
  'PASSWORD_CHANGED',
  'BATCH_CREATE',
  'BULK_CREATE',
  'PURGE',
  'RETENTION_PURGE',
  'LOGIN_',
];

const CRITICAL_ENTITY_PREFIXES = ['Attendance', 'Billing'];
const CRITICAL_ENTITY_TYPES = new Set([
  'GradeRecord',
  'AssessmentResult',
  'GradeOverride',
  'School',
  'SchoolYear',
  'ReportingPeriod',
]);
const CRITICAL_ACTIONS = new Set([
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'PASSWORD_CHANGED',
  'ROLE_CHANGED',
  'MEMBERSHIP_CHANGED',
  'DELETE',
  'DEACTIVATE',
  'PURGE',
  'RETENTION_PURGE',
]);

@Injectable()
export class AuditService {
  private retentionLastRunAt = 0;
  private retentionInFlight: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private getAuditConfig() {
    return {
      level: resolveAuditLogLevel(),
      retentionDays: resolveAuditRetentionDays(),
    };
  }

  private async resolveAuditLogsEnabledEffective() {
    try {
      const setting = await this.prisma.systemSetting.findUnique({
        where: {
          key: SYSTEM_SETTING_KEY_AUDIT_LOGS_ENABLED,
        },
        select: {
          value: true,
        },
      });

      const parsed = setting ? parseBooleanSettingValue(setting.value) : null;

      if (typeof parsed === 'boolean') {
        return parsed;
      }
    } catch (error) {
      console.error('Audit setting lookup failed, falling back to env:', error);
    }

    return resolveAuditLogsEnabled();
  }

  private isStandardWriteAction(action: string) {
    return STANDARD_WRITE_ACTION_PREFIXES.some((prefix) =>
      action.startsWith(prefix),
    );
  }

  private isCriticalAction(input: Pick<AuditLogInput, 'entityType' | 'action'>) {
    const action = input.action.trim().toUpperCase();
    const entityType = input.entityType.trim();

    if (CRITICAL_ACTIONS.has(action)) {
      return true;
    }

    if (action.includes('DELETE')) {
      return true;
    }

    if (entityType === 'User') {
      return ['ROLE_CHANGED', 'PASSWORD_CHANGED', 'DEACTIVATE'].includes(action);
    }

    if (entityType === 'UserSchoolMembership') {
      return action === 'MEMBERSHIP_CHANGED';
    }

    if (CRITICAL_ENTITY_TYPES.has(entityType)) {
      return true;
    }

    return CRITICAL_ENTITY_PREFIXES.some((prefix) =>
      entityType.startsWith(prefix),
    );
  }

  async shouldLog(input: Pick<AuditLogInput, 'entityType' | 'action'>) {
    const config = this.getAuditConfig();

    const enabled = await this.resolveAuditLogsEnabledEffective();

    if (!enabled) {
      return false;
    }

    const action = input.action.trim().toUpperCase();

    if (config.level === 'verbose') {
      return true;
    }

    if (config.level === 'standard') {
      if (this.isStandardWriteAction(action)) {
        return true;
      }

      return !['READ', 'LIST', 'GET', 'VIEW'].includes(action);
    }

    return this.isCriticalAction(input);
  }

  private ensureOwner(user: AuthenticatedUser) {
    if (user.role !== UserRole.OWNER) {
      throw new ForbiddenException('Only owner can access audit reports');
    }
  }

  private ensureAuditReadAccess(user: AuthenticatedUser) {
    if (
      user.role === UserRole.OWNER ||
      user.role === UserRole.SUPER_ADMIN ||
      user.role === UserRole.ADMIN
    ) {
      return;
    }

    throw new ForbiddenException(
      'Only owner, super admin, or admin can access audit reports',
    );
  }

  private resolveActorSchoolScope(user: AuthenticatedUser) {
    const schoolIds = new Set<string>();

    if (user.schoolId) {
      schoolIds.add(user.schoolId);
    }

    for (const membership of user.memberships ?? []) {
      if (membership?.isActive && membership.schoolId) {
        schoolIds.add(membership.schoolId);
      }
    }

    return Array.from(schoolIds);
  }

  private applyAuditReadScope(
    user: AuthenticatedUser,
    where: Prisma.AuditLogWhereInput,
  ): Prisma.AuditLogWhereInput {
    if (user.role === UserRole.OWNER || user.role === UserRole.SUPER_ADMIN) {
      return where;
    }

    const schoolIds = this.resolveActorSchoolScope(user);

    if (schoolIds.length === 0) {
      throw new ForbiddenException('No school scope available for audit access');
    }

    return {
      ...where,
      schoolId: {
        in: schoolIds,
      },
    };
  }

  private parseDateOrThrow(
    value: string,
    fieldLabel: string,
    asEndOfDay = false,
  ) {
    const trimmed = value.trim();
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);

    const parsed = isDateOnly
      ? new Date(`${trimmed}T00:00:00.000Z`)
      : new Date(trimmed);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldLabel} must be a valid date`);
    }

    if (isDateOnly && asEndOfDay) {
      parsed.setUTCDate(parsed.getUTCDate() + 1);
      parsed.setUTCMilliseconds(parsed.getUTCMilliseconds() - 1);
    }

    return parsed;
  }

  private resolveDateRange(options: {
    fromDate?: string;
    toDate?: string;
    required: boolean;
  }): ResolvedDateRange {
    const now = new Date();

    if (options.required && (!options.fromDate || !options.toDate)) {
      throw new BadRequestException('fromDate and toDate are required');
    }

    const fromDate = options.fromDate
      ? this.parseDateOrThrow(options.fromDate, 'fromDate')
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const toDate = options.toDate
      ? this.parseDateOrThrow(options.toDate, 'toDate', true)
      : now;

    if (fromDate > toDate) {
      throw new BadRequestException('fromDate must be before or equal to toDate');
    }

    return {
      fromDate,
      toDate,
    };
  }

  private buildWhere(options: {
    range: ResolvedDateRange;
    filters: AuditFilters;
  }): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {
      createdAt: {
        gte: options.range.fromDate,
        lte: options.range.toDate,
      },
    };

    if (options.filters.actorUserId) {
      where.actorUserId = options.filters.actorUserId;
    }

    if (options.filters.entityType) {
      where.entityType = options.filters.entityType;
    }

    if (options.filters.action) {
      where.action = options.filters.action;
    }

    if (options.filters.severity) {
      where.severity = options.filters.severity;
    }

    return where;
  }

  private async resolveActorSnapshot(actor?: AuthenticatedUser | null) {
    if (!actor?.id) {
      return {
        actorUserId: null,
        actorNameSnapshot: null,
        actorRoleSnapshot: null,
      };
    }

    const actorUser = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        firstName: true,
        lastName: true,
      },
    });

    const actorName = actorUser
      ? `${actorUser.firstName} ${actorUser.lastName}`.trim()
      : null;

    return {
      actorUserId: actor.id,
      actorNameSnapshot: actorName && actorName.length > 0 ? actorName : null,
      actorRoleSnapshot: actor.role,
    };
  }

  private async applyRetentionPolicyIfDue() {
    const now = Date.now();

    if (now - this.retentionLastRunAt < AUDIT_RETENTION_RUN_INTERVAL_MS) {
      return;
    }

    if (this.retentionInFlight) {
      await this.retentionInFlight;
      return;
    }

    this.retentionInFlight = this.runRetentionPolicy().finally(() => {
      this.retentionLastRunAt = Date.now();
      this.retentionInFlight = null;
    });

    await this.retentionInFlight;
  }

  private async runRetentionPolicy() {
    const { retentionDays } = this.getAuditConfig();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const aggregate = await this.prisma.auditLog.aggregate({
      where: {
        createdAt: {
          lt: cutoff,
        },
      },
      _count: {
        _all: true,
      },
      _min: {
        createdAt: true,
      },
      _max: {
        createdAt: true,
      },
    });

    const staleCount = aggregate._count._all;

    if (!staleCount) {
      return;
    }

    const rangeFrom = aggregate._min.createdAt ?? cutoff;
    const rangeTo = aggregate._max.createdAt ?? cutoff;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.auditLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoff,
          },
        },
      });

      await tx.auditArchiveHistory.create({
        data: {
          action: AuditArchiveAction.RETENTION_PURGE,
          fromDate: rangeFrom,
          toDate: rangeTo,
          rowCount: deleted.count,
          purgedAt: now,
          purgedByNameSnapshot: 'SYSTEM_RETENTION',
          notes: `Automatic retention purge for logs older than ${retentionDays} days`,
          metadataJson: {
            cutoff,
          },
        },
      });

      if (
        await this.shouldLog({
          entityType: 'AuditLog',
          action: 'RETENTION_PURGE',
        })
      ) {
        await tx.auditLog.create({
          data: {
            actorNameSnapshot: 'SYSTEM_RETENTION',
            entityType: 'AuditLog',
            action: 'RETENTION_PURGE',
            severity: AuditLogSeverity.WARNING,
            summary: `Automatic retention purge deleted ${deleted.count} audit rows older than ${cutoff.toISOString()}`,
            changesJson: {
              fromDate: rangeFrom,
              toDate: rangeTo,
              rowCount: deleted.count,
            },
          },
        });
      }
    });
  }

  async logCritical(input: Omit<AuditLogInput, 'severity'>) {
    return this.log({
      ...input,
      severity: AuditLogSeverity.CRITICAL,
    });
  }

  async log(input: AuditLogInput) {
    if (!(await this.shouldLog(input))) {
      return;
    }

    try {
      const actorSnapshot = await this.resolveActorSnapshot(input.actor);

      await this.prisma.auditLog.create({
        data: {
          ...actorSnapshot,
          schoolId: input.schoolId ?? null,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          action: input.action,
          severity: input.severity ?? AuditLogSeverity.INFO,
          summary: truncate(input.summary, 500) ?? 'No summary',
          targetDisplay: truncate(input.targetDisplay, 180),
          changesJson: (input.changesJson ?? undefined) as any,
          metadataJson: (input.metadataJson ?? undefined) as any,
        },
      });
    } catch (error) {
      console.error('Audit log write failed:', error);
    }
  }

  async cleanupExpiredLogs() {
    await this.runRetentionPolicy();
  }

  async list(user: AuthenticatedUser, query: ListAuditLogsQueryDto) {
    this.ensureAuditReadAccess(user);
    await this.applyRetentionPolicyIfDue();

    const normalized = query.normalize();
    const range = this.resolveDateRange({
      fromDate: normalized.fromDate,
      toDate: normalized.toDate,
      required: false,
    });

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const baseWhere = this.buildWhere({
      range,
      filters: {
        actorUserId: normalized.actorUserId,
        entityType: normalized.entityType,
        action: normalized.action,
        severity: normalized.severity,
      },
    });
    const where = this.applyAuditReadScope(user, baseWhere);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      fromDate: range.fromDate,
      toDate: range.toDate,
      page,
      pageSize,
      total,
      rows,
    };
  }

  async summary(user: AuthenticatedUser, query: ListAuditLogsQueryDto) {
    this.ensureAuditReadAccess(user);
    await this.applyRetentionPolicyIfDue();

    const normalized = query.normalize();
    const range = this.resolveDateRange({
      fromDate: normalized.fromDate,
      toDate: normalized.toDate,
      required: false,
    });

    const baseWhere = this.buildWhere({
      range,
      filters: {
        actorUserId: normalized.actorUserId,
        entityType: normalized.entityType,
        action: normalized.action,
        severity: normalized.severity,
      },
    });
    const where = this.applyAuditReadScope(user, baseWhere);

    const destructiveActions = [
      'DELETE',
      'ARCHIVE',
      'PURGE',
      'UNENROLL',
      'REMOVE_TEACHER',
      'DEACTIVATE',
    ];

    const [
      total,
      severityCounts,
      actionCounts,
      entityCounts,
      destructiveActionsCount,
      gradeChangesCount,
      attendanceChangesCount,
      userRoleChangesCount,
      configurationChangesCount,
    ] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({
        by: ['severity'],
        where,
        _count: { _all: true },
        orderBy: { severity: 'asc' },
      }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { _all: true },
        orderBy: { action: 'asc' },
      }),
      this.prisma.auditLog.groupBy({
        by: ['entityType'],
        where,
        _count: { _all: true },
        orderBy: { entityType: 'asc' },
      }),
      this.prisma.auditLog.count({
        where: {
          ...where,
          action: {
            in: destructiveActions,
          },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          ...where,
          entityType: {
            in: ['GradeRecord', 'AssessmentResult', 'GradeOverride'],
          },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          ...where,
          entityType: {
            startsWith: 'Attendance',
          },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          ...where,
          OR: [
            {
              entityType: 'User',
              action: {
                in: ['CREATE', 'UPDATE', 'ROLE_CHANGED', 'DEACTIVATE', 'DELETE'],
              },
            },
            {
              entityType: 'UserSchoolMembership',
            },
            {
              entityType: 'StudentParentLink',
            },
          ],
        },
      }),
      this.prisma.auditLog.count({
        where: {
          ...where,
          entityType: {
            in: [
              'School',
              'SchoolYear',
              'ReportingPeriod',
              'Class',
              'Form',
              'GradeScale',
              'GradeLevel',
              'BehaviorCategoryOption',
              'AttendanceStatusRule',
              'AttendanceCustomStatus',
            ],
          },
        },
      }),
    ]);

    return {
      fromDate: range.fromDate,
      toDate: range.toDate,
      total,
      severityCounts,
      actionCounts,
      entityCounts,
      reports: {
        destructiveActionsCount,
        gradeChangesCount,
        attendanceChangesCount,
        userRoleChangesCount,
        configurationChangesCount,
      },
    };
  }

  private formatExportLines(options: {
    rows: Array<{
      createdAt: Date;
      severity: AuditLogSeverity;
      actorNameSnapshot: string | null;
      actorRoleSnapshot: UserRole | null;
      entityType: string;
      entityId: string | null;
      action: string;
      summary: string;
      schoolId: string | null;
    }>;
    range: ResolvedDateRange;
    filters: AuditFilters;
  }) {
    const lines: string[] = [];

    lines.push('SIS Audit Log Export');
    lines.push(`Generated At: ${new Date().toISOString()}`);
    lines.push(`From: ${options.range.fromDate.toISOString()}`);
    lines.push(`To: ${options.range.toDate.toISOString()}`);
    lines.push(
      `Filters: actor=${options.filters.actorUserId ?? 'ALL'} entity=${options.filters.entityType ?? 'ALL'} action=${options.filters.action ?? 'ALL'} severity=${options.filters.severity ?? 'ALL'}`,
    );
    lines.push(`Rows: ${options.rows.length}`);
    lines.push('');
    lines.push('createdAt | severity | actor | role | schoolId | entityType | entityId | action | summary');

    for (const row of options.rows) {
      lines.push(
        [
          row.createdAt.toISOString(),
          row.severity,
          row.actorNameSnapshot ?? 'SYSTEM',
          row.actorRoleSnapshot ?? '-',
          row.schoolId ?? '-',
          row.entityType,
          row.entityId ?? '-',
          row.action,
          truncate(row.summary, 180) ?? '-',
        ].join(' | '),
      );
    }

    return lines;
  }

  private async recordExportHistory(options: {
    actor: AuthenticatedUser;
    range: ResolvedDateRange;
    rowCount: number;
    format: 'PDF' | 'CSV';
    filters: AuditFilters;
  }) {
    const actorSnapshot = await this.resolveActorSnapshot(options.actor);

    await this.prisma.auditArchiveHistory.create({
      data: {
        action: AuditArchiveAction.EXPORT,
        fromDate: options.range.fromDate,
        toDate: options.range.toDate,
        rowCount: options.rowCount,
        exportedAt: new Date(),
        exportedByUserId: actorSnapshot.actorUserId,
        exportedByNameSnapshot: actorSnapshot.actorNameSnapshot,
        exportedByRoleSnapshot: actorSnapshot.actorRoleSnapshot,
        notes: `Audit log ${options.format} export`,
        metadataJson: {
          format: options.format,
          filters: options.filters,
        },
      },
    });

    await this.log({
      actor: options.actor,
      entityType: 'AuditLog',
      action: 'EXPORT',
      severity: AuditLogSeverity.INFO,
      summary: `Exported ${options.rowCount} audit rows as ${options.format}`,
      changesJson: {
        fromDate: options.range.fromDate,
        toDate: options.range.toDate,
        rowCount: options.rowCount,
        format: options.format,
      },
      metadataJson: {
        filters: options.filters,
      },
    });
  }

  async exportPdf(user: AuthenticatedUser, query: ExportAuditLogsQueryDto) {
    this.ensureOwner(user);
    await this.applyRetentionPolicyIfDue();

    const range = this.resolveDateRange({
      fromDate: query.fromDate,
      toDate: query.toDate,
      required: true,
    });

    const filters: AuditFilters = {
      actorUserId: query.actorUserId?.trim() || undefined,
      entityType: query.entityType?.trim() || undefined,
      action: query.action?.trim() || undefined,
      severity: query.severity,
    };

    const where = this.buildWhere({
      range,
      filters,
    });

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
      take: AUDIT_EXPORT_MAX_ROWS,
      select: {
        createdAt: true,
        severity: true,
        actorNameSnapshot: true,
        actorRoleSnapshot: true,
        schoolId: true,
        entityType: true,
        entityId: true,
        action: true,
        summary: true,
      },
    });

    if (rows.length >= AUDIT_EXPORT_MAX_ROWS) {
      throw new BadRequestException(
        `Export exceeds ${AUDIT_EXPORT_MAX_ROWS} rows. Narrow the date range or filters.`,
      );
    }

    const lines = this.formatExportLines({
      rows,
      range,
      filters,
    });

    await this.recordExportHistory({
      actor: user,
      range,
      rowCount: rows.length,
      format: 'PDF',
      filters,
    });

    return {
      fileName: `audit-logs-${range.fromDate.toISOString().slice(0, 10)}-to-${range.toDate
        .toISOString()
        .slice(0, 10)}.pdf`,
      contentType: 'application/pdf',
      data: createSimplePdf(lines),
      rowCount: rows.length,
    };
  }

  async exportCsv(user: AuthenticatedUser, query: ExportAuditLogsQueryDto) {
    this.ensureOwner(user);
    await this.applyRetentionPolicyIfDue();

    const range = this.resolveDateRange({
      fromDate: query.fromDate,
      toDate: query.toDate,
      required: true,
    });

    const filters: AuditFilters = {
      actorUserId: query.actorUserId?.trim() || undefined,
      entityType: query.entityType?.trim() || undefined,
      action: query.action?.trim() || undefined,
      severity: query.severity,
    };

    const where = this.buildWhere({
      range,
      filters,
    });

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
      take: AUDIT_EXPORT_MAX_ROWS,
    });

    if (rows.length >= AUDIT_EXPORT_MAX_ROWS) {
      throw new BadRequestException(
        `Export exceeds ${AUDIT_EXPORT_MAX_ROWS} rows. Narrow the date range or filters.`,
      );
    }

    const header = [
      'id',
      'createdAt',
      'actorUserId',
      'actorNameSnapshot',
      'actorRoleSnapshot',
      'schoolId',
      'entityType',
      'entityId',
      'action',
      'severity',
      'summary',
      'targetDisplay',
      'changesJson',
      'metadataJson',
    ];

    const csvLines = [header.map((column) => toCsvValue(column)).join(',')];

    for (const row of rows) {
      csvLines.push(
        [
          row.id,
          row.createdAt.toISOString(),
          row.actorUserId,
          row.actorNameSnapshot,
          row.actorRoleSnapshot,
          row.schoolId,
          row.entityType,
          row.entityId,
          row.action,
          row.severity,
          row.summary,
          row.targetDisplay,
          row.changesJson,
          row.metadataJson,
        ]
          .map((entry) => toCsvValue(entry))
          .join(','),
      );
    }

    await this.recordExportHistory({
      actor: user,
      range,
      rowCount: rows.length,
      format: 'CSV',
      filters,
    });

    return {
      fileName: `audit-logs-${range.fromDate.toISOString().slice(0, 10)}-to-${range.toDate
        .toISOString()
        .slice(0, 10)}.csv`,
      contentType: 'text/csv; charset=utf-8',
      data: Buffer.from(`${csvLines.join('\n')}\n`, 'utf8'),
      rowCount: rows.length,
    };
  }

  async purge(user: AuthenticatedUser, body: PurgeAuditLogsDto) {
    this.ensureOwner(user);
    await this.applyRetentionPolicyIfDue();

    const range = this.resolveDateRange({
      fromDate: body.fromDate,
      toDate: body.toDate,
      required: true,
    });

    const confirmationText = body.confirmationText.trim();

    if (confirmationText !== AUDIT_PURGE_CONFIRMATION_TEXT) {
      throw new BadRequestException(
        `confirmationText must exactly match "${AUDIT_PURGE_CONFIRMATION_TEXT}"`,
      );
    }

    const where: Prisma.AuditLogWhereInput = {
      createdAt: {
        gte: range.fromDate,
        lte: range.toDate,
      },
    };

    const currentCount = await this.prisma.auditLog.count({ where });

    if (currentCount !== body.expectedRowCount) {
      throw new BadRequestException(
        `expectedRowCount mismatch: expected ${body.expectedRowCount}, actual ${currentCount}`,
      );
    }

    const actorSnapshot = await this.resolveActorSnapshot(user);

    const deletedCount = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.auditLog.deleteMany({ where });

      await tx.auditArchiveHistory.create({
        data: {
          action: AuditArchiveAction.PURGE,
          fromDate: range.fromDate,
          toDate: range.toDate,
          rowCount: deleted.count,
          purgedAt: new Date(),
          purgedByUserId: actorSnapshot.actorUserId,
          purgedByNameSnapshot: actorSnapshot.actorNameSnapshot,
          purgedByRoleSnapshot: actorSnapshot.actorRoleSnapshot,
          notes: body.notes?.trim() || null,
        },
      });

      if (
        await this.shouldLog({
          entityType: 'AuditLog',
          action: 'PURGE',
        })
      ) {
        await tx.auditLog.create({
          data: {
            actorUserId: actorSnapshot.actorUserId,
            actorNameSnapshot: actorSnapshot.actorNameSnapshot,
            actorRoleSnapshot: actorSnapshot.actorRoleSnapshot,
            entityType: 'AuditLog',
            action: 'PURGE',
            severity: AuditLogSeverity.HIGH,
            summary: `Purged ${deleted.count} audit rows for selected range`,
            changesJson: {
              fromDate: range.fromDate,
              toDate: range.toDate,
              rowCount: deleted.count,
            },
          },
        });
      }

      return deleted.count;
    });

    return {
      success: true,
      purgedCount: deletedCount,
      fromDate: range.fromDate,
      toDate: range.toDate,
    };
  }
}
