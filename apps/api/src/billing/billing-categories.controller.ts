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
import { BillingCategoriesService } from './billing-categories.service';
import { CreateBillingCategoryDto } from './dto/create-billing-category.dto';
import { UpdateBillingCategoryDto } from './dto/update-billing-category.dto';
import { ListBillingCategoriesQueryDto } from './dto/list-billing-categories-query.dto';

@Controller('billing/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingCategoriesController {
  constructor(private readonly service: BillingCategoriesService) {}

  @Get()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListBillingCategoriesQueryDto,
  ) {
    return this.service.list(req.user, {
      schoolId: query.schoolId,
      includeInactive: query.includeInactive ?? false,
    });
  }

  @Post()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateBillingCategoryDto,
  ) {
    return this.service.create(req.user, body);
  }

  @Patch(':id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateBillingCategoryDto,
  ) {
    return this.service.update(req.user, id, body);
  }

  @Patch(':id/archive')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  archive(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.archive(req.user, id);
  }
}
