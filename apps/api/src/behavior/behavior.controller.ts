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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { NonEmptyStringPipe } from '../common/pipes/non-empty-string.pipe';
import { CreateBehaviorRecordDto } from './dto/create-behavior-record.dto';
import { UpdateBehaviorRecordDto } from './dto/update-behavior-record.dto';
import { ListBehaviorRecordsQueryDto } from './dto/list-behavior-records-query.dto';
import { CreateBehaviorCategoryOptionDto } from './dto/create-behavior-category-option.dto';
import { UpdateBehaviorCategoryOptionDto } from './dto/update-behavior-category-option.dto';
import { ListBehaviorCategoryOptionsQueryDto } from './dto/list-behavior-category-options-query.dto';
import { ListBehaviorStudentsQueryDto } from './dto/list-behavior-students-query.dto';
import { BehaviorService } from './behavior.service';

function sanitizeContentDispositionFileName(value: string) {
  const cleaned = value.replace(/[\r\n"]/g, '').trim();
  return cleaned.length > 0 ? cleaned : 'attachment.pdf';
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class BehaviorController {
  constructor(private readonly service: BehaviorService) {}

  @Post('students/:studentId/behavior-records')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STAFF', 'SUPPLY_TEACHER')
  createForStudent(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
    @Body() body: CreateBehaviorRecordDto,
  ) {
    return this.service.createForStudent(req.user, studentId, body);
  }

  @Get('students/:studentId/behavior-records')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STAFF', 'SUPPLY_TEACHER')
  listForStudent(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
    @Query() query: ListBehaviorRecordsQueryDto,
  ) {
    return this.service.listForStudent(req.user, studentId, query);
  }

  @Get('behavior-records')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STAFF', 'SUPPLY_TEACHER')
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListBehaviorRecordsQueryDto,
  ) {
    return this.service.list(req.user, query);
  }

  @Get('behavior/students')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STAFF', 'SUPPLY_TEACHER')
  listStudents(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListBehaviorStudentsQueryDto,
  ) {
    return this.service.listStudents(req.user, query);
  }

  @Get('behavior/students/:studentId/prefill')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STAFF', 'SUPPLY_TEACHER')
  getStudentPrefill(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.service.getStudentPrefill(req.user, studentId);
  }

  @Get('behavior-records/:id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STAFF', 'SUPPLY_TEACHER')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.findOne(req.user, id);
  }

  @Patch('behavior-records/:id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STAFF', 'SUPPLY_TEACHER')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateBehaviorRecordDto,
  ) {
    return this.service.update(req.user, id, body);
  }

  @Get('behavior-categories')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STAFF', 'SUPPLY_TEACHER')
  listCategories(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListBehaviorCategoryOptionsQueryDto,
  ) {
    return this.service.listCategories(req.user, {
      includeInactive: query.includeInactive ?? false,
      schoolId: query.schoolId,
    });
  }

  @Post('behavior-categories')
  @Roles('OWNER', 'SUPER_ADMIN')
  createCategory(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateBehaviorCategoryOptionDto,
  ) {
    return this.service.createCategory(req.user, body);
  }

  @Patch('behavior-categories/:id')
  @Roles('OWNER', 'SUPER_ADMIN')
  updateCategory(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateBehaviorCategoryOptionDto,
  ) {
    return this.service.updateCategory(req.user, id, body);
  }

  @Patch('behavior-categories/:id/activate')
  @Roles('OWNER', 'SUPER_ADMIN')
  activateCategory(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.setCategoryActiveState(req.user, id, true);
  }

  @Patch('behavior-categories/:id/deactivate')
  @Roles('OWNER', 'SUPER_ADMIN')
  deactivateCategory(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.setCategoryActiveState(req.user, id, false);
  }

  @Post('behavior-records/:id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STAFF', 'SUPPLY_TEACHER')
  uploadAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) behaviorRecordId: string,
    @UploadedFile() file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    } | null,
  ) {
    return this.service.uploadAttachment(req.user, behaviorRecordId, file);
  }

  @Get('behavior-records/:id/attachments')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STAFF', 'SUPPLY_TEACHER')
  listAttachments(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) behaviorRecordId: string,
  ) {
    return this.service.listAttachments(req.user, behaviorRecordId);
  }

  @Get('behavior-records/:id/attachments/:attachmentId/download')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STAFF', 'SUPPLY_TEACHER')
  async downloadAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) behaviorRecordId: string,
    @Param('attachmentId', NonEmptyStringPipe) attachmentId: string,
    @Res() res: Response,
  ) {
    const download = await this.service.getAttachmentDownload(
      req.user,
      behaviorRecordId,
      attachmentId,
    );
    res.setHeader('Content-Type', download.contentType ?? 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${sanitizeContentDispositionFileName(download.attachment.originalFileName)}"`,
    );
    if (download.contentLength !== null && download.contentLength !== undefined) {
      res.setHeader('Content-Length', `${download.contentLength}`);
    }

    return res.send(download.body);
  }

  @Delete('behavior-records/:id/attachments/:attachmentId')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  deleteAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) behaviorRecordId: string,
    @Param('attachmentId', NonEmptyStringPipe) attachmentId: string,
  ) {
    return this.service.deleteAttachment(req.user, behaviorRecordId, attachmentId);
  }
}
