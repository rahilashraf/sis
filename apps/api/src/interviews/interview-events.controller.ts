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
import { CreateInterviewEventDto } from './dto/create-interview-event.dto';
import { GetParentInterviewEventSlotsQueryDto } from './dto/get-parent-interview-event-slots-query.dto';
import { ListInterviewEventsQueryDto } from './dto/list-interview-events-query.dto';
import { ListParentInterviewEventsQueryDto } from './dto/list-parent-interview-events-query.dto';
import { UpdateInterviewEventDto } from './dto/update-interview-event.dto';
import { InterviewsService } from './interviews.service';

@Controller('interview-events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InterviewEventsController {
  constructor(private readonly service: InterviewsService) {}

  @Get('parent')
  @Roles('PARENT')
  listParent(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListParentInterviewEventsQueryDto,
  ) {
    return this.service.listParentEvents(req.user, query);
  }

  @Get(':id/parent-slots')
  @Roles('PARENT')
  listParentEventSlots(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Query() query: GetParentInterviewEventSlotsQueryDto,
  ) {
    return this.service.listParentEventSlots(req.user, id, query.studentId);
  }

  @Get()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListInterviewEventsQueryDto,
  ) {
    return this.service.listEvents(req.user, query);
  }

  @Get(':id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.getEvent(req.user, id);
  }

  @Post()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateInterviewEventDto,
  ) {
    return this.service.createEvent(req.user, body);
  }

  @Patch(':id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateInterviewEventDto,
  ) {
    return this.service.updateEvent(req.user, id, body);
  }
}
