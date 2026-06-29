import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AnnouncementAudience, UserRole } from '@prisma/client';
import { AnnouncementsService } from './announcements.service';

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let notificationsService: {
    createAnnouncementNotifications: jest.Mock;
  };
  let prisma: {
    announcement: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    announcementTarget: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    gradeLevel: {
      findMany: jest.Mock;
    };
    class: {
      findMany: jest.Mock;
    };
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    teacherClassAssignment: {
      findMany: jest.Mock;
    };
    studentParentLink: {
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    notificationsService = {
      createAnnouncementNotifications: jest.fn().mockResolvedValue({ count: 0 }),
    };

    prisma = {
      announcement: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      announcementTarget: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      gradeLevel: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      class: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      teacherClassAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      studentParentLink: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
    };

    service = new AnnouncementsService(
      prisma as never,
      notificationsService as never,
    );
  });

  it('requires at least one target on create', async () => {
    await expect(
      service.create(
        {
          id: 'admin-1',
          role: UserRole.ADMIN,
          schoolId: 'school-1',
          memberships: [{ schoolId: 'school-1', isActive: true }],
        } as never,
        {
          schoolId: 'school-1',
          title: 'No recipients',
          body: 'Body',
          audience: AnnouncementAudience.PARENTS_AND_STUDENTS,
          includeWholeSchool: false,
          gradeLevelIds: [],
          classIds: [],
          studentIds: [],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.announcement.create).not.toHaveBeenCalled();
  });

  it('blocks teachers from creating whole-school announcements', async () => {
    await expect(
      service.create(
        {
          id: 'teacher-1',
          role: UserRole.TEACHER,
          schoolId: 'school-1',
          memberships: [{ schoolId: 'school-1', isActive: true }],
        } as never,
        {
          schoolId: 'school-1',
          title: 'School wide',
          body: 'Body',
          audience: AnnouncementAudience.PARENTS_AND_STUDENTS,
          includeWholeSchool: true,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.announcement.create).not.toHaveBeenCalled();
  });

  it('returns an empty parent feed when no linked children exist', async () => {
    const result = await service.list(
      {
        id: 'parent-1',
        role: UserRole.PARENT,
        schoolId: 'school-1',
        memberships: [{ schoolId: 'school-1', isActive: true }],
      } as never,
      {},
    );

    expect(prisma.studentParentLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { parentId: 'parent-1' },
      }),
    );
    expect(result).toEqual([]);
    expect(prisma.announcement.findMany).not.toHaveBeenCalled();
  });
});
