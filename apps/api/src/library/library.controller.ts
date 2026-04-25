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
import { CreateLibraryHoldDto } from './dto/create-library-hold.dto';
import { CreateLibraryItemDto } from './dto/create-library-item.dto';
import { CreateManualLibraryFineDto } from './dto/create-manual-library-fine.dto';
import { GetLibraryFineSettingsQueryDto } from './dto/get-library-fine-settings-query.dto';
import { ListLibraryFinesQueryDto } from './dto/list-library-fines-query.dto';
import { ListLibraryHoldsQueryDto } from './dto/list-library-holds-query.dto';
import { ListLibraryItemsQueryDto } from './dto/list-library-items-query.dto';
import { ListLibraryLoansQueryDto } from './dto/list-library-loans-query.dto';
import { ListLibraryOverdueQueryDto } from './dto/list-library-overdue-query.dto';
import { AssessLibraryOverdueFinesDto } from './dto/assess-library-overdue-fines.dto';
import { AssessUnclaimedHoldFineDto } from './dto/assess-unclaimed-hold-fine.dto';
import { MarkLibraryLoanLostDto } from './dto/mark-library-loan-lost.dto';
import { ReturnLibraryLoanDto } from './dto/return-library-loan.dto';
import { UpsertLibraryFineSettingsDto } from './dto/upsert-library-fine-settings.dto';
import { UpdateLibraryHoldDto } from './dto/update-library-hold.dto';
import { UpdateLibraryItemDto } from './dto/update-library-item.dto';
import { WaiveLibraryFineDto } from './dto/waive-library-fine.dto';
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

  @Get('items/:id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  findItem(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.findItem(req.user, id);
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

  @Post('loans/:id/mark-lost')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  markLoanLost(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: MarkLibraryLoanLostDto,
  ) {
    return this.service.markLoanLost(req.user, id, body);
  }

  @Post('loans/:id/mark-found')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  markLoanFound(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
  ) {
    return this.service.markLoanFound(req.user, id);
  }

  @Get('catalog')
  @Roles('STUDENT')
  listStudentCatalog(@Req() req: AuthenticatedRequest) {
    return this.service.listStudentCatalog(req.user);
  }

  @Post('holds')
  @Roles('STUDENT')
  createStudentHold(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateLibraryHoldDto,
  ) {
    return this.service.createStudentHold(req.user, body);
  }

  @Get('holds/me')
  @Roles('STUDENT')
  listMyStudentHolds(@Req() req: AuthenticatedRequest) {
    return this.service.listMyStudentHolds(req.user);
  }

  @Get('holds')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  listHolds(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListLibraryHoldsQueryDto,
  ) {
    return this.service.listHolds(req.user, query);
  }

  @Patch('holds/:id')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  updateHold(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateLibraryHoldDto,
  ) {
    return this.service.updateHold(req.user, id, body);
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

  @Get('parent/students/:studentId/holds')
  @Roles('PARENT')
  listParentStudentHolds(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.service.listParentStudentHolds(req.user, studentId);
  }

  @Get('parent/students/:studentId/catalog')
  @Roles('PARENT')
  listParentStudentCatalog(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
  ) {
    return this.service.listParentStudentCatalog(req.user, studentId);
  }

  @Post('parent/students/:studentId/holds')
  @Roles('PARENT')
  createParentStudentHold(
    @Req() req: AuthenticatedRequest,
    @Param('studentId', NonEmptyStringPipe) studentId: string,
    @Body() body: CreateLibraryHoldDto,
  ) {
    return this.service.createParentStudentHold(req.user, studentId, body);
  }

  @Get('fine-settings')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  getFineSettings(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetLibraryFineSettingsQueryDto,
  ) {
    return this.service.getFineSettings(req.user, query.schoolId);
  }

  @Patch('fine-settings')
  @Roles('OWNER', 'SUPER_ADMIN')
  upsertFineSettings(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpsertLibraryFineSettingsDto,
  ) {
    return this.service.upsertFineSettings(req.user, body);
  }

  @Get('fines')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  listFines(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListLibraryFinesQueryDto,
  ) {
    return this.service.listFines(req.user, query);
  }

  @Post('fines/manual')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  createManualFine(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateManualLibraryFineDto,
  ) {
    return this.service.createManualFine(req.user, body);
  }

  @Post('fines/:id/waive')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  waiveFine(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: WaiveLibraryFineDto,
  ) {
    return this.service.waiveFine(req.user, id, body);
  }

  @Post('fines/assess-overdue')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  assessOverdueFines(
    @Req() req: AuthenticatedRequest,
    @Body() body: AssessLibraryOverdueFinesDto,
  ) {
    return this.service.assessOverdueFines(req.user, body);
  }

  @Post('fines/assess-unclaimed-hold')
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF')
  assessUnclaimedHoldFine(
    @Req() req: AuthenticatedRequest,
    @Body() body: AssessUnclaimedHoldFineDto,
  ) {
    return this.service.assessUnclaimedHoldFine(req.user, body);
  }
}
