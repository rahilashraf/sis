import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { AssignTeacherDto } from './dto/assign-teacher.dto';
import { EnrollStudentDto } from './dto/enroll-student.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() body: CreateClassDto) {
    return this.classesService.create(body);
  }

  @UseGuards(JwtAuthGuard)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Get()
  findAll() {
    return this.classesService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  @Get('my')
  findMyClasses(@Req() req: any) {
    return this.classesService.findMyClasses(req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Post(':id/assign-teacher')
  assignTeacher(@Param('id') id: string, @Body() body: AssignTeacherDto) {
    return this.classesService.assignTeacher(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Delete(':id/teachers/:teacherId')
  removeTeacher(
    @Param('id') id: string,
    @Param('teacherId') teacherId: string,
  ) {
    return this.classesService.removeTeacher(id, teacherId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Post(':id/enroll-student')
  enrollStudent(@Param('id') id: string, @Body() body: EnrollStudentDto) {
    return this.classesService.enrollStudent(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Delete(':id/students/:studentId')
  unenrollStudent(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
  ) {
    return this.classesService.unenrollStudent(id, studentId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Patch(':id/archive')
  archive(@Param('id') id: string) {
    return this.classesService.setClassActiveState(id, false);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.classesService.setClassActiveState(id, true);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  @Get(':id/teachers')
  findTeachers(@Req() req: any, @Param('id') id: string) {
    return this.classesService.findTeachers(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  @Get(':id/students')
  findStudents(@Req() req: any, @Param('id') id: string) {
    return this.classesService.findStudents(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  @Get('teacher/:teacherId')
  findClassesForTeacher(
    @Req() req: any,
    @Param('teacherId') teacherId: string,
  ) {
    return this.classesService.findClassesForTeacher(req.user, teacherId);
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
  findClassesForStudent(
    @Req() req: any,
    @Param('studentId') studentId: string,
  ) {
    return this.classesService.findClassesForStudent(req.user, studentId);
  }
}
