import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { safeUserSelect } from '../common/prisma/safe-user-response';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(username: string, password: string) {
    this.logger.log({
      event: 'AUTH_LOGIN_ATTEMPT',
      username,
    });

    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        passwordHash: true,
        ...safeUserSelect,
      },
    });

    this.logger.log({
      event: 'AUTH_LOGIN_USER_LOOKUP',
      username,
      userFound: Boolean(user),
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log({
      event: 'AUTH_LOGIN_USER_STATUS',
      username,
      userId: user.id,
      isActive: user.isActive,
    });

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    this.logger.log({
      event: 'AUTH_LOGIN_PASSWORD_CHECK',
      username,
      userId: user.id,
      passwordMatch: isMatch,
    });

    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    this.logger.log({
      event: 'AUTH_LOGIN_TOKEN_CREATED',
      username,
      userId: user.id,
      tokenCreated: Boolean(accessToken),
    });

    const safeUser = { ...user };
    delete (safeUser as { passwordHash?: string }).passwordHash;

    return {
      accessToken,
      user: safeUser,
    };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: safeUserSelect,
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    return user;
  }
}
