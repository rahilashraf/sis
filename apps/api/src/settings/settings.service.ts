import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
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
  constructor(private readonly prisma: PrismaService) {}

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

    return {
      enabled,
    };
  }
}
