import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AttendanceService } from '../attendance/attendance.service';
import { GetStudentSummaryQueryDto } from '../attendance/dto/get-student-summary-query.dto';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { StudentsService } from './students.service';
import { UpdateStudentDto } from './dto/update-student.dto';
import { GradebookService } from '../gradebook/gradebook.service';
import { ReRegistrationDto } from './dto/re-registration.dto';

@Controller('students')
export class StudentsController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly studentsService: StudentsService,
    private readonly gradebookService: GradebookService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  @Get('me/attendance/summary')
  getMyAttendanceSummary(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetStudentSummaryQueryDto,
  ) {
    if (!query.startDate || !query.endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    return this.attendanceService.getStudentSummary(
      req.user,
      req.user.id,
      query.startDate,
      query.endDate,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Get(':studentId/parents')
  findParents(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.studentsService.findParents(req.user, studentId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'OWNER',
    'SUPER_ADMIN',
    'ADMIN',
    'STAFF',
    'TEACHER',
    'SUPPLY_TEACHER',
    'PARENT',
    'STUDENT',
  )
  @Get(':id/grades')
  getGrades(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Query('classId', NonEmptyStringPipe) classId: string,
  ) {
    return this.gradebookService.getStudentGrades(req.user, id, classId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'OWNER',
    'SUPER_ADMIN',
    'ADMIN',
    'STAFF',
    'TEACHER',
    'SUPPLY_TEACHER',
    'PARENT',
    'STUDENT',
  )
  @Get(':id/grade-summary')
  getGradeSummary(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Query('classId', NonEmptyStringPipe) classId: string,
  ) {
    return this.gradebookService.getStudentSummary(req.user, id, classId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'OWNER',
    'SUPER_ADMIN',
    'ADMIN',
    'STAFF',
    'PARENT',
    'STUDENT',
  )
  @Get(':id/academic-overview')
  getAcademicOverview(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.gradebookService.getStudentAcademicOverview(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'PARENT')
  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.studentsService.findOne(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateStudentDto,
  ) {
    return this.studentsService.update(req.user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'PARENT')
  @Patch(':id/re-registration')
  reRegister(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Query('schoolYearId') schoolYearId: string | undefined,
    @Body() body: ReRegistrationDto,
  ) {
    return this.studentsService.reRegister(req.user, id, body, {
      schoolYearId: schoolYearId?.trim() || null,
    });
  }
}
