import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReRegistrationController } from './re-registration.controller';
import { ReRegistrationService } from './re-registration.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ReRegistrationController],
  providers: [ReRegistrationService],
  exports: [ReRegistrationService],
})
export class ReRegistrationModule {}

