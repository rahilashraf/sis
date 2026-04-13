import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
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
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { SubmitFormDto } from './dto/submit-form.dto';
import { GetParentFormQueryDto } from './dto/get-parent-form-query.dto';
import { FormsService } from './forms.service';

@Controller('forms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FormsController {
  constructor(private readonly service: FormsService) {}

  @Post()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateFormDto) {
    return this.service.create(req.user, body);
  }

  @Get()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  list(
    @Req() req: AuthenticatedRequest,
    @Query('schoolId') schoolId?: string,
    @Query('includeInactive', new DefaultValuePipe(false), ParseBoolPipe)
    includeInactive?: boolean,
  ) {
    return this.service.list(req.user, {
      schoolId,
      includeInactive: includeInactive ?? false,
    });
  }

  @Get('for-parent')
  @Roles('PARENT')
  listForParent(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetParentFormQueryDto,
  ) {
    return this.service.listForParent(req.user, query.studentId);
  }

  @Get('active')
  @Roles('PARENT')
  listActiveForParent(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetParentFormQueryDto,
  ) {
    return this.service.listActiveForParent(req.user, query.studentId);
  }

  @Get(':id/for-parent')
  @Roles('PARENT')
  getForParent(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Query() query: GetParentFormQueryDto,
  ) {
    return this.service.getForParent(req.user, id, query.studentId);
  }

  @Post(':id/submit')
  @Roles('PARENT')
  submit(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: SubmitFormDto,
  ) {
    return this.service.submit(req.user, id, body);
  }

  @Get(':id/responses')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  getResponses(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.getResponses(req.user, id);
  }

  @Get(':id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.findOne(req.user, id);
  }

  @Patch(':id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateFormDto,
  ) {
    return this.service.update(req.user, id, body);
  }

  @Patch(':id/archive')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  archive(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.setActiveState(req.user, id, false);
  }

  @Patch(':id/activate')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  activate(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.setActiveState(req.user, id, true);
  }

  @Delete(':id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.remove(req.user, id);
  }
}
