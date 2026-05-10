import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RolePermissionsController } from './role-permissions.controller';
import { RolePermissionsService } from './role-permissions.service';
import { TemporaryPermissionsService } from './temporary-permissions.service';

@Module({
  imports: [PrismaModule],
  controllers: [RolePermissionsController],
  providers: [RolePermissionsService, TemporaryPermissionsService],
  exports: [RolePermissionsService, TemporaryPermissionsService],
})
export class RolePermissionsModule {}
