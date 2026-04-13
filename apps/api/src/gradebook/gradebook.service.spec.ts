import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GradebookService } from './gradebook.service';

describe('GradebookService', () => {
  let service: GradebookService;
  let prisma: {
    class: { findUnique: jest.Mock };
    teacherClassAssignment: { findFirst: jest.Mock };
    studentClassEnrollment: { findFirst: jest.Mock; findMany: jest.Mock };
    studentParentLink: { findUnique: jest.Mock };
    assessment: { findMany: jest.Mock };
    assessmentCategory: { findMany: jest.Mock };
    gradeScale: { findFirst: jest.Mock };
    gradeOverride: { findFirst: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      class: { findUnique: jest.fn() },
      teacherClassAssignment: { findFirst: jest.fn() },
      studentClassEnrollment: { findFirst: jest.fn(), findMany: jest.fn() },
      studentParentLink: { findUnique: jest.fn() },
      assessment: { findMany: jest.fn() },
      assessmentCategory: { findMany: jest.fn() },
      gradeScale: { findFirst: jest.fn() },
      gradeOverride: { findFirst: jest.fn(), findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradebookService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get(GradebookService);
  });

  it('filters unpublished assessments for parent reads', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.studentParentLink.findUnique.mockResolvedValue({ id: 'link-1' });
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    prisma.assessment.findMany.mockResolvedValue([]);

    await service.getStudentGrades(
      { id: 'parent-1', role: UserRole.PARENT, memberships: [] },
      'student-1',
      'class-1',
    );

    expect(prisma.assessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classId: 'class-1',
          isPublishedToParents: true,
        }),
      }),
    );
  });

  it('allows teachers to read unpublished assessments for assigned classes', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue({ id: 'assign-1' });
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    prisma.assessment.findMany.mockResolvedValue([]);

    await service.getStudentGrades(
      { id: 'teacher-1', role: UserRole.TEACHER, memberships: [] },
      'student-1',
      'class-1',
    );

    const callArgs = prisma.assessment.findMany.mock.calls[0]?.[0];
    expect(callArgs?.where?.isPublishedToParents).toBeUndefined();
  });

  it('computes class summary averages across assessments', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      gradebookWeightingMode: 'UNWEIGHTED',
    });
    prisma.gradeScale.findFirst.mockResolvedValue({
      rules: [
        { minPercent: 80, maxPercent: 100, letterGrade: 'A' },
        { minPercent: 70, maxPercent: 79.9, letterGrade: 'B' },
        { minPercent: 60, maxPercent: 69.9, letterGrade: 'C' },
      ],
    });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue({ id: 'assign-1' });
    prisma.gradeOverride.findMany.mockResolvedValue([]);
    prisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        title: 'Quiz 1',
        maxScore: 10,
        weight: 1,
        dueAt: null,
        isPublishedToParents: false,
        assessmentType: { id: 't1', key: 'QUIZ', name: 'Quiz' },
        reportingPeriod: null,
        results: [
          { studentId: 's1', score: 8 },
          { studentId: 's2', score: 6 },
        ],
      },
      {
        id: 'a2',
        title: 'Test 1',
        maxScore: 20,
        weight: 1,
        dueAt: null,
        isPublishedToParents: true,
        assessmentType: { id: 't2', key: 'TEST', name: 'Test' },
        reportingPeriod: null,
        results: [
          { studentId: 's1', score: 18 },
          { studentId: 's2', score: null },
        ],
      },
    ]);
    prisma.studentClassEnrollment.findMany.mockResolvedValue([
      {
        studentId: 's1',
        createdAt: new Date('2026-04-11T00:00:00.000Z'),
        student: { id: 's1', firstName: 'Ada', lastName: 'Lovelace' },
      },
      {
        studentId: 's2',
        createdAt: new Date('2026-04-11T00:00:00.000Z'),
        student: { id: 's2', firstName: 'Grace', lastName: 'Hopper' },
      },
    ]);

    const summary = await service.getClassSummary(
      { id: 'teacher-1', role: UserRole.TEACHER, memberships: [] },
      'class-1',
    );

    expect(summary.assessmentCount).toBe(2);
    expect(summary.studentCount).toBe(2);
    expect(summary.overallAveragePercent).toBe(72.5);
    expect(summary.overallLetterGrade).toBe('B');

    const s1 = summary.students.find((entry) => entry.student.id === 's1');
    const s2 = summary.students.find((entry) => entry.student.id === 's2');

    expect(s1?.averagePercent).toBe(85);
    expect(s1?.averageLetterGrade).toBe('A');
    expect(s2?.averagePercent).toBe(60);
    expect(s2?.averageLetterGrade).toBe('C');
  });

  it('computes weighted averages when assessment weights differ', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
      gradebookWeightingMode: 'ASSESSMENT_WEIGHTED',
    });
    prisma.teacherClassAssignment.findFirst.mockResolvedValue({ id: 'assign-1' });
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    prisma.gradeScale.findFirst.mockResolvedValue({ rules: [] });
    prisma.gradeOverride.findFirst.mockResolvedValue(null);
    prisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        title: 'Weighted Quiz',
        maxScore: 10,
        weight: 2,
        dueAt: null,
        isPublishedToParents: false,
        assessmentType: { id: 't1', key: 'QUIZ', name: 'Quiz' },
        reportingPeriod: null,
        results: [
          {
            id: 'r1',
            studentId: 'student-1',
            score: 10,
            comment: null,
            createdAt: new Date('2026-04-11T00:00:00.000Z'),
            updatedAt: new Date('2026-04-11T00:00:00.000Z'),
          },
        ],
      },
      {
        id: 'a2',
        title: 'Lightweight Test',
        maxScore: 10,
        weight: 1,
        dueAt: null,
        isPublishedToParents: false,
        assessmentType: { id: 't2', key: 'TEST', name: 'Test' },
        reportingPeriod: null,
        results: [
          {
            id: 'r2',
            studentId: 'student-1',
            score: 0,
            comment: null,
            createdAt: new Date('2026-04-11T00:00:00.000Z'),
            updatedAt: new Date('2026-04-11T00:00:00.000Z'),
          },
        ],
      },
    ]);

    const summary = await service.getStudentSummary(
      { id: 'teacher-1', role: UserRole.TEACHER, memberships: [] } as never,
      'student-1',
      'class-1',
    );

    expect(summary.averagePercent).toBe(66.7);
    expect(summary.usesWeights).toBe(true);
  });

  it('blocks students from reading other students', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      schoolId: 'school-1',
      schoolYearId: 'year-1',
    });
    prisma.studentClassEnrollment.findFirst.mockResolvedValue({ id: 'enrollment-1' });

    await expect(
      service.getStudentGrades(
        { id: 'student-1', role: UserRole.STUDENT, memberships: [] },
        'student-2',
        'class-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
