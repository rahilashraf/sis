import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
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
import { CreateAssessmentCategoryDto } from './dto/create-assessment-category.dto';
import { UpdateAssessmentCategoryDto } from './dto/update-assessment-category.dto';
import { UpdateGradebookSettingsDto } from './dto/update-gradebook-settings.dto';
import { GradebookConfigService } from './gradebook-config.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradebookConfigController {
  constructor(private readonly service: GradebookConfigService) {}

  @Get('classes/:id/gradebook-settings')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  getSettings(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) classId: string,
  ) {
    return this.service.getSettings(req.user, classId);
  }

  @Patch('classes/:id/gradebook-settings')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  updateSettings(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) classId: string,
    @Body() body: UpdateGradebookSettingsDto,
  ) {
    return this.service.updateSettings(req.user, classId, {
      weightingMode: body.weightingMode,
    });
  }

  @Get('classes/:id/assessment-categories')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  listCategories(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) classId: string,
    @Query('includeInactive', new DefaultValuePipe(false), ParseBoolPipe)
    includeInactive: boolean,
  ) {
    return this.service.listCategories(req.user, classId, includeInactive);
  }

  @Post('classes/:id/assessment-categories')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  createCategory(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) classId: string,
    @Body() body: CreateAssessmentCategoryDto,
  ) {
    return this.service.createCategory(req.user, classId, body);
  }

  @Patch('assessment-categories/:id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  updateCategory(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) categoryId: string,
    @Body() body: UpdateAssessmentCategoryDto,
  ) {
    return this.service.updateCategory(req.user, categoryId, body);
  }
}
