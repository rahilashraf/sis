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

  @Get('windows')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  listWindows(
    @Req() req: AuthenticatedRequest,
    @Query('schoolId', NonEmptyStringPipe) schoolId: string,
    @Query('schoolYearId', NonEmptyStringPipe) schoolYearId: string,
  ) {
    return this.service.listWindows(req.user, schoolId, schoolYearId);
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
