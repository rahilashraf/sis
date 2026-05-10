import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { GetSchoolFeatureTogglesQueryDto } from './dto/get-school-feature-toggles-query.dto';
import { UpdateSchoolFeatureTogglesDto } from './dto/update-school-feature-toggles.dto';
import { FeatureTogglesService } from './feature-toggles.service';

@Controller(['settings/feature-toggles', 'api/settings/feature-toggles'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeatureTogglesController {
  constructor(private readonly featureTogglesService: FeatureTogglesService) {}

  @Get()
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
  getSchoolFeatureToggles(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetSchoolFeatureTogglesQueryDto,
  ) {
    return this.featureTogglesService.getSchoolFeatureToggles(
      req.user,
      query.schoolId,
    );
  }

  @Patch(':schoolId')
  @Roles('OWNER')
  updateSchoolFeatureToggles(
    @Req() req: AuthenticatedRequest,
    @Param('schoolId', NonEmptyStringPipe) schoolId: string,
    @Body() body: UpdateSchoolFeatureTogglesDto,
  ) {
    return this.featureTogglesService.updateSchoolFeatureToggles(
      req.user,
      schoolId,
      body,
    );
  }
}
