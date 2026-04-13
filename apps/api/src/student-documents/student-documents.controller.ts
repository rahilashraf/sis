import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { StudentDocumentsService } from './student-documents.service';
import { CreateStudentDocumentDto } from './dto/create-student-document.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentDocumentsController {
  constructor(private readonly service: StudentDocumentsService) {}

  @Get('students/:id/documents')
  @Roles(
    'OWNER',
    'SUPER_ADMIN',
    'ADMIN',
    'STAFF',
    'TEACHER',
    'PARENT',
    'STUDENT',
  )
  list(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) studentId: string,
  ) {
    return this.service.list(req.user, studentId);
  }

  @Get('students/:id/documents/:documentId')
  @Roles(
    'OWNER',
    'SUPER_ADMIN',
    'ADMIN',
    'STAFF',
    'TEACHER',
    'PARENT',
    'STUDENT',
  )
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) studentId: string,
    @Param('documentId', NonEmptyStringPipe) documentId: string,
  ) {
    return this.service.getDownload(req.user, studentId, documentId);
  }

  @Post('students/:id/documents')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  create(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) studentId: string,
    @Body() body: CreateStudentDocumentDto,
  ) {
    return this.service.create(req.user, studentId, body);
  }

  @Patch('students/:id/documents/:documentId/archive')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  archive(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) studentId: string,
    @Param('documentId', NonEmptyStringPipe) documentId: string,
  ) {
    return this.service.archive(req.user, studentId, documentId);
  }

  @Delete('students/:id/documents/:documentId')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) studentId: string,
    @Param('documentId', NonEmptyStringPipe) documentId: string,
  ) {
    return this.service.remove(req.user, studentId, documentId);
  }
}
