import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateSchoolYearDto } from './dto/create-school-year.dto';
import { SchoolYearsService } from './school-years.service';

@Controller('school-years')
export class SchoolYearsController {
  constructor(private readonly schoolYearsService: SchoolYearsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Post()
  create(@Body() body: CreateSchoolYearDto) {
    return this.schoolYearsService.create(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAllForSchool(@Query('schoolId') schoolId: string) {
    return this.schoolYearsService.findAllForSchool(schoolId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Patch(':id/activate')
  activate(@Param('id') id: string) {
    return this.schoolYearsService.activate(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Patch(':id/archive')
  archive(@Param('id') id: string) {
    return this.schoolYearsService.archive(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.schoolYearsService.archive(id);
  }
}
