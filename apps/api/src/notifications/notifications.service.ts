import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AnnouncementAudience,
  AnnouncementTargetType,
  NotificationType,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { EmailService } from '../email/email.service';
import { FeatureTogglesService } from '../feature-toggles/feature-toggles.service';
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

export type CreateAnnouncementNotificationInput = {
  announcementId: string;
  schoolId: string;
  authorId: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  targets: Array<{
    targetType: AnnouncementTargetType;
    gradeLevelId: string | null;
    classId: string | null;
    studentId: string | null;
  }>;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly featureTogglesService: FeatureTogglesService,
  ) {}

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

  private includesParents(audience: AnnouncementAudience) {
    return (
      audience === AnnouncementAudience.PARENTS ||
      audience === AnnouncementAudience.PARENTS_AND_STUDENTS
    );
  }

  private includesStudents(audience: AnnouncementAudience) {
    return (
      audience === AnnouncementAudience.STUDENTS ||
      audience === AnnouncementAudience.PARENTS_AND_STUDENTS
    );
  }

  private async getSchoolScopedUserIds(options: {
    schoolId: string;
    role: UserRole;
  }) {
    const users = await this.prisma.user.findMany({
      where: {
        role: options.role,
        isActive: true,
        OR: [
          { schoolId: options.schoolId },
          {
            memberships: {
              some: {
                schoolId: options.schoolId,
                isActive: true,
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    return users.map((user) => user.id);
  }

  private async getStudentsForTargets(options: {
    schoolId: string;
    gradeLevelIds: string[];
    classIds: string[];
    explicitStudentIds: string[];
  }) {
    const studentIds = new Set<string>();

    if (options.gradeLevelIds.length > 0) {
      const studentsByGrade = await this.prisma.user.findMany({
        where: {
          role: UserRole.STUDENT,
          isActive: true,
          gradeLevelId: {
            in: options.gradeLevelIds,
          },
          OR: [
            { schoolId: options.schoolId },
            {
              memberships: {
                some: {
                  schoolId: options.schoolId,
                  isActive: true,
                },
              },
            },
          ],
        },
        select: {
          id: true,
        },
      });

      for (const student of studentsByGrade) {
        studentIds.add(student.id);
      }
    }

    if (options.classIds.length > 0) {
      const studentsByClass = await this.prisma.studentClassEnrollment.findMany({
        where: {
          classId: {
            in: options.classIds,
          },
          class: {
            schoolId: options.schoolId,
          },
          student: {
            role: UserRole.STUDENT,
            isActive: true,
          },
        },
        select: {
          studentId: true,
        },
      });

      for (const enrollment of studentsByClass) {
        studentIds.add(enrollment.studentId);
      }
    }

    if (options.explicitStudentIds.length > 0) {
      const explicitStudents = await this.prisma.user.findMany({
        where: {
          id: {
            in: options.explicitStudentIds,
          },
          role: UserRole.STUDENT,
          isActive: true,
          OR: [
            { schoolId: options.schoolId },
            {
              memberships: {
                some: {
                  schoolId: options.schoolId,
                  isActive: true,
                },
              },
            },
          ],
        },
        select: {
          id: true,
        },
      });

      for (const student of explicitStudents) {
        studentIds.add(student.id);
      }
    }

    return [...studentIds];
  }

  private async getActiveParentIdsByStudentIds(studentIds: string[]) {
    if (studentIds.length === 0) {
      return [];
    }

    const links = await this.prisma.studentParentLink.findMany({
      where: {
        studentId: {
          in: studentIds,
        },
        parent: {
          role: UserRole.PARENT,
          isActive: true,
        },
      },
      select: {
        parentId: true,
      },
    });

    return [...new Set(links.map((link) => link.parentId))];
  }

  private async getRecipientUsersWithEmails(userIds: string[]) {
    if (userIds.length === 0) {
      return [];
    }

    return this.prisma.user.findMany({
      where: {
        id: {
          in: userIds,
        },
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
  }

  async createAnnouncementNotifications(input: CreateAnnouncementNotificationInput) {
    const announcementsEnabled =
      await this.featureTogglesService.isFeatureEnabledForSchool(
        input.schoolId,
        'ANNOUNCEMENTS',
      );

    if (!announcementsEnabled) {
      return {
        count: 0,
        recipients: 0,
        announcementId: input.announcementId,
        type: NotificationType.ANNOUNCEMENT,
      };
    }

    const includeParents = this.includesParents(input.audience);
    const includeStudents = this.includesStudents(input.audience);

    const schoolTargets = input.targets.filter(
      (target) => target.targetType === AnnouncementTargetType.SCHOOL,
    );
    const gradeLevelIds = input.targets
      .filter(
        (target) =>
          target.targetType === AnnouncementTargetType.GRADE_LEVEL &&
          Boolean(target.gradeLevelId),
      )
      .map((target) => target.gradeLevelId as string);
    const classIds = input.targets
      .filter(
        (target) =>
          target.targetType === AnnouncementTargetType.CLASS &&
          Boolean(target.classId),
      )
      .map((target) => target.classId as string);
    const explicitStudentIds = input.targets
      .filter(
        (target) =>
          target.targetType === AnnouncementTargetType.STUDENT &&
          Boolean(target.studentId),
      )
      .map((target) => target.studentId as string);

    const recipientUserIds = new Set<string>();

    if (includeStudents) {
      if (schoolTargets.length > 0) {
        const allStudentsInSchool = await this.getSchoolScopedUserIds({
          schoolId: input.schoolId,
          role: UserRole.STUDENT,
        });
        for (const studentId of allStudentsInSchool) {
          recipientUserIds.add(studentId);
        }
      }

      const targetedStudentIds = await this.getStudentsForTargets({
        schoolId: input.schoolId,
        gradeLevelIds,
        classIds,
        explicitStudentIds,
      });
      for (const studentId of targetedStudentIds) {
        recipientUserIds.add(studentId);
      }
    }

    if (includeParents) {
      if (schoolTargets.length > 0) {
        const allParentsInSchool = await this.getSchoolScopedUserIds({
          schoolId: input.schoolId,
          role: UserRole.PARENT,
        });
        for (const parentId of allParentsInSchool) {
          recipientUserIds.add(parentId);
        }
      }

      const targetedStudentIds = await this.getStudentsForTargets({
        schoolId: input.schoolId,
        gradeLevelIds,
        classIds,
        explicitStudentIds,
      });
      const parentIds = await this.getActiveParentIdsByStudentIds(targetedStudentIds);
      for (const parentId of parentIds) {
        recipientUserIds.add(parentId);
      }
    }

    recipientUserIds.delete(input.authorId);

    const recipients = [...recipientUserIds];
    if (recipients.length === 0) {
      return { count: 0, recipients: 0 };
    }

    const existingNotifications = await this.prisma.notification.findMany({
      where: {
        type: NotificationType.ANNOUNCEMENT,
        entityType: 'ANNOUNCEMENT',
        entityId: input.announcementId,
        recipientUserId: {
          in: recipients,
        },
      },
      select: {
        recipientUserId: true,
      },
    });

    const existingRecipientIds = new Set(
      existingNotifications.map((notification) => notification.recipientUserId),
    );
    const recipientsToCreate = recipients.filter(
      (recipientUserId) => !existingRecipientIds.has(recipientUserId),
    );
    if (recipientsToCreate.length === 0) {
      return {
        count: 0,
        recipients: recipients.length,
        announcementId: input.announcementId,
        type: NotificationType.ANNOUNCEMENT,
      };
    }

    const result = await this.createMany(
      recipientsToCreate.map((recipientUserId) => ({
        schoolId: input.schoolId,
        recipientUserId,
        type: NotificationType.ANNOUNCEMENT,
        title: input.title,
        message: input.body,
        entityType: 'ANNOUNCEMENT',
        entityId: input.announcementId,
      })),
    );

    const usersForEmail = await this.getRecipientUsersWithEmails(recipientsToCreate);
    const emailRecipients = usersForEmail
      .filter((user) => typeof user.email === 'string' && user.email.trim().length > 0)
      .map((user) => ({
        userId: user.id,
        email: user.email as string,
        firstName: user.firstName,
        lastName: user.lastName,
      }));

    void this.emailService
      .sendAnnouncementEmails({
        recipients: emailRecipients,
        title: input.title,
        body: input.body,
        announcementId: input.announcementId,
      })
      .catch((error) => {
        this.logger.warn(
          `Announcement email dispatch skipped due to error: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    return {
      count: result.count,
      recipients: recipientsToCreate.length,
      announcementId: input.announcementId,
      type: NotificationType.ANNOUNCEMENT,
    };
  }

  private buildDefaultStudentAlertTitle(
    type: NotificationType,
    studentName: string,
  ) {
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

  private buildDefaultStudentAlertMessage(
    type: NotificationType,
    studentName: string,
  ) {
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
    const notificationType = query.type as NotificationType | undefined;

    return this.prisma.notification.findMany({
      where: {
        recipientUserId: user.id,
        ...(query.unreadOnly ? { isRead: false } : {}),
        ...(notificationType ? { type: notificationType } : {}),
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
      throw new ForbiddenException(
        'You do not have permission to send student alerts',
      );
    }

    const notificationType = input.type as NotificationType;

    const includeStudent = input.includeStudent ?? true;
    const includeParents = input.includeParents ?? true;

    if (!includeStudent && !includeParents) {
      throw new BadRequestException(
        'At least one recipient group must be enabled',
      );
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

    const studentSchoolId =
      student.memberships[0]?.schoolId ?? student.schoolId ?? null;
    if (!isBypassRole(actor.role)) {
      const actorSchoolIds = getAccessibleSchoolIds(actor);
      const studentSchoolIds = new Set(
        [
          student.schoolId ?? null,
          ...student.memberships.map((membership) => membership.schoolId),
        ].filter((schoolId): schoolId is string => Boolean(schoolId)),
      );
      const hasOverlap = actorSchoolIds.some((schoolId) =>
        studentSchoolIds.has(schoolId),
      );
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
      this.buildDefaultStudentAlertTitle(notificationType, studentName);
    const message =
      input.message?.trim() ||
      this.buildDefaultStudentAlertMessage(notificationType, studentName);

    const result = await this.createMany(
      recipients.map((recipientUserId) => ({
        schoolId: studentSchoolId,
        recipientUserId,
        type: notificationType,
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
      type: notificationType,
    };
  }

  async createBroadcast(
    actor: AuthenticatedUser,
    input: CreateNotificationBroadcastDto,
  ) {
    if (!this.canSendBroadcast(actor.role)) {
      throw new ForbiddenException(
        'You do not have permission to send broadcasts',
      );
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
    if (isBypassRole(actor.role)) {
      if (!schoolId) {
        throw new BadRequestException(
          'A school context is required for this broadcast',
        );
      }
    } else {
      const actorSchoolIds = getAccessibleSchoolIds(actor);
      schoolId = requestedSchoolId ?? actorSchoolIds[0] ?? null;
      if (!schoolId) {
        throw new BadRequestException(
          'A school context is required for this broadcast',
        );
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

    let type = 'ADMIN_BROADCAST' as NotificationType;
    if (
      input.type === 'SYSTEM_ANNOUNCEMENT' ||
      input.type === 'ADMIN_BROADCAST'
    ) {
      type = input.type as NotificationType;
    }

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
