import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  UniformOrderStatus,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { getAccessibleSchoolIdsWithLegacyFallback } from '../common/access/school-membership.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUniformItemDto } from './dto/create-uniform-item.dto';
import {
  CreateUniformOrderDto,
  CreateUniformOrderItemDto,
} from './dto/create-uniform-order.dto';
import { ListParentUniformItemsQueryDto } from './dto/list-parent-uniform-items-query.dto';
import { ListParentUniformOrdersQueryDto } from './dto/list-parent-uniform-orders-query.dto';
import { ListUniformItemsQueryDto } from './dto/list-uniform-items-query.dto';
import { ListUniformOrdersQueryDto } from './dto/list-uniform-orders-query.dto';
import { UpdateParentUniformOrderDto } from './dto/update-parent-uniform-order.dto';
import { UpdateUniformItemDto } from './dto/update-uniform-item.dto';
import { UpdateUniformOrderStatusDto } from './dto/update-uniform-order-status.dto';

const UNIFORM_MANAGE_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.STAFF,
];

const PARENT_ORDER_MUTABLE_STATUSES = new Set<UniformOrderStatus>([
  UniformOrderStatus.PENDING,
  UniformOrderStatus.APPROVED,
]);

const uniformItemSelect = Prisma.validator<Prisma.UniformItemSelect>()({
  id: true,
  schoolId: true,
  name: true,
  description: true,
  category: true,
  sku: true,
  price: true,
  availableSizes: true,
  availableColors: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  school: {
    select: {
      id: true,
      name: true,
      shortName: true,
    },
  },
});

const uniformOrderItemSelect = Prisma.validator<Prisma.UniformOrderItemSelect>()({
  id: true,
  orderId: true,
  uniformItemId: true,
  itemNameSnapshot: true,
  itemSkuSnapshot: true,
  selectedSize: true,
  selectedColor: true,
  unitPrice: true,
  quantity: true,
  lineTotal: true,
  createdAt: true,
  updatedAt: true,
  uniformItem: {
    select: {
      id: true,
      schoolId: true,
      name: true,
      sku: true,
      isActive: true,
    },
  },
});

const uniformOrderAdminSelect = Prisma.validator<Prisma.UniformOrderSelect>()({
  id: true,
  schoolId: true,
  parentId: true,
  studentId: true,
  status: true,
  notes: true,
  internalNotes: true,
  totalAmount: true,
  createdAt: true,
  updatedAt: true,
  school: {
    select: {
      id: true,
      name: true,
      shortName: true,
    },
  },
  parent: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      email: true,
      role: true,
    },
  },
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      email: true,
      role: true,
    },
  },
  items: {
    orderBy: [{ createdAt: 'asc' }],
    select: uniformOrderItemSelect,
  },
});

const uniformOrderParentSelect = Prisma.validator<Prisma.UniformOrderSelect>()({
  id: true,
  schoolId: true,
  parentId: true,
  studentId: true,
  status: true,
  notes: true,
  totalAmount: true,
  createdAt: true,
  updatedAt: true,
  school: {
    select: {
      id: true,
      name: true,
      shortName: true,
    },
  },
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      email: true,
      role: true,
    },
  },
  items: {
    orderBy: [{ createdAt: 'asc' }],
    select: uniformOrderItemSelect,
  },
});

