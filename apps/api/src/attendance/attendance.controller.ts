import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Patch,
  ParseBoolPipe,
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
import { GetClassSummaryQueryDto } from './dto/get-class-summary-query.dto';
import { GetClassAttendanceRecordsQueryDto } from './dto/get-class-attendance-records-query.dto';
import { GetAttendanceStatusRulesQueryDto } from './dto/get-attendance-status-rules-query.dto';
import { UpdateAttendanceStatusRuleDto } from './dto/update-attendance-status-rule.dto';
import { GetAttendanceCustomStatusesQueryDto } from './dto/get-attendance-custom-statuses-query.dto';
import { CreateAttendanceCustomStatusDto } from './dto/create-attendance-custom-status.dto';
import { UpdateAttendanceCustomStatusDto } from './dto/update-attendance-custom-status.dto';
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
    if (!query.startDate && !query.endDate) {
      return this.attendanceService.getStudentAllTimeSummary(req.user, studentId);
    }

    if (!query.startDate || !query.endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    return this.attendanceService.getStudentSummary(req.user, studentId, query.startDate, query.endDate);
  }

  @Get('classes/:classId/summary')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  getClassSummary(
    @Req() req: AuthenticatedRequest,
    @Param('classId', NonEmptyStringPipe) classId: string,
    @Query() query: GetClassSummaryQueryDto,
  ) {
    if (!query.startDate && !query.endDate) {
      return this.attendanceService.getClassAllTimeSummary(req.user, classId);
    }

    if (!query.startDate || !query.endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    return this.attendanceService.getClassSummary(
      req.user,
      classId,
      query.startDate,
      query.endDate,
    );
  }

  @Get('classes/:classId/records')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  getClassRecordsByDateRange(
    @Req() req: AuthenticatedRequest,
    @Param('classId', NonEmptyStringPipe) classId: string,
    @Query() query: GetClassAttendanceRecordsQueryDto,
  ) {
    return this.attendanceService.getClassRecordsByDateRange(
      req.user,
      classId,
      query.startDate,
      query.endDate,
    );
  }

  @Get('status-rules')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  getStatusRules(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetAttendanceStatusRulesQueryDto,
  ) {
    return this.attendanceService.getStatusRules(req.user, query.schoolId);
  }

  @Patch('status-rules/:status')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  updateStatusRule(
    @Req() req: AuthenticatedRequest,
    @Param('status', NonEmptyStringPipe) status: string,
    @Query() query: GetAttendanceStatusRulesQueryDto,
    @Body() body: UpdateAttendanceStatusRuleDto,
  ) {
    return this.attendanceService.updateStatusRule(
      req.user,
      query.schoolId,
      status,
      body.behavior,
    );
  }

  @Get('custom-statuses')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  getCustomStatuses(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetAttendanceCustomStatusesQueryDto,
    @Query('includeInactive', new DefaultValuePipe(false), ParseBoolPipe)
    includeInactive?: boolean,
  ) {
    return this.attendanceService.getCustomStatuses(
      req.user,
      query.schoolId,
      includeInactive ?? false,
    );
  }

  @Post('custom-statuses')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  createCustomStatus(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateAttendanceCustomStatusDto,
  ) {
    return this.attendanceService.createCustomStatus(req.user, body);
  }

  @Patch('custom-statuses/:id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  updateCustomStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateAttendanceCustomStatusDto,
  ) {
    return this.attendanceService.updateCustomStatus(req.user, id, body);
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
