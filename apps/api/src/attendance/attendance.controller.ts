import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  Req,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceRecordDto } from './dto/update-attendance-record.dto';
import { UpdateAttendanceSessionDto } from './dto/update-attendance-session.dto';
import { GetAttendanceSessionsQueryDto } from './dto/get-attendance-sessions-query.dto';
import { GetStudentAttendanceByDateQueryDto } from './dto/get-student-attendance-by-date-query.dto';
import { GetStudentSummaryQueryDto } from './dto/get-student-summary-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { GetAttendanceStudentsQueryDto } from './dto/get-attendance-students-query.dto';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('students')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  getStudents(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetAttendanceStudentsQueryDto,
  ) {
    return this.attendanceService.getStudentsForClasses(
      req.user,
      query.classIds,
    );
  }

  @Post('sessions')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateAttendanceDto) {
    return this.attendanceService.create(req.user, body);
  }

  @Get('sessions')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  getSessionsByDate(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetAttendanceSessionsQueryDto,
  ) {
    return this.attendanceService.getSessionsByDate(
      req.user,
      query.schoolId,
      query.date,
    );
  }

  @Get('sessions/:sessionId')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  getSessionById(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId', NonEmptyStringPipe) sessionId: string,
  ) {
    return this.attendanceService.getSessionById(req.user, sessionId);
  }

  @Patch('sessions/:sessionId')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  updateSession(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId', NonEmptyStringPipe) sessionId: string,
    @Body() body: UpdateAttendanceSessionDto,
  ) {
    return this.attendanceService.updateSession(req.user, sessionId, body);
  }

  @Get('students/:studentId/by-date')
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
  getStudentAttendanceByDate(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
    @Query() query: GetStudentAttendanceByDateQueryDto,
  ) {
    return this.attendanceService.getStudentAttendanceByDate(
      req.user,
      studentId,
      query.date,
    );
  }

  @Get('students/:studentId/history')
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
  getStudentHistory(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.attendanceService.getStudentHistory(req.user, studentId);
  }

  @Get('students/:studentId/summary')
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
  getStudentSummary(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
    @Query() query: GetStudentSummaryQueryDto,
  ) {
    if (!query.startDate || !query.endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    return this.attendanceService.getStudentSummary(
      req.user,
      studentId,
      query.startDate,
      query.endDate,
    );
  }

  @Patch('records/:recordId')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  updateRecord(
    @Req() req: AuthenticatedRequest,
    @Param('recordId', NonEmptyStringPipe) recordId: string,
    @Body() body: UpdateAttendanceRecordDto,
  ) {
    return this.attendanceService.updateRecord(req.user, recordId, body);
  }

  @Delete('sessions/:sessionId')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  removeSession(
    @Req() req: AuthenticatedRequest,
    @Param('sessionId', NonEmptyStringPipe) sessionId: string,
  ) {
    return this.attendanceService.deleteSession(req.user, sessionId);
  }
}
