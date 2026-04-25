import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { GradeScalesService } from './grade-scales.service';
import { CreateGradeScaleDto } from './dto/create-grade-scale.dto';
import { CreateGradeScaleRuleDto } from './dto/create-grade-scale-rule.dto';
import { GetGradeScalesQueryDto } from './dto/get-grade-scales-query.dto';
import { UpdateGradeScaleDto } from './dto/update-grade-scale.dto';
import { UpdateGradeScaleRuleDto } from './dto/update-grade-scale-rule.dto';
import { ApplyGradeScaleMultiSchoolDto } from './dto/apply-grade-scale-multi-school.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradeScalesController {
  constructor(private readonly gradeScalesService: GradeScalesService) {}

  @Get('grade-scales')
  @Roles('OWNER', 'SUPER_ADMIN')
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetGradeScalesQueryDto,
  ) {
    return this.gradeScalesService.list(req.user, query.schoolId, {
      includeInactive: query.includeInactive,
    });
  }

  @Post('grade-scales')
  @Roles('OWNER', 'SUPER_ADMIN')
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateGradeScaleDto) {
    return this.gradeScalesService.create(req.user, body);
  }

  @Patch('grade-scales/:id')
  @Roles('OWNER', 'SUPER_ADMIN')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateGradeScaleDto,
  ) {
    return this.gradeScalesService.update(req.user, id, body);
  }

  @Patch('grade-scales/:id/set-default')
  @Roles('OWNER', 'SUPER_ADMIN')
  setDefault(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.gradeScalesService.setDefault(req.user, id);
  }

  @Patch('grade-scales/:id/archive')
  @Roles('OWNER', 'SUPER_ADMIN')
  archive(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.gradeScalesService.setActive(req.user, id, false);
  }

  @Patch('grade-scales/:id/activate')
  @Roles('OWNER', 'SUPER_ADMIN')
  activate(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.gradeScalesService.setActive(req.user, id, true);
  }

  @Post('grade-scales/multi-school')
  @Roles('OWNER', 'SUPER_ADMIN')
  applyAcrossSchools(
    @Req() req: AuthenticatedRequest,
    @Body() body: ApplyGradeScaleMultiSchoolDto,
  ) {
    return this.gradeScalesService.applyAcrossSchools(req.user, body);
  }

  @Post('grade-scales/:id/rules')
  @Roles('OWNER', 'SUPER_ADMIN')
  addRule(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: CreateGradeScaleRuleDto,
  ) {
    return this.gradeScalesService.addRule(req.user, id, body);
  }

  @Patch('grade-scale-rules/:id')
  @Roles('OWNER', 'SUPER_ADMIN')
  updateRule(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateGradeScaleRuleDto,
  ) {
    return this.gradeScalesService.updateRule(req.user, id, body);
  }
}
