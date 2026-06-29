import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { FeatureTogglesModule } from '../feature-toggles/feature-toggles.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [PrismaModule, EmailModule, FeatureTogglesModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
