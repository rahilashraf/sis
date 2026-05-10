import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { GetRolePermissionsQueryDto } from './dto/get-role-permissions-query.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RolePermissionsService } from './role-permissions.service';

@Controller(['settings/role-permissions', 'api/settings/role-permissions'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolePermissionsController {
  constructor(private readonly rolePermissionsService: RolePermissionsService) {}

  @Get()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  getRolePermissions(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetRolePermissionsQueryDto,
  ) {
    return this.rolePermissionsService.getRolePermissions({
      user: req.user,
      schoolId: query.schoolId,
      role: query.role,
    });
  }

  @Patch(':schoolId/:role')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  updateRolePermissions(
    @Req() req: AuthenticatedRequest,
    @Param('schoolId', NonEmptyStringPipe) schoolId: string,
    @Param('role', new ParseEnumPipe(UserRole)) role: UserRole,
    @Body() body: UpdateRolePermissionsDto,
  ) {
    return this.rolePermissionsService.updateRolePermissions({
      user: req.user,
      schoolId,
      role,
      body,
    });
  }
}
