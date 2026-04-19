import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/auth/auth-user';
import {
  getAccessibleSchoolIds,
  isBypassRole,
  isSchoolAdminRole,
} from '../common/access/school-access.util';
import { parseDateOnlyOrThrow } from '../common/dates/date-only.util';
import {
  safeUserSchoolMembershipSelect,
  safeUserSelect,
} from '../common/prisma/safe-user-response';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ReRegistrationDto } from './dto/re-registration.dto';
import { ReRegistrationService } from '../re-registration/re-registration.service';

const legacyStudentProfileFieldNames = [
  'dateOfBirth',
  'gender',
  'addressLine1',
  'addressLine2',
  'city',
  'province',
  'postalCode',
  'emergencyContactName',
  'emergencyContactPhone',
  'emergencyContactRelationship',
] as const;

const expandedStudentProfileFieldNames = [
  'gradeLevelId',
  'studentNumber',
  'oen',
  'studentEmail',
  'allergies',
  'medicalConditions',
  'healthCardNumber',
  'guardian1Name',
  'guardian1Email',
  'guardian1Phone',
  'guardian1Address',
  'guardian1Relationship',
  'guardian1WorkPhone',
  'guardian2Name',
  'guardian2Email',
  'guardian2Phone',
  'guardian2Address',
  'guardian2Relationship',
  'guardian2WorkPhone',
] as const;

const studentProfileFieldNames = [
  ...legacyStudentProfileFieldNames,
  ...expandedStudentProfileFieldNames,
  'schoolId',
] as const;

const expandedStudentProfileFieldLabels: Record<
  (typeof expandedStudentProfileFieldNames)[number],
  string
> = {
  gradeLevelId: 'grade level',
  studentNumber: 'student number',
  oen: 'OEN',
  studentEmail: 'student email',
  allergies: 'allergies',
  medicalConditions: 'medical conditions',
  healthCardNumber: 'health card number',
  guardian1Name: 'guardian 1',
  guardian1Email: 'guardian 1 email',
  guardian1Phone: 'guardian 1 phone',
  guardian1Address: 'guardian 1 address',
  guardian1Relationship: 'guardian 1 relationship',
  guardian1WorkPhone: 'guardian 1 work phone',
  guardian2Name: 'guardian 2',
  guardian2Email: 'guardian 2 email',
  guardian2Phone: 'guardian 2 phone',
  guardian2Address: 'guardian 2 address',
  guardian2Relationship: 'guardian 2 relationship',
  guardian2WorkPhone: 'guardian 2 work phone',
};

const gradeLevelSummarySelect = Prisma.validator<Prisma.GradeLevelSelect>()({
  id: true,
  schoolId: true,
  name: true,
  sortOrder: true,
  isActive: true,
});

const studentProfileSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  username: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  gradeLevelId: true,
  studentNumber: true,
  oen: true,
  dateOfBirth: true,
  gender: true,
  studentEmail: true,
  allergies: true,
  medicalConditions: true,
  healthCardNumber: true,
  guardian1Name: true,
  guardian1Email: true,
  guardian1Phone: true,
  guardian1Address: true,
  guardian1Relationship: true,
  guardian1WorkPhone: true,
  guardian2Name: true,
  guardian2Email: true,
  guardian2Phone: true,
  guardian2Address: true,
  guardian2Relationship: true,
  guardian2WorkPhone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  province: true,
  postalCode: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  emergencyContactRelationship: true,
  createdAt: true,
  updatedAt: true,
  gradeLevel: {
    select: gradeLevelSummarySelect,
  },
  memberships: {
    select: safeUserSchoolMembershipSelect,
    orderBy: {
      createdAt: 'asc',
    },
  },
});

