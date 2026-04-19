import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FormFieldType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
  isSchoolAdminRole,
} from '../common/access/school-access.util';
import { formatDateOnly, parseDateOnlyOrThrow } from '../common/dates/date-only.util';
import { safeUserSelect } from '../common/prisma/safe-user-response';

type AuthUser = AuthenticatedUser;

function isSchemaMissingError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2021' || error.code === 'P2022')
  );
}

@Injectable()
export class FormsService {
  constructor(private readonly prisma: PrismaService) {}

  private isManageRole(role: UserRole) {
    return (
      role === UserRole.OWNER ||
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.ADMIN
    );
  }

  private isResponsesReadRole(role: UserRole) {
    return this.isManageRole(role) || isSchoolAdminRole(role);
  }

  private ensureUserCanManageSchool(user: AuthUser, schoolId: string) {
    if (!this.isManageRole(user.role)) {
      throw new ForbiddenException('You do not have forms access');
    }

    if (!isBypassRole(user.role)) {
      ensureUserHasSchoolAccess(user, schoolId);
    }
  }

  private ensureUserCanReadResponses(user: AuthUser, schoolId: string) {
    if (!this.isResponsesReadRole(user.role)) {
      throw new ForbiddenException('You do not have forms access');
    }

    if (!isBypassRole(user.role)) {
      ensureUserHasSchoolAccess(user, schoolId);
    }
  }

