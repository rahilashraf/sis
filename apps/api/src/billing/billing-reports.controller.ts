import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuditLogSeverity } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { AuditService } from '../audit/audit.service';
import { BillingReportsService } from './billing-reports.service';
import { GetBillingChargesReportQueryDto } from './dto/get-billing-charges-report-query.dto';
import { GetBillingOutstandingReportQueryDto } from './dto/get-billing-outstanding-report-query.dto';
import { GetBillingPaymentsReportQueryDto } from './dto/get-billing-payments-report-query.dto';
import { GetBillingSummaryReportQueryDto } from './dto/get-billing-summary-report-query.dto';

@Controller('billing/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingReportsController {
  constructor(
    private readonly reportsService: BillingReportsService,
    private readonly auditService: AuditService,
  ) {}

  private async logExportAttempt(
    req: AuthenticatedRequest,
    reportType: string,
    schoolId?: string,
  ) {
    await this.auditService.log({
      actor: req.user,
      schoolId: schoolId ?? req.user.schoolId ?? req.user.memberships[0]?.schoolId ?? null,
      entityType: 'BillingReport',
      action: 'EXPORT_ATTEMPT',
      severity: AuditLogSeverity.INFO,
      summary: `Billing ${reportType} report export requested`,
      metadataJson: {
        reportType,
      },
    });
  }

  @Get('payments')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  async payments(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetBillingPaymentsReportQueryDto,
    @Res() res: Response,
  ) {
    if (this.reportsService.getFormat(query.format) === 'csv') {
      await this.logExportAttempt(req, 'payments', query.schoolId);
      const file = await this.reportsService.exportPaymentsReportCsv(req.user, query);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.setHeader('Content-Length', String(file.data.length));
      return res.send(file.data);
    }

    return res.json(await this.reportsService.getPaymentsReport(req.user, query));
  }

  @Get('charges')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  async charges(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetBillingChargesReportQueryDto,
    @Res() res: Response,
  ) {
    if (this.reportsService.getFormat(query.format) === 'csv') {
      await this.logExportAttempt(req, 'charges', query.schoolId);
      const file = await this.reportsService.exportChargesReportCsv(req.user, query);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.setHeader('Content-Length', String(file.data.length));
      return res.send(file.data);
    }

    return res.json(await this.reportsService.getChargesReport(req.user, query));
  }

  @Get('outstanding')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  async outstanding(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetBillingOutstandingReportQueryDto,
    @Res() res: Response,
  ) {
    if (this.reportsService.getFormat(query.format) === 'csv') {
      await this.logExportAttempt(req, 'outstanding', query.schoolId);
      const file = await this.reportsService.exportOutstandingReportCsv(req.user, query);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.setHeader('Content-Length', String(file.data.length));
      return res.send(file.data);
    }

    return res.json(await this.reportsService.getOutstandingReport(req.user, query));
  }

  @Get('summary')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  async summary(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetBillingSummaryReportQueryDto,
    @Res() res: Response,
  ) {
    if (this.reportsService.getFormat(query.format) === 'csv') {
      await this.logExportAttempt(req, 'summary', query.schoolId);
      const file = await this.reportsService.exportSummaryReportCsv(req.user, query);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.setHeader('Content-Length', String(file.data.length));
      return res.send(file.data);
    }

    return res.json(await this.reportsService.getSummaryReport(req.user, query));
  }
}
