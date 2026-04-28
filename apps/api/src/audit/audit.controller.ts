import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { ExportAuditLogsQueryDto } from './dto/export-audit-logs-query.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { PurgeAuditLogsDto } from './dto/purge-audit-logs.dto';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListAuditLogsQueryDto,
  ) {
    return this.auditService.list(req.user, query);
  }

  @Get('summary')
  summary(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListAuditLogsQueryDto,
  ) {
    return this.auditService.summary(req.user, query);
  }

  @Get('export/pdf')
  @Roles('OWNER')
  async exportPdf(
    @Req() req: AuthenticatedRequest,
    @Query() query: ExportAuditLogsQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.auditService.exportPdf(req.user, query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Length', String(file.data.length));
    return res.send(file.data);
  }

  @Get('export/csv')
  @Roles('OWNER')
  async exportCsv(
    @Req() req: AuthenticatedRequest,
    @Query() query: ExportAuditLogsQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.auditService.exportCsv(req.user, query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Length', String(file.data.length));
    return res.send(file.data);
  }

  @Post('purge')
  @Roles('OWNER')
  purge(
    @Req() req: AuthenticatedRequest,
    @Body() body: PurgeAuditLogsDto,
  ) {
    return this.auditService.purge(req.user, body);
  }
}
