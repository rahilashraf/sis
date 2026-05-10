import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { GetGovernanceQueryDto } from './dto/get-governance-query.dto';
import { UpdateSchoolGovernanceSettingsDto } from './dto/update-school-governance-settings.dto';
import { GovernanceService } from './governance.service';

@Controller(['settings/governance', 'api/settings/governance'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class GovernanceController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Get()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  getSchoolGovernanceSettings(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetGovernanceQueryDto,
  ) {
    return this.governanceService.getSchoolGovernanceSettings(
      req.user,
      query.schoolId,
    );
  }

  @Patch(':schoolId')
  @Roles('OWNER')
  updateSchoolGovernanceSettings(
    @Req() req: AuthenticatedRequest,
    @Param('schoolId', NonEmptyStringPipe) schoolId: string,
    @Body() body: UpdateSchoolGovernanceSettingsDto,
  ) {
    return this.governanceService.updateSchoolGovernanceSettings(
      req.user,
      schoolId,
      body,
    );
  }

  @Get('visibility')
  @Roles(
    'OWNER',
    'SUPER_ADMIN',
    'ADMIN',
    'STAFF',
    'TEACHER',
    'SUPPLY_TEACHER',
    'PARENT',
    'STUDENT',
  )
  getAccessVisibility(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetGovernanceQueryDto,
  ) {
    return this.governanceService.getAccessVisibility(req.user, query.schoolId);
  }
}
