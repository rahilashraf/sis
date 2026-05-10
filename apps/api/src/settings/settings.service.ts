import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuditLogSeverity, Prisma, UserRole } from '@prisma/client';
import { buildAuditDiff } from '../audit/audit-diff.util';
import { AuditService } from '../audit/audit.service';
import { resolveAuditLogsEnabled } from '../audit/audit.constants';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_SETTING_KEY_AUDIT_LOGS_ENABLED } from './settings.constants';

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

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private ensureAuditSettingAccess(user: AuthenticatedUser) {
    if (
      user.role !== UserRole.OWNER &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only owners and super admins can manage audit settings',
      );
    }
  }

  async getAuditSettings(user: AuthenticatedUser) {
    this.ensureAuditSettingAccess(user);

    const setting = await this.prisma.systemSetting.findUnique({
      where: {
        key: SYSTEM_SETTING_KEY_AUDIT_LOGS_ENABLED,
      },
      select: {
        value: true,
      },
    });

    const parsed = setting ? parseBooleanSettingValue(setting.value) : null;

    return {
      enabled:
        typeof parsed === 'boolean' ? parsed : resolveAuditLogsEnabled(),
    };
  }

  async updateAuditSettings(user: AuthenticatedUser, enabled: boolean) {
    this.ensureAuditSettingAccess(user);

    const existing = await this.prisma.systemSetting.findUnique({
      where: {
        key: SYSTEM_SETTING_KEY_AUDIT_LOGS_ENABLED,
      },
      select: {
        value: true,
      },
    });

    const beforeEnabled = existing
      ? parseBooleanSettingValue(existing.value)
      : resolveAuditLogsEnabled();

    await this.prisma.systemSetting.upsert({
      where: {
        key: SYSTEM_SETTING_KEY_AUDIT_LOGS_ENABLED,
      },
      create: {
        key: SYSTEM_SETTING_KEY_AUDIT_LOGS_ENABLED,
        value: enabled ? 'true' : 'false',
      },
      update: {
        value: enabled ? 'true' : 'false',
      },
    });

    await this.auditService.log({
      actor: user,
      entityType: 'SystemSetting',
      entityId: SYSTEM_SETTING_KEY_AUDIT_LOGS_ENABLED,
      action: 'UPDATE_AUDIT_SETTING',
      severity: AuditLogSeverity.WARNING,
      summary: `Audit logging has been ${enabled ? 'enabled' : 'disabled'}`,
      changesJson:
        buildAuditDiff({
          before: {
            AUDIT_LOGS_ENABLED: beforeEnabled,
          },
          after: {
            AUDIT_LOGS_ENABLED: enabled,
          },
        }) ?? undefined,
      metadataJson: {
        key: SYSTEM_SETTING_KEY_AUDIT_LOGS_ENABLED,
        before: beforeEnabled,
        after: enabled,
      } as Prisma.InputJsonValue,
    });

    return {
      enabled,
    };
  }
}
