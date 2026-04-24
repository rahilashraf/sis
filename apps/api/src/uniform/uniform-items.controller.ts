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
import { CreateUniformItemDto } from './dto/create-uniform-item.dto';
import { ListParentUniformItemsQueryDto } from './dto/list-parent-uniform-items-query.dto';
import { ListUniformItemsQueryDto } from './dto/list-uniform-items-query.dto';
import { UpdateUniformItemDto } from './dto/update-uniform-item.dto';
import { UniformService } from './uniform.service';

@Controller('uniform-items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UniformItemsController {
  constructor(private readonly service: UniformService) {}

  @Get('parent')
  @Roles('PARENT')
  listForParent(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListParentUniformItemsQueryDto,
  ) {
    return this.service.listParentItems(req.user, query);
  }

  @Get()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListUniformItemsQueryDto,
  ) {
    return this.service.listItems(req.user, query);
  }

  @Get(':id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.getItem(req.user, id);
  }

  @Post()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateUniformItemDto,
  ) {
    return this.service.createItem(req.user, body);
  }

  @Patch(':id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateUniformItemDto,
  ) {
    return this.service.updateItem(req.user, id, body);
  }

  @Patch(':id/archive')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  archive(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.setItemActiveState(req.user, id, false);
  }

  @Patch(':id/activate')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  activate(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.setItemActiveState(req.user, id, true);
  }
}
