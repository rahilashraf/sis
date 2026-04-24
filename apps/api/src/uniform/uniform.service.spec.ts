import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UniformOrderStatus, UserRole } from '@prisma/client';
import { UniformService } from './uniform.service';

describe('UniformService parent order mutation', () => {
  let service: UniformService;
  let prisma: {
    studentParentLink: { findUnique: jest.Mock };
    uniformOrder: { findFirst: jest.Mock; update: jest.Mock };
    uniformItem: { findMany: jest.Mock };
  };

  const parentActor = {
    id: 'parent-1',
    role: UserRole.PARENT,
    memberships: [{ schoolId: 'school-1', isActive: true }],
  } as const;

  beforeEach(() => {
    prisma = {
      studentParentLink: {
        findUnique: jest.fn(),
      },
      uniformOrder: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      uniformItem: {
        findMany: jest.fn(),
      },
    };

    service = new UniformService(prisma as never);
  });

  function mockLinkedStudent() {
    prisma.studentParentLink.findUnique.mockResolvedValue({
      student: {
        id: 'student-1',
        role: UserRole.STUDENT,
        schoolId: 'school-1',
        memberships: [{ schoolId: 'school-1', isActive: true }],
      },
    });
  }

  function mockOwnOrder(status: UniformOrderStatus) {
    prisma.uniformOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      status,
    });
  }

  function mockAvailableItems() {
    prisma.uniformItem.findMany.mockResolvedValue([
      {
        id: 'item-1',
        schoolId: 'school-1',
        name: 'Shirt',
        sku: 'S-1',
        price: '12.50',
        availableSizes: ['M'],
        availableColors: ['Blue'],
      },
      {
        id: 'item-2',
        schoolId: 'school-1',
        name: 'Pants',
        sku: 'P-1',
        price: '18.00',
        availableSizes: [],
        availableColors: [],
      },
    ]);
  }

  it('allows parent to edit own order in PENDING and recalculates totals server-side', async () => {
    mockOwnOrder(UniformOrderStatus.PENDING);
    mockLinkedStudent();
    mockAvailableItems();
    prisma.uniformOrder.update.mockResolvedValue({ id: 'order-1' });

    await service.updateParentOrder(parentActor as never, 'order-1', {
      notes: 'Please hold at office',
      items: [
        {
          uniformItemId: 'item-1',
          quantity: 2,
          selectedSize: 'M',
          selectedColor: 'Blue',
        },
        {
          uniformItemId: 'item-2',
          quantity: 1,
          selectedSize: null,
          selectedColor: null,
        },
      ],
    });

    expect(prisma.uniformOrder.update).toHaveBeenCalledTimes(1);
    const updateArgs = prisma.uniformOrder.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'order-1' });
    expect(updateArgs.data.notes).toBe('Please hold at office');
    expect(updateArgs.data.totalAmount.toString()).toBe('43');
    expect(updateArgs.data.items.deleteMany).toEqual({});
    expect(updateArgs.data.items.create).toHaveLength(2);
  });

  it('allows parent to edit own order in APPROVED', async () => {
    mockOwnOrder(UniformOrderStatus.APPROVED);
    mockLinkedStudent();
    prisma.uniformItem.findMany.mockResolvedValue([
      {
        id: 'item-1',
        schoolId: 'school-1',
        name: 'Shirt',
        sku: 'S-1',
        price: '12.50',
        availableSizes: ['M'],
        availableColors: ['Blue'],
      },
    ]);
    prisma.uniformOrder.update.mockResolvedValue({ id: 'order-1' });

    await service.updateParentOrder(parentActor as never, 'order-1', {
      notes: null,
      items: [
        {
          uniformItemId: 'item-1',
          quantity: 1,
          selectedSize: 'M',
          selectedColor: 'Blue',
        },
      ],
    });

    expect(prisma.uniformOrder.update).toHaveBeenCalledTimes(1);
  });

  it.each([
    UniformOrderStatus.PREPARING,
    UniformOrderStatus.READY_FOR_PICKUP,
  ])('blocks parent edit when status is %s', async (status) => {
    mockOwnOrder(status);
    mockLinkedStudent();

    await expect(
      service.updateParentOrder(parentActor as never, 'order-1', {
        notes: null,
        items: [
          {
            uniformItemId: 'item-1',
            quantity: 1,
            selectedSize: null,
            selectedColor: null,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.uniformOrder.update).not.toHaveBeenCalled();
  });

  it.each([
    UniformOrderStatus.PREPARING,
    UniformOrderStatus.READY_FOR_PICKUP,
  ])('blocks parent cancel when status is %s', async (status) => {
    mockOwnOrder(status);
    mockLinkedStudent();

    await expect(
      service.cancelParentOrder(parentActor as never, 'order-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.uniformOrder.update).not.toHaveBeenCalled();
  });

  it('prevents editing another parent order', async () => {
    prisma.uniformOrder.findFirst.mockResolvedValue(null);

    await expect(
      service.updateParentOrder(parentActor as never, 'order-foreign', {
        notes: null,
        items: [
          {
            uniformItemId: 'item-1',
            quantity: 1,
            selectedSize: null,
            selectedColor: null,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.uniformOrder.update).not.toHaveBeenCalled();
  });
});
