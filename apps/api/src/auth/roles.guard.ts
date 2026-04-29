import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Forbidden resource');
    }

    if (requiredRoles.includes(user.role)) {
      return true;
    }

    await this.auditService.logCritical({
      actor: user,
      schoolId: user.schoolId ?? user.memberships[0]?.schoolId ?? null,
      entityType: 'AccessControl',
      action: 'ROLE_ACCESS_DENIED',
      summary: `Role ${user.role} denied for ${request.method} ${request.originalUrl ?? request.url}`,
      metadataJson: {
        role: user.role,
        requiredRoles,
        method: request.method,
      },
    });

    throw new ForbiddenException('Forbidden resource');
  }
}
