import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogSeverity, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { buildAuditDiff } from '../audit/audit-diff.util';
import { CreateBillingCategoryDto } from './dto/create-billing-category.dto';
import { UpdateBillingCategoryDto } from './dto/update-billing-category.dto';

@Injectable()
export class BillingCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private ensureCanManage(actor: AuthenticatedUser) {
    const allowed = ['OWNER', 'SUPER_ADMIN', 'ADMIN'];
    if (!allowed.includes(actor.role)) {
      throw new ForbiddenException('You do not have billing access');
    }
  }

  private ensureCanRead(actor: AuthenticatedUser) {
    const allowed = ['OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF'];
    if (!allowed.includes(actor.role)) {
      throw new ForbiddenException('You do not have billing access');
    }
  }

  async list(
    actor: AuthenticatedUser,
    options?: { schoolId?: string; includeInactive?: boolean },
  ) {
    const includeInactive = options?.includeInactive ?? false;

    if (includeInactive) {
      this.ensureCanManage(actor);
    } else {
      this.ensureCanRead(actor);
    }

    const where: Prisma.BillingCategoryWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
    };

    const requestedSchoolId = options?.schoolId?.trim() || null;

    if (requestedSchoolId) {
      if (!isBypassRole(actor.role)) {
        ensureUserHasSchoolAccess(actor, requestedSchoolId);
      }
      where.schoolId = requestedSchoolId;
    } else if (!isBypassRole(actor.role)) {
      const accessibleSchoolIds = getAccessibleSchoolIds(actor);
      where.schoolId = { in: accessibleSchoolIds };
    }

    return this.prisma.billingCategory.findMany({
      where,
      orderBy: [{ name: 'asc' }],
    });
  }

  async create(actor: AuthenticatedUser, data: CreateBillingCategoryDto) {
    this.ensureCanManage(actor);

    const schoolId = data.schoolId.trim();
    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, schoolId);
    }

    try {
      const created = await this.prisma.billingCategory.create({
        data: {
          schoolId,
          name: data.name.trim(),
          description: data.description ?? null,
          isActive: true,
        },
      });

      await this.auditService.log({
        actor,
        schoolId,
        entityType: 'BillingCategory',
        entityId: created.id,
        action: 'CREATE',
        severity: AuditLogSeverity.INFO,
        summary: `Created billing category "${created.name}"`,
        targetDisplay: created.name,
      });

      return created;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A billing category with this name already exists in this school',
        );
      }

      throw error;
    }
  }

  private async getCategoryOrThrow(id: string) {
    const category = await this.prisma.billingCategory.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Billing category not found');
    }

    return category;
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    data: UpdateBillingCategoryDto,
  ) {
    this.ensureCanManage(actor);

    const existing = await this.getCategoryOrThrow(id);

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, existing.schoolId);
    }

    try {
      const updated = await this.prisma.billingCategory.update({
        where: { id },
        data: {
          name: data.name !== undefined ? data.name.trim() : undefined,
          description:
            data.description !== undefined ? data.description : undefined,
        },
      });

      await this.auditService.log({
        actor,
        schoolId: updated.schoolId,
        entityType: 'BillingCategory',
        entityId: updated.id,
        action: 'UPDATE',
        severity: AuditLogSeverity.INFO,
        summary: `Updated billing category "${updated.name}"`,
        targetDisplay: updated.name,
        changesJson:
          buildAuditDiff({
            before: existing,
            after: { name: updated.name, description: updated.description },
          }) ?? undefined,
      });

      return updated;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A billing category with this name already exists in this school',
        );
      }

      throw error;
    }
  }

  async archive(actor: AuthenticatedUser, id: string) {
    this.ensureCanManage(actor);

    const existing = await this.getCategoryOrThrow(id);

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, existing.schoolId);
    }

    if (!existing.isActive) {
      return existing;
    }

    const archived = await this.prisma.billingCategory.update({
      where: { id },
      data: {
        isActive: false,
        archivedAt: new Date(),
      },
    });

    await this.auditService.log({
      actor,
      schoolId: archived.schoolId,
      entityType: 'BillingCategory',
      entityId: archived.id,
      action: 'ARCHIVE',
      severity: AuditLogSeverity.INFO,
      summary: `Archived billing category "${archived.name}"`,
      targetDisplay: archived.name,
    });

    return archived;
  }
}
