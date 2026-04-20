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
import { BillingChargesService } from './billing-charges.service';
import { BulkCreateBillingChargeDto } from './dto/bulk-create-billing-charge.dto';
import { CreateBillingChargeDto } from './dto/create-billing-charge.dto';
import { UpdateBillingChargeDto } from './dto/update-billing-charge.dto';
import { VoidBillingChargeDto } from './dto/void-billing-charge.dto';
import { ListBillingChargesQueryDto } from './dto/list-billing-charges-query.dto';

@Controller('billing/charges')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingChargesController {
  constructor(private readonly service: BillingChargesService) {}

  @Get()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListBillingChargesQueryDto,
  ) {
    return this.service.list(req.user, query);
  }

  @Get(':id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.findOne(req.user, id);
  }

  @Post()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateBillingChargeDto,
  ) {
    return this.service.create(req.user, body);
  }

  @Post('bulk')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  bulkCreate(
    @Req() req: AuthenticatedRequest,
    @Body() body: BulkCreateBillingChargeDto,
  ) {
    return this.service.bulkCreate(req.user, body);
  }

  @Patch(':id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateBillingChargeDto,
  ) {
    return this.service.update(req.user, id, body);
  }

  @Post(':id/void')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  voidCharge(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: VoidBillingChargeDto,
  ) {
    return this.service.voidCharge(req.user, id, body);
  }
}
