import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { UpdateAuditSettingsDto } from './dto/update-audit-settings.dto';
import { SettingsService } from './settings.service';

@Controller(['settings', 'api/settings'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('audit')
  @Roles('OWNER', 'SUPER_ADMIN')
  getAuditSettings(@Req() req: AuthenticatedRequest) {
    return this.settingsService.getAuditSettings(req.user);
  }

  @Patch('audit')
  @Roles('OWNER', 'SUPER_ADMIN')
  updateAuditSettings(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateAuditSettingsDto,
  ) {
    return this.settingsService.updateAuditSettings(req.user, body.enabled);
  }
}
