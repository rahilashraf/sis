import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationBroadcastDto } from './dto/create-notification-broadcast.dto';
import { CreateStudentNotificationAlertDto } from './dto/create-student-notification-alert.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

const notificationSelect = Prisma.validator<Prisma.NotificationSelect>()({
  id: true,
  schoolId: true,
  recipientUserId: true,
  type: true,
  title: true,
  message: true,
  entityType: true,
  entityId: true,
  isRead: true,
  readAt: true,
  createdAt: true,
});

export type CreateNotificationInput = {
  schoolId?: string | null;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private canSendStudentAlerts(role: UserRole) {
    return (
      role === UserRole.OWNER ||
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.ADMIN ||
      role === UserRole.STAFF ||
      role === UserRole.TEACHER ||
      role === UserRole.SUPPLY_TEACHER
    );
  }

  private canSendBroadcast(role: UserRole) {
    return (
      role === UserRole.OWNER ||
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.ADMIN
    );
  }

  private buildDefaultStudentAlertTitle(type: NotificationType, studentName: string) {
    if (type === NotificationType.FORM_REMINDER) {
      return `Form reminder for ${studentName}`;
    }
    if (type === NotificationType.ATTENDANCE_ALERT) {
      return `Attendance alert for ${studentName}`;
    }
    if (type === NotificationType.LOW_GRADE_ALERT) {
      return `Low progress alert for ${studentName}`;
    }
    return `New published grade for ${studentName}`;
  }

  private buildDefaultStudentAlertMessage(type: NotificationType, studentName: string) {
    if (type === NotificationType.FORM_REMINDER) {
      return `A form requires attention for ${studentName}.`;
    }
    if (type === NotificationType.ATTENDANCE_ALERT) {
      return `Attendance needs review for ${studentName}.`;
    }
    if (type === NotificationType.LOW_GRADE_ALERT) {
      return `Progress is below target for ${studentName}.`;
    }
    return `A new grade has been published for ${studentName}.`;
  }

  createOne(input: CreateNotificationInput) {
    return this.prisma.notification.create({
      data: {
        schoolId: input.schoolId ?? null,
        recipientUserId: input.recipientUserId,
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
      select: notificationSelect,
    });
  }

  createMany(inputs: CreateNotificationInput[]) {
    if (inputs.length === 0) {
      return Promise.resolve({ count: 0 });
    }

    return this.prisma.notification.createMany({
      data: inputs.map((input) => ({
        schoolId: input.schoolId ?? null,
        recipientUserId: input.recipientUserId,
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      })),
    });
  }

  listForUser(user: AuthenticatedUser, query: ListNotificationsQueryDto) {
    return this.prisma.notification.findMany({
      where: {
        recipientUserId: user.id,
        ...(query.unreadOnly ? { isRead: false } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: query.limit ?? 25,
      select: notificationSelect,
    });
  }

  async getUnreadCount(user: AuthenticatedUser) {
    const count = await this.prisma.notification.count({
      where: {
        recipientUserId: user.id,
        isRead: false,
      },
    });

    return { count };
  }

  async markAsRead(user: AuthenticatedUser, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, recipientUserId: user.id },
      select: { id: true, isRead: true },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.isRead) {
      return this.prisma.notification.findUnique({
        where: { id },
        select: notificationSelect,
      });
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
      select: notificationSelect,
    });
  }

  async markAllAsRead(user: AuthenticatedUser) {
    const result = await this.prisma.notification.updateMany({
      where: {
        recipientUserId: user.id,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { count: result.count };
  }

  async createStudentAlert(
    actor: AuthenticatedUser,
    input: CreateStudentNotificationAlertDto,
  ) {
    if (!this.canSendStudentAlerts(actor.role)) {
      throw new ForbiddenException('You do not have permission to send student alerts');
    }

    const includeStudent = input.includeStudent ?? true;
    const includeParents = input.includeParents ?? true;

    if (!includeStudent && !includeParents) {
      throw new BadRequestException('At least one recipient group must be enabled');
    }

    const student = await this.prisma.user.findFirst({
      where: {
        id: input.studentId,
        role: UserRole.STUDENT,
        isActive: true,
      },
      select: {
        id: true,
        schoolId: true,
        firstName: true,
        lastName: true,
        memberships: {
          where: { isActive: true },
          select: { schoolId: true },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const studentSchoolId = student.memberships[0]?.schoolId ?? student.schoolId ?? null;
    if (!isBypassRole(actor.role)) {
      const actorSchoolIds = getAccessibleSchoolIds(actor);
      const studentSchoolIds = new Set(
        [
          student.schoolId ?? null,
          ...student.memberships.map((membership) => membership.schoolId),
        ].filter((schoolId): schoolId is string => Boolean(schoolId)),
      );
      const hasOverlap = actorSchoolIds.some((schoolId) => studentSchoolIds.has(schoolId));
      if (!hasOverlap) {
        throw new ForbiddenException('You do not have school access');
      }
    }

    const recipientUserIds = new Set<string>();
    if (includeStudent) {
      recipientUserIds.add(student.id);
    }

    if (includeParents) {
      const parentLinks = await this.prisma.studentParentLink.findMany({
        where: {
          studentId: student.id,
          parent: {
            isActive: true,
            role: UserRole.PARENT,
          },
        },
        select: { parentId: true },
      });
      for (const link of parentLinks) {
        recipientUserIds.add(link.parentId);
      }
    }

    const recipients = Array.from(recipientUserIds);
    if (recipients.length === 0) {
      return { count: 0, recipients: 0 };
    }

    const studentName =
      `${student.firstName} ${student.lastName}`.trim() || 'Student';
    const title =
      input.title?.trim() ||
      this.buildDefaultStudentAlertTitle(input.type, studentName);
    const message =
      input.message?.trim() ||
      this.buildDefaultStudentAlertMessage(input.type, studentName);

    const result = await this.createMany(
      recipients.map((recipientUserId) => ({
        schoolId: studentSchoolId,
        recipientUserId,
        type: input.type,
        title,
        message,
        entityType: input.entityType?.trim() || null,
        entityId: input.entityId?.trim() || null,
      })),
    );

    return {
      count: result.count,
      recipients: recipients.length,
      studentId: student.id,
      type: input.type,
    };
  }

  async createBroadcast(
    actor: AuthenticatedUser,
    input: CreateNotificationBroadcastDto,
  ) {
    if (!this.canSendBroadcast(actor.role)) {
      throw new ForbiddenException('You do not have permission to send broadcasts');
    }

    const requestedSchoolId = input.schoolId?.trim() || null;
    const title = input.title.trim();
    const message = input.message.trim();
    if (!title || !message) {
      throw new BadRequestException('Title and message are required');
    }

    const targetRoles =
      input.targetRoles && input.targetRoles.length > 0
        ? input.targetRoles
        : [
            UserRole.PARENT,
            UserRole.STUDENT,
            UserRole.TEACHER,
            UserRole.SUPPLY_TEACHER,
            UserRole.STAFF,
            UserRole.ADMIN,
          ];

    let schoolId = requestedSchoolId;
    if (!isBypassRole(actor.role)) {
      const actorSchoolIds = getAccessibleSchoolIds(actor);
      schoolId = requestedSchoolId ?? actorSchoolIds[0] ?? null;
      if (!schoolId) {
        throw new BadRequestException('A school context is required for this broadcast');
      }
      ensureUserHasSchoolAccess(actor, schoolId);
    }

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: targetRoles },
        ...(schoolId
          ? { memberships: { some: { schoolId, isActive: true } } }
          : {}),
        ...(input.recipientUserIds?.length
          ? { id: { in: input.recipientUserIds } }
          : {}),
      },
      select: { id: true },
      take: 500,
    });

    if (users.length === 0) {
      return { count: 0, recipients: 0 };
    }

    const type =
      input.type &&
      (input.type === NotificationType.SYSTEM_ANNOUNCEMENT ||
        input.type === NotificationType.ADMIN_BROADCAST)
        ? input.type
        : NotificationType.ADMIN_BROADCAST;

    const result = await this.createMany(
      users.map((user) => ({
        schoolId,
        recipientUserId: user.id,
        type,
        title,
        message,
        entityType: 'Broadcast',
        entityId: null,
      })),
    );

    return {
      count: result.count,
      recipients: users.length,
      schoolId,
      type,
      targetRoles,
    };
  }
}
