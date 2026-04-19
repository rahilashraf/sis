import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BehaviorController } from './behavior.controller';
import { BehaviorService } from './behavior.service';

@Module({
  imports: [PrismaModule],
  controllers: [BehaviorController],
  providers: [BehaviorService],
  exports: [BehaviorService],
})
export class BehaviorModule {}
