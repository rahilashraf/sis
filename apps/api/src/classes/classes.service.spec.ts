import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { ClassesService } from './classes.service';

describe('ClassesService', () => {
  let service: ClassesService;
  let prisma: {
    class: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    schoolYear: {
      findUnique: jest.Mock;
    };
    gradeLevel: {
      findUnique: jest.Mock;
    };
    enrollmentSubjectOption: {
      findUnique: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    teacherClassAssignment: {
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      class: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      schoolYear: {
        findUnique: jest.fn(),
      },
      gradeLevel: {
        findUnique: jest.fn(),
      },
      enrollmentSubjectOption: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      teacherClassAssignment: {
        create: jest.fn(),
      },
    };

    service = new ClassesService(prisma as never);
  });

  it('scopes class listing for staff to their active schools', async () => {
    prisma.class.findMany.mockResolvedValue([]);

    await service.findAll({
      id: 'staff-1',
      role: UserRole.STAFF,
      memberships: [{ schoolId: 'school-1', isActive: true }],
    } as never);

    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          schoolId: {
            in: ['school-1'],
          },
        },
      }),
    );
  });

  it('rejects assigning a teacher from another school', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'teacher-1',
        role: UserRole.TEACHER,
        memberships: [{ schoolId: 'school-2' }],
      })
      .mockResolvedValueOnce({
        id: 'teacher-1',
        role: UserRole.TEACHER,
      });

    await expect(
      service.assignTeacher(
        {
          id: 'admin-1',
          role: UserRole.ADMIN,
          memberships: [{ schoolId: 'school-1', isActive: true }],
        } as never,
        'class-1',
        { teacherId: 'teacher-1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a class-specific duplicate message during create', async () => {
    prisma.schoolYear.findUnique.mockResolvedValue({
      id: 'year-1',
      schoolId: 'school-1',
    });
    prisma.gradeLevel.findUnique.mockResolvedValue({
      id: 'grade-1',
      schoolId: 'school-1',
      name: 'Grade 2',
      isActive: true,
    });
    prisma.enrollmentSubjectOption.findUnique.mockResolvedValue({
      id: 'subject-1',
      name: 'Math',
      isActive: true,
    });
    prisma.class.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
        meta: {
          target: [
            'schoolId',
            'schoolYearId',
            'name',
            'gradeLevelId',
            'subjectOptionId',
          ],
        },
      }),
    );

    await expect(
      service.create(
        {
          id: 'admin-1',
          role: UserRole.ADMIN,
          memberships: [{ schoolId: 'school-1', isActive: true }],
        } as never,
        {
          schoolId: 'school-1',
          schoolYearId: 'year-1',
          gradeLevelId: 'grade-1',
          subjectOptionId: 'subject-1',
          name: 'Math 101',
        },
      ),
    ).rejects.toEqual(
      new ConflictException(
        'A class with this name, grade level, and subject already exists for this school year',
      ),
    );
  });

  it('returns a class-specific duplicate message during update', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      gradeLevelId: 'grade-1',
      subjectOptionId: 'subject-1',
    });
    prisma.class.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
        meta: {
          target: [
            'schoolId',
            'schoolYearId',
            'name',
            'gradeLevelId',
            'subjectOptionId',
          ],
        },
      }),
    );

    await expect(
      service.update(
        {
          id: 'admin-1',
          role: UserRole.ADMIN,
          memberships: [{ schoolId: 'school-1', isActive: true }],
        } as never,
        'class-1',
        {
          name: 'Math 101',
        },
      ),
    ).rejects.toEqual(
      new ConflictException(
        'A class with this name, grade level, and subject already exists for this school year',
      ),
    );
  });
});
