import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { BillingStudentsService } from './billing-students.service';
import { ListBillingOverdueQueryDto } from './dto/list-billing-overdue-query.dto';
import { SendBillingOverdueRemindersDto } from './dto/send-billing-overdue-reminders.dto';

@Controller('billing/overdue')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingOverdueController {
  constructor(private readonly service: BillingStudentsService) {}

  @Get()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListBillingOverdueQueryDto,
  ) {
    return this.service.listOverdue(req.user, query);
  }

  @Post('reminders')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  sendReminders(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListBillingOverdueQueryDto,
    @Body() body: SendBillingOverdueRemindersDto,
  ) {
    return this.service.sendOverdueReminders(req.user, query, body);
  }
}
