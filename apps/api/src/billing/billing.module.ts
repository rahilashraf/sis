import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingCategoriesController } from './billing-categories.controller';
import { BillingCategoriesService } from './billing-categories.service';
import { BillingChargesController } from './billing-charges.controller';
import { BillingChargesService } from './billing-charges.service';
import { BillingOverdueController } from './billing-overdue.controller';
import { BillingParentController, BillingParentPaymentsController } from './billing-parent.controller';
import { BillingPaymentsController } from './billing-payments.controller';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingReportsController } from './billing-reports.controller';
import { BillingReportsService } from './billing-reports.service';
import { BillingStudentsController } from './billing-students.controller';
import { BillingStudentsService } from './billing-students.service';

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule],
  controllers: [
    BillingCategoriesController,
    BillingChargesController,
    BillingOverdueController,
    BillingParentController,
    BillingParentPaymentsController,
    BillingPaymentsController,
    BillingReportsController,
    BillingStudentsController,
  ],
  providers: [
    BillingCategoriesService,
    BillingChargesService,
    BillingPaymentsService,
    BillingReportsService,
    BillingStudentsService,
  ],
  exports: [
    BillingCategoriesService,
    BillingChargesService,
    BillingPaymentsService,
    BillingReportsService,
    BillingStudentsService,
  ],
})
export class BillingModule {}
