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
import { SchoolIdQueryDto } from '../common/dto/school-id-query.dto';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { UpdateSchoolYearDto } from './dto/update-school-year.dto';

@Controller('school-years')
export class SchoolYearsController {
  constructor(private readonly schoolYearsService: SchoolYearsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateSchoolYearDto) {
    return this.schoolYearsService.create(req.user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAllForSchool(
    @Req() req: AuthenticatedRequest,
    @Query() query: SchoolIdQueryDto,
  ) {
    return this.schoolYearsService.findAllForSchool(req.user, query.schoolId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateSchoolYearDto,
  ) {
    return this.schoolYearsService.update(req.user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Patch(':id/activate')
  activate(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.schoolYearsService.activate(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Patch(':id/archive')
  archive(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.schoolYearsService.archive(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Patch(':id/deactivate')
  deactivate(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.schoolYearsService.archive(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.schoolYearsService.remove(req.user, id);
  }
}
