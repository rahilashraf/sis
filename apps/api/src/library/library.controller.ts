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
import { CheckoutLibraryLoanDto } from './dto/checkout-library-loan.dto';
import { CreateLibraryItemDto } from './dto/create-library-item.dto';
import { ListLibraryItemsQueryDto } from './dto/list-library-items-query.dto';
import { ListLibraryLoansQueryDto } from './dto/list-library-loans-query.dto';
import { ListLibraryOverdueQueryDto } from './dto/list-library-overdue-query.dto';
import { ReturnLibraryLoanDto } from './dto/return-library-loan.dto';
import { UpdateLibraryItemDto } from './dto/update-library-item.dto';
import { LibraryService } from './library.service';

@Controller('library')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LibraryController {
  constructor(private readonly service: LibraryService) {}

  @Get('items')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  listItems(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListLibraryItemsQueryDto,
  ) {
    return this.service.listItems(req.user, query);
  }

  @Post('items')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  createItem(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateLibraryItemDto,
  ) {
    return this.service.createItem(req.user, body);
  }

  @Patch('items/:id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  updateItem(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateLibraryItemDto,
  ) {
    return this.service.updateItem(req.user, id, body);
  }

  @Post('loans/checkout')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  checkout(
    @Req() req: AuthenticatedRequest,
    @Body() body: CheckoutLibraryLoanDto,
  ) {
    return this.service.checkoutLoan(req.user, body);
  }

  @Post('loans/:id/return')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  returnLoan(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: ReturnLibraryLoanDto,
  ) {
    return this.service.returnLoan(req.user, id, body);
  }

  @Get('loans')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  listLoans(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListLibraryLoansQueryDto,
  ) {
    return this.service.listLoans(req.user, query);
  }

  @Get('overdue')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  listOverdue(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListLibraryOverdueQueryDto,
  ) {
    return this.service.listOverdue(req.user, query);
  }

  @Get('parent/students/:studentId/loans')
  @Roles('PARENT')
  listParentStudentLoans(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.service.listParentStudentLoans(req.user, studentId);
  }
}
