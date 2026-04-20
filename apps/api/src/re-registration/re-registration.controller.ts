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
import { CreateReRegistrationWindowDto } from './dto/create-re-registration-window.dto';
import { ListReRegistrationTrackingDto } from './dto/list-re-registration-tracking.dto';
import { UpdateReRegistrationWindowDto } from './dto/update-re-registration-window.dto';
import { ReRegistrationService } from './re-registration.service';

@Controller('re-registration')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReRegistrationController {
  constructor(private readonly service: ReRegistrationService) {}

  @Get('window')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'PARENT')
  getWindow(
    @Req() req: AuthenticatedRequest,
    @Query('schoolId', NonEmptyStringPipe) schoolId: string,
    @Query('schoolYearId', NonEmptyStringPipe) schoolYearId: string,
  ) {
    return this.service.getWindowStatus(req.user, schoolId, schoolYearId);
  }

  @Get('window/for-student/:studentId')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'PARENT')
  getWindowForStudent(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.service.getWindowStatusForStudent(req.user, studentId);
  }

  @Get('windows')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  listWindows(
    @Req() req: AuthenticatedRequest,
    @Query('schoolId', NonEmptyStringPipe) schoolId: string,
    @Query('schoolYearId', NonEmptyStringPipe) schoolYearId: string,
  ) {
    return this.service.listWindows(req.user, schoolId, schoolYearId);
  }

  @Get('window/:id/tracking')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  getWindowTracking(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Query() query: ListReRegistrationTrackingDto,
  ) {
    return this.service.getWindowTracking(req.user, id, query);
  }

  @Post('window/:id/remind-all')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  remindAllPending(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.remindAllPending(req.user, id);
  }

  @Post('window/:id/remind-student/:studentId')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  remindStudent(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.service.remindStudent(req.user, id, studentId);
  }

  @Post('window')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  createWindow(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateReRegistrationWindowDto,
  ) {
    return this.service.create(req.user, body);
  }

  @Patch('window/:id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  updateWindow(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateReRegistrationWindowDto,
  ) {
    return this.service.update(req.user, id, body);
  }
}
