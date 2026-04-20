import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogSeverity,
  ChargeStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  isBypassRole,
} from '../common/access/school-access.util';
import {
  BatchBillingPaymentEntryDto,
  CreateBatchBillingPaymentsDto,
} from './dto/create-batch-billing-payments.dto';
import {
  CreateBillingPaymentDto,
  PaymentAllocationItemDto,
} from './dto/create-billing-payment.dto';
import { VoidBillingPaymentDto } from './dto/void-billing-payment.dto';

const paymentSelect = Prisma.validator<Prisma.BillingPaymentSelect>()({
  id: true,
  schoolId: true,
  schoolYearId: true,
  studentId: true,
  recordedById: true,
  paymentDate: true,
  amount: true,
  method: true,
  referenceNumber: true,
  notes: true,
  receiptNumber: true,
  isVoided: true,
  voidedAt: true,
  voidReason: true,
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
  recordedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
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
  allocations: {
    select: {
      id: true,
      chargeId: true,
      amount: true,
      createdAt: true,
      charge: {
        select: {
          id: true,
          title: true,
          amount: true,
          amountPaid: true,
          amountDue: true,
          status: true,
        },
      },
    },
  },
});

@Injectable()
export class BillingPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async notifyLinkedParentsForPaymentEvent(input: {
    schoolId: string;
    studentId: string;
    paymentId: string;
    type: 'BILLING_PAYMENT_RECORDED' | 'BILLING_PAYMENT_VOIDED';
    message: string;
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
        type: input.type,
        title: input.message,
        message: input.message,
        entityType: 'BillingPayment',
        entityId: input.paymentId,
      })),
    );
  }

  private ensureCanCreate(actor: AuthenticatedUser) {
    const allowed = ['OWNER', 'SUPER_ADMIN', 'ADMIN'];
    if (!allowed.includes(actor.role)) {
      throw new ForbiddenException('You do not have permission to record payments');
    }
  }

  private ensureCanVoid(actor: AuthenticatedUser) {
    const allowed = ['OWNER', 'SUPER_ADMIN', 'ADMIN'];
    if (!allowed.includes(actor.role)) {
      throw new ForbiddenException('You do not have permission to void payments');
    }
  }

  private generateReceiptNumber(schoolId: string): string {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000).toString();
    const prefix = schoolId.slice(-6).toUpperCase();
    return `RCP-${prefix}-${datePart}-${rand}`;
  }

  async create(actor: AuthenticatedUser, dto: CreateBillingPaymentDto) {
    this.ensureCanCreate(actor);

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, dto.schoolId);
    }

    const paymentAmount = new Prisma.Decimal(dto.amount);
    if (paymentAmount.lte(0)) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    const paymentDate = new Date(dto.paymentDate);
    if (Number.isNaN(paymentDate.getTime())) {
      throw new BadRequestException('paymentDate must be a valid ISO date');
    }

    // Validate school exists
    const school = await this.prisma.school.findUnique({
      where: { id: dto.schoolId },
      select: { id: true },
    });
    if (!school) {
      throw new NotFoundException(`School ${dto.schoolId} not found`);
    }

    // Validate student belongs to school
    const student = await this.prisma.user.findFirst({
      where: {
        id: dto.studentId,
        memberships: { some: { schoolId: dto.schoolId } },
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!student) {
      throw new NotFoundException(
        `Student ${dto.studentId} not found in school ${dto.schoolId}`,
      );
    }

    // Validate school year if provided
    if (dto.schoolYearId) {
      const sy = await this.prisma.schoolYear.findFirst({
        where: { id: dto.schoolYearId, schoolId: dto.schoolId },
        select: { id: true },
      });
      if (!sy) {
        throw new NotFoundException(
          `School year ${dto.schoolYearId} not found in school ${dto.schoolId}`,
        );
      }
    }

    // Build final allocations (explicit or auto)
    const resolvedAllocations = await this.resolveAllocations(
      dto.schoolId,
      dto.studentId,
      paymentAmount,
      dto.allocations,
    );

    // Generate a unique receipt number (retry once on collision)
    let receiptNumber = this.generateReceiptNumber(dto.schoolId);
    const existing = await this.prisma.billingPayment.findUnique({
      where: { schoolId_receiptNumber: { schoolId: dto.schoolId, receiptNumber } },
      select: { id: true },
    });
    if (existing) {
      receiptNumber = this.generateReceiptNumber(dto.schoolId);
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      // Create payment record
      const newPayment = await tx.billingPayment.create({
        data: {
          schoolId: dto.schoolId,
          schoolYearId: dto.schoolYearId ?? null,
          studentId: dto.studentId,
          recordedById: actor.id,
          paymentDate,
          amount: paymentAmount,
          method: dto.method as PaymentMethod,
          referenceNumber: dto.referenceNumber ?? null,
          notes: dto.notes ?? null,
          receiptNumber,
        },
        select: { id: true, receiptNumber: true },
      });

      // Create allocation records and update each charge
      for (const alloc of resolvedAllocations) {
        const allocAmount = new Prisma.Decimal(alloc.amount);

        await tx.billingPaymentAllocation.create({
          data: {
            paymentId: newPayment.id,
            chargeId: alloc.chargeId,
            amount: allocAmount,
          },
        });

        // Fetch current charge inside transaction
        const charge = await tx.billingCharge.findUnique({
          where: { id: alloc.chargeId },
          select: { amountPaid: true, amountDue: true, amount: true, status: true },
        });
        if (!charge) continue;

        const newAmountPaid = new Prisma.Decimal(charge.amountPaid).add(allocAmount);
        const newAmountDue = new Prisma.Decimal(charge.amount).sub(newAmountPaid);
        const safeAmountDue = newAmountDue.lt(0) ? new Prisma.Decimal(0) : newAmountDue;

        let newStatus: ChargeStatus = charge.status;
        if (safeAmountDue.eq(0)) {
          newStatus = ChargeStatus.PAID;
        } else if (newAmountPaid.gt(0)) {
          newStatus = ChargeStatus.PARTIAL;
        }

        await tx.billingCharge.update({
          where: { id: alloc.chargeId },
          data: {
            amountPaid: newAmountPaid,
            amountDue: safeAmountDue,
            status: newStatus,
          },
        });
      }

      // Return full payment with relations
      return tx.billingPayment.findUnique({
        where: { id: newPayment.id },
        select: paymentSelect,
      });
    });

    if (!payment) {
      throw new BadRequestException('Payment creation failed unexpectedly');
    }

    await this.auditService.log({
      actor,
      schoolId: dto.schoolId,
      entityType: 'BillingPayment',
      entityId: payment.id,
      action: 'CREATE',
      severity: AuditLogSeverity.INFO,
      summary: `Payment of ${dto.amount} recorded for student ${student.firstName} ${student.lastName} (receipt: ${payment.receiptNumber})`,
      targetDisplay: `${student.firstName} ${student.lastName}`,
    });

    const studentName = `${student.firstName} ${student.lastName}`.trim() || 'student';

    await this.notifyLinkedParentsForPaymentEvent({
      schoolId: dto.schoolId,
      studentId: dto.studentId,
      paymentId: payment.id,
      type: 'BILLING_PAYMENT_RECORDED',
      message: `Payment recorded for ${studentName}`,
      shouldNotify: dto.sendNotifications ?? false,
    });

    return payment;
  }

  async createBatch(
    actor: AuthenticatedUser,
    dto: CreateBatchBillingPaymentsDto,
  ) {
    this.ensureCanCreate(actor);

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, dto.schoolId);
    }

    if (!dto.entries || dto.entries.length === 0) {
      throw new BadRequestException('entries must contain at least one payment row');
    }

    type BatchRowResult = {
      rowIndex: number;
      studentId: string;
      success: boolean;
      paymentId?: string;
      receiptNumber?: string;
      error?: string;
    };

    const results: BatchRowResult[] = [];

    const parseErrorMessage = (error: unknown) => {
      if (error instanceof Error && error.message) {
        return error.message;
      }
      return 'Unable to process batch payment row';
    };

    for (let index = 0; index < dto.entries.length; index += 1) {
      const entry: BatchBillingPaymentEntryDto = dto.entries[index];

      try {
        const payment = await this.create(actor, {
          schoolId: dto.schoolId,
          studentId: entry.studentId,
          schoolYearId: entry.schoolYearId,
          paymentDate: entry.paymentDate,
          amount: entry.amount,
          method: entry.method,
          referenceNumber: entry.referenceNumber,
          notes: entry.notes,
          allocations: entry.allocations,
          sendNotifications: dto.sendNotifications ?? false,
        });

        results.push({
          rowIndex: index,
          studentId: entry.studentId,
          success: true,
          paymentId: payment.id,
          receiptNumber: payment.receiptNumber,
        });
      } catch (error) {
        results.push({
          rowIndex: index,
          studentId: entry.studentId,
          success: false,
          error: parseErrorMessage(error),
        });
      }
    }

    const successCount = results.filter((result) => result.success).length;
    const failedCount = results.length - successCount;

    await this.auditService.log({
      actor,
      schoolId: dto.schoolId,
      entityType: 'BillingPayment',
      entityId: null,
      action: 'BATCH_CREATE',
      severity: failedCount > 0 ? AuditLogSeverity.WARNING : AuditLogSeverity.INFO,
      summary: `Batch payment entry processed ${results.length} row(s): ${successCount} succeeded, ${failedCount} failed`,
      targetDisplay: `Batch payments (${dto.schoolId})`,
      metadataJson: {
        totalRows: results.length,
        successCount,
        failedCount,
      },
    });

    return {
      schoolId: dto.schoolId,
      totalRows: results.length,
      successCount,
      failedCount,
      results,
    };
  }

  /**
   * Resolves the final list of allocations, either from explicit input or
   * auto-allocated to the oldest outstanding charges.
   */
  private async resolveAllocations(
    schoolId: string,
    studentId: string,
    paymentAmount: Prisma.Decimal,
    explicit?: PaymentAllocationItemDto[],
  ): Promise<{ chargeId: string; amount: string }[]> {
    if (explicit && explicit.length > 0) {
      return this.validateExplicitAllocations(
        schoolId,
        studentId,
        paymentAmount,
        explicit,
      );
    }
    return this.autoAllocate(schoolId, studentId, paymentAmount);
  }

  private async validateExplicitAllocations(
    schoolId: string,
    studentId: string,
    paymentAmount: Prisma.Decimal,
    items: PaymentAllocationItemDto[],
  ): Promise<{ chargeId: string; amount: string }[]> {
    let totalAllocated = new Prisma.Decimal(0);

    const chargeIds = items.map((i) => i.chargeId);
    const charges = await this.prisma.billingCharge.findMany({
      where: { id: { in: chargeIds }, schoolId, studentId },
      select: { id: true, amountDue: true, status: true, title: true },
    });

    const chargeMap = new Map(charges.map((c) => [c.id, c]));

    const result: { chargeId: string; amount: string }[] = [];

    for (const item of items) {
      const charge = chargeMap.get(item.chargeId);
      if (!charge) {
        throw new NotFoundException(
          `Charge ${item.chargeId} not found for this student in school ${schoolId}`,
        );
      }
      if (charge.status === ChargeStatus.VOID) {
        throw new BadRequestException(
          `Cannot allocate to voided charge "${charge.title}"`,
        );
      }
      if (charge.status === ChargeStatus.PAID) {
        throw new BadRequestException(
          `Charge "${charge.title}" is already fully paid`,
        );
      }

      const allocAmount = new Prisma.Decimal(item.amount);
      if (allocAmount.lte(0)) {
        throw new BadRequestException(
          `Allocation amount for charge ${item.chargeId} must be greater than zero`,
        );
      }
      if (allocAmount.gt(new Prisma.Decimal(charge.amountDue))) {
        throw new BadRequestException(
          `Allocation amount ${item.amount} exceeds amount due (${charge.amountDue}) for charge "${charge.title}"`,
        );
      }

      totalAllocated = totalAllocated.add(allocAmount);
      result.push({ chargeId: item.chargeId, amount: item.amount });
    }

    if (!totalAllocated.eq(paymentAmount)) {
      throw new BadRequestException(
        `Sum of allocations (${totalAllocated.toFixed(2)}) must equal payment amount (${paymentAmount.toFixed(2)})`,
      );
    }

    return result;
  }

  private async autoAllocate(
    schoolId: string,
    studentId: string,
    paymentAmount: Prisma.Decimal,
  ): Promise<{ chargeId: string; amount: string }[]> {
    // Fetch oldest outstanding charges (PENDING or PARTIAL), sorted by dueDate ASC NULLS LAST, issuedAt ASC
    const charges = await this.prisma.billingCharge.findMany({
      where: {
        schoolId,
        studentId,
        status: { in: [ChargeStatus.PENDING, ChargeStatus.PARTIAL] },
      },
      orderBy: [{ dueDate: 'asc' }, { issuedAt: 'asc' }],
      select: { id: true, amountDue: true, title: true },
    });

    if (charges.length === 0) {
      throw new BadRequestException(
        'No outstanding charges found for this student to allocate payment against',
      );
    }

    let remaining = paymentAmount;
    const result: { chargeId: string; amount: string }[] = [];

    for (const charge of charges) {
      if (remaining.lte(0)) break;

      const due = new Prisma.Decimal(charge.amountDue);
      const alloc = remaining.gt(due) ? due : remaining;
      result.push({ chargeId: charge.id, amount: alloc.toFixed(2) });
      remaining = remaining.sub(alloc);
    }

    if (remaining.gt(0)) {
      throw new BadRequestException(
        `Payment amount (${paymentAmount.toFixed(2)}) exceeds total outstanding balance for this student`,
      );
    }

    return result;
  }

  async voidPayment(
    actor: AuthenticatedUser,
    paymentId: string,
    data: VoidBillingPaymentDto,
  ) {
    this.ensureCanVoid(actor);

    const payment = await this.prisma.billingPayment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        schoolId: true,
        studentId: true,
        amount: true,
        receiptNumber: true,
        isVoided: true,
        student: { select: { firstName: true, lastName: true } },
        allocations: {
          select: {
            id: true,
            chargeId: true,
            amount: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Billing payment not found');
    }

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, payment.schoolId);
    }

    // Idempotent: already voided — return current state
    if (payment.isVoided) {
      return this.prisma.billingPayment.findUnique({
        where: { id: paymentId },
        select: paymentSelect,
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Mark payment as voided
      await tx.billingPayment.update({
        where: { id: paymentId },
        data: {
          isVoided: true,
          voidedAt: new Date(),
          voidReason: data.voidReason ?? null,
        },
      });

      // Reverse each allocation
      for (const alloc of payment.allocations) {
        const allocAmount = new Prisma.Decimal(alloc.amount);

        const charge = await tx.billingCharge.findUnique({
          where: { id: alloc.chargeId },
          select: { amount: true, amountPaid: true, amountDue: true, status: true },
        });

        if (!charge) continue;

        const newAmountPaid = new Prisma.Decimal(charge.amountPaid).sub(allocAmount);
        const safeAmountPaid = newAmountPaid.lt(0) ? new Prisma.Decimal(0) : newAmountPaid;
        const newAmountDue = new Prisma.Decimal(charge.amount).sub(safeAmountPaid);
        const safeAmountDue = newAmountDue.lt(0) ? new Prisma.Decimal(0) : newAmountDue;

        let newStatus: ChargeStatus = charge.status;
        // Only update status if charge is not already in a terminal non-payment state
        if (
          charge.status !== ChargeStatus.VOID &&
          charge.status !== ChargeStatus.WAIVED &&
          charge.status !== ChargeStatus.CANCELLED
        ) {
          if (safeAmountPaid.eq(0)) {
            newStatus = ChargeStatus.PENDING;
          } else if (safeAmountDue.gt(0)) {
            newStatus = ChargeStatus.PARTIAL;
          } else {
            newStatus = ChargeStatus.PAID;
          }
        }

        await tx.billingCharge.update({
          where: { id: alloc.chargeId },
          data: {
            amountPaid: safeAmountPaid,
            amountDue: safeAmountDue,
            status: newStatus,
          },
        });
      }

      return tx.billingPayment.findUnique({
        where: { id: paymentId },
        select: paymentSelect,
      });
    });

    const studentName =
      `${payment.student.firstName} ${payment.student.lastName}`.trim();

    await this.auditService.log({
      actor,
      schoolId: payment.schoolId,
      entityType: 'BillingPayment',
      entityId: paymentId,
      action: 'VOID',
      severity: AuditLogSeverity.WARNING,
      summary: `Voided payment ${payment.receiptNumber} for student ${studentName}`,
      targetDisplay: `${studentName} — receipt ${payment.receiptNumber}`,
      metadataJson: {
        voidReason: data.voidReason ?? null,
        amount: payment.amount.toString(),
        allocationsReversed: payment.allocations.length,
      },
    });

    await this.notifyLinkedParentsForPaymentEvent({
      schoolId: payment.schoolId,
      studentId: payment.studentId,
      paymentId,
      type: 'BILLING_PAYMENT_VOIDED',
      message: `Payment reversed for ${studentName}`,
      shouldNotify: data.sendNotifications ?? false,
    });

    return result;
  }

  async getReceiptData(actor: AuthenticatedUser, paymentId: string) {
    this.ensureCanVoid(actor);

    const payment = await this.prisma.billingPayment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        schoolId: true,
        receiptNumber: true,
        paymentDate: true,
        amount: true,
        method: true,
        referenceNumber: true,
        notes: true,
        isVoided: true,
        voidedAt: true,
        voidReason: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        recordedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        allocations: {
          select: {
            id: true,
            chargeId: true,
            amount: true,
            charge: {
              select: {
                id: true,
                title: true,
                amount: true,
              },
            },
          },
        },
        school: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.schoolId) {
      ensureUserHasSchoolAccess(actor, payment.schoolId);
    }

    return payment;
  }

  async getReceiptDataForParent(actor: AuthenticatedUser, paymentId: string) {
    if (actor.role !== 'PARENT') {
      throw new ForbiddenException('Only parents can access this endpoint');
    }

    const payment = await this.prisma.billingPayment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        schoolId: true,
        studentId: true,
        receiptNumber: true,
        paymentDate: true,
        amount: true,
        method: true,
        referenceNumber: true,
        notes: true,
        isVoided: true,
        voidedAt: true,
        voidReason: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        recordedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        allocations: {
          select: {
            id: true,
            chargeId: true,
            amount: true,
            charge: {
              select: {
                id: true,
                title: true,
                amount: true,
              },
            },
          },
        },
        school: {
          select: {
            id: true,
            name: true,
            shortName: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Verify parent is linked to the student
    const link = await this.prisma.studentParentLink.findUnique({
      where: {
        parentId_studentId: {
          parentId: actor.id,
          studentId: payment.studentId,
        },
      },
    });

    if (!link) {
      throw new ForbiddenException('You are not linked to this student');
    }

    return payment;
  }
}
