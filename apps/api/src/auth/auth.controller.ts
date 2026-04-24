import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { LoginDto } from './dto/login.dto';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body.username, body.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req: AuthenticatedRequest) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARENT')
  @Patch('me/profile')
  updateMyProfile(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateMyProfileDto,
  ) {
    return this.authService.updateMyProfile(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARENT')
  @Post('me/change-password')
  changeMyPassword(
    @Req() req: AuthenticatedRequest,
    @Body() body: ChangePasswordDto,
  ) {
    return this.authService.changeMyPassword(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PARENT')
  @Get('me/security')
  getMySecurity(@Req() req: AuthenticatedRequest) {
    return this.authService.getMySecurity(req.user.id);
  }
}
