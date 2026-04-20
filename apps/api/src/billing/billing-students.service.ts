import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChargeStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { getAccessibleSchoolIdsWithLegacyFallback } from '../common/access/school-membership.util';
import { GetStudentAccountSummaryQueryDto } from './dto/get-student-account-summary-query.dto';

const accountSummaryChargeSelect = Prisma.validator<Prisma.BillingChargeSelect>()({
  id: true,
  schoolId: true,
  schoolYearId: true,
  studentId: true,
  categoryId: true,
  title: true,
  amount: true,
  amountPaid: true,
  amountDue: true,
  status: true,
  issuedAt: true,
  dueDate: true,
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
});

const recentPaymentSelect = Prisma.validator<Prisma.BillingPaymentSelect>()({
  id: true,
  schoolId: true,
  schoolYearId: true,
  studentId: true,
  receiptNumber: true,
  method: true,
  amount: true,
  paymentDate: true,
  referenceNumber: true,
  schoolYear: {
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  },
});

@Injectable()
export class BillingStudentsService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureCanRead(actor: AuthenticatedUser) {
    const allowed: UserRole[] = [
      UserRole.OWNER,
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.STAFF,
    ];

    if (!allowed.includes(actor.role)) {
      throw new ForbiddenException('You do not have permission to view billing data');
    }
  }

  private buildScopeSchoolIds(
    actor: AuthenticatedUser,
    requestedSchoolId?: string | null,
  ) {
    const schoolId = requestedSchoolId?.trim() || null;

    if (schoolId) {
      if (!isBypassRole(actor.role)) {
        ensureUserHasSchoolAccess(actor, schoolId);
      }
      return [schoolId];
    }

    if (isBypassRole(actor.role)) {
      return null;
    }

    const accessible = getAccessibleSchoolIds(actor);
    if (accessible.length === 0) {
      throw new ForbiddenException('You do not have school access');
    }

    return accessible;
  }

  private startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private sumDecimals(values: Prisma.Decimal[]) {
    return values.reduce((acc, value) => acc.add(value), new Prisma.Decimal(0));
  }

  async getAccountSummary(
    actor: AuthenticatedUser,
    studentId: string,
    query?: GetStudentAccountSummaryQueryDto,
  ) {
    this.ensureCanRead(actor);

    const scopeSchoolIds = this.buildScopeSchoolIds(actor, query?.schoolId);

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        email: true,
        role: true,
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

    if (student.role !== UserRole.STUDENT) {
      throw new BadRequestException('Provided user is not a student');
    }

    const studentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId,
    });

    const effectiveSchoolIds = scopeSchoolIds
      ? scopeSchoolIds.filter((schoolId) => studentSchoolIds.includes(schoolId))
      : studentSchoolIds;

    if (effectiveSchoolIds.length === 0) {
      throw new NotFoundException(
        'Student not found in the requested school scope',
      );
    }

    const summary = await this.buildAccountSummary(
      studentId,
      effectiveSchoolIds,
    );

    return {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        username: student.username,
        email: student.email,
      },
      ...summary,
    };
  }

  async getAccountSummaryForParent(
    actor: AuthenticatedUser,
    studentId: string,
  ) {
    if (actor.role !== UserRole.PARENT) {
      throw new ForbiddenException('Only parents can access this endpoint');
    }

    // Verify this parent is linked to the requested student
    type LinkedStudent = {
      id: string;
      firstName: string;
      lastName: string;
      username: string;
      email: string | null;
      role: string;
      schoolId: string | null;
      memberships: Array<{ schoolId: string }>;
    };

    const link: { student: LinkedStudent } | null =
      await this.prisma.studentParentLink.findUnique({
        where: {
          parentId_studentId: {
            parentId: actor.id,
            studentId,
          },
        },
        select: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              email: true,
              role: true,
              schoolId: true,
              memberships: {
                where: { isActive: true },
                select: { schoolId: true },
              },
            },
          },
        },
      });

    if (!link) {
      throw new ForbiddenException('You are not linked to this student');
    }

    const student = link.student;

    if (student.role !== UserRole.STUDENT) {
      throw new BadRequestException('Provided user is not a student');
    }

    const effectiveSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId,
    });

    if (effectiveSchoolIds.length === 0) {
      throw new NotFoundException('Student has no active school membership');
    }

    const summary = await this.buildAccountSummary(
      studentId,
      effectiveSchoolIds,
    );

    return {
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        username: student.username,
        email: student.email,
      },
      ...summary,
    };
  }

  private async buildAccountSummary(
    studentId: string,
    effectiveSchoolIds: string[],
  ) {
    const outstandingCharges = await this.prisma.billingCharge.findMany({
      where: {
        studentId,
        schoolId: { in: effectiveSchoolIds },
        status: { not: ChargeStatus.VOID },
        amountDue: { gt: new Prisma.Decimal(0) },
      },
      orderBy: [{ dueDate: 'asc' }, { issuedAt: 'asc' }, { createdAt: 'asc' }],
      select: accountSummaryChargeSelect,
    });

    const todayStart = this.startOfToday();

    const overdueCharges = outstandingCharges.filter(
      (charge) => charge.dueDate && charge.dueDate < todayStart,
    );

    const totalOutstanding = this.sumDecimals(
      outstandingCharges.map((charge) => new Prisma.Decimal(charge.amountDue)),
    );

    const totalOverdue = this.sumDecimals(
      overdueCharges.map((charge) => new Prisma.Decimal(charge.amountDue)),
    );

    const paidAggregate = await this.prisma.billingPayment.aggregate({
      where: {
        studentId,
        schoolId: { in: effectiveSchoolIds },
        isVoided: false,
      },
      _sum: { amount: true },
    });

    const totalPaid = paidAggregate._sum.amount ?? new Prisma.Decimal(0);

    const recentPayments = await this.prisma.billingPayment.findMany({
      where: {
        studentId,
        schoolId: { in: effectiveSchoolIds },
        isVoided: false,
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      take: 10,
      select: recentPaymentSelect,
    });

    return {
      totalOutstanding,
      totalOverdue,
      totalPaid,
      outstandingCharges,
      overdueCharges,
      recentPayments,
    };
  }
}