  private parseDateTimeOrThrow(value: string, field: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid datetime`);
    }
    return parsed;
  }

  private validateOpenCloseWindow(opensAt: Date | null, closesAt: Date | null) {
    if (opensAt && closesAt && opensAt >= closesAt) {
      throw new BadRequestException('opensAt must be before closesAt');
    }
  }

  private isFormOpenNow(
    form: { isActive: boolean; opensAt: Date | null; closesAt: Date | null },
    now = new Date(),
  ) {
    if (!form.isActive) {
      return false;
    }

    if (form.opensAt && now < form.opensAt) {
      return false;
    }

    if (form.closesAt && now > form.closesAt) {
      return false;
    }

    return true;
  }

  private normalizeFieldKey(key: string) {
    const trimmed = key.trim().toUpperCase();
    if (!trimmed) {
      throw new BadRequestException('Form field key cannot be empty');
    }

    if (!/^[A-Z0-9_]+$/.test(trimmed)) {
      throw new BadRequestException(
        'Form field key must use letters, numbers, and underscores only',
      );
    }

    return trimmed;
  }

  private normalizeSelectOptions(options: string[], fieldKey: string) {
    const normalized = Array.from(
      new Set(options.map((entry) => entry.trim()).filter(Boolean)),
    );

    if (normalized.length === 0) {
      throw new BadRequestException(
        `Select field ${fieldKey} requires at least one option`,
      );
    }

    return normalized;
  }

  private normalizeFormFields(
    fields: Array<{
      key: string;
      label: string;
      type: FormFieldType;
      options?: string[];
      sortOrder?: number;
      isRequired?: boolean;
      isActive?: boolean;
    }>,
  ) {
    if (fields.length === 0) {
      throw new BadRequestException('At least one form field is required');
    }

    const seenKeys = new Set<string>();
    return fields.map((field, index) => {
      const key = this.normalizeFieldKey(field.key);
      if (seenKeys.has(key)) {
        throw new BadRequestException(`Duplicate field key: ${key}`);
      }
      seenKeys.add(key);

      const label = field.label.trim();
      if (!label) {
        throw new BadRequestException(`Field label is required for ${key}`);
      }

      if (field.type === FormFieldType.SELECT) {
        if (!field.options) {
          throw new BadRequestException(
            `Select field ${key} requires options`,
          );
        }
      } else if (field.options && field.options.length > 0) {
        throw new BadRequestException(
          `Only SELECT fields can define options (${key})`,
        );
      }

      return {
        key,
        label,
        type: field.type,
        optionsJson:
          field.type === FormFieldType.SELECT && field.options
            ? this.normalizeSelectOptions(field.options, key)
            : undefined,
        sortOrder: field.sortOrder ?? index,
        isRequired: field.isRequired ?? false,
        isActive: field.isActive ?? true,
      };
    });
  }

  private parseOptionsJson(
    value: Prisma.JsonValue | null,
    fieldKey: string,
  ): string[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(
        `Select field ${fieldKey} is missing configured options`,
      );
    }

    const options = value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (options.length === 0) {
      throw new BadRequestException(
        `Select field ${fieldKey} is missing configured options`,
      );
    }

    return options;
  }

  private normalizeFieldValue(
    field: {
      key: string;
      type: FormFieldType;
      optionsJson: Prisma.JsonValue | null;
      isRequired: boolean;
    },
    value: string | null | undefined,
  ) {
    const raw = value?.trim() ?? null;

    if (!raw) {
      if (field.isRequired) {
        throw new BadRequestException(`Field ${field.key} is required`);
      }

      return null;
    }

    if (
      field.type === FormFieldType.SHORT_TEXT ||
      field.type === FormFieldType.LONG_TEXT
    ) {
      return raw;
    }

    if (field.type === FormFieldType.SELECT) {
      const options = this.parseOptionsJson(field.optionsJson, field.key);
      if (!options.includes(raw)) {
        throw new BadRequestException(
          `Field ${field.key} must be one of the configured options`,
        );
      }
      return raw;
    }

    if (field.type === FormFieldType.CHECKBOX) {
      const normalized = raw.toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(normalized)) {
        return 'true';
      }

      if (['false', '0', 'no', 'n'].includes(normalized)) {
        return 'false';
      }

      throw new BadRequestException(
        `Field ${field.key} must be a checkbox value`,
      );
    }

    const parsed = parseDateOnlyOrThrow(raw, `Field ${field.key}`);
    return formatDateOnly(parsed);
  }

  private async getFormOrThrow(id: string) {
    const form = await this.prisma.form.findUnique({
      where: { id },
      include: {
        fields: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    return form;
  }

  private async getParentLinkedStudents(parentId: string) {
    return this.prisma.studentParentLink.findMany({
      where: { parentId },
      select: {
        studentId: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            memberships: {
              where: { isActive: true },
              select: {
                schoolId: true,
              },
            },
          },
        },
      },
    });
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
            memberships: {
              where: { isActive: true },
              select: {
                schoolId: true,
              },
            },
          },
        },
      },
    });

    if (!link) {
      throw new ForbiddenException('You are not linked to this student');
    }

    return link.student;
  }

  async create(
    user: AuthUser,
    data: {
      schoolId: string;
      title: string;
      description?: string | null;
      isActive?: boolean;
      opensAt?: string;
      closesAt?: string;
      requiresStudentContext?: boolean;
      fields: Array<{
        key: string;
        label: string;
        type: FormFieldType;
        options?: string[];
        sortOrder?: number;
        isRequired?: boolean;
        isActive?: boolean;
      }>;
    },
  ) {
    const schoolId = data.schoolId.trim();
    if (!schoolId) {
      throw new BadRequestException('schoolId is required');
    }

    this.ensureUserCanManageSchool(user, schoolId);

    const title = data.title.trim();
    if (!title) {
      throw new BadRequestException('title is required');
    }

    const opensAt = data.opensAt
      ? this.parseDateTimeOrThrow(data.opensAt, 'opensAt')
      : null;
    const closesAt = data.closesAt
      ? this.parseDateTimeOrThrow(data.closesAt, 'closesAt')
      : null;
    this.validateOpenCloseWindow(opensAt, closesAt);

    const fields = this.normalizeFormFields(data.fields);

    try {
      return await this.prisma.form.create({
        data: {
          schoolId,
          createdByUserId: user.id,
          title,
          description: data.description ?? null,
          isActive: data.isActive ?? true,
          opensAt,
          closesAt,
          requiresStudentContext: data.requiresStudentContext ?? false,
          fields: {
            create: fields,
          },
        },
        include: {
          fields: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Forms migrations are required before creating forms. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }

  async list(
    user: AuthUser,
    options?: {
      schoolId?: string;
      includeInactive?: boolean;
    },
  ) {
    if (!this.isResponsesReadRole(user.role) && !this.isManageRole(user.role)) {
      throw new ForbiddenException('You do not have forms access');
    }

    const schoolId = options?.schoolId?.trim() || null;
    const includeInactive = options?.includeInactive ?? false;

    if (schoolId) {
      if (!isBypassRole(user.role)) {
        ensureUserHasSchoolAccess(user, schoolId);
      }
    }

    const accessibleSchoolIds = getAccessibleSchoolIds(user);

    try {
      return await this.prisma.form.findMany({
        where: {
          ...(schoolId
            ? { schoolId }
            : isBypassRole(user.role)
              ? {}
              : { schoolId: { in: accessibleSchoolIds } }),
          ...(includeInactive ? {} : { isActive: true }),
        },
        include: {
          fields: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
          _count: {
            select: {
              responses: true,
            },
          },
          school: {
            select: {
              id: true,
              name: true,
              shortName: true,
              isActive: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return [];
      }

      throw error;
    }
  }

  async listForParent(user: AuthUser, studentId?: string) {
    if (user.role !== UserRole.PARENT) {
      throw new ForbiddenException('You do not have parent forms access');
    }

    const normalizedStudentId = studentId?.trim() || null;
    const now = new Date();
    let schoolIds: string[] = [];

    if (normalizedStudentId) {
      const linkedStudent = await this.ensureParentLinkedToStudent(
        user.id,
        normalizedStudentId,
      );
      schoolIds = linkedStudent.memberships.map((membership) => membership.schoolId);
    } else {
      const linkedStudents = await this.getParentLinkedStudents(user.id);
      schoolIds = linkedStudents.flatMap((entry) =>
        entry.student.memberships.map((membership) => membership.schoolId),
      );
    }

    const uniqueSchoolIds = [...new Set(schoolIds.filter(Boolean))];
    if (uniqueSchoolIds.length === 0) {
      return [];
    }

    try {
      const forms = await this.prisma.form.findMany({
        where: {
          schoolId: { in: uniqueSchoolIds },
          isActive: true,
        },
        include: {
          fields: {
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
          school: {
            select: {
              id: true,
              name: true,
              shortName: true,
              isActive: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      });

      if (forms.length === 0) {
        return [];
      }

      const responseMatches = await this.prisma.formResponse.findMany({
        where: {
          parentId: user.id,
          formId: { in: forms.map((form) => form.id) },
        },
        select: {
          formId: true,
          studentId: true,
        },
      });

      const responsesByFormId = new Map<
        string,
        Array<{ formId: string; studentId: string | null }>
      >();
      for (const response of responseMatches) {
        if (!responsesByFormId.has(response.formId)) {
          responsesByFormId.set(response.formId, []);
        }
        responsesByFormId.get(response.formId)!.push(response);
      }

      return forms.map((form) => {
        const formResponses = responsesByFormId.get(form.id) ?? [];

        const hasSubmitted = form.requiresStudentContext
          ? normalizedStudentId
            ? formResponses.some(
                (response) => response.studentId === normalizedStudentId,
              )
            : formResponses.some((response) => Boolean(response.studentId))
          : formResponses.some((response) => response.studentId === null);

        const state = hasSubmitted
          ? 'SUBMITTED'
          : this.isFormOpenNow(form, now)
            ? 'OPEN'
            : 'CLOSED';

        return {
          ...form,
          hasSubmitted,
          state,
        };
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return [];
      }

      throw error;
    }
  }

  async findOne(user: AuthUser, id: string) {
    const form = await this.getFormOrThrow(id);
    this.ensureUserCanReadResponses(user, form.schoolId);
    return form;
  }

  async update(
    user: AuthUser,
    id: string,
    data: {
      title?: string;
      description?: string | null;
      isActive?: boolean;
      opensAt?: string;
      closesAt?: string;
      requiresStudentContext?: boolean;
      fields?: Array<{
        key: string;
        label: string;
        type: FormFieldType;
        options?: string[];
        sortOrder?: number;
        isRequired?: boolean;
        isActive?: boolean;
      }>;
    },
  ) {
    const existing = await this.prisma.form.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            responses: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Form not found');
    }

    this.ensureUserCanManageSchool(user, existing.schoolId);

    const opensAt =
      data.opensAt !== undefined
        ? data.opensAt
          ? this.parseDateTimeOrThrow(data.opensAt, 'opensAt')
          : null
        : existing.opensAt;
    const closesAt =
      data.closesAt !== undefined
        ? data.closesAt
          ? this.parseDateTimeOrThrow(data.closesAt, 'closesAt')
          : null
        : existing.closesAt;
    this.validateOpenCloseWindow(opensAt, closesAt);

    let normalizedFields:
      | Array<{
          key: string;
          label: string;
          type: FormFieldType;
          optionsJson: string[] | undefined;
          sortOrder: number;
          isRequired: boolean;
          isActive: boolean;
        }>
      | null = null;

    if (data.fields !== undefined) {
      if (existing._count.responses > 0) {
        throw new BadRequestException(
          'Cannot change form fields after responses have been submitted',
        );
      }

      normalizedFields = this.normalizeFormFields(data.fields);
    }

    let nextTitle: string | undefined;
    if (data.title !== undefined) {
      nextTitle = data.title.trim();
      if (!nextTitle) {
        throw new BadRequestException('title cannot be empty');
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.form.update({
          where: { id },
          data: {
            ...(nextTitle !== undefined ? { title: nextTitle } : {}),
            ...(data.description !== undefined
              ? { description: data.description ?? null }
              : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
            ...(data.requiresStudentContext !== undefined
              ? { requiresStudentContext: data.requiresStudentContext }
              : {}),
            ...(data.opensAt !== undefined ? { opensAt } : {}),
            ...(data.closesAt !== undefined ? { closesAt } : {}),
          },
        });

        if (normalizedFields) {
          await tx.formField.deleteMany({ where: { formId: id } });
          await tx.formField.createMany({
            data: normalizedFields.map((field) => ({
              formId: id,
              ...field,
            })),
          });
        }
      });

      return this.getFormOrThrow(id);
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Forms migrations are required before updating forms. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }

  async setActiveState(user: AuthUser, id: string, isActive: boolean) {
    const existing = await this.prisma.form.findUnique({
      where: { id },
      select: { id: true, schoolId: true },
    });

    if (!existing) {
      throw new NotFoundException('Form not found');
    }

    this.ensureUserCanManageSchool(user, existing.schoolId);

    try {
      return await this.prisma.form.update({
        where: { id },
        data: { isActive },
        include: {
          fields: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Forms migrations are required before updating forms. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.form.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        _count: {
          select: {
            responses: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Form not found');
    }

    this.ensureUserCanManageSchool(user, existing.schoolId);

    if (existing._count.responses > 0) {
      throw new BadRequestException(
        'This form already has submissions. Archive it instead of deleting it.',
      );
    }

    try {
      await this.prisma.form.delete({
        where: { id },
      });

      return { success: true as const, removalMode: 'deleted' as const };
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Forms migrations are required before deleting forms. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }

  async listActiveForParent(user: AuthUser, studentId?: string) {
    if (user.role !== UserRole.PARENT) {
      throw new ForbiddenException('You do not have parent forms access');
    }

    const now = new Date();
    let schoolIds: string[] = [];

    if (studentId?.trim()) {
      const linkedStudent = await this.ensureParentLinkedToStudent(
        user.id,
        studentId.trim(),
      );
      schoolIds = linkedStudent.memberships.map((membership) => membership.schoolId);
    } else {
      const linkedStudents = await this.getParentLinkedStudents(user.id);
      schoolIds = linkedStudents.flatMap((entry) =>
        entry.student.memberships.map((membership) => membership.schoolId),
      );
    }

    const uniqueSchoolIds = [...new Set(schoolIds)];
    if (uniqueSchoolIds.length === 0) {
      return [];
    }

    try {
      return await this.prisma.form.findMany({
        where: {
          schoolId: { in: uniqueSchoolIds },
          isActive: true,
          OR: [{ opensAt: null }, { opensAt: { lte: now } }],
          AND: [{ OR: [{ closesAt: null }, { closesAt: { gte: now } }] }],
        },
        include: {
          fields: {
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
          school: {
            select: {
              id: true,
              name: true,
              shortName: true,
              isActive: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }],
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return [];
      }

      throw error;
    }
  }

  async getForParent(user: AuthUser, id: string, studentId?: string | null) {
    if (user.role !== UserRole.PARENT) {
      throw new ForbiddenException('You do not have parent forms access');
    }

    const form = await this.prisma.form.findUnique({
      where: { id },
      include: {
        fields: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        school: {
          select: {
            id: true,
            name: true,
            shortName: true,
            isActive: true,
          },
        },
      },
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    const linkedStudents = await this.getParentLinkedStudents(user.id);
    const linkedStudentsInSchool = linkedStudents
      .filter((entry) =>
        entry.student.memberships.some(
          (membership) => membership.schoolId === form.schoolId,
        ),
      )
      .map((entry) => entry.student);

    if (linkedStudentsInSchool.length === 0) {
      throw new ForbiddenException('You do not have access to this form');
    }

    if (studentId?.trim()) {
      const selectedStudent = await this.ensureParentLinkedToStudent(
        user.id,
        studentId.trim(),
      );

      if (
        !selectedStudent.memberships.some(
          (membership) => membership.schoolId === form.schoolId,
        )
      ) {
        throw new ForbiddenException('Selected student is not in the form school');
      }
    }

    if (!this.isFormOpenNow(form)) {
      throw new ForbiddenException('This form is not currently available');
    }

    return {
      ...form,
      linkedStudents: linkedStudentsInSchool.map((student) => ({
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
      })),
    };
  }

  async submit(
    user: AuthUser,
    id: string,
    data: {
      studentId?: string | null;
      values: Array<{ fieldId: string; value?: string | null }>;
    },
  ) {
    if (user.role !== UserRole.PARENT) {
      throw new ForbiddenException('You do not have parent forms access');
    }

    const form = await this.prisma.form.findUnique({
      where: { id },
      include: {
        fields: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    if (!this.isFormOpenNow(form)) {
      throw new ForbiddenException('This form is not currently open for submissions');
    }

    const normalizedStudentId = data.studentId?.trim() || null;
    if (form.requiresStudentContext && !normalizedStudentId) {
      throw new BadRequestException('studentId is required for this form');
    }

    if (normalizedStudentId) {
      const linkedStudent = await this.ensureParentLinkedToStudent(
        user.id,
        normalizedStudentId,
      );
      if (
        !linkedStudent.memberships.some(
          (membership) => membership.schoolId === form.schoolId,
        )
      ) {
        throw new ForbiddenException('Selected student is not in the form school');
      }
    } else {
      const linkedStudents = await this.getParentLinkedStudents(user.id);
      const hasSchoolAccess = linkedStudents.some((entry) =>
        entry.student.memberships.some(
          (membership) => membership.schoolId === form.schoolId,
        ),
      );
      if (!hasSchoolAccess) {
        throw new ForbiddenException('You do not have access to this form');
      }
    }

    const existing = await this.prisma.formResponse.findFirst({
      where: {
        formId: form.id,
        parentId: user.id,
        studentId: normalizedStudentId,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'A submission already exists for this form and student context',
      );
    }

    const valuesByFieldId = new Map<string, string | null | undefined>();
    for (const valueEntry of data.values) {
      if (valuesByFieldId.has(valueEntry.fieldId)) {
        throw new BadRequestException(
          `Duplicate field value submitted for ${valueEntry.fieldId}`,
        );
      }
      valuesByFieldId.set(valueEntry.fieldId, valueEntry.value);
    }

    const fieldById = new Map(form.fields.map((field) => [field.id, field]));
    for (const fieldId of valuesByFieldId.keys()) {
      if (!fieldById.has(fieldId)) {
        throw new BadRequestException(`Unknown fieldId: ${fieldId}`);
      }
    }

    const responseValues: Array<{ fieldId: string; valueText: string }> = [];
    for (const field of form.fields) {
      const normalizedValue = this.normalizeFieldValue(
        field,
        valuesByFieldId.get(field.id),
      );
      if (normalizedValue !== null) {
        responseValues.push({
          fieldId: field.id,
          valueText: normalizedValue,
        });
      }
    }

    try {
      return await this.prisma.formResponse.create({
        data: {
          formId: form.id,
          schoolId: form.schoolId,
          parentId: user.id,
          studentId: normalizedStudentId,
          values: {
            createMany: {
              data: responseValues,
            },
          },
        },
        include: {
          values: {
            include: {
              field: {
                select: {
                  id: true,
                  key: true,
                  label: true,
                  type: true,
                  sortOrder: true,
                },
              },
            },
            orderBy: {
              field: {
                sortOrder: 'asc',
              },
            },
          },
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Forms migrations are required before submitting forms. Apply the latest Prisma migrations and try again.',
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A submission already exists for this form and student context',
        );
      }

      throw error;
    }
  }

  async getResponses(user: AuthUser, id: string) {
    const form = await this.prisma.form.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
      },
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    this.ensureUserCanReadResponses(user, form.schoolId);

    try {
      return await this.prisma.formResponse.findMany({
        where: { formId: id },
        include: {
          parent: {
            select: safeUserSelect,
          },
          student: {
            select: safeUserSelect,
          },
          values: {
            include: {
              field: {
                select: {
                  id: true,
                  key: true,
                  label: true,
                  type: true,
                  sortOrder: true,
                },
              },
            },
            orderBy: {
              field: {
                sortOrder: 'asc',
              },
            },
          },
        },
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return [];
      }

      throw error;
    }
  }
}
