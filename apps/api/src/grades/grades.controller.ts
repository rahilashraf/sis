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
import { CreateGradeRecordDto } from './dto/create-grade-record.dto';
import { UpdateGradeRecordDto } from './dto/update-grade-record.dto';
import { GradesService } from './grades.service';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { PeriodKeyQueryDto } from '../common/dto/period-key-query.dto';

@Controller('grades')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  @Post()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateGradeRecordDto) {
    return this.gradesService.create(req.user, body);
  }

  @Patch(':id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateGradeRecordDto,
  ) {
    return this.gradesService.update(req.user, id, body);
  }

  @Get('classes/:classId')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  findByClass(
    @Req() req: AuthenticatedRequest,
    @Param('classId', NonEmptyStringPipe) classId: string,
  ) {
    return this.gradesService.findByClass(req.user, classId);
  }

  @Get('classes/:classId/summary')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  getClassSummary(
    @Req() req: AuthenticatedRequest,
    @Param('classId', NonEmptyStringPipe) classId: string,
    @Query() query: PeriodKeyQueryDto,
  ) {
    return this.gradesService.getClassSummary(
      req.user,
      classId,
      query.periodKey,
    );
  }

  @Get('students/:studentId')
  @Roles(
    'OWNER',
    'SUPER_ADMIN',
    'ADMIN',
    'STAFF',
    'TEACHER',
    'PARENT',
    'STUDENT',
  )
  findByStudent(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.gradesService.findByStudent(req.user, studentId);
  }

  @Get('students/:studentId/summary')
  @Roles(
    'OWNER',
    'SUPER_ADMIN',
    'ADMIN',
    'STAFF',
    'TEACHER',
    'PARENT',
    'STUDENT',
  )
  getStudentSummary(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
    @Query() query: PeriodKeyQueryDto,
  ) {
    return this.gradesService.getStudentSummary(
      req.user,
      studentId,
      query.periodKey,
    );
  }
}