@Injectable()
export class UniformService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureCanManage(actor: AuthenticatedUser) {
    if (!UNIFORM_MANAGE_ROLES.includes(actor.role)) {
      throw new ForbiddenException('You do not have permission to manage uniforms');
    }
  }

  private ensureParent(actor: AuthenticatedUser) {
    if (actor.role !== UserRole.PARENT) {
      throw new ForbiddenException('Only parents can access this endpoint');
    }
  }

  private buildScopeSchoolIds(
    actor: AuthenticatedUser,
    requestedSchoolId?: string | null,
  ) {
    const schoolId = requestedSchoolId?.trim() || null;

    if (schoolId) {
      if (!isBypassRole(actor.role)) {
        ensureUserHasSchoolAccess(actor, schoolId);
      }

      return [schoolId];
    }

    if (isBypassRole(actor.role)) {
      return null;
    }

    const accessibleSchoolIds = getAccessibleSchoolIds(actor);

    if (accessibleSchoolIds.length === 0) {
      throw new ForbiddenException('You do not have school access');
    }

    return accessibleSchoolIds;
  }

  private normalizeOptionValues(values?: string[] | null) {
    return Array.from(
      new Set(
        (values ?? [])
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
  }

  private parseMoneyOrThrow(value: string, fieldName: string) {
    const normalized = value.trim();

    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      throw new BadRequestException(
        `${fieldName} must be a positive number with at most 2 decimal places`,
      );
    }

    return new Prisma.Decimal(normalized);
  }

  private normalizeSelectedOption(value?: string | null) {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  }

  private validateSelectedOption(options: {
    label: string;
    selected: string | null;
    available: string[];
  }) {
    if (options.available.length === 0) {
      if (options.selected) {
        throw new BadRequestException(
          `${options.label} is not configurable for this uniform item`,
        );
      }

      return null;
    }

    if (!options.selected) {
      throw new BadRequestException(`${options.label} is required for this item`);
    }

    if (!options.available.includes(options.selected)) {
      throw new BadRequestException(
        `${options.label} must be one of: ${options.available.join(', ')}`,
      );
    }

    return options.selected;
  }

  private handleUniqueItemConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new BadRequestException('An item with this SKU already exists in this school');
    }

    throw error;
  }

  private async ensureParentLinkedToStudent(parentId: string, studentId: string) {
    const link = await this.prisma.studentParentLink.findUnique({
      where: {
        parentId_studentId: {
          parentId,
          studentId,
        },
      },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            schoolId: true,
            memberships: {
              where: { isActive: true },
              select: { schoolId: true },
            },
          },
        },
      },
    });

    if (!link || link.student.role !== UserRole.STUDENT) {
      throw new ForbiddenException('You are not linked to this student');
    }

    return link.student;
  }

  private async getParentLinkedStudents(parentId: string) {
    return this.prisma.studentParentLink.findMany({
      where: { parentId },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            schoolId: true,
            memberships: {
              where: { isActive: true },
              select: { schoolId: true },
            },
          },
        },
      },
    });
  }

  async listItems(actor: AuthenticatedUser, query: ListUniformItemsQueryDto) {
    this.ensureCanManage(actor);

    const scopeSchoolIds = this.buildScopeSchoolIds(actor, query.schoolId);
    const includeInactive = query.includeInactive ?? false;
    const search = query.search?.trim() || null;

    return this.prisma.uniformItem.findMany({
      where: {
        ...(scopeSchoolIds ? { schoolId: { in: scopeSchoolIds } } : {}),
        ...(includeInactive ? {} : { isActive: true }),
        ...(query.category ? { category: query.category } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { createdAt: 'desc' }],
      select: uniformItemSelect,
    });
  }

  async listParentItems(
    actor: AuthenticatedUser,
    query: ListParentUniformItemsQueryDto,
  ) {
    this.ensureParent(actor);

    const studentId = query.studentId?.trim() || null;
    let schoolIds: string[] = [];

    if (studentId) {
      const student = await this.ensureParentLinkedToStudent(actor.id, studentId);
      schoolIds = getAccessibleSchoolIdsWithLegacyFallback({
        memberships: student.memberships,
        legacySchoolId: student.schoolId,
      });
    } else {
      const linkedStudents = await this.getParentLinkedStudents(actor.id);
      schoolIds = linkedStudents.flatMap((entry) =>
        getAccessibleSchoolIdsWithLegacyFallback({
          memberships: entry.student.memberships,
          legacySchoolId: entry.student.schoolId,
        }),
      );
    }

    const uniqueSchoolIds = [...new Set(schoolIds.filter(Boolean))];
    if (uniqueSchoolIds.length === 0) {
      return [];
    }

    return this.prisma.uniformItem.findMany({
      where: {
        schoolId: { in: uniqueSchoolIds },
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { createdAt: 'desc' }],
      select: uniformItemSelect,
    });
  }

  async getItem(actor: AuthenticatedUser, id: string) {
    this.ensureCanManage(actor);

    const item = await this.prisma.uniformItem.findUnique({
      where: { id },
      select: uniformItemSelect,
    });

    if (!item) {
      throw new NotFoundException('Uniform item not found');
    }

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, item.schoolId);
    }

    return item;
  }

  async createItem(actor: AuthenticatedUser, data: CreateUniformItemDto) {
    this.ensureCanManage(actor);

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, data.schoolId);
    }

    const school = await this.prisma.school.findUnique({
      where: { id: data.schoolId },
      select: { id: true },
    });

    if (!school) {
      throw new NotFoundException('School not found');
    }

    try {
      return await this.prisma.uniformItem.create({
        data: {
          schoolId: data.schoolId,
          name: data.name.trim(),
          description: data.description ?? null,
          category: data.category ?? null,
          sku: data.sku ?? null,
          price: this.parseMoneyOrThrow(data.price, 'price'),
          availableSizes: this.normalizeOptionValues(data.availableSizes),
          availableColors: this.normalizeOptionValues(data.availableColors),
          isActive: data.isActive ?? true,
          sortOrder: data.sortOrder ?? 0,
        },
        select: uniformItemSelect,
      });
    } catch (error) {
      this.handleUniqueItemConflict(error);
    }
  }

  async updateItem(actor: AuthenticatedUser, id: string, data: UpdateUniformItemDto) {
    this.ensureCanManage(actor);

    const existing = await this.prisma.uniformItem.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Uniform item not found');
    }

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, existing.schoolId);
    }

    try {
      return await this.prisma.uniformItem.update({
        where: { id: existing.id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.category !== undefined ? { category: data.category } : {}),
          ...(data.sku !== undefined ? { sku: data.sku } : {}),
          ...(data.price !== undefined
            ? { price: this.parseMoneyOrThrow(data.price, 'price') }
            : {}),
          ...(data.availableSizes !== undefined
            ? { availableSizes: this.normalizeOptionValues(data.availableSizes) }
            : {}),
          ...(data.availableColors !== undefined
            ? { availableColors: this.normalizeOptionValues(data.availableColors) }
            : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        },
        select: uniformItemSelect,
      });
    } catch (error) {
      this.handleUniqueItemConflict(error);
    }
  }

  async setItemActiveState(actor: AuthenticatedUser, id: string, isActive: boolean) {
    this.ensureCanManage(actor);

    const existing = await this.prisma.uniformItem.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Uniform item not found');
    }

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, existing.schoolId);
    }

    return this.prisma.uniformItem.update({
      where: { id: existing.id },
      data: { isActive },
      select: uniformItemSelect,
    });
  }

  private buildAdminOrderWhere(
    actor: AuthenticatedUser,
    query: ListUniformOrdersQueryDto,
  ): Prisma.UniformOrderWhereInput {
    const scopeSchoolIds = this.buildScopeSchoolIds(actor, query.schoolId);

    return {
      ...(scopeSchoolIds ? { schoolId: { in: scopeSchoolIds } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.parentId ? { parentId: query.parentId } : {}),
    };
  }

  async listOrders(actor: AuthenticatedUser, query: ListUniformOrdersQueryDto) {
    this.ensureCanManage(actor);

    const where = this.buildAdminOrderWhere(actor, query);

    return this.prisma.uniformOrder.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      select: uniformOrderAdminSelect,
    });
  }

  async listParentOrders(
    actor: AuthenticatedUser,
    query: ListParentUniformOrdersQueryDto,
  ) {
    this.ensureParent(actor);

    const studentId = query.studentId?.trim() || null;
    if (studentId) {
      await this.ensureParentLinkedToStudent(actor.id, studentId);
    }

    return this.prisma.uniformOrder.findMany({
      where: {
        parentId: actor.id,
        ...(studentId ? { studentId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      select: uniformOrderParentSelect,
    });
  }

  async getOrder(actor: AuthenticatedUser, id: string) {
    if (actor.role === UserRole.PARENT) {
      const order = await this.prisma.uniformOrder.findFirst({
        where: {
          id,
          parentId: actor.id,
        },
        select: uniformOrderParentSelect,
      });

      if (!order) {
        throw new NotFoundException('Uniform order not found');
      }

      return order;
    }

    this.ensureCanManage(actor);

    const order = await this.prisma.uniformOrder.findUnique({
      where: { id },
      select: uniformOrderAdminSelect,
    });

    if (!order) {
      throw new NotFoundException('Uniform order not found');
    }

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, order.schoolId);
    }

    return order;
  }

  private normalizeOrderLineInput(items: CreateUniformOrderItemDto[]) {
    return items.map((entry) => ({
      uniformItemId: entry.uniformItemId.trim(),
      quantity: entry.quantity,
      selectedSize: this.normalizeSelectedOption(entry.selectedSize),
      selectedColor: this.normalizeSelectedOption(entry.selectedColor),
    }));
  }

  private ensureParentOrderIsMutable(status: UniformOrderStatus) {
    if (!PARENT_ORDER_MUTABLE_STATUSES.has(status)) {
      throw new BadRequestException(
        'Order can only be updated or cancelled while status is Pending or Approved',
      );
    }
  }

  private async getParentOrderForMutation(actor: AuthenticatedUser, orderId: string) {
    const existing = await this.prisma.uniformOrder.findFirst({
      where: {
        id: orderId,
        parentId: actor.id,
      },
      select: {
        id: true,
        schoolId: true,
        studentId: true,
        status: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Uniform order not found');
    }

    const student = await this.ensureParentLinkedToStudent(actor.id, existing.studentId);
    const studentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId,
    });

    if (!studentSchoolIds.includes(existing.schoolId)) {
      throw new ForbiddenException(
        'Selected student does not belong to the school for this order',
      );
    }

    this.ensureParentOrderIsMutable(existing.status);

    return existing;
  }

  async createOrder(actor: AuthenticatedUser, data: CreateUniformOrderDto) {
    this.ensureParent(actor);

    const student = await this.ensureParentLinkedToStudent(
      actor.id,
      data.studentId.trim(),
    );

    const studentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId,
    });

    if (studentSchoolIds.length === 0) {
      throw new BadRequestException('Selected student has no active school membership');
    }

    const normalizedItems = this.normalizeOrderLineInput(data.items);

    const seenItemIds = new Set<string>();
    for (const line of normalizedItems) {
      if (!line.uniformItemId) {
        throw new BadRequestException('uniformItemId is required for each order line');
      }

      if (seenItemIds.has(line.uniformItemId)) {
        throw new BadRequestException('Duplicate uniformItemId entries are not allowed');
      }

      seenItemIds.add(line.uniformItemId);
    }

    const itemIds = normalizedItems.map((entry) => entry.uniformItemId);

    const items = await this.prisma.uniformItem.findMany({
      where: {
        id: { in: itemIds },
        isActive: true,
      },
      select: {
        id: true,
        schoolId: true,
        name: true,
        sku: true,
        price: true,
        availableSizes: true,
        availableColors: true,
      },
    });

    if (items.length !== itemIds.length) {
      throw new BadRequestException('One or more uniform items are unavailable');
    }

    const schoolIds = [...new Set(items.map((entry) => entry.schoolId))];

    if (schoolIds.length !== 1) {
      throw new BadRequestException('All order items must belong to the same school');
    }

    const [schoolId] = schoolIds;

    if (!studentSchoolIds.includes(schoolId)) {
      throw new ForbiddenException(
        'Selected student does not belong to the school for the selected items',
      );
    }

    const itemById = new Map(items.map((entry) => [entry.id, entry]));

    let totalAmount = new Prisma.Decimal(0);
    const orderItemsPayload: Prisma.UniformOrderItemUncheckedCreateWithoutOrderInput[] =
      normalizedItems.map((line) => {
        const item = itemById.get(line.uniformItemId);
        if (!item) {
          throw new BadRequestException('One or more uniform items are unavailable');
        }

        const selectedSize = this.validateSelectedOption({
          label: 'selectedSize',
          selected: line.selectedSize,
          available: item.availableSizes,
        });

        const selectedColor = this.validateSelectedOption({
          label: 'selectedColor',
          selected: line.selectedColor,
          available: item.availableColors,
        });

        const unitPrice = new Prisma.Decimal(item.price);
        const lineTotal = unitPrice.mul(line.quantity);
        totalAmount = totalAmount.add(lineTotal);

        return {
          uniformItemId: item.id,
          itemNameSnapshot: item.name,
          itemSkuSnapshot: item.sku,
          selectedSize,
          selectedColor,
          unitPrice,
          quantity: line.quantity,
          lineTotal,
        };
      });

    return this.prisma.uniformOrder.create({
      data: {
        schoolId,
        parentId: actor.id,
        studentId: student.id,
        status: UniformOrderStatus.PENDING,
        notes: data.notes ?? null,
        totalAmount,
        items: {
          create: orderItemsPayload,
        },
      },
      select: uniformOrderParentSelect,
    });
  }

  async updateParentOrder(
    actor: AuthenticatedUser,
    id: string,
    data: UpdateParentUniformOrderDto,
  ) {
    this.ensureParent(actor);

    const existing = await this.getParentOrderForMutation(actor, id);
    const normalizedItems = this.normalizeOrderLineInput(data.items);

    const seenItemIds = new Set<string>();
    for (const line of normalizedItems) {
      if (!line.uniformItemId) {
        throw new BadRequestException('uniformItemId is required for each order line');
      }

      if (seenItemIds.has(line.uniformItemId)) {
        throw new BadRequestException('Duplicate uniformItemId entries are not allowed');
      }

      seenItemIds.add(line.uniformItemId);
    }

    const itemIds = normalizedItems.map((entry) => entry.uniformItemId);

    const items = await this.prisma.uniformItem.findMany({
      where: {
        id: { in: itemIds },
        schoolId: existing.schoolId,
        isActive: true,
      },
      select: {
        id: true,
        schoolId: true,
        name: true,
        sku: true,
        price: true,
        availableSizes: true,
        availableColors: true,
      },
    });

    if (items.length !== itemIds.length) {
      throw new BadRequestException('One or more uniform items are unavailable');
    }

    const itemById = new Map(items.map((entry) => [entry.id, entry]));

    let totalAmount = new Prisma.Decimal(0);
    const orderItemsPayload: Prisma.UniformOrderItemCreateWithoutOrderInput[] =
      normalizedItems.map((line) => {
        const item = itemById.get(line.uniformItemId);
        if (!item) {
          throw new BadRequestException('One or more uniform items are unavailable');
        }

        const selectedSize = this.validateSelectedOption({
          label: 'selectedSize',
          selected: line.selectedSize,
          available: item.availableSizes,
        });

        const selectedColor = this.validateSelectedOption({
          label: 'selectedColor',
          selected: line.selectedColor,
          available: item.availableColors,
        });

        const unitPrice = new Prisma.Decimal(item.price);
        const lineTotal = unitPrice.mul(line.quantity);
        totalAmount = totalAmount.add(lineTotal);

        return {
          uniformItem: {
            connect: {
              id: item.id,
            },
          },
          itemNameSnapshot: item.name,
          itemSkuSnapshot: item.sku,
          selectedSize,
          selectedColor,
          unitPrice,
          quantity: line.quantity,
          lineTotal,
        };
      });

    return this.prisma.uniformOrder.update({
      where: { id: existing.id },
      data: {
        notes: data.notes ?? null,
        totalAmount,
        items: {
          deleteMany: {},
          create: orderItemsPayload,
        },
      },
      select: uniformOrderParentSelect,
    });
  }

  async cancelParentOrder(actor: AuthenticatedUser, id: string) {
    this.ensureParent(actor);

    const existing = await this.getParentOrderForMutation(actor, id);

    return this.prisma.uniformOrder.update({
      where: { id: existing.id },
      data: {
        status: UniformOrderStatus.CANCELLED,
      },
      select: uniformOrderParentSelect,
    });
  }

  async updateOrderStatus(
    actor: AuthenticatedUser,
    id: string,
    data: UpdateUniformOrderStatusDto,
  ) {
    this.ensureCanManage(actor);

    const existing = await this.prisma.uniformOrder.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Uniform order not found');
    }

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, existing.schoolId);
    }

    return this.prisma.uniformOrder.update({
      where: { id: existing.id },
      data: {
        status: data.status,
        ...(data.internalNotes !== undefined
          ? { internalNotes: data.internalNotes }
          : {}),
      },
      select: uniformOrderAdminSelect,
    });
  }
}
