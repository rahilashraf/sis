import { Module } from '@nestjs/common';
import { ReRegistrationController } from './re-registration.controller';
import { ReRegistrationService } from './re-registration.service';

@Module({
  controllers: [ReRegistrationController],
  providers: [ReRegistrationService],
  exports: [ReRegistrationService],
})
export class ReRegistrationModule {}

