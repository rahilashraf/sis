import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { parseDateOnlyOrThrow } from '../common/dates/date-only.util';
import { CreateEnrollmentHistoryDto } from './dto/create-enrollment-history.dto';
import { UpdateEnrollmentHistoryDto } from './dto/update-enrollment-history.dto';
import { ReplaceEnrollmentSubjectsDto } from './dto/replace-enrollment-subjects.dto';
import { CreateEnrollmentSubjectOptionDto } from './dto/create-enrollment-subject-option.dto';
import { UpdateEnrollmentSubjectOptionDto } from './dto/update-enrollment-subject-option.dto';

const enrollmentHistoryWithSubjectsInclude =
  Prisma.validator<Prisma.EnrollmentHistoryInclude>()({
    subjects: {
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    },
  });

type EnrollmentHistoryWithSubjects = Prisma.EnrollmentHistoryGetPayload<{
  include: typeof enrollmentHistoryWithSubjectsInclude;
}>;

@Injectable()
export class EnrollmentHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  private canManageEnrollmentHistory(role: UserRole) {
    return (
      role === UserRole.OWNER ||
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.ADMIN
    );
  }

  private canReadEnrollmentHistory(role: UserRole) {
    return this.canManageEnrollmentHistory(role) || role === UserRole.STAFF;
  }

  private canManageSubjectOptions(role: UserRole) {
    return role === UserRole.OWNER || role === UserRole.SUPER_ADMIN;
  }

  private canListSubjectOptions(role: UserRole) {
    return this.canReadEnrollmentHistory(role) || this.canManageSubjectOptions(role);
  }

  private validateDateOrder(dateOfEnrollment: Date, dateOfDeparture: Date | null) {
    if (dateOfDeparture && dateOfDeparture < dateOfEnrollment) {
      throw new BadRequestException(
        'dateOfDeparture cannot be before dateOfEnrollment',
      );
    }
  }

  private normalizeSubjectOptionName(name: string) {
    const normalized = name.trim();

    if (!normalized) {
      throw new BadRequestException('Subject option name is required');
    }

    return normalized;
  }

  private async getStudentRecordOrThrow(studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        role: true,
        memberships: {
          where: { isActive: true },
          select: { schoolId: true },
        },
      },
    });

    if (!student || student.role !== UserRole.STUDENT) {
      throw new NotFoundException('Student not found');
    }

    return student;
  }

  private ensureUserCanAccessStudentEnrollment(
    user: AuthenticatedUser,
    student: Awaited<ReturnType<EnrollmentHistoryService['getStudentRecordOrThrow']>>,
    accessType: 'read' | 'write',
  ) {
    if (accessType === 'write') {
      if (!this.canManageEnrollmentHistory(user.role)) {
        throw new ForbiddenException(
          'You do not have enrollment history write access',
        );
      }
      return;
    }

    if (!this.canReadEnrollmentHistory(user.role)) {
      throw new ForbiddenException(
        'You do not have enrollment history access',
      );
    }

    if (isBypassRole(user.role)) {
      return;
    }

    const studentSchoolIds = student.memberships.map((membership) => membership.schoolId);
    const userSchoolIds = getAccessibleSchoolIds(user);
    const hasOverlap = studentSchoolIds.some((schoolId) =>
      userSchoolIds.includes(schoolId),
    );

    if (!hasOverlap) {
      throw new ForbiddenException('You do not have school access');
    }
  }

  private async resolveSubjectNamesFromOptionIds(subjectOptionIds?: string[]) {
    if (!subjectOptionIds) {
      return [] as string[];
    }

    const normalizedIds = Array.from(
      new Set(subjectOptionIds.map((entry) => entry.trim()).filter(Boolean)),
    );

    if (normalizedIds.length === 0) {
      return [] as string[];
    }

    const subjectOptions = await this.prisma.enrollmentSubjectOption.findMany({
      where: {
        id: { in: normalizedIds },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (subjectOptions.length !== normalizedIds.length) {
      throw new BadRequestException(
        'subjectOptionIds must reference active subject options',
      );
    }

    const namesById = new Map(
      subjectOptions.map((subjectOption) => [subjectOption.id, subjectOption.name]),
    );

    return normalizedIds.map((id) => namesById.get(id) ?? '');
  }

  private serializeEnrollmentHistory(history: EnrollmentHistoryWithSubjects) {
    return {
      ...history,
      selectedSubjects: history.subjects.map((subject) => subject.subjectName),
    };
  }

  private async findEnrollmentHistoryByStudent(studentId: string) {
    return this.prisma.enrollmentHistory.findUnique({
      where: { studentId },
      include: enrollmentHistoryWithSubjectsInclude,
    });
  }

  async getByStudent(user: AuthenticatedUser, studentId: string) {
    const student = await this.getStudentRecordOrThrow(studentId);
    this.ensureUserCanAccessStudentEnrollment(user, student, 'read');

    const history = await this.findEnrollmentHistoryByStudent(studentId);

    if (!history) {
      return null;
    }

    return this.serializeEnrollmentHistory(history);
  }

  async create(
    user: AuthenticatedUser,
    studentId: string,
    data: CreateEnrollmentHistoryDto,
  ) {
    const student = await this.getStudentRecordOrThrow(studentId);
    this.ensureUserCanAccessStudentEnrollment(user, student, 'write');

    const existing = await this.prisma.enrollmentHistory.findUnique({
      where: { studentId },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'Enrollment history already exists for this student',
      );
    }

    const dateOfEnrollment = parseDateOnlyOrThrow(
      data.dateOfEnrollment,
      'dateOfEnrollment',
    );
    const dateOfDeparture = data.dateOfDeparture
      ? parseDateOnlyOrThrow(data.dateOfDeparture, 'dateOfDeparture')
      : null;

    this.validateDateOrder(dateOfEnrollment, dateOfDeparture);

    const subjectNames = await this.resolveSubjectNamesFromOptionIds(
      data.subjectOptionIds,
    );

    const created = await this.prisma.$transaction(async (transaction) => {
      const enrollmentHistory = await transaction.enrollmentHistory.create({
        data: {
          studentId,
          dateOfEnrollment,
          dateOfDeparture,
          previousSchoolName: data.previousSchoolName ?? null,
          status: data.status,
          notes: data.notes ?? null,
        },
      });

      if (subjectNames.length > 0) {
        await transaction.enrollmentHistorySubject.createMany({
          data: subjectNames.map((subjectName, index) => ({
            enrollmentHistoryId: enrollmentHistory.id,
            subjectName,
            sortOrder: index,
          })),
        });
      }

      return transaction.enrollmentHistory.findUniqueOrThrow({
        where: { id: enrollmentHistory.id },
        include: enrollmentHistoryWithSubjectsInclude,
      });
    });

    return this.serializeEnrollmentHistory(created);
  }

  async update(
    user: AuthenticatedUser,
    studentId: string,
    data: UpdateEnrollmentHistoryDto,
  ) {
    const student = await this.getStudentRecordOrThrow(studentId);
    this.ensureUserCanAccessStudentEnrollment(user, student, 'write');

    const existing = await this.findEnrollmentHistoryByStudent(studentId);

    if (!existing) {
      throw new NotFoundException('Enrollment history not found');
    }

    const nextDateOfEnrollment =
      data.dateOfEnrollment !== undefined
        ? parseDateOnlyOrThrow(data.dateOfEnrollment, 'dateOfEnrollment')
        : existing.dateOfEnrollment;
    const nextDateOfDeparture =
      data.dateOfDeparture !== undefined
        ? data.dateOfDeparture
          ? parseDateOnlyOrThrow(data.dateOfDeparture, 'dateOfDeparture')
          : null
        : existing.dateOfDeparture;

    this.validateDateOrder(nextDateOfEnrollment, nextDateOfDeparture);

    const updateData: Prisma.EnrollmentHistoryUpdateInput = {};

    if (data.dateOfEnrollment !== undefined) {
      updateData.dateOfEnrollment = nextDateOfEnrollment;
    }

    if (data.dateOfDeparture !== undefined) {
      updateData.dateOfDeparture = nextDateOfDeparture;
    }

    if (data.previousSchoolName !== undefined) {
      updateData.previousSchoolName = data.previousSchoolName;
    }

    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    const updated = await this.prisma.enrollmentHistory.update({
      where: { id: existing.id },
      data: updateData,
      include: enrollmentHistoryWithSubjectsInclude,
    });

    return this.serializeEnrollmentHistory(updated);
  }

  async replaceSubjects(
    user: AuthenticatedUser,
    studentId: string,
    data: ReplaceEnrollmentSubjectsDto,
  ) {
    const student = await this.getStudentRecordOrThrow(studentId);
    this.ensureUserCanAccessStudentEnrollment(user, student, 'write');

    const existing = await this.findEnrollmentHistoryByStudent(studentId);

    if (!existing) {
      throw new NotFoundException('Enrollment history not found');
    }

    const subjectNames = await this.resolveSubjectNamesFromOptionIds(
      data.subjectOptionIds,
    );

    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.enrollmentHistorySubject.deleteMany({
        where: {
          enrollmentHistoryId: existing.id,
        },
      });

      if (subjectNames.length > 0) {
        await transaction.enrollmentHistorySubject.createMany({
          data: subjectNames.map((subjectName, index) => ({
            enrollmentHistoryId: existing.id,
            subjectName,
            sortOrder: index,
          })),
        });
      }

      return transaction.enrollmentHistory.findUniqueOrThrow({
        where: { id: existing.id },
        include: enrollmentHistoryWithSubjectsInclude,
      });
    });

    return this.serializeEnrollmentHistory(updated);
  }

  async listSubjectOptions(
    user: AuthenticatedUser,
    options?: { includeInactive?: boolean },
  ) {
    if (!this.canListSubjectOptions(user.role)) {
      throw new ForbiddenException('You do not have enrollment history access');
    }

    const includeInactive = options?.includeInactive ?? false;
    if (includeInactive && !this.canManageSubjectOptions(user.role)) {
      throw new ForbiddenException(
        'Only owners and super admins can list inactive subject options',
      );
    }

    return this.prisma.enrollmentSubjectOption.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createSubjectOption(
    user: AuthenticatedUser,
    data: CreateEnrollmentSubjectOptionDto,
  ) {
    if (!this.canManageSubjectOptions(user.role)) {
      throw new ForbiddenException(
        'Only owners and super admins can manage subject options',
      );
    }

    try {
      return await this.prisma.enrollmentSubjectOption.create({
        data: {
          name: this.normalizeSubjectOptionName(data.name),
          sortOrder: data.sortOrder ?? 0,
          isActive: data.isActive ?? true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A subject option with this name already exists');
      }

      throw error;
    }
  }

  private async getSubjectOptionOrThrow(id: string) {
    const subjectOption = await this.prisma.enrollmentSubjectOption.findUnique({
      where: { id },
    });

    if (!subjectOption) {
      throw new NotFoundException('Subject option not found');
    }

    return subjectOption;
  }

  async updateSubjectOption(
    user: AuthenticatedUser,
    id: string,
    data: UpdateEnrollmentSubjectOptionDto,
  ) {
    if (!this.canManageSubjectOptions(user.role)) {
      throw new ForbiddenException(
        'Only owners and super admins can manage subject options',
      );
    }

    await this.getSubjectOptionOrThrow(id);

    const updateData: Prisma.EnrollmentSubjectOptionUpdateInput = {};

    if (data.name !== undefined) {
      updateData.name = this.normalizeSubjectOptionName(data.name);
    }

    if (data.sortOrder !== undefined) {
      updateData.sortOrder = data.sortOrder;
    }

    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    try {
      return await this.prisma.enrollmentSubjectOption.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A subject option with this name already exists');
      }

      throw error;
    }
  }

  async setSubjectOptionActiveState(
    user: AuthenticatedUser,
    id: string,
    isActive: boolean,
  ) {
    return this.updateSubjectOption(user, id, { isActive });
  }
}
