import {
  Body,
  Controller,
  DefaultValuePipe,
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
import { AssessmentResultStatusLabelsService } from './assessment-result-status-labels.service';
import { CreateAssessmentResultStatusLabelDto } from './dto/create-assessment-result-status-label.dto';
import { UpdateAssessmentResultStatusLabelDto } from './dto/update-assessment-result-status-label.dto';

@Controller('assessment-result-status-labels')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssessmentResultStatusLabelsController {
  constructor(private readonly service: AssessmentResultStatusLabelsService) {}

  @Get()
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN', 'STAFF', 'TEACHER')
  list(
    @Req() req: AuthenticatedRequest,
    @Query('schoolId', NonEmptyStringPipe) schoolId: string,
    @Query('includeInactive', new DefaultValuePipe(false), ParseBoolPipe)
    includeInactive: boolean,
  ) {
    return this.service.list(req.user, { schoolId, includeInactive });
  }

  @Post()
  @Roles('OWNER', 'SUPER_ADMIN')
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateAssessmentResultStatusLabelDto) {
    return this.service.create(req.user, body);
  }

  @Patch(':id')
  @Roles('OWNER', 'SUPER_ADMIN')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', NonEmptyStringPipe) id: string,
    @Body() body: UpdateAssessmentResultStatusLabelDto,
  ) {
    return this.service.update(req.user, id, body);
  }
}
