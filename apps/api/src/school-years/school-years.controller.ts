import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateSchoolYearDto } from './dto/create-school-year.dto';
import { SchoolYearsService } from './school-years.service';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { UpdateSchoolYearDto } from './dto/update-school-year.dto';
import { QuerySchoolYearsDto } from './dto/query-school-years.dto';
import { RolloverSchoolYearDto } from './dto/rollover-school-year.dto';

@Controller('school-years')
export class SchoolYearsController {
  constructor(private readonly schoolYearsService: SchoolYearsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateSchoolYearDto) {
    return this.schoolYearsService.create(req.user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAllForSchool(
    @Req() req: AuthenticatedRequest,
    @Query() query: QuerySchoolYearsDto,
  ) {
    return this.schoolYearsService.findAllForSchool(
      req.user,
      query.schoolId,
      query.includeInactive ?? false,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateSchoolYearDto,
  ) {
    return this.schoolYearsService.update(req.user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Patch(':id/activate')
  activate(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.schoolYearsService.activate(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Patch(':id/end')
  endSchoolYear(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.schoolYearsService.archive(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Patch(':id/archive')
  archiveAlias(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.schoolYearsService.archive(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Patch(':id/deactivate')
  deactivate(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.schoolYearsService.archive(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Post('auto-end-expired')
  autoEndExpired() {
    return this.schoolYearsService.autoEndExpiredSchoolYearsAndArchiveClasses();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Post('rollover/preview')
  previewRollover(
    @Req() req: AuthenticatedRequest,
    @Body() body: RolloverSchoolYearDto,
  ) {
    return this.schoolYearsService.previewRollover(req.user, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Post('rollover/execute')
  executeRollover(
    @Req() req: AuthenticatedRequest,
    @Body() body: RolloverSchoolYearDto,
  ) {
    return this.schoolYearsService.executeRollover(req.user, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Delete(':id')
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    const result = await this.schoolYearsService.remove(req.user, id);
    return { success: result.success };
  }
}
