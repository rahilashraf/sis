import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateReportingPeriodDto } from './dto/create-reporting-period.dto';
import { QueryReportingPeriodsDto } from './dto/query-reporting-periods.dto';
import { UpdateReportingPeriodDto } from './dto/update-reporting-period.dto';
import { ReportingPeriodsService } from './reporting-periods.service';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';

@Controller('reporting-periods')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportingPeriodsController {
  constructor(
    private readonly reportingPeriodsService: ReportingPeriodsService,
  ) {}

  @Roles('OWNER', 'SUPER_ADMIN')
  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateReportingPeriodDto,
  ) {
    return this.reportingPeriodsService.create(req.user, body);
  }

  @Roles(
    'OWNER',
    'SUPER_ADMIN',
    'ADMIN',
    'STAFF',
    'TEACHER',
  )
  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: QueryReportingPeriodsDto,
  ) {
    return this.reportingPeriodsService.findAll(req.user, query);
  }

  @Roles(
    'OWNER',
    'SUPER_ADMIN',
    'ADMIN',
    'STAFF',
    'TEACHER',
  )
  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.reportingPeriodsService.findOne(req.user, id);
  }

  @Roles('OWNER', 'SUPER_ADMIN')
  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateReportingPeriodDto,
  ) {
    return this.reportingPeriodsService.update(req.user, id, body);
  }

  @Patch(':id/archive')
  @Roles('OWNER', 'SUPER_ADMIN')
  archive(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.reportingPeriodsService.setActive(req.user, id, false);
  }

  @Patch(':id/activate')
  @Roles('OWNER', 'SUPER_ADMIN')
  activate(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.reportingPeriodsService.setActive(req.user, id, true);
  }

  @Patch(':id/lock')
  @Roles('OWNER', 'SUPER_ADMIN')
  lock(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.reportingPeriodsService.setLocked(req.user, id, true);
  }

  @Patch(':id/unlock')
  @Roles('OWNER', 'SUPER_ADMIN')
  unlock(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.reportingPeriodsService.setLocked(req.user, id, false);
  }
}
