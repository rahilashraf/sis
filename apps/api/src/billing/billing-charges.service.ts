import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogSeverity,
  ChargeSourceType,
  ChargeStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildAuditDiff } from '../audit/audit-diff.util';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { CreateBillingChargeDto } from './dto/create-billing-charge.dto';
import {
  BulkCreateBillingChargeDto,
  BulkChargeTargetMode,
} from './dto/bulk-create-billing-charge.dto';
import { ListBillingChargesQueryDto } from './dto/list-billing-charges-query.dto';
import { UpdateBillingChargeDto } from './dto/update-billing-charge.dto';
import { VoidBillingChargeDto } from './dto/void-billing-charge.dto';

const chargeSelect = Prisma.validator<Prisma.BillingChargeSelect>()({
  id: true,
  schoolId: true,
  schoolYearId: true,
  studentId: true,
  categoryId: true,
  createdById: true,
  title: true,
  description: true,
  amount: true,
  amountPaid: true,
  amountDue: true,
  status: true,
  sourceType: true,
  issuedAt: true,
  dueDate: true,
  voidedAt: true,
  voidReason: true,
  voidedById: true,
  createdAt: true,
  updatedAt: true,
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      email: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
    },
  },
  schoolYear: {
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  },
  voidedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  },
  libraryFine: {
    select: {
      id: true,
      reason: true,
      status: true,
      assessedAt: true,
    },
  },
});

