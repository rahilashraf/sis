import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChargeSourceType,
  ChargeStatus,
  LibraryFineReason,
  LibraryFineStatus,
  LibraryHoldStatus,
  LibraryLateFineFrequency,
  LibraryItemStatus,
  LibraryLoanStatus,
  NotificationType,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { getAccessibleSchoolIdsWithLegacyFallback } from '../common/access/school-membership.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutLibraryLoanDto } from './dto/checkout-library-loan.dto';
import { CreateLibraryHoldDto } from './dto/create-library-hold.dto';
import { CreateLibraryItemDto } from './dto/create-library-item.dto';
import { ListLibraryItemsQueryDto } from './dto/list-library-items-query.dto';
import { ListLibraryHoldsQueryDto } from './dto/list-library-holds-query.dto';
import { ListLibraryLoansQueryDto } from './dto/list-library-loans-query.dto';
import { ListLibraryOverdueQueryDto } from './dto/list-library-overdue-query.dto';
import { GetLibraryFineSettingsQueryDto } from './dto/get-library-fine-settings-query.dto';
import { ListLibraryFinesQueryDto } from './dto/list-library-fines-query.dto';
import { UpsertLibraryFineSettingsDto } from './dto/upsert-library-fine-settings.dto';
import { CreateManualLibraryFineDto } from './dto/create-manual-library-fine.dto';
import { WaiveLibraryFineDto } from './dto/waive-library-fine.dto';
import { AssessLibraryOverdueFinesDto } from './dto/assess-library-overdue-fines.dto';
import { AssessUnclaimedHoldFineDto } from './dto/assess-unclaimed-hold-fine.dto';
import { ReturnLibraryLoanDto } from './dto/return-library-loan.dto';
import { UpdateLibraryHoldDto } from './dto/update-library-hold.dto';
import { UpdateLibraryItemDto } from './dto/update-library-item.dto';
import { MarkLibraryLoanLostDto } from './dto/mark-library-loan-lost.dto';

const LIBRARY_MANAGE_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.STAFF,
];

const LIBRARY_FINE_POLICY_ROLES: UserRole[] = [UserRole.OWNER, UserRole.SUPER_ADMIN];

const libraryItemSelect = Prisma.validator<Prisma.LibraryItemSelect>()({
  id: true,
  schoolId: true,
  title: true,
  author: true,
  isbn: true,
  barcode: true,
  category: true,
  status: true,
  totalCopies: true,
  availableCopies: true,
  createdAt: true,
  updatedAt: true,
  school: {
    select: {
      id: true,
      name: true,
      shortName: true,
    },
  },
});

const libraryLoanSelect = Prisma.validator<Prisma.LibraryLoanSelect>()({
  id: true,
  schoolId: true,
  itemId: true,
  studentId: true,
  checkedOutByUserId: true,
  checkoutDate: true,
  dueDate: true,
  returnedAt: true,
  receivedByUserId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  item: {
    select: {
      id: true,
      title: true,
      author: true,
      isbn: true,
      barcode: true,
      category: true,
      status: true,
    },
  },
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      email: true,
    },
  },
  checkedOutBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
    },
  },
  receivedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
    },
  },
  school: {
    select: {
      id: true,
      name: true,
      shortName: true,
    },
  },
});

type LoanRecord = Prisma.LibraryLoanGetPayload<{ select: typeof libraryLoanSelect }>;

const libraryHoldSelect = Prisma.validator<Prisma.LibraryHoldSelect>()({
  id: true,
  schoolId: true,
  itemId: true,
  studentId: true,
  createdByUserId: true,
  status: true,
  notes: true,
  resolvedAt: true,
  resolvedByUserId: true,
  createdAt: true,
  updatedAt: true,
  school: {
    select: {
      id: true,
      name: true,
      shortName: true,
    },
  },
  item: {
    select: {
      id: true,
      title: true,
      author: true,
      isbn: true,
      barcode: true,
      category: true,
      status: true,
      availableCopies: true,
      totalCopies: true,
    },
  },
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      email: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
    },
  },
  resolvedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
    },
  },
});

const libraryFineSettingsSelect =
  Prisma.validator<Prisma.LibraryFineSettingsSelect>()({
    id: true,
    schoolId: true,
    lateFineAmount: true,
    lostItemFineAmount: true,
    unclaimedHoldFineAmount: true,
    lateFineGraceDays: true,
    lateFineFrequency: true,
    createdAt: true,
    updatedAt: true,
    school: {
      select: {
        id: true,
        name: true,
        shortName: true,
      },
    },
  });

const libraryFineSelect = Prisma.validator<Prisma.LibraryFineSelect>()({
  id: true,
  schoolId: true,
  studentId: true,
  libraryItemId: true,
  checkoutId: true,
  holdReference: true,
  reason: true,
  status: true,
  amount: true,
  description: true,
  assessedAt: true,
  waivedAt: true,
  waivedById: true,
  billingChargeId: true,
  createdAt: true,
  updatedAt: true,
  school: {
    select: {
      id: true,
      name: true,
      shortName: true,
    },
  },
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      email: true,
    },
  },
  libraryItem: {
    select: {
      id: true,
      title: true,
      barcode: true,
      category: true,
    },
  },
  checkout: {
    select: {
      id: true,
      dueDate: true,
      checkoutDate: true,
      status: true,
    },
  },
  waivedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
    },
  },
  billingCharge: {
    select: {
      id: true,
      title: true,
      status: true,
      amount: true,
      amountPaid: true,
      amountDue: true,
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
});

