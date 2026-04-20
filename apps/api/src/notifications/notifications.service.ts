import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
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
}
