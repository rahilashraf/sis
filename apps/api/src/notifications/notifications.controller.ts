import {
  Body,
  Controller,
  Get,
  Param,
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
import { CreateNotificationBroadcastDto } from './dto/create-notification-broadcast.dto';
import { CreateStudentNotificationAlertDto } from './dto/create-student-notification-alert.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.listForUser(req.user, query);
  }

  @Get('unread-count')
  unreadCount(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.getUnreadCount(req.user);
  }

  @Post('read-all')
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.markAllAsRead(req.user);
  }

  @Post(':id/read')
  markAsRead(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.notificationsService.markAsRead(req.user, id);
  }

  @Post('alerts/student')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  createStudentAlert(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateStudentNotificationAlertDto,
  ) {
    return this.notificationsService.createStudentAlert(req.user, body);
  }

  @Post('broadcast')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  createBroadcast(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateNotificationBroadcastDto,
  ) {
    return this.notificationsService.createBroadcast(req.user, body);
  }
}
