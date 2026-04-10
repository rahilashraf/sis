import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateGradeRecordDto } from './dto/create-grade-record.dto';
import { GradesService } from './grades.service';

@Controller('grades')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  @Post()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  create(@Req() req: any, @Body() body: CreateGradeRecordDto) {
    return this.gradesService.create(req.user, body);
  }

  @Get('classes/:classId')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  findByClass(@Req() req: any, @Param('classId') classId: string) {
    return this.gradesService.findByClass(req.user, classId);
  }

  @Get('students/:studentId')
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
  findByStudent(@Req() req: any, @Param('studentId') studentId: string) {
    return this.gradesService.findByStudent(req.user, studentId);
  }
}
