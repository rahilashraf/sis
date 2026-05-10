import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FeatureTogglesController } from './feature-toggles.controller';
import { FeatureTogglesService } from './feature-toggles.service';

@Module({
  imports: [PrismaModule],
  controllers: [FeatureTogglesController],
  providers: [FeatureTogglesService],
  exports: [FeatureTogglesService],
})
export class FeatureTogglesModule {}
