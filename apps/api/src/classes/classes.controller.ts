import {
  Body,
  Controller,
  Get,
  Param,
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
  @Get()
  findAll() {
    return this.classesService.findAll();
  }

  @UseGuards(JwtAuthGuard)
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
  @Post(':id/enroll-student')
  enrollStudent(@Param('id') id: string, @Body() body: EnrollStudentDto) {
    return this.classesService.enrollStudent(id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/teachers')
  findTeachers(@Param('id') id: string) {
    return this.classesService.findTeachers(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/students')
  findStudents(@Param('id') id: string) {
    return this.classesService.findStudents(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('teacher/:teacherId')
  findClassesForTeacher(@Param('teacherId') teacherId: string) {
    return this.classesService.findClassesForTeacher(teacherId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('student/:studentId')
  findClassesForStudent(@Param('studentId') studentId: string) {
    return this.classesService.findClassesForStudent(studentId);
  }
}