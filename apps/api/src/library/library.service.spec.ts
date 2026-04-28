import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  ChargeStatus,
  LibraryFineReason,
  LibraryFineStatus,
  LibraryLateFineFrequency,
  Prisma,
  UserRole,
} from '@prisma/client';
import { LibraryService } from './library.service';

describe('LibraryService fines', () => {
  let service: LibraryService;
  let prisma: {
    libraryFineSettings: { upsert: jest.Mock };
    user: { findUnique: jest.Mock };
    libraryLoan: { findUnique: jest.Mock; findMany: jest.Mock };
    libraryFine: { findUnique: jest.Mock; findMany: jest.Mock };
    libraryHold: { findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    libraryItem: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    studentParentLink: { findUnique: jest.Mock };
    billingCategory: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    billingCharge: { create: jest.Mock; update: jest.Mock };
    libraryFine: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    libraryItem: { findUnique: jest.Mock; update: jest.Mock };
    libraryLoan: { update: jest.Mock };
    billingCategory: { upsert: jest.Mock };
  };

  const ownerActor = {
    id: 'owner-1',
    role: UserRole.OWNER,
    memberships: [{ schoolId: 'school-1', isActive: true }],
  } as const;

  const adminActor = {
    id: 'admin-1',
    role: UserRole.ADMIN,
    memberships: [{ schoolId: 'school-1', isActive: true }],
  } as const;

  const staffActor = {
    id: 'staff-1',
    role: UserRole.STAFF,
    memberships: [{ schoolId: 'school-1', isActive: true }],
  } as const;

  const studentActor = {
    id: 'student-1',
    role: UserRole.STUDENT,
    memberships: [{ schoolId: 'school-1', isActive: true }],
  } as const;

  const parentActor = {
    id: 'parent-1',
    role: UserRole.PARENT,
    memberships: [{ schoolId: 'school-1', isActive: true }],
  } as const;

  const notificationsService = {
    createMany: jest.fn(),
  };

  function buildFineSettings(overrides?: Partial<Record<string, unknown>>) {
    return {
      id: 'settings-1',
      schoolId: 'school-1',
      lateFineAmount: new Prisma.Decimal('1.50'),
      lostItemFineAmount: new Prisma.Decimal('25.00'),
      unclaimedHoldFineAmount: new Prisma.Decimal('10.00'),
      lateFineGraceDays: 0,
      lateFineFrequency: LibraryLateFineFrequency.PER_DAY,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
      school: {
        id: 'school-1',
        name: 'Main School',
        shortName: 'MS',
      },
      ...overrides,
    };
  }

  function buildFineRecord(overrides?: Partial<Record<string, unknown>>) {
    return {
      id: 'fine-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      libraryItemId: 'item-1',
      checkoutId: 'loan-1',
      holdReference: null,
      reason: LibraryFineReason.MANUAL,
      status: LibraryFineStatus.OPEN,
      amount: new Prisma.Decimal('12.50'),
      description: 'Manual fine',
      assessedAt: new Date('2026-04-10T00:00:00.000Z'),
      waivedAt: null,
      waivedById: null,
      billingChargeId: 'charge-1',
      createdAt: new Date('2026-04-10T00:00:00.000Z'),
      updatedAt: new Date('2026-04-10T00:00:00.000Z'),
      school: {
        id: 'school-1',
        name: 'Main School',
        shortName: 'MS',
      },
      student: {
        id: 'student-1',
        firstName: 'Test',
        lastName: 'Student',
        username: 'student01',
        email: 'student@test.local',
      },
      libraryItem: {
        id: 'item-1',
        title: 'Algebra Book',
        barcode: 'BC-1',
        category: 'Textbook',
      },
      checkout: {
        id: 'loan-1',
        dueDate: new Date('2026-04-05T00:00:00.000Z'),
        checkoutDate: new Date('2026-03-20T00:00:00.000Z'),
        status: 'ACTIVE',
      },
      waivedBy: null,
      billingCharge: {
        id: 'charge-1',
        title: 'Library fine - manual',
        status: ChargeStatus.PENDING,
        amount: new Prisma.Decimal('12.50'),
        amountPaid: new Prisma.Decimal('0'),
        amountDue: new Prisma.Decimal('12.50'),
        category: {
          id: 'cat-1',
          name: 'Library Fines',
        },
      },
      ...overrides,
    };
  }

  function buildItemRecord(overrides?: Partial<Record<string, unknown>>) {
    return {
      id: 'item-1',
      schoolId: 'school-1',
      title: 'Algebra Book',
      author: 'Author',
      isbn: 'ISBN-1',
      barcode: 'BC-1',
      category: 'Textbook',
      status: 'AVAILABLE',
      totalCopies: 5,
      availableCopies: 3,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
      school: {
        id: 'school-1',
        name: 'Main School',
        shortName: 'MS',
      },
      ...overrides,
    };
  }

  function buildLoanRecord(overrides?: Partial<Record<string, unknown>>) {
    return {
      id: 'loan-1',
      schoolId: 'school-1',
      itemId: 'item-1',
      studentId: 'student-1',
      checkedOutByUserId: 'admin-1',
      checkoutDate: new Date('2026-04-01T00:00:00.000Z'),
      dueDate: new Date('2026-04-05T00:00:00.000Z'),
      returnedAt: null,
      receivedByUserId: null,
      status: 'LOST',
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
      item: {
        id: 'item-1',
        title: 'Algebra Book',
        author: 'Author',
        isbn: 'ISBN-1',
        barcode: 'BC-1',
        category: 'Textbook',
        status: 'LOST',
      },
      student: {
        id: 'student-1',
        firstName: 'Test',
        lastName: 'Student',
        username: 'student01',
        email: 'student@test.local',
      },
      checkedOutBy: {
        id: 'admin-1',
        firstName: 'Admin',
        lastName: 'User',
        username: 'admin',
      },
      receivedBy: null,
      school: {
        id: 'school-1',
        name: 'Main School',
        shortName: 'MS',
      },
      ...overrides,
    };
  }

  function buildHoldRecord(overrides?: Partial<Record<string, unknown>>) {
    return {
      id: 'hold-1',
      schoolId: 'school-1',
      itemId: 'item-1',
      studentId: 'student-1',
      createdByUserId: 'student-1',
      status: 'ACTIVE',
      notes: null,
      resolvedAt: null,
      resolvedByUserId: null,
      createdAt: new Date('2026-04-15T00:00:00.000Z'),
      updatedAt: new Date('2026-04-15T00:00:00.000Z'),
      school: {
        id: 'school-1',
        name: 'Main School',
        shortName: 'MS',
      },
      item: {
        id: 'item-1',
        title: 'Algebra Book',
        author: 'Author',
        isbn: 'ISBN-1',
        barcode: 'BC-1',
        category: 'Textbook',
        status: 'CHECKED_OUT',
        availableCopies: 0,
        totalCopies: 1,
      },
      student: {
        id: 'student-1',
        firstName: 'Test',
        lastName: 'Student',
        username: 'student01',
        email: 'student@test.local',
      },
      createdBy: {
        id: 'student-1',
        firstName: 'Test',
        lastName: 'Student',
        username: 'student01',
      },
      resolvedBy: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    tx = {
      billingCharge: { create: jest.fn(), update: jest.fn() },
      libraryFine: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      libraryItem: { findUnique: jest.fn(), update: jest.fn() },
      libraryLoan: { update: jest.fn() },
      billingCategory: { upsert: jest.fn() },
    };

    prisma = {
      libraryFineSettings: { upsert: jest.fn() },
      user: { findUnique: jest.fn() },
      libraryLoan: { findUnique: jest.fn(), findMany: jest.fn() },
      libraryFine: { findUnique: jest.fn(), findMany: jest.fn() },
      libraryHold: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      libraryItem: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      studentParentLink: { findUnique: jest.fn() },
      billingCategory: { upsert: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return arg(tx);
        }

        return Promise.all(arg as Promise<unknown>[]);
      }),
    };

    service = new LibraryService(prisma as never, notificationsService as never);
    prisma.libraryLoan.findMany.mockResolvedValue([]);
  });

  it('allows OWNER to update fine settings', async () => {
    prisma.libraryFineSettings.upsert.mockResolvedValue(buildFineSettings());

    await service.upsertFineSettings(ownerActor as never, {
      schoolId: 'school-1',
      lateFineAmount: '1.50',
      lostItemFineAmount: '25.00',
      unclaimedHoldFineAmount: '10.00',
      lateFineGraceDays: 2,
      lateFineFrequency: LibraryLateFineFrequency.PER_DAY,
    });

    expect(prisma.libraryFineSettings.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.libraryFineSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: 'school-1' },
      }),
    );
  });

  it('blocks ADMIN from updating fine settings', async () => {
    await expect(
      service.upsertFineSettings(adminActor as never, {
        schoolId: 'school-1',
        lateFineAmount: '1.50',
        lostItemFineAmount: '25.00',
        unclaimedHoldFineAmount: '10.00',
        lateFineGraceDays: 2,
        lateFineFrequency: LibraryLateFineFrequency.PER_DAY,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows admin to create manual library fine', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      schoolId: 'school-1',
      firstName: 'Test',
      lastName: 'Student',
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.billingCategory.upsert.mockResolvedValue({
      id: 'cat-1',
      schoolId: 'school-1',
      name: 'Library Fines',
    });
    tx.billingCharge.create.mockResolvedValue({ id: 'charge-1' });
    tx.libraryFine.create.mockResolvedValue(
      buildFineRecord({
        reason: LibraryFineReason.MANUAL,
        amount: new Prisma.Decimal('12.50'),
      }),
    );

    const created = await service.createManualFine(adminActor as never, {
      schoolId: 'school-1',
      studentId: 'student-1',
      amount: '12.50',
      description: 'Damaged cover',
    });

    expect(tx.billingCharge.create).toHaveBeenCalledTimes(1);
    expect(tx.libraryFine.create).toHaveBeenCalledTimes(1);
    expect(created.reason).toBe(LibraryFineReason.MANUAL);
    expect(String(created.amount)).toBe('12.5');
  });

  it('waive fine updates linked billing charge state', async () => {
    prisma.libraryFine.findUnique.mockResolvedValue({
      id: 'fine-1',
      schoolId: 'school-1',
      status: LibraryFineStatus.OPEN,
      billingChargeId: 'charge-1',
      billingCharge: {
        id: 'charge-1',
        status: ChargeStatus.PENDING,
        amountPaid: new Prisma.Decimal('0'),
      },
    });

    tx.libraryFine.update.mockResolvedValue(
      buildFineRecord({
        status: LibraryFineStatus.WAIVED,
        waivedAt: new Date('2026-04-11T00:00:00.000Z'),
        waivedById: 'admin-1',
        billingCharge: {
          id: 'charge-1',
          title: 'Library fine - manual',
          status: ChargeStatus.WAIVED,
          amount: new Prisma.Decimal('12.50'),
          amountPaid: new Prisma.Decimal('0'),
          amountDue: new Prisma.Decimal('0'),
          category: { id: 'cat-1', name: 'Library Fines' },
        },
      }),
    );

    await service.waiveFine(adminActor as never, 'fine-1', {
      reason: 'Courtesy waiver',
    });

    expect(tx.billingCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'charge-1' },
        data: expect.objectContaining({
          status: ChargeStatus.WAIVED,
        }),
      }),
    );
    expect(tx.libraryFine.update).toHaveBeenCalledTimes(1);
  });

  it('assesses capped late fee and auto-marks lost with item lost fee override after 20 overdue days', async () => {
    prisma.libraryFineSettings.upsert.mockResolvedValue(buildFineSettings());
    const daysAgo = 25;
    prisma.libraryLoan.findMany.mockResolvedValue([
      {
        id: 'loan-1',
        schoolId: 'school-1',
        studentId: 'student-1',
        itemId: 'item-1',
        dueDate: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
        item: {
          title: 'Algebra Book',
          lostFeeOverride: new Prisma.Decimal('40.00'),
        },
      },
    ]);
    prisma.libraryFine.findUnique.mockResolvedValue(null);
    prisma.billingCategory.upsert.mockResolvedValue({
      id: 'cat-1',
      schoolId: 'school-1',
      name: 'Library Fines',
    });
    tx.billingCharge.create
      .mockResolvedValueOnce({ id: 'charge-late' })
      .mockResolvedValueOnce({ id: 'charge-lost' });
    tx.libraryFine.create
      .mockResolvedValueOnce(
        buildFineRecord({
          id: 'fine-late',
          reason: LibraryFineReason.LATE,
          amount: new Prisma.Decimal('40.00'),
        }),
      )
      .mockResolvedValueOnce(
        buildFineRecord({
          id: 'fine-lost',
          reason: LibraryFineReason.LOST,
          amount: new Prisma.Decimal('40.00'),
        }),
      );

    jest.spyOn(service, 'markLoanLost').mockResolvedValue({
      loan: buildLoanRecord({ status: 'LOST' }),
      fine: null,
      fineCreated: false,
    } as never);

    const result = await service.assessOverdueFines(adminActor as never, {
      schoolId: 'school-1',
    });

    expect(result.evaluatedLoans).toBe(1);
    expect(result.createdCount).toBe(2);
    expect(result.markedLostCount).toBe(1);
    expect(service.markLoanLost).toHaveBeenCalledTimes(1);
  });

  it('infers checkoutId for late manual fine from student + item active checkout', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      schoolId: 'school-1',
      firstName: 'Test',
      lastName: 'Student',
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.libraryItem.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.libraryLoan.findMany.mockResolvedValue([
      {
        id: 'loan-1',
        schoolId: 'school-1',
        studentId: 'student-1',
        itemId: 'item-1',
      },
    ]);
    prisma.libraryFineSettings.upsert.mockResolvedValue(buildFineSettings());
    prisma.billingCategory.upsert.mockResolvedValue({
      id: 'cat-1',
      schoolId: 'school-1',
      name: 'Library Fines',
    });
    tx.billingCharge.create.mockResolvedValue({ id: 'charge-1' });
    tx.libraryFine.create.mockResolvedValue(
      buildFineRecord({
        reason: LibraryFineReason.LATE,
        checkoutId: 'loan-1',
      }),
    );

    const created = await service.createManualFine(adminActor as never, {
      schoolId: 'school-1',
      studentId: 'student-1',
      reason: LibraryFineReason.LATE,
      libraryItemId: 'item-1',
    });

    expect(prisma.libraryLoan.findMany).toHaveBeenCalledTimes(1);
    expect(created.checkoutId).toBe('loan-1');
  });

  it('rejects late/lost manual fine when checkout inference is ambiguous', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      schoolId: 'school-1',
      firstName: 'Test',
      lastName: 'Student',
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.libraryItem.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.libraryLoan.findMany.mockResolvedValue([
      {
        id: 'loan-1',
        schoolId: 'school-1',
        studentId: 'student-1',
        itemId: 'item-1',
      },
      {
        id: 'loan-2',
        schoolId: 'school-1',
        studentId: 'student-1',
        itemId: 'item-1',
      },
    ]);

    await expect(
      service.createManualFine(adminActor as never, {
        schoolId: 'school-1',
        studentId: 'student-1',
        reason: LibraryFineReason.LOST,
        libraryItemId: 'item-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses configured settings amount when manual fine amount is omitted', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-1',
      role: UserRole.STUDENT,
      schoolId: 'school-1',
      firstName: 'Test',
      lastName: 'Student',
      memberships: [{ schoolId: 'school-1' }],
    });
    prisma.libraryLoan.findUnique.mockResolvedValue({
      id: 'loan-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      itemId: 'item-1',
    });
    prisma.libraryItem.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.libraryFineSettings.upsert.mockResolvedValue(
      buildFineSettings({
        lostItemFineAmount: new Prisma.Decimal('30.00'),
      }),
    );
    prisma.billingCategory.upsert.mockResolvedValue({
      id: 'cat-1',
      schoolId: 'school-1',
      name: 'Library Fines',
    });
    tx.billingCharge.create.mockResolvedValue({ id: 'charge-1' });
    tx.libraryFine.create.mockResolvedValue(
      buildFineRecord({
        reason: LibraryFineReason.LOST,
        amount: new Prisma.Decimal('30.00'),
      }),
    );

    await service.createManualFine(adminActor as never, {
      schoolId: 'school-1',
      studentId: 'student-1',
      reason: LibraryFineReason.LOST,
      checkoutId: 'loan-1',
    });

    expect(tx.billingCharge.create).toHaveBeenCalledTimes(1);
    const chargeCreateArgs = tx.billingCharge.create.mock.calls[0][0];
    expect(String(chargeCreateArgs.data.amount)).toBe('30');
  });

  it('allows admin to edit item metadata in scoped school', async () => {
    prisma.libraryItem.findUnique.mockResolvedValueOnce({
      id: 'item-1',
      schoolId: 'school-1',
      title: 'Algebra Book',
      totalCopies: 5,
      availableCopies: 3,
      status: 'AVAILABLE',
    });
    prisma.libraryLoan.findMany.mockResolvedValueOnce([]);
    prisma.libraryItem.update.mockResolvedValue(buildItemRecord({ title: 'Updated Title' }));

    const updated = await service.updateItem(adminActor as never, 'item-1', {
      title: 'Updated Title',
      author: 'Updated Author',
    });

    expect(prisma.libraryItem.update).toHaveBeenCalledTimes(1);
    expect(updated.title).toBe('Updated Title');
  });

  it('allows direct manual status override independent of availableCopies', async () => {
    prisma.libraryItem.findUnique.mockResolvedValueOnce({
      id: 'item-1',
      schoolId: 'school-1',
      title: 'Algebra Book',
      totalCopies: 5,
      availableCopies: 3,
      status: 'AVAILABLE',
    });
    prisma.libraryLoan.findMany.mockResolvedValueOnce([]);
    prisma.libraryItem.update.mockResolvedValue(
      buildItemRecord({ status: 'CHECKED_OUT' }),
    );

    const updated = await service.updateItem(adminActor as never, 'item-1', {
      status: 'CHECKED_OUT',
    });

    expect(prisma.libraryItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CHECKED_OUT',
        }),
      }),
    );
    expect(updated.status).toBe('CHECKED_OUT');
  });

  it('blocks reducing total copies below active checkout count', async () => {
    prisma.libraryItem.findUnique.mockResolvedValueOnce({
      id: 'item-1',
      schoolId: 'school-1',
      title: 'Algebra Book',
      totalCopies: 5,
      availableCopies: 3,
      status: 'AVAILABLE',
    });
    prisma.libraryLoan.findMany.mockResolvedValueOnce([{ id: 'loan-1' }, { id: 'loan-2' }]);

    await expect(
      service.updateItem(adminActor as never, 'item-1', {
        totalCopies: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.libraryItem.update).not.toHaveBeenCalled();
  });

  it('blocks cross-school item edit', async () => {
    prisma.libraryItem.findUnique.mockResolvedValueOnce({
      id: 'item-2',
      schoolId: 'school-2',
      title: 'Other School Item',
      totalCopies: 4,
      availableCopies: 4,
      status: 'AVAILABLE',
    });

    await expect(
      service.updateItem(staffActor as never, 'item-2', {
        title: 'Should fail',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('mark-found only works for lost loans', async () => {
    prisma.libraryLoan.findUnique.mockResolvedValueOnce({
      id: 'loan-2',
      schoolId: 'school-1',
      itemId: 'item-1',
      status: 'ACTIVE',
      returnedAt: null,
    });

    await expect(service.markLoanFound(adminActor as never, 'loan-2')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('mark-found restores inventory and leaves linked lost fine for review when open', async () => {
    prisma.libraryLoan.findUnique.mockResolvedValueOnce({
      id: 'loan-1',
      schoolId: 'school-1',
      itemId: 'item-1',
      status: 'LOST',
      returnedAt: null,
    });

    tx.libraryLoan.update.mockResolvedValue(
      buildLoanRecord({
        status: 'RETURNED',
        returnedAt: new Date('2026-04-15T00:00:00.000Z'),
        receivedByUserId: 'admin-1',
      }),
    );
    tx.libraryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      totalCopies: 0,
      availableCopies: 0,
      status: 'LOST',
    });
    tx.libraryFine.findUnique.mockResolvedValue({
      id: 'fine-1',
      status: LibraryFineStatus.OPEN,
      amount: new Prisma.Decimal('25.00'),
      billingChargeId: 'charge-1',
      billingCharge: {
        id: 'charge-1',
        status: ChargeStatus.PENDING,
        amountDue: new Prisma.Decimal('25.00'),
        title: 'Library fine - lost item',
      },
    });

    const result = await service.markLoanFound(adminActor as never, 'loan-1');

    expect(tx.libraryItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1' },
        data: expect.objectContaining({
          totalCopies: 1,
          availableCopies: 1,
          status: 'AVAILABLE',
        }),
      }),
    );
    expect(tx.libraryFine.update).not.toHaveBeenCalled();
    expect(result.fineRequiresReview).toBe(true);
    expect(result.lostFine?.id).toBe('fine-1');
  });

  it('allows student to create hold for self', async () => {
    prisma.libraryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      schoolId: 'school-1',
      status: 'CHECKED_OUT',
      availableCopies: 0,
    });
    prisma.libraryHold.findFirst.mockResolvedValue(null);
    prisma.libraryHold.create.mockResolvedValue(buildHoldRecord());

    const created = await service.createStudentHold(studentActor as never, {
      itemId: 'item-1',
    });

    expect(prisma.libraryHold.create).toHaveBeenCalledTimes(1);
    expect(created.studentId).toBe(studentActor.id);
    expect(created.status).toBe('ACTIVE');
  });

  it('prevents duplicate active hold creation', async () => {
    prisma.libraryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      schoolId: 'school-1',
      status: 'CHECKED_OUT',
      availableCopies: 0,
    });
    prisma.libraryHold.findFirst.mockResolvedValue({ id: 'hold-existing' });

    await expect(
      service.createStudentHold(studentActor as never, {
        itemId: 'item-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks parent from placing holds', async () => {
    await expect(
      service.createStudentHold(parentActor as never, {
        itemId: 'item-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows parent to place hold for a linked child', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue({
      student: {
        id: 'student-1',
        role: UserRole.STUDENT,
        schoolId: 'school-1',
        memberships: [{ schoolId: 'school-1', isActive: true }],
      },
    });
    prisma.libraryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      schoolId: 'school-1',
      status: 'CHECKED_OUT',
      availableCopies: 0,
    });
    prisma.libraryHold.findFirst.mockResolvedValue(null);
    prisma.libraryHold.create.mockResolvedValue(
      buildHoldRecord({
        studentId: 'student-1',
        createdByUserId: 'parent-1',
      }),
    );

    const created = await service.createParentStudentHold(
      parentActor as never,
      'student-1',
      {
        itemId: 'item-1',
      },
    );

    expect(created.studentId).toBe('student-1');
    expect(created.createdByUserId).toBe('parent-1');
  });

  it('blocks parent hold creation for unrelated child', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue(null);

    await expect(
      service.createParentStudentHold(parentActor as never, 'student-2', {
        itemId: 'item-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents duplicate active child hold creation from parent flow', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValue({
      student: {
        id: 'student-1',
        role: UserRole.STUDENT,
        schoolId: 'school-1',
        memberships: [{ schoolId: 'school-1', isActive: true }],
      },
    });
    prisma.libraryItem.findUnique.mockResolvedValue({
      id: 'item-1',
      schoolId: 'school-1',
      status: 'CHECKED_OUT',
      availableCopies: 0,
    });
    prisma.libraryHold.findFirst.mockResolvedValue({ id: 'hold-existing' });

    await expect(
      service.createParentStudentHold(parentActor as never, 'student-1', {
        itemId: 'item-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows parent to view linked child holds only', async () => {
    prisma.studentParentLink.findUnique.mockResolvedValueOnce({
      student: {
        id: 'student-1',
        role: UserRole.STUDENT,
      },
    });
    prisma.libraryHold.findMany.mockResolvedValue([buildHoldRecord()]);

    const linkedResult = await service.listParentStudentHolds(parentActor as never, 'student-1');
    expect(linkedResult.holds).toHaveLength(1);

    prisma.studentParentLink.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.listParentStudentHolds(parentActor as never, 'student-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
