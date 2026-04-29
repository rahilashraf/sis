import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ChargeStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { GetBillingChargesReportQueryDto } from './dto/get-billing-charges-report-query.dto';
import { GetBillingOutstandingReportQueryDto } from './dto/get-billing-outstanding-report-query.dto';
import { GetBillingPaymentsReportQueryDto } from './dto/get-billing-payments-report-query.dto';
import { GetBillingSummaryReportQueryDto } from './dto/get-billing-summary-report-query.dto';

type DateRange = {
  fromDate?: Date;
  toDate?: Date;
};

function toCsvValue(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const escaped = serialized.replace(/"/g, '""');
  return `"${escaped}"`;
}

@Injectable()
export class BillingReportsService {
  constructor(private readonly prisma: PrismaService) {}
  private static readonly DEFAULT_MAX_REPORT_ROWS = 5000;

  private ensureCanRead(actor: AuthenticatedUser) {
    const allowed: UserRole[] = [
      UserRole.OWNER,
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.STAFF,
    ];

    if (!allowed.includes(actor.role)) {
      throw new ForbiddenException('You do not have permission to view billing reports');
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

  private parseDateOrThrow(value: string, field: string, endOfDay = false) {
    const trimmed = value.trim();
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
    const parsed = isDateOnly
      ? new Date(`${trimmed}T00:00:00.000Z`)
      : new Date(trimmed);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }

    if (isDateOnly && endOfDay) {
      parsed.setUTCDate(parsed.getUTCDate() + 1);
      parsed.setUTCMilliseconds(parsed.getUTCMilliseconds() - 1);
    }

    return parsed;
  }

  private resolveDateRange(options: { dateFrom?: string; dateTo?: string }): DateRange {
    const fromDate = options.dateFrom
      ? this.parseDateOrThrow(options.dateFrom, 'dateFrom')
      : undefined;
    const toDate = options.dateTo
      ? this.parseDateOrThrow(options.dateTo, 'dateTo', true)
      : undefined;

    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('dateFrom must be before or equal to dateTo');
    }

    return { fromDate, toDate };
  }

  private formatMoney(value: Prisma.Decimal | number | string | null | undefined) {
    if (value === null || value === undefined) {
      return '0.00';
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value.toFixed(2) : '0.00';
    }

    return value.toNumber().toFixed(2);
  }

  private normalizeFormat(format?: string) {
    return format?.trim().toLowerCase() === 'csv' ? 'csv' : 'json';
  }

  private buildCsvFile(fileName: string, header: string[], rows: unknown[][]) {
    const csvLines = [header.map((column) => toCsvValue(column)).join(',')];

    for (const row of rows) {
      csvLines.push(row.map((value) => toCsvValue(value)).join(','));
    }

    return {
      fileName,
      contentType: 'text/csv; charset=utf-8',
      data: Buffer.from(`${csvLines.join('\n')}\n`, 'utf8'),
    };
  }

  private getMaxReportRows() {
    const configured = Number.parseInt(
      process.env.BILLING_REPORT_MAX_ROWS ??
        `${BillingReportsService.DEFAULT_MAX_REPORT_ROWS}`,
      10,
    );

    if (!Number.isFinite(configured) || configured < 1) {
      return BillingReportsService.DEFAULT_MAX_REPORT_ROWS;
    }

    return configured;
  }

  private enforceReportRowLimit(rowCount: number, reportLabel: string) {
    const maxRows = this.getMaxReportRows();
    if (rowCount > maxRows) {
      throw new BadRequestException(
        `${reportLabel} exceeds max rows (${maxRows}). Narrow your filters.`,
      );
    }
  }

  async getPaymentsReport(
    actor: AuthenticatedUser,
    query: GetBillingPaymentsReportQueryDto,
  ) {
    this.ensureCanRead(actor);

    const scopeSchoolIds = this.buildScopeSchoolIds(actor, query.schoolId);
    const range = this.resolveDateRange({
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });

    const where: Prisma.BillingPaymentWhereInput = {
      ...(query.includeVoided ? {} : { isVoided: false }),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.method ? { method: query.method as any } : {}),
      ...(range.fromDate || range.toDate
        ? {
            paymentDate: {
              ...(range.fromDate ? { gte: range.fromDate } : {}),
              ...(range.toDate ? { lte: range.toDate } : {}),
            },
          }
        : {}),
    };

    if (scopeSchoolIds) {
      where.schoolId = { in: scopeSchoolIds };
    }

    const rows = await this.prisma.billingPayment.findMany({
      where,
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      take: this.getMaxReportRows() + 1,
      select: {
        id: true,
        paymentDate: true,
        receiptNumber: true,
        amount: true,
        method: true,
        referenceNumber: true,
        isVoided: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            username: true,
            email: true,
          },
        },
      },
    });
    this.enforceReportRowLimit(rows.length, 'Billing payments report');

    const items = rows.map((row) => ({
      paymentDate: row.paymentDate.toISOString(),
      receiptNumber: row.receiptNumber,
      studentName:
        `${row.student.firstName} ${row.student.lastName}`.trim() ||
        row.student.username ||
        row.student.email ||
        row.id,
      amount: this.formatMoney(row.amount),
      method: row.method,
      referenceNumber: row.referenceNumber,
      status: row.isVoided ? 'VOIDED' : 'ACTIVE',
    }));

    return {
      items,
      totals: {
        count: items.length,
        totalAmount: this.formatMoney(
          rows.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0)),
        ),
      },
    };
  }

  async exportPaymentsReportCsv(
    actor: AuthenticatedUser,
    query: GetBillingPaymentsReportQueryDto,
  ) {
    const report = await this.getPaymentsReport(actor, query);
    return this.buildCsvFile(
      'billing-payments-report.csv',
      [
        'paymentDate',
        'receiptNumber',
        'studentName',
        'amount',
        'method',
        'referenceNumber',
        'status',
      ],
      report.items.map((item) => [
        item.paymentDate,
        item.receiptNumber,
        item.studentName,
        item.amount,
        item.method,
        item.referenceNumber,
        item.status,
      ]),
    );
  }

  async getChargesReport(
    actor: AuthenticatedUser,
    query: GetBillingChargesReportQueryDto,
  ) {
    this.ensureCanRead(actor);

    const scopeSchoolIds = this.buildScopeSchoolIds(actor, query.schoolId);
    const range = this.resolveDateRange({
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });

    const where: Prisma.BillingChargeWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status as ChargeStatus } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(range.fromDate || range.toDate
        ? {
            issuedAt: {
              ...(range.fromDate ? { gte: range.fromDate } : {}),
              ...(range.toDate ? { lte: range.toDate } : {}),
            },
          }
        : {}),
    };

    if (scopeSchoolIds) {
      where.schoolId = { in: scopeSchoolIds };
    }

    const rows = await this.prisma.billingCharge.findMany({
      where,
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
      take: this.getMaxReportRows() + 1,
      select: {
        id: true,
        issuedAt: true,
        dueDate: true,
        title: true,
        amount: true,
        amountPaid: true,
        amountDue: true,
        status: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            username: true,
            email: true,
          },
        },
        category: {
          select: {
            name: true,
          },
        },
      },
    });
    this.enforceReportRowLimit(rows.length, 'Billing charges report');

    const items = rows.map((row) => ({
      issuedAt: row.issuedAt.toISOString(),
      dueDate: row.dueDate?.toISOString() ?? null,
      studentName:
        `${row.student.firstName} ${row.student.lastName}`.trim() ||
        row.student.username ||
        row.student.email ||
        row.id,
      title: row.title,
      category: row.category.name,
      amount: this.formatMoney(row.amount),
      amountPaid: this.formatMoney(row.amountPaid),
      amountDue: this.formatMoney(row.amountDue),
      status: row.status,
    }));

    return {
      items,
      totals: {
        count: items.length,
        totalAmount: this.formatMoney(
          rows.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0)),
        ),
        totalDue: this.formatMoney(
          rows.reduce((sum, row) => sum.add(row.amountDue), new Prisma.Decimal(0)),
        ),
      },
    };
  }

  async exportChargesReportCsv(
    actor: AuthenticatedUser,
    query: GetBillingChargesReportQueryDto,
  ) {
    const report = await this.getChargesReport(actor, query);
    return this.buildCsvFile(
      'billing-charges-report.csv',
      [
        'issuedAt',
        'dueDate',
        'studentName',
        'title',
        'category',
        'amount',
        'amountPaid',
        'amountDue',
        'status',
      ],
      report.items.map((item) => [
        item.issuedAt,
        item.dueDate,
        item.studentName,
        item.title,
        item.category,
        item.amount,
        item.amountPaid,
        item.amountDue,
        item.status,
      ]),
    );
  }

  async getOutstandingReport(
    actor: AuthenticatedUser,
    query: GetBillingOutstandingReportQueryDto,
  ) {
    this.ensureCanRead(actor);

    const scopeSchoolIds = this.buildScopeSchoolIds(actor, query.schoolId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const rows = await this.prisma.billingCharge.findMany({
      where: {
        status: { not: ChargeStatus.VOID },
        amountDue: { gt: new Prisma.Decimal(0) },
        ...(scopeSchoolIds ? { schoolId: { in: scopeSchoolIds } } : {}),
      },
      take: this.getMaxReportRows() + 1,
      select: {
        schoolId: true,
        studentId: true,
        amountDue: true,
        dueDate: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            username: true,
            email: true,
          },
        },
      },
    });
    this.enforceReportRowLimit(rows.length, 'Billing outstanding report');

    const grouped = new Map<
      string,
      {
        studentName: string;
        totalOutstanding: number;
        totalOverdue: number;
        overdueChargeCount: number;
      }
    >();

    for (const row of rows) {
      const key = `${row.schoolId}:${row.studentId}`;
      const amountDue = row.amountDue.toNumber();
      const studentName =
        `${row.student.firstName} ${row.student.lastName}`.trim() ||
        row.student.username ||
        row.student.email ||
        row.studentId;
      const current = grouped.get(key) ?? {
        studentName,
        totalOutstanding: 0,
        totalOverdue: 0,
        overdueChargeCount: 0,
      };

      current.totalOutstanding += amountDue;
      if (row.dueDate && row.dueDate < todayStart) {
        current.totalOverdue += amountDue;
        current.overdueChargeCount += 1;
      }
      grouped.set(key, current);
    }

    const items = Array.from(grouped.entries())
      .map(([key, value]) => {
        const [schoolId, studentId] = key.split(':');
        return {
          schoolId,
          studentId,
          studentName: value.studentName,
          totalOutstanding: value.totalOutstanding.toFixed(2),
          totalOverdue: value.totalOverdue.toFixed(2),
          overdueChargeCount: value.overdueChargeCount,
        };
      })
      .filter((item) => Number(item.totalOutstanding) >= (query.minBalance ?? 0))
      .sort((a, b) => Number(b.totalOutstanding) - Number(a.totalOutstanding));

    return {
      items,
      totals: {
        studentCount: items.length,
        totalOutstanding: items
          .reduce((sum, item) => sum + Number(item.totalOutstanding), 0)
          .toFixed(2),
        totalOverdue: items
          .reduce((sum, item) => sum + Number(item.totalOverdue), 0)
          .toFixed(2),
      },
    };
  }

  async exportOutstandingReportCsv(
    actor: AuthenticatedUser,
    query: GetBillingOutstandingReportQueryDto,
  ) {
    const report = await this.getOutstandingReport(actor, query);
    return this.buildCsvFile(
      'billing-outstanding-report.csv',
      [
        'studentName',
        'totalOutstanding',
        'totalOverdue',
        'overdueChargeCount',
      ],
      report.items.map((item) => [
        item.studentName,
        item.totalOutstanding,
        item.totalOverdue,
        item.overdueChargeCount,
      ]),
    );
  }

  async getSummaryReport(
    actor: AuthenticatedUser,
    query: GetBillingSummaryReportQueryDto,
  ) {
    this.ensureCanRead(actor);

    const scopeSchoolIds = this.buildScopeSchoolIds(actor, query.schoolId);
    const range = this.resolveDateRange({
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const chargeWhere: Prisma.BillingChargeWhereInput = {
      ...(scopeSchoolIds ? { schoolId: { in: scopeSchoolIds } } : {}),
      ...(range.fromDate || range.toDate
        ? {
            issuedAt: {
              ...(range.fromDate ? { gte: range.fromDate } : {}),
              ...(range.toDate ? { lte: range.toDate } : {}),
            },
          }
        : {}),
    };

    const paymentWhere: Prisma.BillingPaymentWhereInput = {
      ...(scopeSchoolIds ? { schoolId: { in: scopeSchoolIds } } : {}),
      ...(range.fromDate || range.toDate
        ? {
            paymentDate: {
              ...(range.fromDate ? { gte: range.fromDate } : {}),
              ...(range.toDate ? { lte: range.toDate } : {}),
            },
          }
        : {}),
    };

    const [chargeAgg, paymentAgg, voidedAgg, currentOutstandingAgg, overdueAgg] =
      await this.prisma.$transaction([
        this.prisma.billingCharge.aggregate({
          where: chargeWhere,
          _sum: { amount: true },
        }),
        this.prisma.billingPayment.aggregate({
          where: {
            ...paymentWhere,
            isVoided: false,
          },
          _sum: { amount: true },
        }),
        this.prisma.billingPayment.aggregate({
          where: {
            ...paymentWhere,
            isVoided: true,
          },
          _sum: { amount: true },
        }),
        this.prisma.billingCharge.aggregate({
          where: {
            ...(scopeSchoolIds ? { schoolId: { in: scopeSchoolIds } } : {}),
            status: { not: ChargeStatus.VOID },
            amountDue: { gt: new Prisma.Decimal(0) },
          },
          _sum: { amountDue: true },
        }),
        this.prisma.billingCharge.aggregate({
          where: {
            ...(scopeSchoolIds ? { schoolId: { in: scopeSchoolIds } } : {}),
            status: { not: ChargeStatus.VOID },
            amountDue: { gt: new Prisma.Decimal(0) },
            dueDate: { lt: todayStart },
          },
          _sum: { amountDue: true },
        }),
      ]);

    return {
      totalChargesIssued: this.formatMoney(chargeAgg._sum.amount),
      totalPaymentsReceived: this.formatMoney(paymentAgg._sum.amount),
      totalVoidedPayments: this.formatMoney(voidedAgg._sum.amount),
      currentOutstanding: this.formatMoney(currentOutstandingAgg._sum.amountDue),
      currentOverdue: this.formatMoney(overdueAgg._sum.amountDue),
    };
  }

  async exportSummaryReportCsv(
    actor: AuthenticatedUser,
    query: GetBillingSummaryReportQueryDto,
  ) {
    const report = await this.getSummaryReport(actor, query);
    return this.buildCsvFile(
      'billing-summary-report.csv',
      [
        'totalChargesIssued',
        'totalPaymentsReceived',
        'totalVoidedPayments',
        'currentOutstanding',
        'currentOverdue',
      ],
      [
        [
          report.totalChargesIssued,
          report.totalPaymentsReceived,
          report.totalVoidedPayments,
          report.currentOutstanding,
          report.currentOverdue,
        ],
      ],
    );
  }

  getFormat(format?: string) {
    return this.normalizeFormat(format);
  }
}
