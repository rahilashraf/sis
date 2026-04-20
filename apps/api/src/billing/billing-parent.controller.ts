import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { BillingStudentsService } from './billing-students.service';

@Controller('billing/parent/students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingParentController {
  constructor(private readonly service: BillingStudentsService) {}

  @Get(':studentId/account-summary')
  @Roles('PARENT')
  getAccountSummary(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.service.getAccountSummaryForParent(req.user, studentId);
  }
}
