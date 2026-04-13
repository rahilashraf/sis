import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { CreateGradeLevelDto } from './dto/create-grade-level.dto';
import { GetGradeLevelsQueryDto } from './dto/get-grade-levels-query.dto';
import { UpdateGradeLevelDto } from './dto/update-grade-level.dto';
import { GradeLevelsService } from './grade-levels.service';

@Controller('grade-levels')
export class GradeLevelsController {
  constructor(private readonly gradeLevelsService: GradeLevelsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAllForSchool(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetGradeLevelsQueryDto,
  ) {
    return this.gradeLevelsService.findAllForSchool(
      req.user,
      query.schoolId,
      query.includeInactive ?? false,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateGradeLevelDto,
  ) {
    return this.gradeLevelsService.create(req.user, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateGradeLevelDto,
  ) {
    return this.gradeLevelsService.update(req.user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Patch(':id/archive')
  archive(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.gradeLevelsService.archive(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Patch(':id/activate')
  activate(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.gradeLevelsService.activate(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.gradeLevelsService.remove(req.user, id);
  }
}
