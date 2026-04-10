import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ParentsService } from './parents.service';
import { AttendanceService } from '../attendance/attendance.service';
import { GetStudentSummaryQueryDto } from '../attendance/dto/get-student-summary-query.dto';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';

@Controller('parents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PARENT')
export class ParentsController {
  constructor(
    private readonly parentsService: ParentsService,
    private readonly attendanceService: AttendanceService,
  ) {}

  @Get('me/students')
  getMyStudents(@Req() req: AuthenticatedRequest) {
    return this.parentsService.findMyStudents(req.user.id);
  }

  @Get('me/students/:studentId/attendance/summary')
  getStudentAttendanceSummary(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
    @Query() query: GetStudentSummaryQueryDto,
  ) {
    return this.attendanceService.getStudentSummary(
      req.user,
      studentId,
      query.startDate,
      query.endDate,
    );
  }
}
