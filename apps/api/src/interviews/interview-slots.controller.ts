import {
  Body,
  Controller,
  Delete,
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
import { BulkGenerateInterviewSlotsDto } from './dto/bulk-generate-interview-slots.dto';
import { BookInterviewSlotDto } from './dto/book-interview-slot.dto';
import { CreateInterviewSlotDto } from './dto/create-interview-slot.dto';
import { ListInterviewSlotsQueryDto } from './dto/list-interview-slots-query.dto';
import { ListParentInterviewBookingsQueryDto } from './dto/list-parent-interview-bookings-query.dto';
import { ListTeacherInterviewSlotsQueryDto } from './dto/list-teacher-interview-slots-query.dto';
import { UpdateInterviewSlotDto } from './dto/update-interview-slot.dto';
import { InterviewsService } from './interviews.service';

@Controller('interview-slots')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InterviewSlotsController {
  constructor(private readonly service: InterviewsService) {}

  @Get('parent-bookings')
  @Roles('PARENT')
  listParentBookings(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListParentInterviewBookingsQueryDto,
  ) {
    return this.service.listParentBookings(req.user, query);
  }

  @Get('teacher')
  @Roles('TEACHER', 'SUPPLY_TEACHER')
  listTeacher(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListTeacherInterviewSlotsQueryDto,
  ) {
    return this.service.listTeacherSlots(req.user, query);
  }

  @Post(':id/book')
  @Roles('PARENT')
  book(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: BookInterviewSlotDto,
  ) {
    return this.service.bookSlot(req.user, id, body);
  }

  @Post(':id/cancel-booking')
  @Roles('PARENT')
  cancelBooking(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.cancelBookingByParent(req.user, id);
  }

  @Get()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListInterviewSlotsQueryDto,
  ) {
    return this.service.listSlots(req.user, query);
  }

  @Post()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateInterviewSlotDto,
  ) {
    return this.service.createSlot(req.user, body);
  }

  @Post('bulk-generate')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  bulkGenerate(
    @Req() req: AuthenticatedRequest,
    @Body() body: BulkGenerateInterviewSlotsDto,
  ) {
    return this.service.bulkGenerateSlots(req.user, body);
  }

  @Patch(':id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateInterviewSlotDto,
  ) {
    return this.service.updateSlot(req.user, id, body);
  }

  @Post(':id/unbook')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  unbook(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.unbookSlotByAdmin(req.user, id);
  }

  @Delete(':id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.removeSlot(req.user, id);
  }
}