@Injectable()
export class LibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private ensureCanManage(actor: AuthenticatedUser) {
    if (!LIBRARY_MANAGE_ROLES.includes(actor.role)) {
      throw new ForbiddenException('You do not have permission to manage library data');
    }
  }

  private ensureCanManageFinePolicy(actor: AuthenticatedUser) {
    if (!LIBRARY_FINE_POLICY_ROLES.includes(actor.role)) {
      throw new ForbiddenException('You do not have permission to manage library fine settings');
    }
  }

  private buildScopeSchoolIds(actor: AuthenticatedUser, requestedSchoolId?: string | null) {
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

    const accessibleSchoolIds = getAccessibleSchoolIds(actor);

    if (accessibleSchoolIds.length === 0) {
      throw new ForbiddenException('You do not have school access');
    }

    return accessibleSchoolIds;
  }

  private ensureCanAccessSchool(actor: AuthenticatedUser, schoolId: string) {
    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, schoolId);
    }
  }

  private parseDateOrThrow(value: string, fieldName: string) {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid datetime`);
    }

    return parsed;
  }

  private parseMoneyOrThrow(value: string, fieldName: string) {
    const normalized = value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      throw new BadRequestException(
        `${fieldName} must be a positive number with at most 2 decimal places`,
      );
    }

    return new Prisma.Decimal(normalized);
  }

  private startOfToday() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  private normalizeItemStatus(input: {
    status?: LibraryItemStatus | null;
    availableCopies: number;
  }) {
    if (input.status === LibraryItemStatus.LOST || input.status === LibraryItemStatus.ARCHIVED) {
      return input.status;
    }

    return input.availableCopies > 0
      ? LibraryItemStatus.AVAILABLE
      : LibraryItemStatus.CHECKED_OUT;
  }

  private normalizeFoundItemStatus(input: {
    status: LibraryItemStatus;
    availableCopies: number;
  }) {
    if (input.status === LibraryItemStatus.ARCHIVED) {
      return LibraryItemStatus.ARCHIVED;
    }

    return input.availableCopies > 0
      ? LibraryItemStatus.AVAILABLE
      : LibraryItemStatus.CHECKED_OUT;
  }

  private computeLoanStatus(loan: {
    status: LibraryLoanStatus;
    returnedAt: Date | null;
    dueDate: Date;
  }) {
    if (loan.status === LibraryLoanStatus.RETURNED || loan.returnedAt) {
      return LibraryLoanStatus.RETURNED;
    }

    if (loan.status === LibraryLoanStatus.LOST) {
      return LibraryLoanStatus.LOST;
    }

    return loan.dueDate < this.startOfToday()
      ? LibraryLoanStatus.OVERDUE
      : LibraryLoanStatus.ACTIVE;
  }

  private mapLoanRecord(loan: LoanRecord) {
    return {
      ...loan,
      status: this.computeLoanStatus(loan),
    };
  }

  private getFineStatusFromCharge(input: {
    currentStatus: LibraryFineStatus;
    chargeStatus: ChargeStatus | null | undefined;
  }) {
    if (!input.chargeStatus) {
      return input.currentStatus;
    }

    if (input.chargeStatus === ChargeStatus.PAID) {
      return LibraryFineStatus.PAID;
    }

    if (input.chargeStatus === ChargeStatus.VOID) {
      return LibraryFineStatus.VOID;
    }

    if (input.chargeStatus === ChargeStatus.WAIVED) {
      return LibraryFineStatus.WAIVED;
    }

    return input.currentStatus;
  }

  private mapFineRecord(
    fine: Prisma.LibraryFineGetPayload<{ select: typeof libraryFineSelect }>,
  ) {
    const effectiveStatus = this.getFineStatusFromCharge({
      currentStatus: fine.status,
      chargeStatus: fine.billingCharge?.status,
    });

    return {
      ...fine,
      status: effectiveStatus,
    };
  }

  private mapHoldRecord(
    hold: Prisma.LibraryHoldGetPayload<{ select: typeof libraryHoldSelect }>,
  ) {
    return hold;
  }

  private getActorSchoolIds(actor: AuthenticatedUser) {
    return getAccessibleSchoolIdsWithLegacyFallback({
      memberships: actor.memberships,
      legacySchoolId: actor.schoolId ?? null,
    });
  }

  private async ensureParentLinkedStudentOrThrow(
    actor: AuthenticatedUser,
    studentId: string,
  ) {
    if (actor.role !== UserRole.PARENT) {
      throw new ForbiddenException('Only parents can access this endpoint');
    }

    const link = await this.prisma.studentParentLink.findUnique({
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
            role: true,
            schoolId: true,
            memberships: {
              where: {
                isActive: true,
              },
              select: {
                schoolId: true,
              },
            },
          },
        },
      },
    });

    if (!link || link.student.role !== UserRole.STUDENT) {
      throw new ForbiddenException('You are not linked to this student');
    }

    return link.student;
  }

  private async getFineSettingsOrCreate(schoolId: string) {
    return this.prisma.libraryFineSettings.upsert({
      where: { schoolId },
      create: {
        schoolId,
        lateFineAmount: new Prisma.Decimal(0),
        lostItemFineAmount: new Prisma.Decimal(0),
        unclaimedHoldFineAmount: new Prisma.Decimal(0),
        lateFineGraceDays: 0,
        lateFineFrequency: LibraryLateFineFrequency.PER_DAY,
      },
      update: {},
      select: libraryFineSettingsSelect,
    });
  }

  private async ensureLibraryFineCategory(schoolId: string) {
    return this.prisma.billingCategory.upsert({
      where: {
        schoolId_name: {
          schoolId,
          name: 'Library Fines',
        },
      },
      create: {
        schoolId,
        name: 'Library Fines',
        description: 'System category for library fines',
        isActive: true,
      },
      update: {
        isActive: true,
        archivedAt: null,
      },
      select: {
        id: true,
        schoolId: true,
        name: true,
      },
    });
  }

  private buildLibraryFineChargeTitle(reason: LibraryFineReason) {
    if (reason === LibraryFineReason.LATE) {
      return 'Library fine - overdue item';
    }

    if (reason === LibraryFineReason.LOST) {
      return 'Library fine - lost item';
    }

    if (reason === LibraryFineReason.UNCLAIMED_HOLD) {
      return 'Library fine - unclaimed hold';
    }

    return 'Library fine - manual';
  }

  private async createFineWithCharge(input: {
    actor: AuthenticatedUser;
    schoolId: string;
    studentId: string;
    reason: LibraryFineReason;
    amount: Prisma.Decimal;
    description?: string | null;
    libraryItemId?: string | null;
    checkoutId?: string | null;
    holdReference?: string | null;
    dueDate?: Date | null;
  }) {
    if (input.amount.lte(0)) {
      throw new BadRequestException('Fine amount must be greater than zero');
    }

    const category = await this.ensureLibraryFineCategory(input.schoolId);
    const chargeTitle = this.buildLibraryFineChargeTitle(input.reason);

    try {
      const fine = await this.prisma.$transaction(async (tx) => {
        const charge = await tx.billingCharge.create({
          data: {
            schoolId: input.schoolId,
            schoolYearId: null,
            studentId: input.studentId,
            categoryId: category.id,
            createdById: input.actor.id,
            title: chargeTitle,
            description: input.description ?? null,
            amount: input.amount,
            amountPaid: new Prisma.Decimal(0),
            amountDue: input.amount,
            status: ChargeStatus.PENDING,
            sourceType: ChargeSourceType.SYSTEM,
            issuedAt: new Date(),
            dueDate: input.dueDate ?? null,
          },
          select: { id: true },
        });

        return tx.libraryFine.create({
          data: {
            schoolId: input.schoolId,
            studentId: input.studentId,
            libraryItemId: input.libraryItemId ?? null,
            checkoutId: input.checkoutId ?? null,
            holdReference: input.holdReference ?? null,
            reason: input.reason,
            status: LibraryFineStatus.OPEN,
            amount: input.amount,
            description: input.description ?? null,
            assessedAt: new Date(),
            billingChargeId: charge.id,
          },
          select: libraryFineSelect,
        });
      });

      return this.mapFineRecord(fine);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A matching library fine already exists');
      }

      throw error;
    }
  }

  private resolveFineAmountFromSettings(input: {
    settings: Prisma.LibraryFineSettingsGetPayload<{ select: typeof libraryFineSettingsSelect }>;
    reason: LibraryFineReason;
    daysOverdue?: number;
  }) {
    if (input.reason === LibraryFineReason.LATE) {
      const dailyAmount = new Prisma.Decimal(input.settings.lateFineAmount);
      const days = input.daysOverdue ?? 1;

      if (input.settings.lateFineFrequency === LibraryLateFineFrequency.FLAT) {
        return dailyAmount;
      }

      return dailyAmount.mul(days);
    }

    if (input.reason === LibraryFineReason.LOST) {
      return new Prisma.Decimal(input.settings.lostItemFineAmount);
    }

    if (input.reason === LibraryFineReason.UNCLAIMED_HOLD) {
      return new Prisma.Decimal(input.settings.unclaimedHoldFineAmount);
    }

    return new Prisma.Decimal(0);
  }

  private parseOptionalDate(value?: string | null) {
    if (!value) {
      return null;
    }

    return this.parseDateOrThrow(value, 'dueDate');
  }

  async getFineSettings(actor: AuthenticatedUser, schoolId: string) {
    this.ensureCanManage(actor);
    this.ensureCanAccessSchool(actor, schoolId);

    return this.getFineSettingsOrCreate(schoolId);
  }

  async upsertFineSettings(
    actor: AuthenticatedUser,
    body: UpsertLibraryFineSettingsDto,
  ) {
    this.ensureCanManageFinePolicy(actor);
    this.ensureCanAccessSchool(actor, body.schoolId);

    return this.prisma.libraryFineSettings.upsert({
      where: { schoolId: body.schoolId },
      create: {
        schoolId: body.schoolId,
        lateFineAmount: this.parseMoneyOrThrow(body.lateFineAmount, 'lateFineAmount'),
        lostItemFineAmount: this.parseMoneyOrThrow(
          body.lostItemFineAmount,
          'lostItemFineAmount',
        ),
        unclaimedHoldFineAmount: this.parseMoneyOrThrow(
          body.unclaimedHoldFineAmount,
          'unclaimedHoldFineAmount',
        ),
        lateFineGraceDays: body.lateFineGraceDays,
        lateFineFrequency: body.lateFineFrequency,
      },
      update: {
        lateFineAmount: this.parseMoneyOrThrow(body.lateFineAmount, 'lateFineAmount'),
        lostItemFineAmount: this.parseMoneyOrThrow(
          body.lostItemFineAmount,
          'lostItemFineAmount',
        ),
        unclaimedHoldFineAmount: this.parseMoneyOrThrow(
          body.unclaimedHoldFineAmount,
          'unclaimedHoldFineAmount',
        ),
        lateFineGraceDays: body.lateFineGraceDays,
        lateFineFrequency: body.lateFineFrequency,
      },
      select: libraryFineSettingsSelect,
    });
  }

  async listFines(actor: AuthenticatedUser, query: ListLibraryFinesQueryDto) {
    this.ensureCanManage(actor);

    const scopeSchoolIds = this.buildScopeSchoolIds(actor, query.schoolId);

    const fines = await this.prisma.libraryFine.findMany({
      where: {
        ...(scopeSchoolIds ? { schoolId: { in: scopeSchoolIds } } : {}),
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.reason ? { reason: query.reason } : {}),
      },
      orderBy: [{ assessedAt: 'desc' }, { createdAt: 'desc' }],
      select: libraryFineSelect,
    });

    const mapped = fines.map((fine) => this.mapFineRecord(fine));
    return query.status
      ? mapped.filter((fine) => fine.status === query.status)
      : mapped;
  }

  async createManualFine(actor: AuthenticatedUser, body: CreateManualLibraryFineDto) {
    this.ensureCanManage(actor);
    this.ensureCanAccessSchool(actor, body.schoolId);

    const reason = body.reason ?? LibraryFineReason.MANUAL;
    const student = await this.ensureStudentInSchoolOrThrow(
      body.studentId,
      body.schoolId,
    );

    let checkout: { id: string; schoolId: string; studentId: string; itemId: string } | null =
      null;
    if (body.checkoutId) {
      checkout = await this.prisma.libraryLoan.findUnique({
        where: { id: body.checkoutId },
        select: {
          id: true,
          schoolId: true,
          studentId: true,
          itemId: true,
        },
      });

      if (!checkout || checkout.schoolId !== body.schoolId) {
        throw new NotFoundException('Library checkout not found in this school');
      }

      if (checkout.studentId !== student.id) {
        throw new BadRequestException('checkoutId does not belong to the selected student');
      }
    }

    if ((reason === LibraryFineReason.LATE || reason === LibraryFineReason.LOST) && !body.checkoutId) {
      throw new BadRequestException('checkoutId is required for LATE and LOST fines');
    }

    if (reason === LibraryFineReason.UNCLAIMED_HOLD && !body.holdReference) {
      throw new BadRequestException('holdReference is required for UNCLAIMED_HOLD fines');
    }

    let libraryItemId = body.libraryItemId ?? checkout?.itemId ?? null;
    if (libraryItemId) {
      const item = await this.prisma.libraryItem.findFirst({
        where: {
          id: libraryItemId,
          schoolId: body.schoolId,
        },
        select: { id: true },
      });

      if (!item) {
        throw new NotFoundException('Library item not found in this school');
      }

      libraryItemId = item.id;
    }

    let amount: Prisma.Decimal;
    if (body.amount) {
      amount = this.parseMoneyOrThrow(body.amount, 'amount');
    } else {
      const settings = await this.getFineSettingsOrCreate(body.schoolId);
      amount = this.resolveFineAmountFromSettings({
        settings,
        reason,
      });
    }

    if (amount.lte(0)) {
      throw new BadRequestException('Fine amount must be configured and greater than zero');
    }

    return this.createFineWithCharge({
      actor,
      schoolId: body.schoolId,
      studentId: student.id,
      reason,
      amount,
      description: body.description ?? null,
      libraryItemId,
      checkoutId: checkout?.id ?? null,
      holdReference: body.holdReference ?? null,
      dueDate: this.parseOptionalDate(body.dueDate),
    });
  }

  async waiveFine(actor: AuthenticatedUser, fineId: string, body: WaiveLibraryFineDto) {
    this.ensureCanManage(actor);

    const fine = await this.prisma.libraryFine.findUnique({
      where: { id: fineId },
      select: {
        id: true,
        schoolId: true,
        status: true,
        billingChargeId: true,
        billingCharge: {
          select: {
            id: true,
            status: true,
            amountPaid: true,
          },
        },
      },
    });

    if (!fine) {
      throw new NotFoundException('Library fine not found');
    }

    this.ensureCanAccessSchool(actor, fine.schoolId);

    if (fine.status !== LibraryFineStatus.OPEN) {
      throw new BadRequestException('Only OPEN fines can be waived');
    }

    if (
      fine.billingCharge &&
      new Prisma.Decimal(fine.billingCharge.amountPaid).greaterThan(0)
    ) {
      throw new BadRequestException(
        'Cannot waive a fine with recorded payments. Reverse payments first.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (fine.billingChargeId) {
        await tx.billingCharge.update({
          where: { id: fine.billingChargeId },
          data: {
            status: ChargeStatus.WAIVED,
            amountDue: new Prisma.Decimal(0),
            ...(body.reason
              ? {
                  description: body.reason,
                }
              : {}),
          },
        });
      }

      return tx.libraryFine.update({
        where: { id: fine.id },
        data: {
          status: LibraryFineStatus.WAIVED,
          waivedAt: new Date(),
          waivedById: actor.id,
        },
        select: libraryFineSelect,
      });
    });

    return this.mapFineRecord(updated);
  }

  async assessOverdueFines(actor: AuthenticatedUser, body: AssessLibraryOverdueFinesDto) {
    this.ensureCanManage(actor);

    if (!body.schoolId) {
      throw new BadRequestException('schoolId is required');
    }

    this.ensureCanAccessSchool(actor, body.schoolId);

    const settings = await this.getFineSettingsOrCreate(body.schoolId);
    const dailyFineAmount = new Prisma.Decimal(settings.lateFineAmount);

    if (dailyFineAmount.lte(0)) {
      throw new BadRequestException(
        'lateFineAmount must be configured greater than zero before assessing overdue fines',
      );
    }

    const todayStart = this.startOfToday();
    const overdueLoans = await this.prisma.libraryLoan.findMany({
      where: {
        schoolId: body.schoolId,
        returnedAt: null,
        dueDate: { lt: todayStart },
        status: {
          in: [LibraryLoanStatus.ACTIVE, LibraryLoanStatus.OVERDUE],
        },
        ...(body.studentId ? { studentId: body.studentId } : {}),
      },
      select: {
        id: true,
        schoolId: true,
        studentId: true,
        itemId: true,
        dueDate: true,
        item: {
          select: {
            title: true,
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }],
    });

    let createdCount = 0;
    let skippedCount = 0;
    let duplicateCount = 0;

    for (const loan of overdueLoans) {
      const daysRaw = Math.floor(
        (todayStart.getTime() - loan.dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const billableDays = Math.max(0, daysRaw - settings.lateFineGraceDays);

      if (billableDays <= 0) {
        skippedCount += 1;
        continue;
      }

      const existing = await this.prisma.libraryFine.findUnique({
        where: {
          checkoutId_reason: {
            checkoutId: loan.id,
            reason: LibraryFineReason.LATE,
          },
        },
        select: { id: true },
      });

      if (existing) {
        duplicateCount += 1;
        continue;
      }

      const amount = this.resolveFineAmountFromSettings({
        settings,
        reason: LibraryFineReason.LATE,
        daysOverdue: billableDays,
      });

      if (amount.lte(0)) {
        skippedCount += 1;
        continue;
      }

      try {
        await this.createFineWithCharge({
          actor,
          schoolId: loan.schoolId,
          studentId: loan.studentId,
          reason: LibraryFineReason.LATE,
          amount,
          description: `Overdue by ${billableDays} day(s) for "${loan.item.title}"`,
          libraryItemId: loan.itemId,
          checkoutId: loan.id,
        });
        createdCount += 1;
      } catch (error) {
        if (
          error instanceof ConflictException ||
          (error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002')
        ) {
          duplicateCount += 1;
          continue;
        }

        throw error;
      }
    }

    return {
      schoolId: body.schoolId,
      evaluatedLoans: overdueLoans.length,
      createdCount,
      skippedCount,
      duplicateCount,
    };
  }

  async assessUnclaimedHoldFine(
    actor: AuthenticatedUser,
    body: AssessUnclaimedHoldFineDto,
  ) {
    this.ensureCanManage(actor);
    this.ensureCanAccessSchool(actor, body.schoolId);

    const student = await this.ensureStudentInSchoolOrThrow(
      body.studentId,
      body.schoolId,
    );

    if (body.libraryItemId) {
      const item = await this.prisma.libraryItem.findFirst({
        where: { id: body.libraryItemId, schoolId: body.schoolId },
        select: { id: true },
      });
      if (!item) {
        throw new NotFoundException('Library item not found in this school');
      }
    }

    const settings = await this.getFineSettingsOrCreate(body.schoolId);
    const amount = this.resolveFineAmountFromSettings({
      settings,
      reason: LibraryFineReason.UNCLAIMED_HOLD,
    });

    if (amount.lte(0)) {
      throw new BadRequestException(
        'unclaimedHoldFineAmount must be configured greater than zero',
      );
    }

    return this.createFineWithCharge({
      actor,
      schoolId: body.schoolId,
      studentId: student.id,
      reason: LibraryFineReason.UNCLAIMED_HOLD,
      amount,
      description:
        body.description ??
        `Unclaimed hold reference ${body.holdReference}`,
      libraryItemId: body.libraryItemId ?? null,
      holdReference: body.holdReference,
      dueDate: this.parseOptionalDate(body.dueDate),
    });
  }

  async listStudentCatalog(actor: AuthenticatedUser) {
    if (actor.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can access this endpoint');
    }

    const schoolIds = this.getActorSchoolIds(actor);
    if (schoolIds.length === 0) {
      throw new ForbiddenException('You do not have school access');
    }

    return this.prisma.libraryItem.findMany({
      where: {
        schoolId: { in: schoolIds },
        status: {
          in: [LibraryItemStatus.AVAILABLE, LibraryItemStatus.CHECKED_OUT],
        },
      },
      orderBy: [{ title: 'asc' }, { createdAt: 'desc' }],
      select: libraryItemSelect,
    });
  }

  async createStudentHold(actor: AuthenticatedUser, body: CreateLibraryHoldDto) {
    if (actor.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can place library holds');
    }

    const item = await this.prisma.libraryItem.findUnique({
      where: { id: body.itemId },
      select: {
        id: true,
        schoolId: true,
        status: true,
        availableCopies: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Library item not found');
    }

    const schoolIds = this.getActorSchoolIds(actor);
    if (!schoolIds.includes(item.schoolId)) {
      throw new ForbiddenException('You do not have access to this school');
    }

    if (item.status === LibraryItemStatus.ARCHIVED || item.status === LibraryItemStatus.LOST) {
      throw new BadRequestException('This item is not eligible for holds');
    }

    if (item.availableCopies > 0) {
      throw new ConflictException('This item is currently available and does not require a hold');
    }

    const existing = await this.prisma.libraryHold.findFirst({
      where: {
        schoolId: item.schoolId,
        itemId: item.id,
        studentId: actor.id,
        status: LibraryHoldStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('You already have an active hold for this item');
    }

    const created = await this.prisma.libraryHold.create({
      data: {
        schoolId: item.schoolId,
        itemId: item.id,
        studentId: actor.id,
        createdByUserId: actor.id,
        status: LibraryHoldStatus.ACTIVE,
        notes: body.notes ?? null,
      },
      select: libraryHoldSelect,
    });

    return this.mapHoldRecord(created);
  }

  async listMyStudentHolds(actor: AuthenticatedUser) {
    if (actor.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can access this endpoint');
    }

    const schoolIds = this.getActorSchoolIds(actor);
    if (schoolIds.length === 0) {
      throw new ForbiddenException('You do not have school access');
    }

    const rows = await this.prisma.libraryHold.findMany({
      where: {
        studentId: actor.id,
        schoolId: {
          in: schoolIds,
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      select: libraryHoldSelect,
    });

    return rows.map((row) => this.mapHoldRecord(row));
  }

  async listHolds(actor: AuthenticatedUser, query: ListLibraryHoldsQueryDto) {
    this.ensureCanManage(actor);

    const scopeSchoolIds = this.buildScopeSchoolIds(actor, query.schoolId);
    const rows = await this.prisma.libraryHold.findMany({
      where: {
        ...(scopeSchoolIds ? { schoolId: { in: scopeSchoolIds } } : {}),
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.itemId ? { itemId: query.itemId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      select: libraryHoldSelect,
    });

    return rows.map((row) => this.mapHoldRecord(row));
  }

  async updateHold(actor: AuthenticatedUser, holdId: string, body: UpdateLibraryHoldDto) {
    this.ensureCanManage(actor);

    const hold = await this.prisma.libraryHold.findUnique({
      where: { id: holdId },
      select: {
        id: true,
        schoolId: true,
        status: true,
      },
    });

    if (!hold) {
      throw new NotFoundException('Library hold not found');
    }

    this.ensureCanAccessSchool(actor, hold.schoolId);

    if (hold.status !== LibraryHoldStatus.ACTIVE) {
      throw new ConflictException('Only active holds can be updated');
    }

    if (body.status === LibraryHoldStatus.ACTIVE) {
      throw new BadRequestException('Holds can only be updated to CANCELLED or FULFILLED');
    }

    const updated = await this.prisma.libraryHold.update({
      where: { id: hold.id },
      data: {
        status: body.status,
        notes: body.notes ?? undefined,
        resolvedAt: new Date(),
        resolvedByUserId: actor.id,
      },
      select: libraryHoldSelect,
    });

    return this.mapHoldRecord(updated);
  }

  async listItems(actor: AuthenticatedUser, query: ListLibraryItemsQueryDto) {
    this.ensureCanManage(actor);

    const scopeSchoolIds = this.buildScopeSchoolIds(actor, query.schoolId);
    const search = query.search?.trim() || null;

    return this.prisma.libraryItem.findMany({
      where: {
        ...(scopeSchoolIds ? { schoolId: { in: scopeSchoolIds } } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { author: { contains: search, mode: 'insensitive' } },
                { isbn: { contains: search, mode: 'insensitive' } },
                { barcode: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ title: 'asc' }, { createdAt: 'desc' }],
      select: libraryItemSelect,
    });
  }

  async findItem(actor: AuthenticatedUser, id: string) {
    this.ensureCanManage(actor);

    const item = await this.prisma.libraryItem.findUnique({
      where: { id },
      select: libraryItemSelect,
    });

    if (!item) {
      throw new NotFoundException('Library item not found');
    }

    this.ensureCanAccessSchool(actor, item.schoolId);

    return item;
  }

  async createItem(actor: AuthenticatedUser, body: CreateLibraryItemDto) {
    this.ensureCanManage(actor);
    this.ensureCanAccessSchool(actor, body.schoolId);

    const school = await this.prisma.school.findUnique({
      where: { id: body.schoolId },
      select: { id: true },
    });

    if (!school) {
      throw new NotFoundException('School not found');
    }

    const totalCopies = body.totalCopies ?? 1;
    const availableCopies = body.availableCopies ?? totalCopies;

    if (availableCopies > totalCopies) {
      throw new BadRequestException('availableCopies cannot exceed totalCopies');
    }

    const status = this.normalizeItemStatus({
      status: body.status,
      availableCopies,
    });

    return this.prisma.libraryItem.create({
      data: {
        schoolId: body.schoolId,
        title: body.title.trim(),
        author: body.author ?? null,
        isbn: body.isbn ?? null,
        barcode: body.barcode ?? null,
        category: body.category ?? null,
        totalCopies,
        availableCopies,
        status,
      },
      select: libraryItemSelect,
    });
  }

  async updateItem(actor: AuthenticatedUser, id: string, body: UpdateLibraryItemDto) {
    this.ensureCanManage(actor);

    const existing = await this.prisma.libraryItem.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        title: true,
        totalCopies: true,
        availableCopies: true,
        status: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Library item not found');
    }

    this.ensureCanAccessSchool(actor, existing.schoolId);

    const activeLoans = await this.prisma.libraryLoan.findMany({
      where: {
        itemId: existing.id,
        returnedAt: null,
        status: {
          in: [LibraryLoanStatus.ACTIVE, LibraryLoanStatus.OVERDUE],
        },
      },
      select: {
        id: true,
      },
    });

    const activeLoanCount = activeLoans.length;

    const nextTotalCopies = body.totalCopies ?? existing.totalCopies;

    if (nextTotalCopies < activeLoanCount) {
      throw new BadRequestException(
        `totalCopies cannot be less than active checkouts (${activeLoanCount})`,
      );
    }

    const maxAvailableCopies = Math.max(0, nextTotalCopies - activeLoanCount);

    let nextAvailableCopies = body.availableCopies;

    if (nextAvailableCopies === undefined) {
      nextAvailableCopies = maxAvailableCopies;
    }

    if (nextAvailableCopies > nextTotalCopies) {
      throw new BadRequestException(
        'availableCopies cannot exceed totalCopies',
      );
    }

    if (nextAvailableCopies > maxAvailableCopies) {
      throw new BadRequestException(
        `availableCopies cannot exceed non-checked-out copies (${maxAvailableCopies})`,
      );
    }

    const status =
      body.status ??
      this.normalizeItemStatus({
        status: existing.status,
        availableCopies: nextAvailableCopies,
      });

    return this.prisma.libraryItem.update({
      where: { id: existing.id },
      data: {
        ...(body.title !== undefined ? { title: body.title?.trim() || existing.title } : {}),
        ...(body.author !== undefined ? { author: body.author } : {}),
        ...(body.isbn !== undefined ? { isbn: body.isbn } : {}),
        ...(body.barcode !== undefined ? { barcode: body.barcode } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.totalCopies !== undefined ? { totalCopies: nextTotalCopies } : {}),
        ...(body.availableCopies !== undefined || body.totalCopies !== undefined
          ? { availableCopies: nextAvailableCopies }
          : {}),
        status,
      },
      select: libraryItemSelect,
    });
  }

  private async ensureStudentInSchoolOrThrow(studentId: string, schoolId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        role: true,
        schoolId: true,
        firstName: true,
        lastName: true,
        memberships: {
          where: { isActive: true },
          select: { schoolId: true },
        },
      },
    });

    if (!student || student.role !== UserRole.STUDENT) {
      throw new NotFoundException('Student not found');
    }

    const studentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId,
    });

    if (!studentSchoolIds.includes(schoolId)) {
      throw new NotFoundException('Student not found in this school');
    }

    return {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
    };
  }

  private formatDueDateLabel(dueDate: Date) {
    return dueDate.toISOString().slice(0, 10);
  }

  private async sendCheckoutNotification(input: {
    schoolId: string;
    studentId: string;
    studentName: string;
    itemTitle: string;
    dueDate: Date;
    loanId: string;
  }) {
    const parentLinks = await this.prisma.studentParentLink.findMany({
      where: {
        studentId: input.studentId,
        parent: {
          isActive: true,
          role: UserRole.PARENT,
        },
      },
      select: {
        parentId: true,
      },
    });

    if (parentLinks.length === 0) {
      return { count: 0 };
    }

    return this.notificationsService.createMany(
      parentLinks.map((link) => ({
        schoolId: input.schoolId,
        recipientUserId: link.parentId,
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        title: 'Library checkout confirmation',
        message: `${input.studentName} checked out "${input.itemTitle}". Due date: ${this.formatDueDateLabel(input.dueDate)}.`,
        entityType: 'LibraryLoan',
        entityId: input.loanId,
      })),
    );
  }

  async checkoutLoan(actor: AuthenticatedUser, body: CheckoutLibraryLoanDto) {
    this.ensureCanManage(actor);
    this.ensureCanAccessSchool(actor, body.schoolId);

    const checkoutDate = body.checkoutDate
      ? this.parseDateOrThrow(body.checkoutDate, 'checkoutDate')
      : new Date();
    const dueDate = this.parseDateOrThrow(body.dueDate, 'dueDate');

    if (dueDate <= checkoutDate) {
      throw new BadRequestException('dueDate must be after checkoutDate');
    }

    const [item, student] = await Promise.all([
      this.prisma.libraryItem.findFirst({
        where: {
          id: body.itemId,
          schoolId: body.schoolId,
        },
        select: {
          id: true,
          schoolId: true,
          title: true,
          availableCopies: true,
          status: true,
        },
      }),
      this.ensureStudentInSchoolOrThrow(body.studentId, body.schoolId),
    ]);

    if (!item) {
      throw new NotFoundException('Library item not found');
    }

    if (item.status === LibraryItemStatus.LOST || item.status === LibraryItemStatus.ARCHIVED) {
      throw new ConflictException('This item is not available for checkout');
    }

    if (item.availableCopies <= 0) {
      throw new ConflictException('No available copies to checkout');
    }

    const createdLoan = await this.prisma.$transaction(async (tx) => {
      const itemUpdateResult = await tx.libraryItem.updateMany({
        where: {
          id: item.id,
          availableCopies: {
            gt: 0,
          },
          status: {
            in: [LibraryItemStatus.AVAILABLE, LibraryItemStatus.CHECKED_OUT],
          },
        },
        data: {
          availableCopies: {
            decrement: 1,
          },
        },
      });

      if (itemUpdateResult.count === 0) {
        throw new ConflictException('No available copies to checkout');
      }

      const refreshedItem = await tx.libraryItem.findUnique({
        where: { id: item.id },
        select: { id: true, availableCopies: true },
      });

      if (!refreshedItem) {
        throw new NotFoundException('Library item not found');
      }

      const normalizedStatus = this.normalizeItemStatus({
        availableCopies: refreshedItem.availableCopies,
      });

      await tx.libraryItem.update({
        where: { id: refreshedItem.id },
        data: {
          status: normalizedStatus,
        },
      });

      return tx.libraryLoan.create({
        data: {
          schoolId: body.schoolId,
          itemId: item.id,
          studentId: student.id,
          checkedOutByUserId: actor.id,
          checkoutDate,
          dueDate,
          status: LibraryLoanStatus.ACTIVE,
        },
        select: libraryLoanSelect,
      });
    });

    void this.sendCheckoutNotification({
      schoolId: body.schoolId,
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      itemTitle: item.title,
      dueDate,
      loanId: createdLoan.id,
    }).catch(() => undefined);

    return this.mapLoanRecord(createdLoan);
  }

  async returnLoan(actor: AuthenticatedUser, loanId: string, body: ReturnLibraryLoanDto) {
    this.ensureCanManage(actor);

    const existing = await this.prisma.libraryLoan.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        schoolId: true,
        itemId: true,
        status: true,
        returnedAt: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Library loan not found');
    }

    this.ensureCanAccessSchool(actor, existing.schoolId);

    if (existing.returnedAt || existing.status === LibraryLoanStatus.RETURNED) {
      throw new ConflictException('This loan has already been returned');
    }

    const returnedAt = body.returnedAt
      ? this.parseDateOrThrow(body.returnedAt, 'returnedAt')
      : new Date();

    const updatedLoan = await this.prisma.$transaction(async (tx) => {
      const loan = await tx.libraryLoan.update({
        where: { id: existing.id },
        data: {
          returnedAt,
          receivedByUserId: actor.id,
          status: LibraryLoanStatus.RETURNED,
        },
        select: libraryLoanSelect,
      });

      const item = await tx.libraryItem.findUnique({
        where: { id: existing.itemId },
        select: {
          id: true,
          totalCopies: true,
          availableCopies: true,
          status: true,
        },
      });

      if (item) {
        const incremented = Math.min(item.totalCopies, item.availableCopies + 1);
        const nextStatus = this.normalizeItemStatus({
          status: item.status,
          availableCopies: incremented,
        });

        await tx.libraryItem.update({
          where: { id: item.id },
          data: {
            availableCopies: incremented,
            status: nextStatus,
          },
        });
      }

      return loan;
    });

    return this.mapLoanRecord(updatedLoan);
  }

  async markLoanLost(actor: AuthenticatedUser, loanId: string, body: MarkLibraryLoanLostDto) {
    this.ensureCanManage(actor);

    const existing = await this.prisma.libraryLoan.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        schoolId: true,
        itemId: true,
        studentId: true,
        dueDate: true,
        status: true,
        returnedAt: true,
        item: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Library loan not found');
    }

    this.ensureCanAccessSchool(actor, existing.schoolId);

    if (existing.returnedAt || existing.status === LibraryLoanStatus.RETURNED) {
      throw new ConflictException('Returned loans cannot be marked as lost');
    }

    if (existing.status === LibraryLoanStatus.LOST) {
      throw new ConflictException('This loan has already been marked as lost');
    }

    const updatedLoan = await this.prisma.$transaction(async (tx) => {
      const loan = await tx.libraryLoan.update({
        where: { id: existing.id },
        data: {
          status: LibraryLoanStatus.LOST,
          receivedByUserId: actor.id,
        },
        select: libraryLoanSelect,
      });

      const item = await tx.libraryItem.findUnique({
        where: { id: existing.itemId },
        select: {
          id: true,
          totalCopies: true,
          availableCopies: true,
          status: true,
        },
      });

      if (item) {
        const nextTotalCopies = Math.max(0, item.totalCopies - 1);
        const nextAvailableCopies = Math.min(item.availableCopies, nextTotalCopies);
        const nextStatus =
          nextTotalCopies === 0
            ? LibraryItemStatus.LOST
            : this.normalizeItemStatus({
                status: item.status,
                availableCopies: nextAvailableCopies,
              });

        await tx.libraryItem.update({
          where: { id: item.id },
          data: {
            totalCopies: nextTotalCopies,
            availableCopies: nextAvailableCopies,
            status: nextStatus,
          },
        });
      }

      return loan;
    });

    const settings = await this.getFineSettingsOrCreate(existing.schoolId);
    const amount = this.resolveFineAmountFromSettings({
      settings,
      reason: LibraryFineReason.LOST,
    });

    let fine = null as ReturnType<typeof this.mapFineRecord> | null;
    let fineCreated = false;

    if (amount.gt(0)) {
      try {
        fine = await this.createFineWithCharge({
          actor,
          schoolId: existing.schoolId,
          studentId: existing.studentId,
          reason: LibraryFineReason.LOST,
          amount,
          description:
            body.description ??
            `Lost library item "${existing.item.title}"`,
          libraryItemId: existing.itemId,
          checkoutId: existing.id,
          dueDate: this.parseOptionalDate(body.dueDate) ?? existing.dueDate,
        });
        fineCreated = true;
      } catch (error) {
        if (error instanceof ConflictException) {
          const existingFine = await this.prisma.libraryFine.findUnique({
            where: {
              checkoutId_reason: {
                checkoutId: existing.id,
                reason: LibraryFineReason.LOST,
              },
            },
            select: libraryFineSelect,
          });

          fine = existingFine ? this.mapFineRecord(existingFine) : null;
        } else {
          throw error;
        }
      }
    }

    return {
      loan: this.mapLoanRecord(updatedLoan),
      fine,
      fineCreated,
    };
  }

  async markLoanFound(actor: AuthenticatedUser, loanId: string) {
    this.ensureCanManage(actor);

    const existing = await this.prisma.libraryLoan.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        schoolId: true,
        itemId: true,
        status: true,
        returnedAt: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Library loan not found');
    }

    this.ensureCanAccessSchool(actor, existing.schoolId);

    if (existing.status !== LibraryLoanStatus.LOST) {
      throw new BadRequestException('Only LOST loans can be marked as found');
    }

    if (existing.returnedAt) {
      throw new ConflictException('This lost loan has already been resolved');
    }

    const resolvedAt = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const loan = await tx.libraryLoan.update({
        where: { id: existing.id },
        data: {
          status: LibraryLoanStatus.RETURNED,
          returnedAt: resolvedAt,
          receivedByUserId: actor.id,
        },
        select: libraryLoanSelect,
      });

      const item = await tx.libraryItem.findUnique({
        where: { id: existing.itemId },
        select: {
          id: true,
          totalCopies: true,
          availableCopies: true,
          status: true,
        },
      });

      if (item) {
        const nextTotalCopies = item.totalCopies + 1;
        const nextAvailableCopies = Math.min(nextTotalCopies, item.availableCopies + 1);
        const nextStatus = this.normalizeFoundItemStatus({
          status: item.status,
          availableCopies: nextAvailableCopies,
        });

        await tx.libraryItem.update({
          where: { id: item.id },
          data: {
            totalCopies: nextTotalCopies,
            availableCopies: nextAvailableCopies,
            status: nextStatus,
          },
        });
      }

      const lostFine = await tx.libraryFine.findUnique({
        where: {
          checkoutId_reason: {
            checkoutId: existing.id,
            reason: LibraryFineReason.LOST,
          },
        },
        select: {
          id: true,
          status: true,
          amount: true,
          billingChargeId: true,
          billingCharge: {
            select: {
              id: true,
              status: true,
              amountDue: true,
              title: true,
            },
          },
        },
      });

      return { loan, lostFine };
    });

    const lostFineStatus = result.lostFine
      ? this.getFineStatusFromCharge({
          currentStatus: result.lostFine.status,
          chargeStatus: result.lostFine.billingCharge?.status,
        })
      : null;
    const fineRequiresReview = lostFineStatus === LibraryFineStatus.OPEN;

    return {
      loan: this.mapLoanRecord(result.loan),
      lostFine: result.lostFine
        ? {
            id: result.lostFine.id,
            status: lostFineStatus,
            amount: result.lostFine.amount.toString(),
            billingChargeId: result.lostFine.billingChargeId,
            billingCharge: result.lostFine.billingCharge
              ? {
                  id: result.lostFine.billingCharge.id,
                  status: result.lostFine.billingCharge.status,
                  amountDue: result.lostFine.billingCharge.amountDue.toString(),
                  title: result.lostFine.billingCharge.title,
                }
              : null,
          }
        : null,
      fineRequiresReview,
    };
  }

  async listLoans(actor: AuthenticatedUser, query: ListLibraryLoansQueryDto) {
    this.ensureCanManage(actor);

    const scopeSchoolIds = this.buildScopeSchoolIds(actor, query.schoolId);
    const todayStart = this.startOfToday();

    const where: Prisma.LibraryLoanWhereInput = {
      ...(scopeSchoolIds ? { schoolId: { in: scopeSchoolIds } } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
    };

    if (query.activeOnly) {
      where.returnedAt = null;
      where.status = {
        in: [LibraryLoanStatus.ACTIVE, LibraryLoanStatus.OVERDUE],
      };
    } else if (query.status === LibraryLoanStatus.OVERDUE) {
      where.returnedAt = null;
      where.status = {
        in: [LibraryLoanStatus.ACTIVE, LibraryLoanStatus.OVERDUE],
      };
      where.dueDate = {
        lt: todayStart,
      };
    } else if (query.status === LibraryLoanStatus.ACTIVE) {
      where.returnedAt = null;
      where.status = {
        in: [LibraryLoanStatus.ACTIVE, LibraryLoanStatus.OVERDUE],
      };
      where.dueDate = {
        gte: todayStart,
      };
    } else if (query.status) {
      where.status = query.status;
    }

    const rows = await this.prisma.libraryLoan.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { checkoutDate: 'desc' }],
      select: libraryLoanSelect,
    });

    return rows.map((row) => this.mapLoanRecord(row));
  }

  async listOverdue(actor: AuthenticatedUser, query: ListLibraryOverdueQueryDto) {
    this.ensureCanManage(actor);

    const scopeSchoolIds = this.buildScopeSchoolIds(actor, query.schoolId);
    const todayStart = this.startOfToday();
    const search = query.search?.trim() || null;

    const rows = await this.prisma.libraryLoan.findMany({
      where: {
        returnedAt: null,
        dueDate: {
          lt: todayStart,
        },
        status: {
          in: [LibraryLoanStatus.ACTIVE, LibraryLoanStatus.OVERDUE],
        },
        ...(scopeSchoolIds ? { schoolId: { in: scopeSchoolIds } } : {}),
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(search
          ? {
              OR: [
                { student: { firstName: { contains: search, mode: 'insensitive' } } },
                { student: { lastName: { contains: search, mode: 'insensitive' } } },
                { student: { username: { contains: search, mode: 'insensitive' } } },
                { item: { title: { contains: search, mode: 'insensitive' } } },
                { item: { barcode: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { checkoutDate: 'desc' }],
      select: libraryLoanSelect,
    });

    return rows.map((row) => {
      const dueDateMs = new Date(row.dueDate).getTime();
      const todayMs = todayStart.getTime();
      const daysOverdue = Math.max(1, Math.floor((todayMs - dueDateMs) / (1000 * 60 * 60 * 24)));

      return {
        ...this.mapLoanRecord(row),
        daysOverdue,
      };
    });
  }

  async listParentStudentLoans(actor: AuthenticatedUser, studentId: string) {
    await this.ensureParentLinkedStudentOrThrow(actor, studentId);

    const todayStart = this.startOfToday();

    const rows = await this.prisma.libraryLoan.findMany({
      where: {
        studentId,
        returnedAt: null,
        status: {
          in: [LibraryLoanStatus.ACTIVE, LibraryLoanStatus.OVERDUE],
        },
      },
      orderBy: [{ dueDate: 'asc' }, { checkoutDate: 'desc' }],
      select: libraryLoanSelect,
    });

    return {
      studentId,
      loans: rows.map((row) => {
        const dueDateMs = new Date(row.dueDate).getTime();
        const isOverdue = dueDateMs < todayStart.getTime();
        const daysOverdue = isOverdue
          ? Math.max(1, Math.floor((todayStart.getTime() - dueDateMs) / (1000 * 60 * 60 * 24)))
          : 0;

        return {
          ...this.mapLoanRecord(row),
          isOverdue,
          daysOverdue,
        };
      }),
    };
  }

  async listParentStudentCatalog(actor: AuthenticatedUser, studentId: string) {
    const student = await this.ensureParentLinkedStudentOrThrow(actor, studentId);
    const studentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId ?? null,
    });

    if (studentSchoolIds.length === 0) {
      return [];
    }

    return this.prisma.libraryItem.findMany({
      where: {
        schoolId: { in: studentSchoolIds },
        status: {
          in: [LibraryItemStatus.AVAILABLE, LibraryItemStatus.CHECKED_OUT],
        },
      },
      orderBy: [{ title: 'asc' }, { createdAt: 'desc' }],
      select: libraryItemSelect,
    });
  }

  async createParentStudentHold(
    actor: AuthenticatedUser,
    studentId: string,
    body: CreateLibraryHoldDto,
  ) {
    const student = await this.ensureParentLinkedStudentOrThrow(actor, studentId);
    const studentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId ?? null,
    });

    const item = await this.prisma.libraryItem.findUnique({
      where: { id: body.itemId },
      select: {
        id: true,
        schoolId: true,
        status: true,
        availableCopies: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Library item not found');
    }

    if (!studentSchoolIds.includes(item.schoolId)) {
      throw new ForbiddenException("Selected item is not in this student's school");
    }

    if (item.status === LibraryItemStatus.ARCHIVED || item.status === LibraryItemStatus.LOST) {
      throw new BadRequestException('This item is not eligible for holds');
    }

    if (item.availableCopies > 0) {
      throw new ConflictException('This item is currently available and does not require a hold');
    }

    const existing = await this.prisma.libraryHold.findFirst({
      where: {
        schoolId: item.schoolId,
        itemId: item.id,
        studentId: student.id,
        status: LibraryHoldStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('This student already has an active hold for this item');
    }

    const created = await this.prisma.libraryHold.create({
      data: {
        schoolId: item.schoolId,
        itemId: item.id,
        studentId: student.id,
        createdByUserId: actor.id,
        status: LibraryHoldStatus.ACTIVE,
        notes: body.notes ?? null,
      },
      select: libraryHoldSelect,
    });

    return this.mapHoldRecord(created);
  }

  async listParentStudentHolds(actor: AuthenticatedUser, studentId: string) {
    await this.ensureParentLinkedStudentOrThrow(actor, studentId);

    const rows = await this.prisma.libraryHold.findMany({
      where: {
        studentId,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: libraryHoldSelect,
    });

    return {
      studentId,
      holds: rows.map((row) => this.mapHoldRecord(row)),
    };
  }
}
