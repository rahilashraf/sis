import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { BillingStudentsService } from './billing-students.service';
import { BillingPaymentsService } from './billing-payments.service';

@Controller('billing/parent/students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingParentController {
  constructor(
    private readonly studentsService: BillingStudentsService,
    private readonly paymentsService: BillingPaymentsService,
  ) {}

  @Get(':studentId/account-summary')
  @Roles('PARENT')
  getAccountSummary(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.studentsService.getAccountSummaryForParent(req.user, studentId);
  }

  @Get(':studentId/statement')
  @Roles('PARENT')
  getStatement(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.studentsService.getStatementForParent(req.user, studentId);
  }
}

@Controller('billing/parent/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingParentPaymentsController {
  constructor(private readonly paymentsService: BillingPaymentsService) {}

  @Get(':paymentId/receipt')
  @Roles('PARENT')
  getReceiptData(
    @Req() req: AuthenticatedRequest,
    @Param('paymentId', NonEmptyStringPipe) paymentId: string,
  ) {
    return this.paymentsService.getReceiptDataForParent(req.user, paymentId);
  }
}
