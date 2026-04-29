import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { DataImportService } from './data-import.service';
import { DataImportDto } from './dto/data-import.dto';

@Controller('data-import')
export class DataImportController {
  constructor(private readonly dataImportService: DataImportService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Post('preview')
  preview(@Req() req: AuthenticatedRequest, @Body() body: DataImportDto) {
    return this.dataImportService.preview(req.user, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN', 'ADMIN')
  @Post('execute')
  execute(@Req() req: AuthenticatedRequest, @Body() body: DataImportDto) {
    return this.dataImportService.execute(req.user, body);
  }
}
