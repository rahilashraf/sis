import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { BillingStudentsService } from './billing-students.service';
import { GetStudentAccountSummaryQueryDto } from './dto/get-student-account-summary-query.dto';

@Controller('billing/students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingStudentsController {
  constructor(private readonly service: BillingStudentsService) {}

  @Get(':studentId/account-summary')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  getAccountSummary(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
    @Query() query: GetStudentAccountSummaryQueryDto,
  ) {
    return this.service.getAccountSummary(req.user, studentId, query);
  }
}