@Injectable()
export class BillingChargesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async notifyLinkedParentsForChargeCreated(input: {
    schoolId: string;
    studentId: string;
    studentName: string;
    chargeId?: string;
    shouldNotify?: boolean;
  }) {
    // Skip notification if shouldNotify is explicitly false
    if (input.shouldNotify === false) {
      return;
    }

    const links = await this.prisma.studentParentLink.findMany({
      where: { studentId: input.studentId },
      select: { parentId: true },
    });

    const parentIds = [...new Set(links.map((link) => link.parentId))];

    if (parentIds.length === 0) {
      return;
    }

    await this.notificationsService.createMany(
      parentIds.map((parentId) => ({
        schoolId: input.schoolId,
        recipientUserId: parentId,
        type: 'BILLING_CHARGE_CREATED',
        title: `New charge posted for ${input.studentName}`,
        message: `New charge posted for ${input.studentName}`,
        entityType: 'BillingCharge',
        entityId: input.chargeId ?? null,
      })),
    );
  }

  private ensureCanCreate(actor: AuthenticatedUser) {
    const allowed = ['OWNER', 'SUPER_ADMIN', 'ADMIN'];
    if (!allowed.includes(actor.role)) {
      throw new ForbiddenException('You do not have permission to create charges');
    }
  }

  private ensureCanRead(actor: AuthenticatedUser) {
    const allowed = ['OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF'];
    if (!allowed.includes(actor.role)) {
      throw new ForbiddenException('You do not have permission to view charges');
    }
  }

  private parseDueDateOrThrow(value: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('dueDate must be a valid date');
    }

    return parsed;
  }

  private buildWhereInput(
    actor: AuthenticatedUser,
    filters?: ListBillingChargesQueryDto,
  ): Prisma.BillingChargeWhereInput {
    const where: Prisma.BillingChargeWhereInput = {};

    if (filters?.studentId) {
      where.studentId = filters.studentId;
    }

    if (filters?.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    const requestedSchoolId = filters?.schoolId?.trim() || null;

    if (requestedSchoolId) {
      if (!isBypassRole(actor.role)) {
        ensureUserHasSchoolAccess(actor, requestedSchoolId);
      }
      where.schoolId = requestedSchoolId;
    } else if (!isBypassRole(actor.role)) {
      const schoolIds = getAccessibleSchoolIds(actor);
      if (schoolIds.length === 0) {
        where.schoolId = '__no_access__';
        return where;
      }
      where.schoolId = { in: schoolIds };
    }

    return where;
  }

  async list(actor: AuthenticatedUser, filters?: ListBillingChargesQueryDto) {
    this.ensureCanRead(actor);

    const where = this.buildWhereInput(actor, filters);

    return this.prisma.billingCharge.findMany({
      where,
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
      select: chargeSelect,
    });
  }

  async findOne(actor: AuthenticatedUser, id: string) {
    this.ensureCanRead(actor);

    const charge = await this.prisma.billingCharge.findUnique({
      where: { id },
      select: chargeSelect,
    });

    if (!charge) {
      throw new NotFoundException('Billing charge not found');
    }

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, charge.schoolId);
    }

    return charge;
  }

  async create(actor: AuthenticatedUser, data: CreateBillingChargeDto) {
    this.ensureCanCreate(actor);

    const schoolId = data.schoolId.trim();

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, schoolId);
    }

    // Validate student exists and belongs to the school
    const student = await this.prisma.user.findUnique({
      where: { id: data.studentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        schoolId: true,
        memberships: {
          where: { isActive: true },
          select: { schoolId: true },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const studentSchoolIds = [
      ...(student.schoolId ? [student.schoolId] : []),
      ...student.memberships.map((m) => m.schoolId),
    ];

    if (!studentSchoolIds.includes(schoolId)) {
      throw new BadRequestException('Student does not belong to the specified school');
    }

    // Validate category exists and belongs to the school
    const category = await this.prisma.billingCategory.findUnique({
      where: { id: data.categoryId },
      select: { id: true, schoolId: true, isActive: true, name: true },
    });

    if (!category) {
      throw new NotFoundException('Billing category not found');
    }

    if (category.schoolId !== schoolId) {
      throw new BadRequestException('Billing category does not belong to the specified school');
    }

    if (!category.isActive) {
      throw new BadRequestException('Billing category is not active');
    }

    // Validate schoolYear if provided
    if (data.schoolYearId) {
      const schoolYear = await this.prisma.schoolYear.findUnique({
        where: { id: data.schoolYearId },
        select: { id: true, schoolId: true },
      });

      if (!schoolYear) {
        throw new NotFoundException('School year not found');
      }

      if (schoolYear.schoolId !== schoolId) {
        throw new BadRequestException('School year does not belong to the specified school');
      }
    }

    const amount = new Prisma.Decimal(data.amount);

    const charge = await this.prisma.billingCharge.create({
      data: {
        schoolId,
        schoolYearId: data.schoolYearId ?? null,
        studentId: data.studentId,
        categoryId: data.categoryId,
        createdById: actor.id,
        title: data.title.trim(),
        description: data.description ?? null,
        amount,
        amountPaid: new Prisma.Decimal(0),
        amountDue: amount,
        status: ChargeStatus.PENDING,
        sourceType: data.sourceType ?? ChargeSourceType.MANUAL,
        issuedAt: new Date(),
        dueDate: data.dueDate ? this.parseDueDateOrThrow(data.dueDate) : null,
      },
      select: chargeSelect,
    });

    const studentName = `${student.firstName} ${student.lastName}`.trim();

    await this.auditService.log({
      actor,
      schoolId,
      entityType: 'BillingCharge',
      entityId: charge.id,
      action: 'CREATE',
      severity: AuditLogSeverity.INFO,
      summary: `Created charge "${charge.title}" for student ${studentName}`,
      targetDisplay: `${studentName} — ${charge.title}`,
      metadataJson: {
        amount: data.amount,
        categoryId: data.categoryId,
        categoryName: category.name,
        studentId: data.studentId,
      },
    });

    await this.notifyLinkedParentsForChargeCreated({
      schoolId,
      studentId: charge.studentId,
      studentName,
      chargeId: charge.id,
      shouldNotify: data.sendNotifications ?? false,
    });

    return charge;
  }

  private ensureCanManage(actor: AuthenticatedUser) {
    const allowed = ['OWNER', 'SUPER_ADMIN', 'ADMIN'];
    if (!allowed.includes(actor.role)) {
      throw new ForbiddenException('You do not have permission to manage charges');
    }
  }

  private async getChargeOrThrow(id: string) {
    const charge = await this.prisma.billingCharge.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        title: true,
        categoryId: true,
        amount: true,
        amountPaid: true,
        amountDue: true,
        status: true,
        description: true,
        dueDate: true,
        studentId: true,
        student: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    if (!charge) {
      throw new NotFoundException('Billing charge not found');
    }

    return charge;
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    data: UpdateBillingChargeDto,
  ) {
    this.ensureCanManage(actor);

    const existing = await this.getChargeOrThrow(id);

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, existing.schoolId);
    }

    if (existing.status === ChargeStatus.VOID) {
      throw new BadRequestException('Cannot update a voided charge');
    }

    if (existing.status === ChargeStatus.PAID) {
      throw new BadRequestException('Cannot update a fully paid charge');
    }

    // Validate categoryId if being changed
    let nextCategoryId = existing.categoryId;
    if (data.categoryId !== undefined && data.categoryId !== null) {
      const category = await this.prisma.billingCategory.findUnique({
        where: { id: data.categoryId },
        select: { id: true, schoolId: true, isActive: true },
      });

      if (!category) {
        throw new NotFoundException('Billing category not found');
      }

      if (category.schoolId !== existing.schoolId) {
        throw new BadRequestException(
          'Billing category does not belong to the same school as the charge',
        );
      }

      if (!category.isActive) {
        throw new BadRequestException('Billing category is not active');
      }

      nextCategoryId = data.categoryId;
    }

    // Amount update: only permitted when no payments have been recorded
    let nextAmount: Prisma.Decimal | undefined;
    let nextAmountDue: Prisma.Decimal | undefined;
    if (data.amount !== undefined) {
      const hasPaid = existing.amountPaid.greaterThan(0);
      if (hasPaid) {
        throw new BadRequestException(
          'Cannot change amount on a charge that already has payments recorded',
        );
      }

      nextAmount = new Prisma.Decimal(data.amount);
      nextAmountDue = nextAmount;
    }

    const before = {
      categoryId: existing.categoryId,
      title: existing.title,
      description: existing.description,
      dueDate: existing.dueDate,
      amount: existing.amount.toString(),
    };

    const updated = await this.prisma.billingCharge.update({
      where: { id },
      data: {
        categoryId: nextCategoryId,
        title: data.title !== undefined ? data.title.trim() : undefined,
        description: data.description !== undefined ? data.description : undefined,
        dueDate:
          data.dueDate !== undefined
            ? data.dueDate
              ? this.parseDueDateOrThrow(data.dueDate)
              : null
            : undefined,
        amount: nextAmount,
        amountDue: nextAmountDue,
      },
      select: chargeSelect,
    });

    const studentName = `${existing.student.firstName} ${existing.student.lastName}`.trim();

    await this.auditService.log({
      actor,
      schoolId: existing.schoolId,
      entityType: 'BillingCharge',
      entityId: existing.id,
      action: 'UPDATE',
      severity: AuditLogSeverity.INFO,
      summary: `Updated charge "${existing.title}" for student ${studentName}`,
      targetDisplay: `${studentName} — ${existing.title}`,
      changesJson: buildAuditDiff({
        before,
        after: {
          categoryId: nextCategoryId,
          title: updated.title,
          description: updated.description,
          dueDate: updated.dueDate,
          amount: updated.amount.toString(),
        },
      }),
    });

    return updated;
  }

  async voidCharge(
    actor: AuthenticatedUser,
    id: string,
    data: VoidBillingChargeDto,
  ) {
    this.ensureCanManage(actor);

    const existing = await this.getChargeOrThrow(id);

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, existing.schoolId);
    }

    if (existing.status === ChargeStatus.VOID) {
      return this.findOne(actor, id);
    }

    // Block if any payments have been recorded
    if (existing.amountPaid.greaterThan(0)) {
      throw new BadRequestException(
        'Cannot void a charge that has payments already recorded. Reverse any payments first.',
      );
    }

    const voided = await this.prisma.billingCharge.update({
      where: { id },
      data: {
        status: ChargeStatus.VOID,
        voidedAt: new Date(),
        voidReason: data.voidReason ?? null,
        voidedById: actor.id,
        amountDue: new Prisma.Decimal(0),
      },
      select: chargeSelect,
    });

    const studentName = `${existing.student.firstName} ${existing.student.lastName}`.trim();

    await this.auditService.log({
      actor,
      schoolId: existing.schoolId,
      entityType: 'BillingCharge',
      entityId: existing.id,
      action: 'VOID',
      severity: AuditLogSeverity.WARNING,
      summary: `Voided charge "${existing.title}" for student ${studentName}`,
      targetDisplay: `${studentName} — ${existing.title}`,
      metadataJson: {
        voidReason: data.voidReason ?? null,
      },
    });

    return voided;
  }

  async bulkCreate(actor: AuthenticatedUser, data: BulkCreateBillingChargeDto) {
    this.ensureCanCreate(actor);

    const schoolId = data.schoolId.trim();

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, schoolId);
    }

    // Validate school exists
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });
    if (!school) {
      throw new NotFoundException(`School ${schoolId} not found`);
    }

    // Validate category
    const category = await this.prisma.billingCategory.findUnique({
      where: { id: data.categoryId },
      select: { id: true, schoolId: true, isActive: true, name: true },
    });
    if (!category) {
      throw new NotFoundException('Billing category not found');
    }
    if (category.schoolId !== schoolId) {
      throw new BadRequestException('Billing category does not belong to the specified school');
    }
    if (!category.isActive) {
      throw new BadRequestException('Billing category is not active');
    }

    // Validate schoolYear if provided
    if (data.schoolYearId) {
      const sy = await this.prisma.schoolYear.findFirst({
        where: { id: data.schoolYearId, schoolId },
        select: { id: true },
      });
      if (!sy) {
        throw new NotFoundException(`School year ${data.schoolYearId} not found in school`);
      }
    }

    // Parse dueDate
    let parsedDueDate: Date | null = null;
    if (data.dueDate) {
      parsedDueDate = new Date(data.dueDate);
      if (Number.isNaN(parsedDueDate.getTime())) {
        throw new BadRequestException('dueDate must be a valid date');
      }
    }

    // ── Resolve target student IDs ─────────────────────────────────────────
    let candidateStudentIds: string[];

    if (data.targetMode === BulkChargeTargetMode.SELECTED) {
      if (!data.studentIds || data.studentIds.length === 0) {
        throw new BadRequestException('studentIds is required for SELECTED mode');
      }
      candidateStudentIds = [...new Set(data.studentIds)];
    } else if (data.targetMode === BulkChargeTargetMode.CLASS) {
      if (!data.classId) {
        throw new BadRequestException('classId is required for CLASS mode');
      }
      const cls = await this.prisma.class.findFirst({
        where: { id: data.classId, schoolId },
        select: {
          id: true,
          students: { select: { studentId: true } },
        },
      });
      if (!cls) {
        throw new NotFoundException(`Class ${data.classId} not found in school`);
      }
      candidateStudentIds = cls.students.map((e) => e.studentId);
    } else {
      // GRADE
      if (!data.gradeLevel) {
        throw new BadRequestException('gradeLevel is required for GRADE mode');
      }
      const gradeLevel = await this.prisma.gradeLevel.findFirst({
        where: { id: data.gradeLevel, schoolId },
        select: { id: true, name: true },
      });
      if (!gradeLevel) {
        throw new NotFoundException(`Grade level ${data.gradeLevel} not found in school`);
      }
      // Students assigned to this grade level via User.gradeLevelId or via memberships in this school
      const studentsInGrade = await this.prisma.user.findMany({
        where: { gradeLevelId: data.gradeLevel },
        select: { id: true },
      });
      candidateStudentIds = studentsInGrade.map((s) => s.id);
    }

    if (candidateStudentIds.length === 0) {
      return {
        totalTargeted: 0,
        createdCount: 0,
        skippedCount: 0,
        createdStudentIds: [],
        skipped: [],
      };
    }

    // ── Validate students belong to school ────────────────────────────────
    const students = await this.prisma.user.findMany({
      where: { id: { in: candidateStudentIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        schoolId: true,
        memberships: { where: { isActive: true }, select: { schoolId: true } },
      },
    });

    const studentMap = new Map(students.map((s) => [s.id, s]));

    // ── Duplicate detection: skip if a non-void active charge with same
    //   categoryId + title + amount already exists for the student ──────────
    const amountDecimal = new Prisma.Decimal(data.amount);

    const existingCharges = await this.prisma.billingCharge.findMany({
      where: {
        schoolId,
        categoryId: data.categoryId,
        title: data.title.trim(),
        amount: amountDecimal,
        studentId: { in: candidateStudentIds },
        status: { not: ChargeStatus.VOID },
      },
      select: { studentId: true },
    });

    const studentsWithDuplicate = new Set(existingCharges.map((c) => c.studentId));

    // ── Classify each candidate ────────────────────────────────────────────
    type SkipEntry = { studentId: string; reason: string };
    const toCreate: string[] = [];
    const skipped: SkipEntry[] = [];

    for (const studentId of candidateStudentIds) {
      const student = studentMap.get(studentId);
      if (!student) {
        skipped.push({ studentId, reason: 'Student not found' });
        continue;
      }

      const studentSchoolIds = [
        ...(student.schoolId ? [student.schoolId] : []),
        ...student.memberships.map((m) => m.schoolId),
      ];
      if (!studentSchoolIds.includes(schoolId)) {
        skipped.push({ studentId, reason: 'Student does not belong to the specified school' });
        continue;
      }

      if (studentsWithDuplicate.has(studentId)) {
        skipped.push({
          studentId,
          reason: `Active charge with same category, title, and amount already exists`,
        });
        continue;
      }

      toCreate.push(studentId);
    }

    // ── Create charges in a transaction ───────────────────────────────────
    const issuedAt = new Date();

    let createdCharges: Array<{ id: string; studentId: string }> = [];

    if (toCreate.length > 0) {
      createdCharges = await this.prisma.$transaction(
        toCreate.map((studentId) =>
          this.prisma.billingCharge.create({
            data: {
              schoolId,
              schoolYearId: data.schoolYearId ?? null,
              studentId,
              categoryId: data.categoryId,
              createdById: actor.id,
              title: data.title.trim(),
              description: data.description ?? null,
              amount: amountDecimal,
              amountPaid: new Prisma.Decimal(0),
              amountDue: amountDecimal,
              status: ChargeStatus.PENDING,
              sourceType: data.sourceType ?? ChargeSourceType.MANUAL,
              issuedAt,
              dueDate: parsedDueDate,
            },
            select: { id: true, studentId: true },
          }),
        ),
      );
    }

    await this.auditService.log({
      actor,
      schoolId,
      entityType: 'BillingCharge',
      entityId: schoolId,
      action: 'BULK_CREATE',
      severity: AuditLogSeverity.INFO,
      summary: `Bulk created ${toCreate.length} charge(s) "${data.title}" (targeted ${candidateStudentIds.length}, skipped ${skipped.length})`,
      targetDisplay: `Bulk — ${data.title}`,
      metadataJson: {
        targetMode: data.targetMode,
        totalTargeted: candidateStudentIds.length,
        createdCount: toCreate.length,
        skippedCount: skipped.length,
        categoryId: data.categoryId,
        categoryName: category.name,
        amount: data.amount,
      },
    });

    if (createdCharges.length > 0) {
      const createdByStudentId = new Map(
        createdCharges.map((charge) => [charge.studentId, charge.id]),
      );

      const parentLinks = await this.prisma.studentParentLink.findMany({
        where: { studentId: { in: toCreate } },
        select: { parentId: true, studentId: true },
      });

      const inputs = new Map<string, Parameters<NotificationsService['createMany']>[0][number]>();

      for (const link of parentLinks) {
        const student = studentMap.get(link.studentId);
        if (!student) {
          continue;
        }

        const studentName = `${student.firstName} ${student.lastName}`.trim() || 'student';
        const key = `${link.parentId}::${link.studentId}`;

        inputs.set(key, {
          schoolId,
          recipientUserId: link.parentId,
          type: 'BILLING_CHARGE_CREATED',
          title: `New charge posted for ${studentName}`,
          message: `New charge posted for ${studentName}`,
          entityType: 'BillingCharge',
          entityId: createdByStudentId.get(link.studentId) ?? null,
        });
      }

      if (data.sendNotifications ?? false) {
        await this.notificationsService.createMany([...inputs.values()]);
      }
    }

    return {
      totalTargeted: candidateStudentIds.length,
      createdCount: toCreate.length,
      skippedCount: skipped.length,
      createdStudentIds: toCreate,
      skipped,
    };
  }
}
