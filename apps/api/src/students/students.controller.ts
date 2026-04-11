import {
  BadRequestException,
  Controller,
  Get,
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

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STUDENT')
export class StudentsController {
  constructor(private readonly attendanceService: AttendanceService) {}

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
}
