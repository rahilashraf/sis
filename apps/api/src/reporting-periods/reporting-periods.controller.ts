import {
  Body,
  Controller,
  Delete,
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

@Controller('reporting-periods')
@UseGuards(JwtAuthGuard)
export class ReportingPeriodsController {
  constructor(
    private readonly reportingPeriodsService: ReportingPeriodsService,
  ) {}

  @UseGuards(RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Post()
  create(@Req() req: any, @Body() body: CreateReportingPeriodDto) {
    return this.reportingPeriodsService.create(req.user, body);
  }

  @Get()
  findAll(@Req() req: any, @Query() query: QueryReportingPeriodsDto) {
    return this.reportingPeriodsService.findAll(req.user, query);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.reportingPeriodsService.findOne(req.user, id);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateReportingPeriodDto,
  ) {
    return this.reportingPeriodsService.update(req.user, id, body);
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.reportingPeriodsService.remove(req.user, id);
  }
}
