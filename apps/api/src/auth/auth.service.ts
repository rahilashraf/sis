import {
  BadRequestException,
  ConflictException,
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
  private static readonly DUMMY_PASSWORD_HASH =
    '$2b$10$CwTycUXWue0Thq9StjUM0uJ8iK88v8gY4xXHzkwmo7aX6ixSeKuu2';
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        passwordHash: true,
        ...safeUserSelect,
      },
    });

    if (!user) {
      await this.consumeFailedLoginCost(password);
      this.logger.warn({
        event: 'AUTH_LOGIN_REJECTED',
        reason: 'INVALID_CREDENTIALS',
      });
      await this.auditService.logCritical({
        entityType: 'Auth',
        action: 'LOGIN_FAILED',
        summary: `Failed login attempt for username ${username}`,
        targetDisplay: username,
        metadataJson: {
          reason: 'USER_NOT_FOUND',
        },
      });
      await this.delayFailedLogin();
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      await this.consumeFailedLoginCost(password, user.passwordHash);
      this.logger.warn({
        event: 'AUTH_LOGIN_REJECTED',
        reason: 'INACTIVE_USER',
        userId: user.id,
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
        action: 'LOGIN_FAILED',
        summary: `Failed login for inactive user ${user.username}`,
        targetDisplay: user.username,
        metadataJson: {
          reason: 'INACTIVE_USER',
        },
      });
      await this.delayFailedLogin();
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      this.logger.warn({
        event: 'AUTH_LOGIN_REJECTED',
        reason: 'INVALID_CREDENTIALS',
        userId: user.id,
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
        action: 'LOGIN_FAILED',
        summary: `Failed login due to invalid password for user ${user.username}`,
        targetDisplay: user.username,
        metadataJson: {
          reason: 'INVALID_PASSWORD',
        },
      });
      await this.delayFailedLogin();
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    this.logger.log({
      event: 'AUTH_LOGIN_SUCCESS',
      userId: user.id,
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

  private normalizeComparableValue(value: string | null | undefined) {
    if (typeof value !== 'string') {
      return '';
    }

    const trimmed = value.trim().toLowerCase();
    return trimmed;
  }

  private normalizeComparablePhone(value: string | null | undefined) {
    if (typeof value !== 'string') {
      return '';
    }

    return value.replace(/\D+/g, '');
  }

  private buildFullName(firstName: string, lastName: string) {
    return `${firstName} ${lastName}`.trim();
  }

  private valuesMatchText(
    left: string | null | undefined,
    right: string | null | undefined,
  ) {
    const leftValue = this.normalizeComparableValue(left);
    const rightValue = this.normalizeComparableValue(right);

    return leftValue.length > 0 && rightValue.length > 0 && leftValue === rightValue;
  }

  private valuesMatchPhone(
    left: string | null | undefined,
    right: string | null | undefined,
  ) {
    const leftValue = this.normalizeComparablePhone(left);
    const rightValue = this.normalizeComparablePhone(right);

    return leftValue.length > 0 && rightValue.length > 0 && leftValue === rightValue;
  }

  async updateMyProfile(userId: string, data: UpdateMyProfileDto) {
    const updateData: {
      firstName?: string;
      lastName?: string;
      email?: string | null;
      phone?: string;
    } = {};

    if (data.firstName !== undefined) {
      updateData.firstName = data.firstName;
    }

    if (data.lastName !== undefined) {
      updateData.lastName = data.lastName;
    }

    if (data.email !== undefined) {
      updateData.email = data.email;
    }

    if (data.phone !== undefined) {
      updateData.phone = data.phone;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid profile fields provided');
    }

    return this.prisma.$transaction(async (tx) => {
      const existingParent = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      });

      if (!existingParent) {
        throw new UnauthorizedException('User not found');
      }

      if (existingParent.role !== 'PARENT') {
        throw new UnauthorizedException('User is not authorized');
      }

      if (updateData.email !== undefined) {
        const conflictingUser = await tx.user.findFirst({
          where: {
            id: { not: userId },
            email: {
              equals: updateData.email,
              mode: 'insensitive',
            },
          },
          select: { id: true },
        });

        if (conflictingUser) {
          throw new ConflictException('Email is already in use by another user');
        }
      }

      const updatedParent = await tx.user.update({
        where: { id: userId },
        data: updateData,
        select: safeUserSelect,
      });

      const previousFullName = this.buildFullName(
        existingParent.firstName,
        existingParent.lastName,
      );
      const updatedFullName = this.buildFullName(
        updatedParent.firstName,
        updatedParent.lastName,
      );
      const fullNameChanged =
        this.normalizeComparableValue(previousFullName) !==
        this.normalizeComparableValue(updatedFullName);
      const emailChanged =
        this.normalizeComparableValue(existingParent.email) !==
        this.normalizeComparableValue(updatedParent.email);
      const phoneChanged =
        this.normalizeComparablePhone(existingParent.phone) !==
        this.normalizeComparablePhone(updatedParent.phone);

      if (!fullNameChanged && !emailChanged && !phoneChanged) {
        return updatedParent;
      }

      const linkedStudents = await tx.studentParentLink.findMany({
        where: { parentId: existingParent.id },
        select: {
          student: {
            select: {
              id: true,
              guardian1Name: true,
              guardian1Email: true,
              guardian1Phone: true,
              guardian2Name: true,
              guardian2Email: true,
              guardian2Phone: true,
            },
          },
        },
      });

      for (const link of linkedStudents) {
        const student = link.student;
        const studentUpdateData: {
          guardian1Name?: string | null;
          guardian1Email?: string | null;
          guardian1Phone?: string | null;
          guardian2Name?: string | null;
          guardian2Email?: string | null;
          guardian2Phone?: string | null;
        } = {};

        const guardian1MatchesParent =
          this.valuesMatchText(student.guardian1Email, existingParent.email) ||
          this.valuesMatchText(student.guardian1Name, previousFullName) ||
          this.valuesMatchPhone(student.guardian1Phone, existingParent.phone);
        const guardian2MatchesParent =
          this.valuesMatchText(student.guardian2Email, existingParent.email) ||
          this.valuesMatchText(student.guardian2Name, previousFullName) ||
          this.valuesMatchPhone(student.guardian2Phone, existingParent.phone);

        if (guardian1MatchesParent) {
          if (
            fullNameChanged &&
            this.valuesMatchText(student.guardian1Name, previousFullName)
          ) {
            studentUpdateData.guardian1Name = updatedFullName;
          }

          if (
            emailChanged &&
            this.valuesMatchText(student.guardian1Email, existingParent.email)
          ) {
            studentUpdateData.guardian1Email = updatedParent.email;
          }

          if (
            phoneChanged &&
            this.valuesMatchPhone(student.guardian1Phone, existingParent.phone)
          ) {
            studentUpdateData.guardian1Phone = updatedParent.phone;
          }
        }

        if (guardian2MatchesParent) {
          if (
            fullNameChanged &&
            this.valuesMatchText(student.guardian2Name, previousFullName)
          ) {
            studentUpdateData.guardian2Name = updatedFullName;
          }

          if (
            emailChanged &&
            this.valuesMatchText(student.guardian2Email, existingParent.email)
          ) {
            studentUpdateData.guardian2Email = updatedParent.email;
          }

          if (
            phoneChanged &&
            this.valuesMatchPhone(student.guardian2Phone, existingParent.phone)
          ) {
            studentUpdateData.guardian2Phone = updatedParent.phone;
          }
        }

        if (Object.keys(studentUpdateData).length === 0) {
          continue;
        }

        await tx.user.update({
          where: { id: student.id },
          data: studentUpdateData,
          select: { id: true },
        });
      }

      return updatedParent;
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

  private async consumeFailedLoginCost(
    password: string,
    hash?: string,
  ): Promise<void> {
    const hashToCheck = hash ?? AuthService.DUMMY_PASSWORD_HASH;
    try {
      await bcrypt.compare(password, hashToCheck);
    } catch {
      // Ignore timing equalization failures to keep auth flow resilient.
    }
  }

  private async delayFailedLogin(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const baseDelayMs = Number.parseInt(
      process.env.LOGIN_FAILURE_DELAY_MS ?? '200',
      10,
    );
    const jitterMs = Number.parseInt(
      process.env.LOGIN_FAILURE_DELAY_JITTER_MS ?? '150',
      10,
    );
    const safeBaseDelay = Number.isFinite(baseDelayMs)
      ? Math.max(baseDelayMs, 0)
      : 200;
    const safeJitter = Number.isFinite(jitterMs) ? Math.max(jitterMs, 0) : 150;
    const delayMs = safeBaseDelay + Math.floor(Math.random() * (safeJitter + 1));

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
