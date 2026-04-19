import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  ParseBoolPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SchoolsService } from './schools.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { CreateSchoolDto } from './dto/create-school.dto';

@Controller('schools')
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('includeInactive', new DefaultValuePipe(false), ParseBoolPipe)
    includeInactive: boolean,
  ) {
    return this.schoolsService.findAll(req.user, includeInactive);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateSchoolDto) {
    return this.schoolsService.create(req.user, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateSchoolDto,
  ) {
    return this.schoolsService.update(req.user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Patch(':id/archive')
  archive(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.schoolsService.setActiveState(req.user, id, false);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Patch(':id/activate')
  activate(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.schoolsService.setActiveState(req.user, id, true);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  @Delete(':id')
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    const result = await this.schoolsService.remove(req.user, id);
    return { success: result.success };
  }
}
