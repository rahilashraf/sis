import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ParentsService } from './parents.service';
import { AttendanceService } from '../attendance/attendance.service';
import { GetStudentSummaryQueryDto } from '../attendance/dto/get-student-summary-query.dto';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';

@Controller('parents')
export class ParentsController {
  constructor(
    private readonly parentsService: ParentsService,
    private readonly attendanceService: AttendanceService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARENT')
  @Get('me/students')
  getMyStudents(@Req() req: AuthenticatedRequest) {
    return this.parentsService.findStudents(req.user, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'PARENT')
  @Get(':parentId/students')
  getStudentsForParent(
    @Req() req: AuthenticatedRequest,
    @Param('parentId', NonEmptyStringPipe) parentId: string,
  ) {
    return this.parentsService.findStudents(req.user, parentId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARENT')
  @Get('me/students/:studentId/attendance/summary')
  getStudentAttendanceSummary(
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
}
