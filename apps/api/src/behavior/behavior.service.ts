import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BehaviorRecordType,
  BehaviorRecordStatus,
  BehaviorSeverity,
  AuditLogSeverity,
  IncidentWitnessRole,
  IncidentLevel,
  Prisma,
  TeacherClassAssignmentType,
  UserRole,
} from '@prisma/client';
import path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import { getAccessibleSchoolIds, isBypassRole } from '../common/access/school-access.util';
import {
  getAccessibleSchoolIdsWithLegacyFallback,
  getPrimarySchoolIdWithLegacyFallback,
} from '../common/access/school-membership.util';
import { parseDateOnlyOrNull, parseDateOnlyOrThrow } from '../common/dates/date-only.util';
import { CreateBehaviorRecordDto } from './dto/create-behavior-record.dto';
import { UpdateBehaviorRecordDto } from './dto/update-behavior-record.dto';
import { ListBehaviorRecordsQueryDto } from './dto/list-behavior-records-query.dto';
import { CreateBehaviorCategoryOptionDto } from './dto/create-behavior-category-option.dto';
import { UpdateBehaviorCategoryOptionDto } from './dto/update-behavior-category-option.dto';
import { ListBehaviorStudentsQueryDto } from './dto/list-behavior-students-query.dto';
import type { IncidentReportDetailsDto } from './dto/incident-report-details.dto';
import type { BehaviorAttachmentStorage } from './storage/behavior-attachment-storage';
import { createBehaviorAttachmentStorageFromEnv } from './storage/behavior-attachment-storage.factory';
import { AuditService } from '../audit/audit.service';
import { buildAuditDiff } from '../audit/audit-diff.util';

const behaviorRecordSelect = Prisma.validator<Prisma.BehaviorRecordSelect>()({
  id: true,
  studentId: true,
  schoolId: true,
  recordedById: true,
  incidentAt: true,
  categoryOptionId: true,
  categoryName: true,
  severity: true,
  incidentLevel: true,
  type: true,
  title: true,
  description: true,
  actionTaken: true,
  followUpRequired: true,
  parentContacted: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  recordedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  },
  categoryOption: {
    select: {
      id: true,
      name: true,
      schoolId: true,
    },
  },
  attachments: {
    orderBy: [{ createdAt: 'desc' }],
    select: {
      id: true,
      behaviorRecordId: true,
      uploadedById: true,
      originalFileName: true,
      mimeType: true,
      fileSize: true,
      storagePath: true,
      createdAt: true,
      updatedAt: true,
      uploadedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    },
  },
  incidentReport: {
    select: {
      id: true,
      behaviorRecordId: true,
      program: true,
      reporterName: true,
      reporterEmail: true,
      reporterRole: true,
      affectedPersonType: true,
      affectedPersonName: true,
      affectedPersonAddress: true,
      affectedPersonDateOfBirth: true,
      affectedPersonPhone: true,
      firstAidStatus: true,
      firstAidAdministeredBy: true,
      firstAidAdministeredByPhone: true,
      firstAidDetails: true,
      isIncidentTimeApproximate: true,
      postIncidentDestination: true,
      postIncidentDestinationOther: true,
      jhscNotificationStatus: true,
      additionalNotes: true,
      createdAt: true,
      updatedAt: true,
      witnesses: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          behaviorIncidentReportId: true,
          name: true,
          phoneNumber: true,
          role: true,
          notes: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  },
});

const behaviorAttachmentSelect =
  Prisma.validator<Prisma.BehaviorRecordAttachmentSelect>()({
    id: true,
    behaviorRecordId: true,
    uploadedById: true,
    originalFileName: true,
    mimeType: true,
    fileSize: true,
    storagePath: true,
    createdAt: true,
    updatedAt: true,
    uploadedBy: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    },
  });

const maxAttachmentSizeBytes = 10 * 1024 * 1024;
const supportedAttachmentMimeTypes = new Set(['application/pdf']);

@Injectable()
export class BehaviorService {
  private attachmentStorage: BehaviorAttachmentStorage | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private getAttachmentStorage() {
    if (!this.attachmentStorage) {
      this.attachmentStorage = createBehaviorAttachmentStorageFromEnv();
    }

    return this.attachmentStorage;
  }

  private canManageBehaviorRecord(role: UserRole) {
    return (
      role === UserRole.OWNER ||
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.ADMIN ||
      role === UserRole.TEACHER ||
      role === UserRole.STAFF ||
      role === UserRole.SUPPLY_TEACHER
    );
  }

  private canManageBehaviorCategories(role: UserRole) {
    return role === UserRole.OWNER || role === UserRole.SUPER_ADMIN;
  }

  private canDeleteAttachment(role: UserRole) {
    return (
      role === UserRole.OWNER ||
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.ADMIN
    );
  }

