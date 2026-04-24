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
import { CreateUniformOrderDto } from './dto/create-uniform-order.dto';
import { ListParentUniformOrdersQueryDto } from './dto/list-parent-uniform-orders-query.dto';
import { ListUniformOrdersQueryDto } from './dto/list-uniform-orders-query.dto';
import { UpdateParentUniformOrderDto } from './dto/update-parent-uniform-order.dto';
import { UpdateUniformOrderStatusDto } from './dto/update-uniform-order-status.dto';
import { UniformService } from './uniform.service';

@Controller('uniform-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UniformOrdersController {
  constructor(private readonly service: UniformService) {}

  @Post()
  @Roles('PARENT')
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateUniformOrderDto,
  ) {
    return this.service.createOrder(req.user, body);
  }

  @Get('parent')
  @Roles('PARENT')
  listParent(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListParentUniformOrdersQueryDto,
  ) {
    return this.service.listParentOrders(req.user, query);
  }

  @Patch(':id/parent-edit')
  @Roles('PARENT')
  updateParentOrder(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateParentUniformOrderDto,
  ) {
    return this.service.updateParentOrder(req.user, id, body);
  }

  @Post(':id/parent-cancel')
  @Roles('PARENT')
  cancelParentOrder(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.cancelParentOrder(req.user, id);
  }

  @Get()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListUniformOrdersQueryDto,
  ) {
    return this.service.listOrders(req.user, query);
  }

  @Get(':id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'PARENT')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.getOrder(req.user, id);
  }

  @Patch(':id/status')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateUniformOrderStatusDto,
  ) {
    return this.service.updateOrderStatus(req.user, id, body);
  }
}
