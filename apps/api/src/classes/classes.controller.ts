import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  ParseBoolPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { AssignTeacherDto } from './dto/assign-teacher.dto';
import { UpdateTeacherAssignmentDto } from './dto/update-teacher-assignment.dto';
import { EnrollStudentDto } from './dto/enroll-student.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { GradebookService } from '../gradebook/gradebook.service';

@Controller('classes')
export class ClassesController {
  constructor(
    private readonly classesService: ClassesService,
    private readonly gradebookService: GradebookService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateClassDto) {
    return this.classesService.create(req.user, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('includeInactive', new DefaultValuePipe(false), ParseBoolPipe)
    includeInactive: boolean,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.classesService.findAll(req.user, includeInactive, schoolId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER', 'SUPPLY_TEACHER')
  @Get('my')
  findMyClasses(@Req() req: AuthenticatedRequest) {
    return this.classesService.findMyClasses(req.user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.classesService.findOne(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Post(':id/assign-teacher')
  assignTeacher(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: AssignTeacherDto,
  ) {
    return this.classesService.assignTeacher(req.user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Patch(':id/teachers/:teacherId')
  updateTeacherAssignment(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Param('teacherId', NonEmptyStringPipe) teacherId: string,
    @Body() body: UpdateTeacherAssignmentDto,
  ) {
    return this.classesService.updateTeacherAssignment(req.user, id, teacherId, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Delete(':id/teachers/:teacherId')
  removeTeacher(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Param('teacherId', NonEmptyStringPipe) teacherId: string,
  ) {
    return this.classesService.removeTeacher(req.user, id, teacherId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Post(':id/enroll-student')
  enrollStudent(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: EnrollStudentDto,
  ) {
    return this.classesService.enrollStudent(req.user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Delete(':id/students/:studentId')
  unenrollStudent(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.classesService.unenrollStudent(req.user, id, studentId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Patch(':id/archive')
  archive(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.classesService.setClassActiveState(req.user, id, false);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Patch(':id/reactivate')
  reactivate(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.classesService.setClassActiveState(req.user, id, true);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateClassDto,
  ) {
    return this.classesService.update(req.user, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Delete(':id')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.classesService.remove(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  @Get(':id/teachers')
  findTeachers(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.classesService.findTeachers(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  @Get(':id/students')
  findStudents(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.classesService.findStudents(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  @Get('teacher/:teacherId')
  findClassesForTeacher(
    @Req() req: AuthenticatedRequest,
    @Param('teacherId', NonEmptyStringPipe) teacherId: string,
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
    'PARENT',
    'STUDENT',
  )
  @Get('student/:studentId')
  findClassesForStudent(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.classesService.findClassesForStudent(req.user, studentId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  @Get(':id/grade-summary')
  getGradeSummary(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.gradebookService.getClassSummary(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  @Get(':id/gradebook-grid')
  getGradebookGrid(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.gradebookService.getClassGradebookGrid(req.user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'OWNER',
    'SUPER_ADMIN',
    'ADMIN',
    'STAFF',
    'TEACHER',
    'PARENT',
    'STUDENT',
  )
  @Get(':id/students/:studentId/summary')
  getStudentSummaryForClass(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) classId: string,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.gradebookService.getStudentInClassSummary(req.user, classId, studentId);
  }
}
