import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UniformItemsController } from './uniform-items.controller';
import { UniformOrdersController } from './uniform-orders.controller';
import { UniformService } from './uniform.service';

@Module({
  imports: [PrismaModule],
  controllers: [UniformItemsController, UniformOrdersController],
  providers: [UniformService],
  exports: [UniformService],
})
export class UniformModule {}
