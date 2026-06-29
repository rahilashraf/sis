import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AnnouncementAudience,
  AnnouncementTargetType,
  NotificationType,
  UserRole,
} from '@prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let emailService: {
    sendAnnouncementEmails: jest.Mock;
  };
  let prisma: {
    notification: {
      create: jest.Mock;
      createMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    studentParentLink: {
      findMany: jest.Mock;
    };
    studentClassEnrollment: {
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    emailService = {
      sendAnnouncementEmails: jest.fn().mockResolvedValue({ sent: 0, skipped: 0 }),
    };

    prisma = {
      notification: {
        create: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      studentParentLink: {
        findMany: jest.fn(),
      },
      studentClassEnrollment: {
        findMany: jest.fn(),
      },
    };

    service = new NotificationsService(prisma as never, emailService as never);
  });

  describe('createAnnouncementNotifications', () => {
    it('resolves recipients, deduplicates users, excludes author, and triggers async email', async () => {
      prisma.user.findMany.mockImplementation(
        async (args: {
          where: {
            id?: { in?: string[] };
            role?: UserRole;
            gradeLevelId?: { in?: string[] };
          };
        }) => {
          if (args.where.role === UserRole.STUDENT && args.where.id?.in?.length) {
            return [{ id: 'student-explicit-1' }];
          }

          if (args.where.id?.in) {
            return [
              {
                id: 'student-school-1',
                email: 'student1@example.com',
                firstName: 'Stu',
                lastName: 'One',
              },
              {
                id: 'parent-school-1',
                email: 'parent1@example.com',
                firstName: 'Pat',
                lastName: 'One',
              },
              {
                id: 'parent-link-1',
                email: 'parentlink@example.com',
                firstName: 'Lee',
                lastName: 'Guardian',
              },
            ];
          }

          if (
            args.where.role === UserRole.STUDENT &&
            args.where.gradeLevelId?.in?.length
          ) {
            return [{ id: 'student-grade-1' }];
          }

          if (args.where.role === UserRole.STUDENT) {
            return [{ id: 'student-school-1' }];
          }

          if (args.where.role === UserRole.PARENT) {
            return [{ id: 'parent-school-1' }];
          }

          return [];
        },
      );
      prisma.studentClassEnrollment.findMany.mockResolvedValue([
        { studentId: 'student-class-1' },
      ]);
      prisma.studentParentLink.findMany.mockResolvedValue([
        { parentId: 'parent-link-1' },
      ]);
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.createMany.mockResolvedValue({ count: 4 });

      const result = await service.createAnnouncementNotifications({
        announcementId: 'announcement-1',
        schoolId: 'school-1',
        authorId: 'student-class-1',
        title: 'Title',
        body: 'Body',
        audience: AnnouncementAudience.PARENTS_AND_STUDENTS,
        targets: [
          {
            targetType: AnnouncementTargetType.SCHOOL,
            gradeLevelId: null,
            classId: null,
            studentId: null,
          },
          {
            targetType: AnnouncementTargetType.GRADE_LEVEL,
            gradeLevelId: 'grade-1',
            classId: null,
            studentId: null,
          },
          {
            targetType: AnnouncementTargetType.CLASS,
            gradeLevelId: null,
            classId: 'class-1',
            studentId: null,
          },
          {
            targetType: AnnouncementTargetType.STUDENT,
            gradeLevelId: null,
            classId: null,
            studentId: 'student-explicit-1',
          },
        ],
      });

      expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
      const createManyInput = prisma.notification.createMany.mock.calls[0][0];
      const recipientIds = createManyInput.data.map(
        (entry: { recipientUserId: string }) => entry.recipientUserId,
      );
      expect(recipientIds).toEqual(
        expect.arrayContaining([
          'student-school-1',
          'parent-school-1',
          'student-grade-1',
          'student-explicit-1',
          'parent-link-1',
        ]),
      );
      expect(recipientIds).not.toContain('student-class-1');
      expect(new Set(recipientIds).size).toBe(recipientIds.length);
      expect(emailService.sendAnnouncementEmails).toHaveBeenCalledWith(
        expect.objectContaining({
          announcementId: 'announcement-1',
          title: 'Title',
          body: 'Body',
          recipients: expect.arrayContaining([
            expect.objectContaining({ userId: 'student-school-1' }),
            expect.objectContaining({ userId: 'parent-school-1' }),
            expect.objectContaining({ userId: 'parent-link-1' }),
          ]),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          count: 4,
          type: NotificationType.ANNOUNCEMENT,
          announcementId: 'announcement-1',
        }),
      );
    });
  });

  describe('createBroadcast', () => {
    it('requires a school context for owner broadcasts', async () => {
      await expect(
        service.createBroadcast(
          {
            id: 'owner-1',
            role: UserRole.OWNER,
            schoolId: null,
            memberships: [],
          } as never,
          {
            title: 'System update',
            message: 'School-scoped notice',
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('scopes broadcasts to the requested school memberships', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'parent-1' }, { id: 'student-1' }]);
      prisma.notification.createMany.mockResolvedValue({ count: 2 });

      const result = await service.createBroadcast(
        {
          id: 'owner-1',
          role: UserRole.OWNER,
          schoolId: null,
          memberships: [],
        } as never,
        {
          schoolId: 'school-2',
          title: 'System update',
          message: 'School-scoped notice',
          targetRoles: [UserRole.PARENT, UserRole.STUDENT],
        },
      );

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            memberships: {
              some: { schoolId: 'school-2', isActive: true },
            },
          }),
        }),
      );
      expect(prisma.notification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              schoolId: 'school-2',
              recipientUserId: 'parent-1',
              type: NotificationType.ADMIN_BROADCAST,
            }),
            expect.objectContaining({
              schoolId: 'school-2',
              recipientUserId: 'student-1',
              type: NotificationType.ADMIN_BROADCAST,
            }),
          ]),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          count: 2,
          recipients: 2,
          schoolId: 'school-2',
        }),
      );
    });
  });

  describe('createStudentAlert', () => {
    const actor = {
      id: 'teacher-1',
      role: UserRole.TEACHER,
      schoolId: null,
      memberships: [{ schoolId: 'school-1', isActive: true }],
    };

    beforeEach(() => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'student-1',
        schoolId: 'school-1',
        firstName: 'Sam',
        lastName: 'Student',
        memberships: [{ schoolId: 'school-1' }],
      });
      prisma.studentParentLink.findMany.mockResolvedValue([
        { parentId: 'parent-1' },
        { parentId: 'parent-2' },
      ]);
      prisma.notification.createMany.mockResolvedValue({ count: 3 });
    });

    it('can send parent-only alerts without notifying the student', async () => {
      const result = await service.createStudentAlert(actor as never, {
        studentId: 'student-1',
        type: NotificationType.ATTENDANCE_ALERT,
        includeStudent: false,
        includeParents: true,
      });

      expect(prisma.notification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({ recipientUserId: 'parent-1' }),
            expect.objectContaining({ recipientUserId: 'parent-2' }),
          ],
        }),
      );
      const createManyArg = prisma.notification.createMany.mock.calls[0][0];
      expect(createManyArg.data).toHaveLength(2);
      expect(createManyArg.data).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({ recipientUserId: 'student-1' }),
        ]),
      );
      expect(result).toEqual(
        expect.objectContaining({
          count: 3,
          recipients: 2,
          studentId: 'student-1',
        }),
      );
    });

    it('can send student-only alerts without notifying parents', async () => {
      prisma.notification.createMany.mockResolvedValue({ count: 1 });

      const result = await service.createStudentAlert(actor as never, {
        studentId: 'student-1',
        type: NotificationType.NEW_PUBLISHED_GRADE,
        includeStudent: true,
        includeParents: false,
      });

      expect(prisma.notification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ recipientUserId: 'student-1' })],
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          count: 1,
          recipients: 1,
          studentId: 'student-1',
        }),
      );
    });

    it('rejects alerts when both student and parent delivery are disabled', async () => {
      await expect(
        service.createStudentAlert(actor as never, {
          studentId: 'student-1',
          type: NotificationType.FORM_REMINDER,
          includeStudent: false,
          includeParents: false,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects cross-school student alerts for non-bypass roles', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'student-2',
        schoolId: 'school-2',
        firstName: 'Casey',
        lastName: 'Cross',
        memberships: [{ schoolId: 'school-2' }],
      });

      await expect(
        service.createStudentAlert(actor as never, {
          studentId: 'student-2',
          type: NotificationType.ATTENDANCE_ALERT,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects missing students', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.createStudentAlert(actor as never, {
          studentId: 'missing-student',
          type: NotificationType.ATTENDANCE_ALERT,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
