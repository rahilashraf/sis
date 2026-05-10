import { Module } from '@nestjs/common';
import { FeatureTogglesModule } from '../feature-toggles/feature-toggles.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RolePermissionsModule } from '../role-permissions/role-permissions.module';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';

@Module({
  imports: [PrismaModule, FeatureTogglesModule, RolePermissionsModule],
  controllers: [GovernanceController],
  providers: [GovernanceService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
