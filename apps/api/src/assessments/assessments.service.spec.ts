import { NotificationType, UserRole } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { AssessmentsService } from './assessments.service';

describe('AssessmentsService notifications', () => {
  let service: AssessmentsService;
  let prisma: {
    assessment: { findUnique: jest.Mock; update: jest.Mock };
    class: { findUnique: jest.Mock };
    assessmentResult: {
      findMany: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      findFirst: jest.Mock;
    };
    assessmentResultStatusLabel: { findMany: jest.Mock; createMany: jest.Mock };
    studentClassEnrollment: { findMany: jest.Mock };
    teacherClassAssignment: { findFirst: jest.Mock };
    user: { findMany: jest.Mock };
    studentParentLink: { findMany: jest.Mock };
    notification: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let notificationsService: { createMany: jest.Mock };

  beforeEach(() => {
    prisma = {
      assessment: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      class: {
        findUnique: jest.fn(),
      },
      assessmentResult: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
      },
      assessmentResultStatusLabel: {
        findMany: jest.fn(),
        createMany: jest.fn(),
      },
      studentClassEnrollment: {
        findMany: jest.fn(),
      },
      teacherClassAssignment: {
        findFirst: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
      studentParentLink: {
        findMany: jest.fn(),
      },
      notification: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    notificationsService = {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    };

    service = new AssessmentsService(
      prisma as never,
      notificationsService as unknown as NotificationsService,
    );
  });

  it('publishes grades with dedupe per assessment/student recipient', async () => {
    prisma.assessment.findUnique.mockResolvedValue({
      id: 'assessment-1',
      classId: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      title: 'Math Quiz 1',
      maxScore: 100,
      isActive: true,
      isPublishedToParents: false,
      assessmentType: { id: 'type-1', key: 'QUIZ', name: 'Quiz' },
    });
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      gradebookWeightingMode: 'UNWEIGHTED',
    });
    prisma.assessment.update.mockResolvedValue({
      id: 'assessment-1',
      classId: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      title: 'Math Quiz 1',
      maxScore: 100,
      isActive: true,
      isPublishedToParents: true,
      assessmentType: { id: 'type-1', key: 'QUIZ', name: 'Quiz' },
    });
    prisma.assessmentResult.findMany.mockResolvedValue([{ studentId: 'student-1' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'student-1' }]);
    prisma.studentParentLink.findMany.mockResolvedValue([
      { studentId: 'student-1', parentId: 'parent-1' },
    ]);
    prisma.notification.findMany.mockResolvedValue([
      {
        recipientUserId: 'student-1',
        entityId: 'assessment-1:student-1',
      },
    ]);

    await service.publish(
      { id: 'owner-1', role: UserRole.OWNER, memberships: [] } as never,
      'assessment-1',
    );

    expect(notificationsService.createMany).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientUserId: 'parent-1',
        type: NotificationType.NEW_PUBLISHED_GRADE,
        entityType: 'AssessmentGradePublication',
        entityId: 'assessment-1:student-1',
      }),
    ]);
  });

  it('sends low-grade alert only when score crosses below 65%', async () => {
    prisma.assessment.findUnique.mockResolvedValue({
      id: 'assessment-1',
      classId: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      title: 'Math Quiz 1',
      maxScore: 100,
      isActive: true,
      isPublishedToParents: true,
      assessmentType: { id: 'type-1', key: 'QUIZ', name: 'Quiz' },
    });
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      gradebookWeightingMode: 'UNWEIGHTED',
    });
    prisma.assessmentResultStatusLabel.findMany.mockResolvedValue([
      { key: 'COMPLETED', id: 'label-1', schoolId: 'school-1', isActive: true },
      { key: 'LATE', id: 'label-2', schoolId: 'school-1', isActive: true },
      { key: 'ABSENT', id: 'label-3', schoolId: 'school-1', isActive: true },
      { key: 'EXEMPT', id: 'label-4', schoolId: 'school-1', isActive: true },
      { key: 'MISSING', id: 'label-5', schoolId: 'school-1', isActive: true },
    ]);
    prisma.studentClassEnrollment.findMany.mockResolvedValue([{ studentId: 'student-1' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'student-1' }]);
    prisma.studentParentLink.findMany.mockResolvedValue([
      { studentId: 'student-1', parentId: 'parent-1' },
    ]);
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        assessmentResult: {
          upsert: prisma.assessmentResult.upsert,
          deleteMany: prisma.assessmentResult.deleteMany,
        },
      }),
    );

    prisma.assessmentResult.findMany
      .mockResolvedValueOnce([{ studentId: 'student-1', score: 80 }])
      .mockResolvedValueOnce([{ studentId: 'student-1', score: 60 }]);
    prisma.assessmentResult.upsert
      .mockResolvedValueOnce({
        id: 'result-1',
        studentId: 'student-1',
        score: 60,
        statusLabelId: null,
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'result-1',
        studentId: 'student-1',
        score: 55,
        statusLabelId: null,
        comment: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const actor = { id: 'owner-1', role: UserRole.OWNER, memberships: [] } as never;
    const payload = {
      grades: [{ studentId: 'student-1', score: 60 }],
    };

    await service.upsertGrades(actor, 'assessment-1', payload);
    await service.upsertGrades(actor, 'assessment-1', {
      grades: [{ studentId: 'student-1', score: 55 }],
    });

    expect(notificationsService.createMany).toHaveBeenCalledTimes(1);
    expect(notificationsService.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: NotificationType.LOW_GRADE_ALERT,
          recipientUserId: 'student-1',
        }),
        expect.objectContaining({
          type: NotificationType.LOW_GRADE_ALERT,
          recipientUserId: 'parent-1',
        }),
      ]),
    );
  });
});