  private normalizeDateTimeOrThrow(value: string, fieldLabel: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldLabel} must be a valid datetime`);
    }

    return parsed;
  }

  private normalizeDateStart(value: string, fieldLabel: string) {
    return parseDateOnlyOrThrow(value, fieldLabel);
  }

  private normalizeDateEnd(value: string, fieldLabel: string) {
    const start = this.normalizeDateStart(value, fieldLabel);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
    return end;
  }

  private normalizeRequiredText(value: string, fieldLabel: string) {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(`${fieldLabel} is required`);
    }

    return normalized;
  }

  private normalizeOptionalText(value?: string | null) {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private getIncidentLevelFromLegacySeverity(severity: BehaviorSeverity | undefined) {
    if (!severity) {
      return IncidentLevel.MINOR;
    }

    return severity === BehaviorSeverity.HIGH
      ? IncidentLevel.MAJOR
      : IncidentLevel.MINOR;
  }

  private getLegacySeverityFromIncidentLevel(incidentLevel: IncidentLevel) {
    if (incidentLevel === IncidentLevel.MAJOR) {
      return BehaviorSeverity.HIGH;
    }

    return BehaviorSeverity.MEDIUM;
  }

  private normalizeIncidentLevel(input: {
    incidentLevel?: IncidentLevel;
    severity?: BehaviorSeverity;
  }) {
    if (input.incidentLevel) {
      return input.incidentLevel;
    }

    return this.getIncidentLevelFromLegacySeverity(input.severity);
  }

  private ensureIncidentOnlyType(type?: BehaviorRecordType) {
    if (!type) {
      return;
    }

    if (type !== BehaviorRecordType.INCIDENT) {
      throw new BadRequestException('Only INCIDENT records are supported');
    }
  }

  private normalizeDateOnlyOrNull(value?: string | null) {
    return parseDateOnlyOrNull(value, 'affectedPersonDateOfBirth');
  }

  private normalizeIncidentReportCreateInput(details: IncidentReportDetailsDto) {
    return {
      program: this.normalizeOptionalText(details.program),
      affectedPersonType: details.affectedPersonType,
      affectedPersonName: this.normalizeOptionalText(details.affectedPersonName),
      affectedPersonAddress: this.normalizeOptionalText(details.affectedPersonAddress),
      affectedPersonDateOfBirth: this.normalizeDateOnlyOrNull(details.affectedPersonDateOfBirth),
      affectedPersonPhone: this.normalizeOptionalText(details.affectedPersonPhone),
      firstAidStatus: details.firstAidStatus,
      firstAidAdministeredBy: this.normalizeOptionalText(details.firstAidAdministeredBy),
      firstAidAdministeredByPhone: this.normalizeOptionalText(
        details.firstAidAdministeredByPhone,
      ),
      firstAidDetails: this.normalizeOptionalText(details.firstAidDetails),
      isIncidentTimeApproximate: details.isIncidentTimeApproximate ?? false,
      postIncidentDestination: details.postIncidentDestination,
      postIncidentDestinationOther: this.normalizeOptionalText(
        details.postIncidentDestinationOther,
      ),
      jhscNotificationStatus: details.jhscNotificationStatus,
      additionalNotes: this.normalizeOptionalText(details.additionalNotes),
    };
  }

  private normalizeIncidentWitnesses(
    witnesses?: IncidentReportDetailsDto['witnesses'],
  ) {
    if (!witnesses) {
      return [] as Array<{
        name: string;
        phoneNumber: string | null;
        role: IncidentWitnessRole | undefined;
        notes: string | null;
        sortOrder: number;
      }>;
    }

    return witnesses.map((witness, index) => ({
      name: this.normalizeRequiredText(witness.name, 'witness name'),
      phoneNumber: this.normalizeOptionalText(witness.phoneNumber),
      role: witness.role,
      notes: this.normalizeOptionalText(witness.notes),
      sortOrder: index,
    }));
  }

  private async getReporterIdentity(actor: AuthenticatedUser) {
    const reporter = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    const reporterName = reporter
      ? `${reporter.firstName} ${reporter.lastName}`.trim()
      : '';

    return {
      reporterName: reporterName.length > 0 ? reporterName : null,
      reporterEmail: this.normalizeOptionalText(reporter?.email ?? null),
      reporterRole: actor.role,
    };
  }

  private async upsertIncidentReport(
    behaviorRecordId: string,
    actor: AuthenticatedUser,
    details: IncidentReportDetailsDto,
  ) {
    const incidentData = this.normalizeIncidentReportCreateInput(details);
    const witnesses = this.normalizeIncidentWitnesses(details.witnesses);
    const reporterIdentity = await this.getReporterIdentity(actor);

    await this.prisma.$transaction(async (transaction) => {
      const existingIncidentReport =
        await transaction.behaviorIncidentReport.findUnique({
          where: { behaviorRecordId },
          select: { id: true },
        });

      let incidentReportId = existingIncidentReport?.id ?? null;

      if (!existingIncidentReport) {
        const createdIncidentReport =
          await transaction.behaviorIncidentReport.create({
            data: {
              behaviorRecord: { connect: { id: behaviorRecordId } },
              ...reporterIdentity,
              ...incidentData,
              witnesses: witnesses.length
                ? {
                    createMany: {
                      data: witnesses,
                    },
                  }
                : undefined,
            },
            select: { id: true },
          });
        incidentReportId = createdIncidentReport.id;
      } else {
        await transaction.behaviorIncidentReport.update({
          where: { behaviorRecordId },
          data: incidentData,
        });
      }

      if (details.witnesses !== undefined) {
        if (!incidentReportId) {
          throw new NotFoundException('Incident report not found');
        }

        await transaction.behaviorIncidentWitness.deleteMany({
          where: { behaviorIncidentReportId: incidentReportId },
        });

        if (witnesses.length > 0) {
          await transaction.behaviorIncidentWitness.createMany({
            data: witnesses.map((witness) => ({
              behaviorIncidentReportId: incidentReportId,
              ...witness,
            })),
          });
        }
      }
    });
  }

  private normalizeCategoryName(name: string) {
    const normalized = name.trim();
    if (!normalized) {
      throw new BadRequestException('Category name is required');
    }

    return normalized;
  }

  private sanitizeFileName(fileName: string) {
    const baseName = path.basename(fileName).trim();
    const safe = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return safe.length > 0 ? safe : 'attachment.pdf';
  }

  private ensureRoleCanManageRecords(actor: AuthenticatedUser) {
    if (!this.canManageBehaviorRecord(actor.role)) {
      throw new ForbiddenException('You do not have behavior access');
    }
  }

  private ensureRoleCanManageCategories(actor: AuthenticatedUser) {
    if (!this.canManageBehaviorCategories(actor.role)) {
      throw new ForbiddenException('You do not have behavior category access');
    }
  }

  private ensureRoleCanDeleteAttachment(actor: AuthenticatedUser) {
    if (!this.canDeleteAttachment(actor.role)) {
      throw new ForbiddenException('You do not have behavior attachment delete access');
    }
  }

  private async getStudentOrThrow(studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        role: true,
        schoolId: true,
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

  private getPrimarySchoolIdOrThrow(
    student: Awaited<ReturnType<BehaviorService['getStudentOrThrow']>>,
  ) {
    const schoolId = getPrimarySchoolIdWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId,
    });
    if (!schoolId) {
      throw new BadRequestException(
        'Student must have an active school membership to record behavior',
      );
    }
    return schoolId;
  }

  private ensureActorCanAccessSchool(actor: AuthenticatedUser, schoolId: string) {
    if (isBypassRole(actor.role)) {
      return;
    }

    const schoolIds = getAccessibleSchoolIds(actor);
    if (!schoolIds.includes(schoolId)) {
      throw new ForbiddenException('You do not have school access');
    }
  }

  private ensureActorCanAccessStudent(
    actor: AuthenticatedUser,
    student: Awaited<ReturnType<BehaviorService['getStudentOrThrow']>>,
  ) {
    if (isBypassRole(actor.role)) {
      return;
    }

    const actorSchoolIds = new Set(getAccessibleSchoolIds(actor));
    const studentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId,
    });
    const hasOverlap = studentSchoolIds.some((schoolId) =>
      actorSchoolIds.has(schoolId),
    );

    if (!hasOverlap) {
      throw new ForbiddenException('You do not have student access');
    }
  }

  private buildTeacherAccessFilter(actor: AuthenticatedUser, now = new Date()) {
    if (actor.role !== UserRole.SUPPLY_TEACHER) {
      return undefined;
    }

    return {
      class: {
        teachers: {
          some: {
            teacherId: actor.id,
            OR: [
              {
                assignmentType: TeacherClassAssignmentType.REGULAR,
              },
              {
                assignmentType: TeacherClassAssignmentType.SUPPLY,
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gte: now } }],
              },
            ],
          },
        },
      },
    } satisfies Prisma.StudentClassEnrollmentWhereInput;
  }

  private buildSupplyTeacherStudentFilter(actor: AuthenticatedUser, now = new Date()) {
    if (actor.role !== UserRole.SUPPLY_TEACHER) {
      return undefined;
    }

    return {
      studentClasses: {
        some: this.buildTeacherAccessFilter(actor, now),
      },
    } satisfies Prisma.UserWhereInput;
  }

  private async ensureSupplyTeacherCanAccessStudent(
    actor: AuthenticatedUser,
    studentId: string,
  ) {
    if (actor.role !== UserRole.SUPPLY_TEACHER) {
      return;
    }

    const enrollment = await this.prisma.studentClassEnrollment.findFirst({
      where: {
        studentId,
        ...this.buildTeacherAccessFilter(actor),
      },
      select: { id: true },
    });

    if (!enrollment) {
      throw new ForbiddenException(
        'Supply teacher access is limited to currently assigned classes',
      );
    }
  }

  private async getCategoryOptionOrThrow(
    categoryOptionId: string,
    schoolId: string,
    includeInactive = false,
  ) {
    const categoryOption = await this.prisma.behaviorCategoryOption.findUnique({
      where: { id: categoryOptionId },
      select: {
        id: true,
        name: true,
        schoolId: true,
        isActive: true,
      },
    });

    if (!categoryOption) {
      throw new BadRequestException('Behavior category option not found');
    }

    if (!includeInactive && !categoryOption.isActive) {
      throw new BadRequestException('Behavior category option is inactive');
    }

    if (categoryOption.schoolId && categoryOption.schoolId !== schoolId) {
      throw new BadRequestException(
        'Behavior category option does not belong to this student school',
      );
    }

    return categoryOption;
  }

  private async getBehaviorRecordOrThrow(id: string) {
    const record = await this.prisma.behaviorRecord.findUnique({
      where: { id },
      select: {
        id: true,
        studentId: true,
        schoolId: true,
      },
    });

    if (!record) {
      throw new NotFoundException('Behavior record not found');
    }

    return record;
  }

  private async getBehaviorAttachmentOrThrow(
    behaviorRecordId: string,
    attachmentId: string,
  ) {
    const attachment = await this.prisma.behaviorRecordAttachment.findUnique({
      where: { id: attachmentId },
      select: behaviorAttachmentSelect,
    });

    if (!attachment || attachment.behaviorRecordId !== behaviorRecordId) {
      throw new NotFoundException('Behavior attachment not found');
    }

    return attachment;
  }

  private buildBehaviorRecordWhereInput(
    actor: AuthenticatedUser,
    filters?: ListBehaviorRecordsQueryDto,
  ): Prisma.BehaviorRecordWhereInput {
    const where: Prisma.BehaviorRecordWhereInput = {};

    if (filters?.studentId) {
      where.studentId = filters.studentId;
    }

    if (filters?.type) {
      this.ensureIncidentOnlyType(filters.type);
      where.type = filters.type;
    } else {
      where.type = BehaviorRecordType.INCIDENT;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.severity) {
      where.severity = filters.severity;
    }

    if (filters?.incidentLevel) {
      where.incidentLevel = filters.incidentLevel;
    }

    if (filters?.category) {
      where.categoryName = filters.category;
    }

    if (filters?.startDate || filters?.endDate) {
      const incidentAt: Prisma.DateTimeFilter = {};
      if (filters.startDate) {
        incidentAt.gte = this.normalizeDateStart(filters.startDate, 'startDate');
      }
      if (filters.endDate) {
        incidentAt.lte = this.normalizeDateEnd(filters.endDate, 'endDate');
      }
      where.incidentAt = incidentAt;
    }

    if (!isBypassRole(actor.role)) {
      const schoolIds = getAccessibleSchoolIds(actor);
      if (schoolIds.length === 0) {
        where.schoolId = '__no_school_access__';
        return where;
      }
      where.schoolId = { in: schoolIds };
    }

    if (actor.role === UserRole.SUPPLY_TEACHER) {
      where.student = this.buildSupplyTeacherStudentFilter(actor);
    }

    return where;
  }

  async listStudents(actor: AuthenticatedUser, query?: ListBehaviorStudentsQueryDto) {
    this.ensureRoleCanManageRecords(actor);

    const requestedSchoolId = query?.schoolId?.trim() || null;
    if (requestedSchoolId && !isBypassRole(actor.role)) {
      this.ensureActorCanAccessSchool(actor, requestedSchoolId);
    }

    const limit = Math.min(Math.max(query?.limit ?? 50, 1), 100);
    const searchText = query?.query?.trim() || '';

    const where: Prisma.UserWhereInput = {
      role: UserRole.STUDENT,
      isActive: true,
    };

    if (requestedSchoolId) {
      where.memberships = {
        some: {
          schoolId: requestedSchoolId,
          isActive: true,
        },
      };
    } else if (!isBypassRole(actor.role)) {
      const schoolIds = getAccessibleSchoolIds(actor);
      where.memberships = {
        some: {
          schoolId: { in: schoolIds },
          isActive: true,
        },
      };
    }

    if (searchText) {
      where.OR = [
        { firstName: { contains: searchText, mode: 'insensitive' } },
        { lastName: { contains: searchText, mode: 'insensitive' } },
        { username: { contains: searchText, mode: 'insensitive' } },
      ];
    }

    if (actor.role === UserRole.SUPPLY_TEACHER) {
      where.studentClasses = {
        some: this.buildTeacherAccessFilter(actor) ?? undefined,
      };
    }

    const students = await this.prisma.user.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gradeLevel: {
          select: {
            id: true,
            name: true,
          },
        },
        memberships: {
          where: { isActive: true },
          select: {
            schoolId: true,
            school: {
              select: {
                id: true,
                name: true,
                shortName: true,
              },
            },
          },
        },
      },
    });

    return students.map((student) => ({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      fullName: `${student.firstName} ${student.lastName}`.trim(),
      dateOfBirth: student.dateOfBirth,
      gradeLevel: student.gradeLevel,
      schools: student.memberships.map((membership) => ({
        id: membership.school.id,
        name: membership.school.name,
        shortName: membership.school.shortName,
      })),
    }));
  }

  async getStudentPrefill(actor: AuthenticatedUser, studentId: string) {
    this.ensureRoleCanManageRecords(actor);
    const student = await this.getStudentOrThrow(studentId);
    this.ensureActorCanAccessStudent(actor, student);
    await this.ensureSupplyTeacherCanAccessStudent(actor, studentId);

    const studentProfile = await this.prisma.user.findUniqueOrThrow({
      where: { id: studentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        province: true,
        postalCode: true,
        guardian1Phone: true,
        guardian2Phone: true,
        emergencyContactPhone: true,
        memberships: {
          where: { isActive: true },
          select: {
            school: {
              select: {
                id: true,
                name: true,
                shortName: true,
              },
            },
          },
        },
      },
    });

    const reporter = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    const addressParts = [
      studentProfile.addressLine1,
      studentProfile.addressLine2,
      studentProfile.city,
      studentProfile.province,
      studentProfile.postalCode,
    ]
      .map((entry) => (entry ?? '').trim())
      .filter(Boolean);

    return {
      student: {
        id: studentProfile.id,
        firstName: studentProfile.firstName,
        lastName: studentProfile.lastName,
        fullName: `${studentProfile.firstName} ${studentProfile.lastName}`.trim(),
        dateOfBirth: studentProfile.dateOfBirth,
        address: addressParts.join(', ') || null,
        phone:
          studentProfile.guardian1Phone ||
          studentProfile.guardian2Phone ||
          studentProfile.emergencyContactPhone ||
          null,
        schools: studentProfile.memberships.map((membership) => ({
          id: membership.school.id,
          name: membership.school.name,
          shortName: membership.school.shortName,
        })),
      },
      reporter: {
        name: reporter ? `${reporter.firstName} ${reporter.lastName}`.trim() : null,
        role: actor.role,
        email: reporter?.email ?? null,
      },
    };
  }

  async createForStudent(
    actor: AuthenticatedUser,
    studentId: string,
    data: CreateBehaviorRecordDto,
  ) {
    this.ensureRoleCanManageRecords(actor);
    this.ensureIncidentOnlyType(data.type);

    const student = await this.getStudentOrThrow(studentId);
    this.ensureActorCanAccessStudent(actor, student);
    await this.ensureSupplyTeacherCanAccessStudent(actor, studentId);

    const schoolId = this.getPrimarySchoolIdOrThrow(student);
    this.ensureActorCanAccessSchool(actor, schoolId);

    const categoryOption = await this.getCategoryOptionOrThrow(
      data.categoryOptionId,
      schoolId,
    );

    const incidentAt = this.normalizeDateTimeOrThrow(data.incidentAt, 'incidentAt');
    const incidentLevel = this.normalizeIncidentLevel(data);
    const severity = data.severity ?? this.getLegacySeverityFromIncidentLevel(incidentLevel);

    const created = await this.prisma.behaviorRecord.create({
      data: {
        studentId,
        schoolId,
        recordedById: actor.id,
        incidentAt,
        categoryOptionId: categoryOption.id,
        categoryName: categoryOption.name,
        severity,
        incidentLevel,
        type: BehaviorRecordType.INCIDENT,
        title: this.normalizeRequiredText(data.title, 'title'),
        description: this.normalizeRequiredText(data.description, 'description'),
        actionTaken: this.normalizeOptionalText(data.actionTaken),
        followUpRequired: data.followUpRequired ?? false,
        parentContacted: data.parentContacted ?? false,
        status: data.status ?? BehaviorRecordStatus.OPEN,
      },
      select: behaviorRecordSelect,
    });

    if (data.incidentReport) {
      await this.upsertIncidentReport(created.id, actor, data.incidentReport);
    }

    const record = await this.prisma.behaviorRecord.findUniqueOrThrow({
      where: { id: created.id },
      select: behaviorRecordSelect,
    });

    await this.auditService.log({
      actor,
      schoolId: record.schoolId,
      entityType: 'BehaviorRecord',
      entityId: record.id,
      action: 'CREATE',
      severity: AuditLogSeverity.WARNING,
      summary: `Created incident report ${record.title} (${record.incidentLevel})`,
      targetDisplay: record.title,
      changesJson:
        buildAuditDiff({
          after: {
            studentId: record.studentId,
            categoryName: record.categoryName,
            incidentLevel: record.incidentLevel,
            status: record.status,
            severity: record.severity,
          },
        }) ?? undefined,
    });

    return record;
  }

  async listForStudent(actor: AuthenticatedUser, studentId: string) {
    this.ensureRoleCanManageRecords(actor);

    const student = await this.getStudentOrThrow(studentId);
    this.ensureActorCanAccessStudent(actor, student);
    await this.ensureSupplyTeacherCanAccessStudent(actor, studentId);
    const schoolId = this.getPrimarySchoolIdOrThrow(student);
    this.ensureActorCanAccessSchool(actor, schoolId);

    return this.prisma.behaviorRecord.findMany({
      where: { studentId, type: BehaviorRecordType.INCIDENT },
      orderBy: [{ incidentAt: 'desc' }, { createdAt: 'desc' }],
      select: behaviorRecordSelect,
    });
  }

  async list(actor: AuthenticatedUser, filters?: ListBehaviorRecordsQueryDto) {
    this.ensureRoleCanManageRecords(actor);

    if (filters?.studentId && actor.role === UserRole.SUPPLY_TEACHER) {
      await this.ensureSupplyTeacherCanAccessStudent(actor, filters.studentId);
    }

    return this.prisma.behaviorRecord.findMany({
      where: this.buildBehaviorRecordWhereInput(actor, filters),
      orderBy: [{ incidentAt: 'desc' }, { createdAt: 'desc' }],
      select: behaviorRecordSelect,
    });
  }

  async findOne(actor: AuthenticatedUser, id: string) {
    this.ensureRoleCanManageRecords(actor);

    const record = await this.getBehaviorRecordOrThrow(id);
    this.ensureActorCanAccessSchool(actor, record.schoolId);
    await this.ensureSupplyTeacherCanAccessStudent(actor, record.studentId);

    return this.prisma.behaviorRecord.findUniqueOrThrow({
      where: { id },
      select: behaviorRecordSelect,
    });
  }

  async update(actor: AuthenticatedUser, id: string, data: UpdateBehaviorRecordDto) {
    this.ensureRoleCanManageRecords(actor);
    this.ensureIncidentOnlyType(data.type);

    const existing = await this.findOne(actor, id);

    let categoryOptionId = existing.categoryOptionId;
    let categoryName = existing.categoryName;

    if (data.categoryOptionId !== undefined) {
      if (data.categoryOptionId === null) {
        throw new BadRequestException('categoryOptionId cannot be cleared');
      }

      const nextCategory = await this.getCategoryOptionOrThrow(
        data.categoryOptionId,
        existing.schoolId,
      );
      categoryOptionId = nextCategory.id;
      categoryName = nextCategory.name;
    }

    const nextIncidentLevel =
      data.incidentLevel !== undefined
        ? data.incidentLevel
        : data.severity !== undefined
          ? this.getIncidentLevelFromLegacySeverity(data.severity)
          : existing.incidentLevel;
    const nextSeverity =
      data.severity !== undefined
        ? data.severity
        : this.getLegacySeverityFromIncidentLevel(nextIncidentLevel);

    const updated = await this.prisma.behaviorRecord.update({
      where: { id: existing.id },
      data: {
        incidentAt:
          data.incidentAt !== undefined
            ? this.normalizeDateTimeOrThrow(data.incidentAt, 'incidentAt')
            : undefined,
        categoryOptionId,
        categoryName,
        severity: nextSeverity,
        incidentLevel: nextIncidentLevel,
        type: BehaviorRecordType.INCIDENT,
        title:
          data.title !== undefined
            ? this.normalizeRequiredText(data.title, 'title')
            : undefined,
        description:
          data.description !== undefined
            ? this.normalizeRequiredText(data.description, 'description')
            : undefined,
        actionTaken:
          data.actionTaken !== undefined
            ? this.normalizeOptionalText(data.actionTaken)
            : undefined,
        followUpRequired: data.followUpRequired,
        parentContacted: data.parentContacted,
        status: data.status,
      },
      select: behaviorRecordSelect,
    });

    if (data.incidentReport !== undefined) {
      await this.upsertIncidentReport(existing.id, actor, data.incidentReport);
    }

    const record = await this.prisma.behaviorRecord.findUniqueOrThrow({
      where: { id: updated.id },
      select: behaviorRecordSelect,
    });

    await this.auditService.log({
      actor,
      schoolId: record.schoolId,
      entityType: 'BehaviorRecord',
      entityId: record.id,
      action: 'UPDATE',
      severity: AuditLogSeverity.WARNING,
      summary: `Updated incident report ${record.title} (${record.incidentLevel})`,
      targetDisplay: record.title,
      changesJson:
        buildAuditDiff({
          before: {
            incidentAt: existing.incidentAt,
            categoryName: existing.categoryName,
            incidentLevel: existing.incidentLevel,
            severity: existing.severity,
            title: existing.title,
            description: existing.description,
            actionTaken: existing.actionTaken,
            followUpRequired: existing.followUpRequired,
            parentContacted: existing.parentContacted,
            status: existing.status,
          },
          after: {
            incidentAt: record.incidentAt,
            categoryName: record.categoryName,
            incidentLevel: record.incidentLevel,
            severity: record.severity,
            title: record.title,
            description: record.description,
            actionTaken: record.actionTaken,
            followUpRequired: record.followUpRequired,
            parentContacted: record.parentContacted,
            status: record.status,
          },
        }) ?? undefined,
    });

    return record;
  }

  async listCategories(
    actor: AuthenticatedUser,
    options?: { includeInactive?: boolean; schoolId?: string },
  ) {
    const includeInactive = options?.includeInactive ?? false;
    const requestedSchoolId = options?.schoolId?.trim() || null;

    if (includeInactive) {
      this.ensureRoleCanManageCategories(actor);
    } else {
      this.ensureRoleCanManageRecords(actor);
    }

    const where: Prisma.BehaviorCategoryOptionWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
    };

    if (requestedSchoolId) {
      if (!isBypassRole(actor.role)) {
        this.ensureActorCanAccessSchool(actor, requestedSchoolId);
      }
      where.schoolId = requestedSchoolId;
    } else if (!isBypassRole(actor.role)) {
      const accessibleSchoolIds = getAccessibleSchoolIds(actor);
      where.OR = [
        { schoolId: null },
        { schoolId: { in: accessibleSchoolIds } },
      ];
    }

    return this.prisma.behaviorCategoryOption.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(actor: AuthenticatedUser, data: CreateBehaviorCategoryOptionDto) {
    this.ensureRoleCanManageCategories(actor);

    const schoolId = data.schoolId?.trim() || null;
    if (schoolId && !isBypassRole(actor.role)) {
      this.ensureActorCanAccessSchool(actor, schoolId);
    }

    try {
      const created = await this.prisma.behaviorCategoryOption.create({
        data: {
          schoolId,
          name: this.normalizeCategoryName(data.name),
          isActive: data.isActive ?? true,
          sortOrder: data.sortOrder ?? 0,
        },
      });

      await this.auditService.log({
        actor,
        schoolId,
        entityType: 'BehaviorCategoryOption',
        entityId: created.id,
        action: 'CREATE',
        severity: AuditLogSeverity.INFO,
        summary: `Created behavior category ${created.name}`,
        targetDisplay: created.name,
      });

      return created;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A behavior category with this name already exists');
      }

      throw error;
    }
  }

  private async getCategoryOrThrow(id: string) {
    const category = await this.prisma.behaviorCategoryOption.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Behavior category not found');
    }

    return category;
  }

  async updateCategory(
    actor: AuthenticatedUser,
    id: string,
    data: UpdateBehaviorCategoryOptionDto,
  ) {
    this.ensureRoleCanManageCategories(actor);

    const existing = await this.getCategoryOrThrow(id);
    if (existing.schoolId && !isBypassRole(actor.role)) {
      this.ensureActorCanAccessSchool(actor, existing.schoolId);
    }

    const nextSchoolId =
      data.schoolId === undefined ? existing.schoolId : data.schoolId?.trim() || null;
    if (nextSchoolId && !isBypassRole(actor.role)) {
      this.ensureActorCanAccessSchool(actor, nextSchoolId);
    }

    try {
      const updated = await this.prisma.behaviorCategoryOption.update({
        where: { id },
        data: {
          schoolId: nextSchoolId,
          name:
            data.name !== undefined
              ? this.normalizeCategoryName(data.name)
              : undefined,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
        },
      });

      await this.auditService.log({
        actor,
        schoolId: updated.schoolId,
        entityType: 'BehaviorCategoryOption',
        entityId: updated.id,
        action: 'UPDATE',
        severity: AuditLogSeverity.INFO,
        summary: `Updated behavior category ${updated.name}`,
        targetDisplay: updated.name,
        changesJson:
          buildAuditDiff({
            before: existing,
            after: {
              schoolId: updated.schoolId,
              name: updated.name,
              sortOrder: updated.sortOrder,
              isActive: updated.isActive,
            },
          }) ?? undefined,
      });

      return updated;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A behavior category with this name already exists');
      }

      throw error;
    }
  }

  async setCategoryActiveState(actor: AuthenticatedUser, id: string, isActive: boolean) {
    return this.updateCategory(actor, id, { isActive });
  }

  private isValidPdfFile(file: { mimetype?: string; originalname?: string }) {
    const mimeType = file.mimetype?.toLowerCase() ?? '';
    if (supportedAttachmentMimeTypes.has(mimeType)) {
      return true;
    }

    const fileName = file.originalname?.toLowerCase() ?? '';
    return fileName.endsWith('.pdf');
  }

  private hasPdfSignature(buffer: Buffer) {
    if (buffer.length < 5) {
      return false;
    }

    return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }

  private buildAttachmentStorageKey(
    record: { id: string; schoolId: string },
    originalName: string,
  ) {
    const safeFileName = this.sanitizeFileName(originalName);
    const fileName = `${Date.now()}-${safeFileName}`;
    return path.posix.join(record.schoolId, record.id, fileName);
  }

  async uploadAttachment(
    actor: AuthenticatedUser,
    behaviorRecordId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    } | null,
  ) {
    this.ensureRoleCanManageRecords(actor);

    const record = await this.getBehaviorRecordOrThrow(behaviorRecordId);
    this.ensureActorCanAccessSchool(actor, record.schoolId);
    await this.ensureSupplyTeacherCanAccessStudent(actor, record.studentId);

    if (!file) {
      throw new BadRequestException('Attachment file is required');
    }

    if (!this.isValidPdfFile(file) || !this.hasPdfSignature(file.buffer)) {
      throw new BadRequestException('Only valid PDF attachments are supported');
    }

    if (file.size <= 0) {
      throw new BadRequestException('Attachment file cannot be empty');
    }

    if (file.size > maxAttachmentSizeBytes) {
      throw new BadRequestException(
        `Attachment file exceeds the ${Math.floor(
          maxAttachmentSizeBytes / (1024 * 1024),
        )}MB limit`,
      );
    }

    const storagePath = this.buildAttachmentStorageKey(record, file.originalname);
    await this.getAttachmentStorage().store({
      key: storagePath,
      body: file.buffer,
      contentType: 'application/pdf',
    });

    try {
      return await this.prisma.behaviorRecordAttachment.create({
        data: {
          behaviorRecordId: record.id,
          uploadedById: actor.id,
          originalFileName: file.originalname,
          mimeType: 'application/pdf',
          fileSize: file.size,
          storagePath,
        },
        select: behaviorAttachmentSelect,
      });
    } catch (error) {
      await this.getAttachmentStorage().remove(storagePath).catch(() => undefined);
      throw error;
    }
  }

  async listAttachments(actor: AuthenticatedUser, behaviorRecordId: string) {
    this.ensureRoleCanManageRecords(actor);

    const record = await this.getBehaviorRecordOrThrow(behaviorRecordId);
    this.ensureActorCanAccessSchool(actor, record.schoolId);
    await this.ensureSupplyTeacherCanAccessStudent(actor, record.studentId);

    return this.prisma.behaviorRecordAttachment.findMany({
      where: { behaviorRecordId: record.id },
      orderBy: [{ createdAt: 'desc' }],
      select: behaviorAttachmentSelect,
    });
  }

  async getAttachmentDownload(actor: AuthenticatedUser, behaviorRecordId: string, attachmentId: string) {
    this.ensureRoleCanManageRecords(actor);

    const record = await this.getBehaviorRecordOrThrow(behaviorRecordId);
    this.ensureActorCanAccessSchool(actor, record.schoolId);
    await this.ensureSupplyTeacherCanAccessStudent(actor, record.studentId);

    const attachment = await this.getBehaviorAttachmentOrThrow(record.id, attachmentId);
    let stored: Awaited<ReturnType<BehaviorAttachmentStorage['read']>>;
    try {
      stored = await this.getAttachmentStorage().read(attachment.storagePath);
    } catch {
      throw new NotFoundException('Behavior attachment file not found');
    }

    return {
      attachment,
      body: stored.body,
      contentType: stored.contentType,
      contentLength: stored.contentLength,
    };
  }

  async deleteAttachment(
    actor: AuthenticatedUser,
    behaviorRecordId: string,
    attachmentId: string,
  ) {
    this.ensureRoleCanDeleteAttachment(actor);

    const record = await this.getBehaviorRecordOrThrow(behaviorRecordId);
    this.ensureActorCanAccessSchool(actor, record.schoolId);

    const attachment = await this.getBehaviorAttachmentOrThrow(record.id, attachmentId);
    await this.prisma.behaviorRecordAttachment.delete({
      where: { id: attachment.id },
    });

    await this.getAttachmentStorage().remove(attachment.storagePath).catch(() => undefined);

    return { success: true as const, id: attachment.id };
  }
}
