import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { BillingPaymentsService } from './billing-payments.service';
import { CreateBatchBillingPaymentsDto } from './dto/create-batch-billing-payments.dto';
import { CreateBillingPaymentDto } from './dto/create-billing-payment.dto';
import { VoidBillingPaymentDto } from './dto/void-billing-payment.dto';

@Controller('billing/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingPaymentsController {
  constructor(private readonly service: BillingPaymentsService) {}

  @Post()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateBillingPaymentDto) {
    return this.service.create(req.user, dto);
  }

  @Post('batch')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  createBatch(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateBatchBillingPaymentsDto,
  ) {
    return this.service.createBatch(req.user, dto);
  }

  @Post(':id/void')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  voidPayment(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() dto: VoidBillingPaymentDto,
  ) {
    return this.service.voidPayment(req.user, id, dto);
  }
}
