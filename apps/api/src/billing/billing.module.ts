import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { BillingCategoriesController } from './billing-categories.controller';
import { BillingCategoriesService } from './billing-categories.service';
import { BillingChargesController } from './billing-charges.controller';
import { BillingChargesService } from './billing-charges.service';
import { BillingParentController } from './billing-parent.controller';
import { BillingPaymentsController } from './billing-payments.controller';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingStudentsController } from './billing-students.controller';
import { BillingStudentsService } from './billing-students.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    BillingCategoriesController,
    BillingChargesController,
    BillingParentController,
    BillingPaymentsController,
    BillingStudentsController,
  ],
  providers: [
    BillingCategoriesService,
    BillingChargesService,
    BillingPaymentsService,
    BillingStudentsService,
  ],
  exports: [
    BillingCategoriesService,
    BillingChargesService,
    BillingPaymentsService,
    BillingStudentsService,
  ],
})
export class BillingModule {}