type StudentProfileRecord = Prisma.UserGetPayload<{
  select: typeof studentProfileSelect;
}>;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reRegistrationService: ReRegistrationService,
  ) {}

  private isAdminLike(role: UserRole) {
    return isBypassRole(role) || isSchoolAdminRole(role);
  }

  private normalizeDateOnly(input: string): Date {
    return parseDateOnlyOrThrow(input, 'dateOfBirth');
  }

  private async getStudentOrThrow(studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        role: true,
        memberships: {
          where: {
            isActive: true,
          },
          select: {
            schoolId: true,
          },
        },
      },
    });

    if (!student || student.role !== UserRole.STUDENT) {
      throw new NotFoundException('Student not found');
    }

    return student;
  }

  private maskHealthCardNumber(value: string | null) {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();

    if (trimmed.length <= 4) {
      return '****';
    }

    return `${'*'.repeat(Math.max(4, trimmed.length - 4))}${trimmed.slice(-4)}`;
  }

  private getPrimaryStudentSchoolId(
    student: Awaited<ReturnType<StudentsService['getStudentOrThrow']>>,
  ) {
    if (student.memberships.length === 0) {
      return null;
    }

    if (student.memberships.length > 1) {
      throw new BadRequestException(
        'Student profile updates require a single active school membership',
      );
    }

    return student.memberships[0].schoolId;
  }

  private getMissingStudentProfileFieldName(error: unknown) {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    const missingColumn =
      error &&
      typeof error === 'object' &&
      'meta' in error &&
      error.meta &&
      typeof error.meta === 'object' &&
      'column' in error.meta &&
      typeof error.meta.column === 'string'
        ? error.meta.column.toLowerCase()
        : '';
    const haystack = `${missingColumn} ${message}`;

    if (haystack.includes('gradelevel')) {
      return 'gradeLevelId';
    }

    return (
      studentProfileFieldNames.find((fieldName) =>
        haystack.includes(fieldName.toLowerCase()),
      ) ?? null
    );
  }

  private buildSchemaBehindWriteMessage(data: UpdateStudentDto, missingField?: string | null) {
    const requestedExpandedFields = expandedStudentProfileFieldNames.filter(
      (fieldName) => data[fieldName] !== undefined,
    );
    const labels = Array.from(
      new Set(
        requestedExpandedFields.map((fieldName) => expandedStudentProfileFieldLabels[fieldName]),
      ),
    );

    if (labels.length > 0) {
      return `Student profile migrations are required before saving ${labels.join(', ')}. Apply the latest Prisma migrations and try again.`;
    }

    if (missingField && missingField !== 'schoolId') {
      const fieldLabel =
        missingField in expandedStudentProfileFieldLabels
          ? expandedStudentProfileFieldLabels[
              missingField as keyof typeof expandedStudentProfileFieldLabels
            ]
          : missingField;

      return `Student profile migrations are required before saving ${fieldLabel}. Apply the latest Prisma migrations and try again.`;
    }

    return 'Student profile migrations are required before saving profile changes. Apply the latest Prisma migrations and try again.';
  }

  private sanitizeStudentProfileForActor(
    actor: AuthenticatedUser,
    student: StudentProfileRecord,
  ): StudentProfileRecord {
    if (this.isAdminLike(actor.role)) {
      return student;
    }

    return {
      ...student,
      healthCardNumber: this.maskHealthCardNumber(student.healthCardNumber),
    };
  }

  private isMissingStudentProfileColumnError(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
      return false;
    }

    if (error.code !== 'P2022' && error.code !== 'P2021') {
      return false;
    }

    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    const missingColumn =
      'meta' in error &&
      error.meta &&
      typeof error.meta === 'object' &&
      'column' in error.meta &&
      typeof error.meta.column === 'string'
        ? error.meta.column.toLowerCase()
        : '';
    const haystack = `${missingColumn} ${message}`;

    if (haystack.includes('gradelevel')) {
      return true;
    }

    return studentProfileFieldNames.some(
      (fieldName) =>
        haystack.includes(fieldName.toLowerCase()),
    );
  }

  private withLegacyStudentProfileDefaults(
    student: Prisma.UserGetPayload<{ select: typeof safeUserSelect }>,
  ): StudentProfileRecord {
    return {
      ...student,
      studentNumber: null,
      oen: null,
      dateOfBirth: null,
      gender: null,
      studentEmail: null,
      allergies: null,
      medicalConditions: null,
      healthCardNumber: null,
      guardian1Name: null,
      guardian1Email: null,
      guardian1Phone: null,
      guardian1Address: null,
      guardian1Relationship: null,
      guardian1WorkPhone: null,
      guardian2Name: null,
      guardian2Email: null,
      guardian2Phone: null,
      guardian2Address: null,
      guardian2Relationship: null,
      guardian2WorkPhone: null,
      gradeLevelId: null,
      gradeLevel: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      province: null,
      postalCode: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      emergencyContactRelationship: null,
    };
  }

  private async findStudentProfile(studentId: string): Promise<StudentProfileRecord> {
    try {
      return await this.prisma.user.findUniqueOrThrow({
        where: { id: studentId },
        select: studentProfileSelect,
      });
    } catch (error) {
      if (!this.isMissingStudentProfileColumnError(error)) {
        throw error;
      }

      const legacyStudent = await this.prisma.user.findUniqueOrThrow({
        where: { id: studentId },
        select: safeUserSelect,
      });

      return this.withLegacyStudentProfileDefaults(legacyStudent);
    }
  }

  private ensureAdminCanAccessStudent(
    actor: AuthenticatedUser,
    student: Awaited<ReturnType<StudentsService['getStudentOrThrow']>>,
  ) {
    if (isBypassRole(actor.role)) {
      return;
    }

    const accessibleSchoolIds = new Set(getAccessibleSchoolIds(actor));
    const hasAccess = student.memberships.some((membership) =>
      accessibleSchoolIds.has(membership.schoolId),
    );

    if (!hasAccess) {
      throw new ForbiddenException('You do not have student access');
    }
  }

  private async ensureParentLinkedToStudent(
    parentId: string,
    studentId: string,
  ) {
    const link = await this.prisma.studentParentLink.findUnique({
      where: {
        parentId_studentId: {
          parentId,
          studentId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!link) {
      throw new ForbiddenException('You do not have student access');
    }
  }

  async findParents(actor: AuthenticatedUser, studentId: string) {
    if (!this.isAdminLike(actor.role)) {
      throw new ForbiddenException('You do not have student access');
    }

    const student = await this.getStudentOrThrow(studentId);
    this.ensureAdminCanAccessStudent(actor, student);

    return this.prisma.studentParentLink.findMany({
      where: { studentId },
      select: {
        id: true,
        parentId: true,
        studentId: true,
        createdAt: true,
        parent: {
          select: safeUserSelect,
        },
      },
      orderBy: [
        { parent: { lastName: 'asc' } },
        { parent: { firstName: 'asc' } },
      ],
    });
  }

  async findOne(actor: AuthenticatedUser, studentId: string) {
    const student = await this.getStudentOrThrow(studentId);

    if (this.isAdminLike(actor.role)) {
      this.ensureAdminCanAccessStudent(actor, student);
    } else if (actor.role === UserRole.PARENT) {
      await this.ensureParentLinkedToStudent(actor.id, studentId);
    } else {
      throw new ForbiddenException('You do not have student access');
    }

    const studentProfile = await this.findStudentProfile(studentId);
    return this.sanitizeStudentProfileForActor(actor, studentProfile);
  }

  async update(actor: AuthenticatedUser, studentId: string, data: UpdateStudentDto) {
    const student = await this.getStudentOrThrow(studentId);

    if (!this.isAdminLike(actor.role)) {
      throw new ForbiddenException('You do not have student access');
    }

    this.ensureAdminCanAccessStudent(actor, student);

    const updateData: Prisma.UserUpdateInput = {};
    const shouldResolvePrimarySchool =
      data.studentNumber !== undefined ||
      data.oen !== undefined ||
      (data.gradeLevelId !== undefined && data.gradeLevelId !== null);
    const primarySchoolId = shouldResolvePrimarySchool
      ? this.getPrimaryStudentSchoolId(student)
      : null;

    if (data.studentNumber !== undefined) {
      if (data.studentNumber !== null && !primarySchoolId) {
        throw new BadRequestException(
          'Student must belong to a school before a student number can be assigned',
        );
      }

      updateData.studentNumber = data.studentNumber;
    }

    if (primarySchoolId && shouldResolvePrimarySchool) {
      updateData.school = {
        connect: {
          id: primarySchoolId,
        },
      };
    }

    if (data.oen !== undefined) {
      updateData.oen = data.oen;
    }

    if (data.gradeLevelId !== undefined) {
      if (data.gradeLevelId === null) {
        updateData.gradeLevel = {
          disconnect: true,
        };
      } else {
        if (!primarySchoolId) {
          throw new BadRequestException(
            'Student must belong to a school before a grade level can be assigned',
          );
        }

        let gradeLevel: { id: string; schoolId: string } | null;

        try {
          gradeLevel = await this.prisma.gradeLevel.findUnique({
            where: { id: data.gradeLevelId },
            select: {
              id: true,
              schoolId: true,
            },
          });
        } catch (error) {
          if (this.isMissingStudentProfileColumnError(error)) {
            throw new ConflictException(
              this.buildSchemaBehindWriteMessage(
                data,
                this.getMissingStudentProfileFieldName(error),
              ),
            );
          }

          throw error;
        }

        if (!gradeLevel) {
          throw new NotFoundException('Grade level not found');
        }

        if (gradeLevel.schoolId !== primarySchoolId) {
          throw new BadRequestException(
            'Grade level must belong to the student school',
          );
        }

        updateData.gradeLevel = {
          connect: {
            id: gradeLevel.id,
          },
        };
      }
    }

    if (data.dateOfBirth !== undefined) {
      updateData.dateOfBirth =
        data.dateOfBirth === null ? null : this.normalizeDateOnly(data.dateOfBirth);
    }

    if (data.gender !== undefined) {
      updateData.gender = data.gender;
    }

    if (data.studentEmail !== undefined) {
      updateData.studentEmail = data.studentEmail;
    }

    if (data.allergies !== undefined) {
      updateData.allergies = data.allergies;
    }

    if (data.medicalConditions !== undefined) {
      updateData.medicalConditions = data.medicalConditions;
    }

    if (data.healthCardNumber !== undefined) {
      updateData.healthCardNumber = data.healthCardNumber;
    }

    if (data.guardian1Name !== undefined) {
      updateData.guardian1Name = data.guardian1Name;
    }

    if (data.guardian1Email !== undefined) {
      updateData.guardian1Email = data.guardian1Email;
    }

    if (data.guardian1Phone !== undefined) {
      updateData.guardian1Phone = data.guardian1Phone;
    }

    if (data.guardian1Address !== undefined) {
      updateData.guardian1Address = data.guardian1Address;
    }

    if (data.guardian1Relationship !== undefined) {
      updateData.guardian1Relationship = data.guardian1Relationship;
    }

    if (data.guardian1WorkPhone !== undefined) {
      updateData.guardian1WorkPhone = data.guardian1WorkPhone;
    }

    if (data.guardian2Name !== undefined) {
      updateData.guardian2Name = data.guardian2Name;
    }

    if (data.guardian2Email !== undefined) {
      updateData.guardian2Email = data.guardian2Email;
    }

    if (data.guardian2Phone !== undefined) {
      updateData.guardian2Phone = data.guardian2Phone;
    }

    if (data.guardian2Address !== undefined) {
      updateData.guardian2Address = data.guardian2Address;
    }

    if (data.guardian2Relationship !== undefined) {
      updateData.guardian2Relationship = data.guardian2Relationship;
    }

    if (data.guardian2WorkPhone !== undefined) {
      updateData.guardian2WorkPhone = data.guardian2WorkPhone;
    }

    if (data.addressLine1 !== undefined) {
      updateData.addressLine1 = data.addressLine1;
    }

    if (data.addressLine2 !== undefined) {
      updateData.addressLine2 = data.addressLine2;
    }

    if (data.city !== undefined) {
      updateData.city = data.city;
    }

    if (data.province !== undefined) {
      updateData.province = data.province;
    }

    if (data.postalCode !== undefined) {
      updateData.postalCode = data.postalCode;
    }

    if (data.emergencyContactName !== undefined) {
      updateData.emergencyContactName = data.emergencyContactName;
    }

    if (data.emergencyContactPhone !== undefined) {
      updateData.emergencyContactPhone = data.emergencyContactPhone;
    }

    if (data.emergencyContactRelationship !== undefined) {
      updateData.emergencyContactRelationship = data.emergencyContactRelationship;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    try {
      return await this.prisma.user.update({
        where: { id: studentId },
        data: updateData,
        select: studentProfileSelect,
      });
    } catch (error) {
      if (this.isMissingStudentProfileColumnError(error)) {
        throw new ConflictException(
          this.buildSchemaBehindWriteMessage(
            data,
            this.getMissingStudentProfileFieldName(error),
          ),
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Student number must be unique within the student school',
        );
      }

      throw error;
    }
  }

  async reRegister(
    actor: AuthenticatedUser,
    studentId: string,
    data: ReRegistrationDto,
    options: { schoolYearId?: string | null } = {},
  ) {
    const student = await this.getStudentOrThrow(studentId);

    if (this.isAdminLike(actor.role)) {
      this.ensureAdminCanAccessStudent(actor, student);
    } else if (actor.role === UserRole.PARENT) {
      await this.ensureParentLinkedToStudent(actor.id, studentId);
      const schoolId = this.getPrimaryStudentSchoolId(student);
      if (!schoolId) {
        throw new BadRequestException('Student must have an active school membership');
      }

      const isOpen = await this.reRegistrationService.isReRegistrationOpenForSchool(
        schoolId,
        options.schoolYearId?.trim() || null,
      );

      if (!isOpen) {
        throw new ForbiddenException('Re-registration is currently closed');
      }
    } else {
      throw new ForbiddenException('You do not have student access');
    }

    const updateData: Prisma.UserUpdateInput = {};

    if (data.dateOfBirth !== undefined) {
      updateData.dateOfBirth =
        data.dateOfBirth === null ? null : this.normalizeDateOnly(data.dateOfBirth);
    }

    if (data.gender !== undefined) {
      updateData.gender = data.gender;
    }

    if (data.studentEmail !== undefined) {
      updateData.studentEmail = data.studentEmail;
    }

    if (data.allergies !== undefined) {
      updateData.allergies = data.allergies;
    }

    if (data.medicalConditions !== undefined) {
      updateData.medicalConditions = data.medicalConditions;
    }

    if (data.guardian1Name !== undefined) {
      updateData.guardian1Name = data.guardian1Name;
    }

    if (data.guardian1Email !== undefined) {
      updateData.guardian1Email = data.guardian1Email;
    }

    if (data.guardian1Phone !== undefined) {
      updateData.guardian1Phone = data.guardian1Phone;
    }

    if (data.guardian1Address !== undefined) {
      updateData.guardian1Address = data.guardian1Address;
    }

    if (data.guardian1Relationship !== undefined) {
      updateData.guardian1Relationship = data.guardian1Relationship;
    }

    if (data.guardian1WorkPhone !== undefined) {
      updateData.guardian1WorkPhone = data.guardian1WorkPhone;
    }

    if (data.guardian2Name !== undefined) {
      updateData.guardian2Name = data.guardian2Name;
    }

    if (data.guardian2Email !== undefined) {
      updateData.guardian2Email = data.guardian2Email;
    }

    if (data.guardian2Phone !== undefined) {
      updateData.guardian2Phone = data.guardian2Phone;
    }

    if (data.guardian2Address !== undefined) {
      updateData.guardian2Address = data.guardian2Address;
    }

    if (data.guardian2Relationship !== undefined) {
      updateData.guardian2Relationship = data.guardian2Relationship;
    }

    if (data.guardian2WorkPhone !== undefined) {
      updateData.guardian2WorkPhone = data.guardian2WorkPhone;
    }

    if (data.addressLine1 !== undefined) {
      updateData.addressLine1 = data.addressLine1;
    }

    if (data.addressLine2 !== undefined) {
      updateData.addressLine2 = data.addressLine2;
    }

    if (data.city !== undefined) {
      updateData.city = data.city;
    }

    if (data.province !== undefined) {
      updateData.province = data.province;
    }

    if (data.postalCode !== undefined) {
      updateData.postalCode = data.postalCode;
    }

    if (data.emergencyContactName !== undefined) {
      updateData.emergencyContactName = data.emergencyContactName;
    }

    if (data.emergencyContactPhone !== undefined) {
      updateData.emergencyContactPhone = data.emergencyContactPhone;
    }

    if (data.emergencyContactRelationship !== undefined) {
      updateData.emergencyContactRelationship = data.emergencyContactRelationship;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    try {
      await this.prisma.user.update({
        where: { id: studentId },
        data: updateData,
        select: { id: true },
      });
    } catch (error) {
      if (this.isMissingStudentProfileColumnError(error)) {
        throw new ConflictException(
          'Student profile migrations are required before saving profile changes. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }

    return this.findOne(actor, studentId);
  }
}
