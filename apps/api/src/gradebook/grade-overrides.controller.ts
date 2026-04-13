import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { UpsertGradeOverrideDto } from './dto/upsert-grade-override.dto';
import { GradeOverridesService } from './grade-overrides.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradeOverridesController {
  constructor(private readonly service: GradeOverridesService) {}

  @Get('classes/:id/students/:studentId/grade-override')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  find(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) classId: string,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
    @Query('reportingPeriodId') reportingPeriodId?: string,
  ) {
    return this.service.find(req.user, classId, studentId, reportingPeriodId?.trim() || null);
  }

  @Put('classes/:id/students/:studentId/grade-override')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  upsert(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) classId: string,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
    @Body() body: UpsertGradeOverrideDto,
  ) {
    return this.service.upsert(req.user, classId, studentId, {
      reportingPeriodId: body.reportingPeriodId ?? null,
      overridePercent: body.overridePercent,
      overrideReason: body.overrideReason,
    });
  }

  @Delete('classes/:id/students/:studentId/grade-override')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) classId: string,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
    @Query('reportingPeriodId') reportingPeriodId?: string,
  ) {
    return this.service.remove(req.user, classId, studentId, reportingPeriodId?.trim() || null);
  }
}
