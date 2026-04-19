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
import { CreateTimetableBlockDto } from './dto/create-timetable-block.dto';
import { CreateBulkTimetableBlockDto } from './dto/create-bulk-timetable-block.dto';
import { ListTimetableQueryDto } from './dto/list-timetable-query.dto';
import { UpdateTimetableBlockDto } from './dto/update-timetable-block.dto';
import { TimetableService } from './timetable.service';

@Controller('timetable')
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: ListTimetableQueryDto) {
    return this.timetableService.list(req.user, query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateTimetableBlockDto,
  ) {
    return this.timetableService.create(req.user, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Post('bulk')
  createBulk(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateBulkTimetableBlockDto,
  ) {
    return this.timetableService.createBulk(req.user, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateTimetableBlockDto,
  ) {
    return this.timetableService.update(req.user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.timetableService.remove(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'SUPPLY_TEACHER', 'PARENT', 'STUDENT')
  @Get('me')
  listMine(@Req() req: AuthenticatedRequest) {
    return this.timetableService.listMine(req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @Get('class/:classId')
  listByClass(
    @Req() req: AuthenticatedRequest,
    @Param('classId', NonEmptyStringPipe) classId: string,
  ) {
    return this.timetableService.listByClass(req.user, classId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @Get('student/:studentId')
  listByStudent(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.timetableService.listByStudent(req.user, studentId);
  }
}
