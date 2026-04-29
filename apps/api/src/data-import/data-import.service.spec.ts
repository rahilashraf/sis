import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LibraryItemStatus, StudentGender, UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DataImportService } from './data-import.service';
import {
  DataImportDuplicateStrategy,
  DataImportEntityType,
} from './dto/data-import.dto';

describe('DataImportService', () => {
  let service: DataImportService;
  let prisma: {
    school: { findUnique: jest.Mock };
    user: { findMany: jest.Mock; create: jest.Mock };
    gradeLevel: { findMany: jest.Mock };
    schoolYear: { findMany: jest.Mock };
    enrollmentSubjectOption: { findMany: jest.Mock };
    class: { findMany: jest.Mock; create: jest.Mock };
    libraryItem: { findMany: jest.Mock; create: jest.Mock };
    studentParentLink: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let auditService: { log: jest.Mock };

  beforeEach(() => {
    prisma = {
      school: { findUnique: jest.fn() },
      user: { findMany: jest.fn(), create: jest.fn() },
      gradeLevel: { findMany: jest.fn() },
      schoolYear: { findMany: jest.fn() },
      enrollmentSubjectOption: { findMany: jest.fn() },
      class: { findMany: jest.fn(), create: jest.fn() },
      libraryItem: { findMany: jest.fn(), create: jest.fn() },
      studentParentLink: { create: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: typeof prisma) => unknown) =>
        callback(prisma),
      ),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new DataImportService(
      prisma as never,
      auditService as unknown as AuditService,
    );

    prisma.school.findUnique.mockResolvedValue({ id: 'school-1' });
    prisma.user.findMany.mockResolvedValue([]);
    prisma.gradeLevel.findMany.mockResolvedValue([
      { id: 'grade-1', name: 'Grade 1', isActive: true },
    ]);
    prisma.schoolYear.findMany.mockResolvedValue([
      { id: 'year-1', name: '2025-2026' },
    ]);
    prisma.enrollmentSubjectOption.findMany.mockResolvedValue([
      { id: 'subject-1', name: 'Math' },
    ]);
    prisma.class.findMany.mockResolvedValue([]);
    prisma.libraryItem.findMany.mockResolvedValue([]);
  });

  it('previews student CSV rows and resolves grade level names', async () => {
    const result = await service.preview(
      {
        id: 'admin-1',
        role: UserRole.ADMIN,
        memberships: [{ schoolId: 'school-1', isActive: true }],
      } as never,
      {
        schoolId: 'school-1',
        entityType: DataImportEntityType.STUDENTS,
        duplicateStrategy: DataImportDuplicateStrategy.FAIL,
        csvContent:
          'username,firstName,lastName,password,gradeLevelName,studentNumber,gender\nstudent1,Ali,Khan,password123,Grade 1,S1001,MALE',
      },
    );

    expect(result.summary.createCount).toBe(1);
    expect(result.summary.errorCount).toBe(0);
  });

  it('marks duplicates as skip when duplicate strategy is skip', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', username: 'student1', email: null }]);

    const result = await service.preview(
      {
        id: 'admin-1',
        role: UserRole.ADMIN,
        memberships: [{ schoolId: 'school-1', isActive: true }],
      } as never,
      {
        schoolId: 'school-1',
        entityType: DataImportEntityType.STUDENTS,
        duplicateStrategy: DataImportDuplicateStrategy.SKIP,
        csvContent:
          'username,firstName,lastName,password\nstudent1,Ali,Khan,password123',
      },
    );

    expect(result.summary.skipCount).toBe(1);
    expect(result.rows[0].status).toBe('skip');
  });

  it('rejects execute when preview still contains errors', async () => {
    await expect(
      service.execute(
        {
          id: 'admin-1',
          role: UserRole.ADMIN,
          memberships: [{ schoolId: 'school-1', isActive: true }],
        } as never,
        {
          schoolId: 'school-1',
          entityType: DataImportEntityType.CLASSES,
          duplicateStrategy: DataImportDuplicateStrategy.FAIL,
          csvContent: 'name,schoolYearName,gradeLevelName,subjectOptionName\nClass A,Unknown,Grade 1,Math',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('executes library item import transactionally', async () => {
    const result = await service.execute(
      {
        id: 'admin-1',
        role: UserRole.ADMIN,
        memberships: [{ schoolId: 'school-1', isActive: true }],
      } as never,
      {
        schoolId: 'school-1',
        entityType: DataImportEntityType.LIBRARY_ITEMS,
        duplicateStrategy: DataImportDuplicateStrategy.FAIL,
        csvContent:
          'title,author,totalCopies,availableCopies,status,lostFeeOverride\nBook A,Author A,2,2,AVAILABLE,12.50',
      },
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.libraryItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Book A',
          author: 'Author A',
          totalCopies: 2,
          availableCopies: 2,
          status: LibraryItemStatus.AVAILABLE,
        }),
      }),
    );
    expect(result.success).toBe(true);
  });

  it('blocks preview outside school scope', async () => {
    await expect(
      service.preview(
        {
          id: 'admin-1',
          role: UserRole.ADMIN,
          memberships: [{ schoolId: 'school-2', isActive: true }],
        } as never,
        {
          schoolId: 'school-1',
          entityType: DataImportEntityType.USERS,
          duplicateStrategy: DataImportDuplicateStrategy.FAIL,
          csvContent: 'username,firstName,lastName,password,role\nstaff1,Sam,User,password123,STAFF',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
