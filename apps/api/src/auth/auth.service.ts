import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import {
  safeUserSchoolMembershipSelect,
  safeUserSelect,
} from '../common/prisma/safe-user-response';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private readonly auditService: AuditService,
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
      await this.auditService.logCritical({
        entityType: 'Auth',
        action: 'LOGIN_FAILED',
        summary: `Failed login attempt for username ${username}`,
        targetDisplay: username,
        metadataJson: {
          reason: 'USER_NOT_FOUND',
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log({
      event: 'AUTH_LOGIN_USER_STATUS',
      username,
      userId: user.id,
      isActive: user.isActive,
    });

    if (!user.isActive) {
      await this.auditService.logCritical({
        actor: {
          id: user.id,
          role: user.role,
          memberships: user.memberships,
        },
        schoolId: user.schoolId ?? user.memberships[0]?.schoolId ?? null,
        entityType: 'Auth',
        entityId: user.id,
        action: 'LOGIN_FAILED',
        summary: `Failed login for inactive user ${user.username}`,
        targetDisplay: user.username,
        metadataJson: {
          reason: 'INACTIVE_USER',
        },
      });
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
      await this.auditService.logCritical({
        actor: {
          id: user.id,
          role: user.role,
          memberships: user.memberships,
        },
        schoolId: user.schoolId ?? user.memberships[0]?.schoolId ?? null,
        entityType: 'Auth',
        entityId: user.id,
        action: 'LOGIN_FAILED',
        summary: `Failed login due to invalid password for user ${user.username}`,
        targetDisplay: user.username,
        metadataJson: {
          reason: 'INVALID_PASSWORD',
        },
      });
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

    await this.auditService.logCritical({
      actor: {
        id: user.id,
        role: user.role,
        memberships: user.memberships,
      },
      schoolId: user.schoolId ?? user.memberships[0]?.schoolId ?? null,
      entityType: 'Auth',
      entityId: user.id,
      action: 'LOGIN_SUCCESS',
      summary: `User ${user.username} logged in successfully`,
      targetDisplay: user.username,
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

  async updateMyProfile(userId: string, data: UpdateMyProfileDto) {
    const updateData: {
      firstName?: string;
      lastName?: string;
      phone?: string;
    } = {};

    if (data.firstName !== undefined) {
      updateData.firstName = data.firstName;
    }

    if (data.lastName !== undefined) {
      updateData.lastName = data.lastName;
    }

    if (data.phone !== undefined) {
      updateData.phone = data.phone;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid profile fields provided');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: safeUserSelect,
    });
  }

  async changeMyPassword(userId: string, data: ChangePasswordDto) {
    if (data.newPassword !== data.confirmPassword) {
      throw new BadRequestException(
        'New password and confirm password must match',
      );
    }

    if (data.currentPassword === data.newPassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true,
        schoolId: true,
        role: true,
        memberships: {
          where: {
            isActive: true,
          },
          select: safeUserSchoolMembershipSelect,
        },
        passwordHash: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    const passwordMatches = await bcrypt.compare(
      data.currentPassword,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
      },
    });

    await this.auditService.logCritical({
      actor: {
        id: user.id,
        role: user.role,
        memberships: user.memberships,
      },
      schoolId: user.schoolId ?? user.memberships[0]?.schoolId ?? null,
      entityType: 'User',
      entityId: user.id,
      action: 'PASSWORD_CHANGED',
      summary: 'User changed account password',
    });

    return {
      success: true,
      message: 'Password changed successfully',
      shouldReauthenticate: true,
      sessionInvalidationSupported: false,
    };
  }

  async getMySecurity(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const linkedChildrenCount = await this.prisma.studentParentLink.count({
      where: {
        parentId: userId,
      },
    });

    return {
      username: user.username,
      email: user.email,
      role: user.role,
      linkedChildrenCount,
      mfaEnabled: false,
      activeSessionsTracked: false,
      lastPasswordChangeAt: null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
