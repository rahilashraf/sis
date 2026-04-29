import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth/auth-user';
import { LoginDto } from './dto/login.dto';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  resolveAuthCookieClearOptions,
  resolveAuthCookieName,
  resolveAuthCookieOptions,
} from './auth-cookie.util';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: {
      limit: Number.parseInt(process.env.LOGIN_THROTTLE_LIMIT ?? '8', 10),
      ttl: Number.parseInt(
        process.env.LOGIN_THROTTLE_TTL_MS ?? `${60_000}`,
        10,
      ),
      blockDuration: Number.parseInt(
        process.env.LOGIN_THROTTLE_BLOCK_DURATION_MS ?? `${5 * 60_000}`,
        10,
      ),
      getTracker: (req) => {
        const ip =
          typeof req.ip === 'string' && req.ip.trim().length > 0
            ? req.ip.trim()
            : 'unknown-ip';
        const username =
          typeof req.body?.username === 'string'
            ? req.body.username.trim().toLowerCase()
            : 'unknown-user';
        return `${ip}:${username}`;
      },
    },
  })
  @Post('login')
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const response = await this.authService.login(body.username, body.password);
    res.cookie(
      resolveAuthCookieName(),
      response.accessToken,
      resolveAuthCookieOptions(),
    );
    return response;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(resolveAuthCookieName(), resolveAuthCookieClearOptions());
    return { success: true };
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
