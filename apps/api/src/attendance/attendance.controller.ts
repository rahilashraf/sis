import {
  Body,
  Controller,
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('students')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  getStudents(@Req() req: any, @Query('classIds') classIds: string) {
    const ids = (classIds || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    return this.attendanceService.getStudentsForClasses(req.user, ids);
  }

  @Post('sessions')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  create(@Req() req: any, @Body() body: CreateAttendanceDto) {
    return this.attendanceService.create(req.user, body);
  }

  @Get('sessions')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  getSessionsByDate(
    @Req() req: any,
    @Query('schoolId') schoolId: string,
    @Query('date') date: string,
  ) {
    return this.attendanceService.getSessionsByDate(req.user, schoolId, date);
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
    @Req() req: any,
    @Param('studentId') studentId: string,
    @Query('date') date: string,
  ) {
    return this.attendanceService.getStudentAttendanceByDate(
      req.user,
      studentId,
      date,
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
  getStudentHistory(@Req() req: any, @Param('studentId') studentId: string) {
    return this.attendanceService.getStudentHistory(req.user, studentId);
  }

  @Patch('records/:recordId')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  updateRecord(
    @Req() req: any,
    @Param('recordId') recordId: string,
    @Body() body: UpdateAttendanceRecordDto,
  ) {
    return this.attendanceService.updateRecord(req.user, recordId, body);
  }
}