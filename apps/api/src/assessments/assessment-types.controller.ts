import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { AssessmentTypesService } from './assessment-types.service';
import { CreateAssessmentTypeDto } from './dto/create-assessment-type.dto';
import { ListAssessmentTypesQueryDto } from './dto/list-assessment-types-query.dto';
import { UpdateAssessmentTypeDto } from './dto/update-assessment-type.dto';

@Controller('assessment-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssessmentTypesController {
  constructor(private readonly assessmentTypesService: AssessmentTypesService) {}

  @Get()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  list(@Req() req: AuthenticatedRequest, @Query() query: ListAssessmentTypesQueryDto) {
    return this.assessmentTypesService.list(req.user, {
      schoolId: query.schoolId,
      includeInactive: query.includeInactive,
    });
  }

  @Post()
  @Roles('OWNER', 'SUPER_ADMIN')
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateAssessmentTypeDto) {
    return this.assessmentTypesService.create(req.user, body);
  }

  @Patch(':id')
  @Roles('OWNER', 'SUPER_ADMIN')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateAssessmentTypeDto,
  ) {
    return this.assessmentTypesService.update(req.user, id, body);
  }

  @Patch(':id/archive')
  @Roles('OWNER', 'SUPER_ADMIN')
  archive(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.assessmentTypesService.archive(req.user, id);
  }

  @Patch(':id/activate')
  @Roles('OWNER', 'SUPER_ADMIN')
  activate(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.assessmentTypesService.activate(req.user, id);
  }
}
