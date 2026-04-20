import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
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
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutLibraryLoanDto } from './dto/checkout-library-loan.dto';
import { CreateLibraryItemDto } from './dto/create-library-item.dto';
import { ListLibraryItemsQueryDto } from './dto/list-library-items-query.dto';
import { ListLibraryLoansQueryDto } from './dto/list-library-loans-query.dto';
import { ListLibraryOverdueQueryDto } from './dto/list-library-overdue-query.dto';
import { ReturnLibraryLoanDto } from './dto/return-library-loan.dto';
import { UpdateLibraryItemDto } from './dto/update-library-item.dto';

const LIBRARY_MANAGE_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.STAFF,
];

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

    const nextTotalCopies = body.totalCopies ?? existing.totalCopies;
    const currentCheckedOut = Math.max(0, existing.totalCopies - existing.availableCopies);

    let nextAvailableCopies = body.availableCopies;

    if (nextAvailableCopies === undefined) {
      nextAvailableCopies = Math.max(0, nextTotalCopies - currentCheckedOut);
    }

    if (nextAvailableCopies > nextTotalCopies) {
      throw new BadRequestException('availableCopies cannot exceed totalCopies');
    }

    const status = this.normalizeItemStatus({
      status: body.status ?? existing.status,
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
    const student = await this.prisma.user.findFirst({
      where: {
        id: studentId,
        role: UserRole.STUDENT,
        isActive: true,
        OR: [
          { schoolId },
          {
            memberships: {
              some: {
                schoolId,
                isActive: true,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found in this school');
    }

    return student;
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
          },
        },
      },
    });

    if (!link || link.student.role !== UserRole.STUDENT) {
      throw new ForbiddenException('You are not linked to this student');
    }

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
}
