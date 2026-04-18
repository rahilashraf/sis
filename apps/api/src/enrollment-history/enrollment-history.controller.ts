import {
  Body,
  Controller,
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
import { CreateEnrollmentHistoryDto } from './dto/create-enrollment-history.dto';
import { UpdateEnrollmentHistoryDto } from './dto/update-enrollment-history.dto';
import { ReplaceEnrollmentSubjectsDto } from './dto/replace-enrollment-subjects.dto';
import { ListEnrollmentSubjectOptionsQueryDto } from './dto/list-enrollment-subject-options-query.dto';
import { CreateEnrollmentSubjectOptionDto } from './dto/create-enrollment-subject-option.dto';
import { UpdateEnrollmentSubjectOptionDto } from './dto/update-enrollment-subject-option.dto';
import { EnrollmentHistoryService } from './enrollment-history.service';

@Controller('enrollment-history')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EnrollmentHistoryController {
  constructor(private readonly service: EnrollmentHistoryService) {}

  @Post('students/:studentId')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  create(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
    @Body() body: CreateEnrollmentHistoryDto,
  ) {
    return this.service.create(req.user, studentId, body);
  }

  @Get('students/:studentId')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  getByStudent(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.service.getByStudent(req.user, studentId);
  }

  @Patch('students/:studentId')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
    @Body() body: UpdateEnrollmentHistoryDto,
  ) {
    return this.service.update(req.user, studentId, body);
  }

  @Patch('students/:studentId/subjects')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  replaceSubjects(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
    @Body() body: ReplaceEnrollmentSubjectsDto,
  ) {
    return this.service.replaceSubjects(req.user, studentId, body);
  }

  @Get('subject-options')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  listSubjectOptions(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListEnrollmentSubjectOptionsQueryDto,
  ) {
    return this.service.listSubjectOptions(req.user, {
      includeInactive: query.includeInactive ?? false,
    });
  }

  @Post('subject-options')
  @Roles('OWNER', 'SUPER_ADMIN')
  createSubjectOption(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateEnrollmentSubjectOptionDto,
  ) {
    return this.service.createSubjectOption(req.user, body);
  }

  @Patch('subject-options/:id')
  @Roles('OWNER', 'SUPER_ADMIN')
  updateSubjectOption(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateEnrollmentSubjectOptionDto,
  ) {
    return this.service.updateSubjectOption(req.user, id, body);
  }

  @Patch('subject-options/:id/activate')
  @Roles('OWNER', 'SUPER_ADMIN')
  activateSubjectOption(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.setSubjectOptionActiveState(req.user, id, true);
  }

  @Patch('subject-options/:id/deactivate')
  @Roles('OWNER', 'SUPER_ADMIN')
  deactivateSubjectOption(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.setSubjectOptionActiveState(req.user, id, false);
  }
}
