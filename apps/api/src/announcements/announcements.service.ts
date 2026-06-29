import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AnnouncementAudience,
  AnnouncementTargetType,
  Prisma,
  UserRole,
} from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { getAccessibleSchoolIdsWithLegacyFallback } from '../common/access/school-membership.util';
import { FeatureTogglesService } from '../feature-toggles/feature-toggles.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import {
  AnnouncementStatusFilter,
  ListAnnouncementsQueryDto,
} from './dto/list-announcements-query.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

type NormalizedTargets = {
  includeWholeSchool: boolean;
  gradeLevelIds: string[];
  classIds: string[];
  studentIds: string[];
};

type RecipientAnnouncementScope = {
  schoolIds: string[];
  where: Prisma.AnnouncementWhereInput;
};

const announcementSelect = Prisma.validator<Prisma.AnnouncementSelect>()({
  id: true,
  schoolId: true,
  authorId: true,
  title: true,
  body: true,
  audience: true,
  isPinned: true,
  publishedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  },
  targets: {
    select: {
      id: true,
      targetType: true,
      gradeLevelId: true,
      classId: true,
      studentId: true,
    },
    orderBy: [{ targetType: 'asc' }, { id: 'asc' }],
  },
});

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly featureTogglesService: FeatureTogglesService,
  ) {}

  private isAdminRole(role: UserRole) {
    return (
      role === UserRole.OWNER ||
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.ADMIN
    );
  }

  private isTeacherRole(role: UserRole) {
    return role === UserRole.TEACHER;
  }

  private canWrite(role: UserRole) {
    return this.isAdminRole(role) || this.isTeacherRole(role);
  }

  private toUniqueIds(values: string[] | undefined) {
    if (!values) {
      return [];
    }

    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  }

  private normalizeTargets(input: {
    includeWholeSchool?: boolean;
    gradeLevelIds?: string[];
    classIds?: string[];
    studentIds?: string[];
  }): NormalizedTargets {
    return {
      includeWholeSchool: input.includeWholeSchool ?? false,
      gradeLevelIds: this.toUniqueIds(input.gradeLevelIds),
      classIds: this.toUniqueIds(input.classIds),
      studentIds: this.toUniqueIds(input.studentIds),
    };
  }

  private assertHasAtLeastOneTarget(targets: NormalizedTargets) {
    if (
      !targets.includeWholeSchool &&
      targets.gradeLevelIds.length === 0 &&
      targets.classIds.length === 0 &&
      targets.studentIds.length === 0
    ) {
      throw new BadRequestException('At least one target is required');
    }
  }

  private assertExpiryNotInPast(expiresAt: Date | null | undefined) {
    if (!expiresAt) {
      return;
    }

    if (expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt must be in the future');
    }
  }

  private parseExpiresAt(value: string | null | undefined) {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('expiresAt must be a valid datetime');
    }

    return parsed;
  }

  private buildTargetRows(targets: NormalizedTargets) {
    const rows: Array<{
      targetType: AnnouncementTargetType;
      gradeLevelId: string | null;
      classId: string | null;
      studentId: string | null;
    }> = [];

    if (targets.includeWholeSchool) {
      rows.push({
        targetType: AnnouncementTargetType.SCHOOL,
        gradeLevelId: null,
        classId: null,
        studentId: null,
      });
    }

    for (const gradeLevelId of targets.gradeLevelIds) {
      rows.push({
        targetType: AnnouncementTargetType.GRADE_LEVEL,
        gradeLevelId,
        classId: null,
        studentId: null,
      });
    }

    for (const classId of targets.classIds) {
      rows.push({
        targetType: AnnouncementTargetType.CLASS,
        gradeLevelId: null,
        classId,
        studentId: null,
      });
    }

    for (const studentId of targets.studentIds) {
      rows.push({
        targetType: AnnouncementTargetType.STUDENT,
        gradeLevelId: null,
        classId: null,
        studentId,
      });
    }

    const dedupedRows = new Map<string, (typeof rows)[number]>();

    for (const row of rows) {
      const key = `${row.targetType}:${row.gradeLevelId ?? ''}:${row.classId ?? ''}:${row.studentId ?? ''}`;
      dedupedRows.set(key, row);
    }

    return Array.from(dedupedRows.values());
  }

  private async resolveSchoolIdForWrite(
    actor: AuthenticatedUser,
    requestedSchoolId: string | undefined,
  ) {
    const normalizedRequestedSchoolId = requestedSchoolId?.trim() || null;

    if (normalizedRequestedSchoolId) {
      if (!isBypassRole(actor.role)) {
        ensureUserHasSchoolAccess(actor, normalizedRequestedSchoolId);
      }
      return normalizedRequestedSchoolId;
    }

    const accessibleSchoolIds = getAccessibleSchoolIds(actor);

    if (accessibleSchoolIds.length === 1) {
      return accessibleSchoolIds[0];
    }

    throw new BadRequestException(
      'schoolId is required because your account has access to multiple schools',
    );
  }

  private async validateTargetIdsBelongToSchool(
    schoolId: string,
    targets: NormalizedTargets,
  ) {
    const [gradeLevels, classes, students] = await Promise.all([
      targets.gradeLevelIds.length
        ? this.prisma.gradeLevel.findMany({
            where: {
              id: { in: targets.gradeLevelIds },
              schoolId,
            },
            select: { id: true },
          })
        : Promise.resolve([]),
      targets.classIds.length
        ? this.prisma.class.findMany({
            where: {
              id: { in: targets.classIds },
              schoolId,
            },
            select: { id: true },
          })
        : Promise.resolve([]),
      targets.studentIds.length
        ? this.prisma.user.findMany({
            where: {
              id: { in: targets.studentIds },
              role: UserRole.STUDENT,
              OR: [
                { schoolId },
                {
                  memberships: {
                    some: {
                      schoolId,
                      isActive: true,
                    },
                  },
                },
              ],
            },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    if (gradeLevels.length !== targets.gradeLevelIds.length) {
      throw new BadRequestException(
        'gradeLevelIds contains one or more invalid grade levels for this school',
      );
    }

    if (classes.length !== targets.classIds.length) {
      throw new BadRequestException(
        'classIds contains one or more invalid classes for this school',
      );
    }

    if (students.length !== targets.studentIds.length) {
      throw new BadRequestException(
        'studentIds contains one or more invalid students for this school',
      );
    }
  }

  private async validateTeacherTargetScope(
    actor: AuthenticatedUser,
    schoolId: string,
    targets: NormalizedTargets,
  ) {
    if (!this.isTeacherRole(actor.role)) {
      return;
    }

    if (targets.includeWholeSchool) {
      throw new ForbiddenException(
        'Teachers cannot create whole-school announcements',
      );
    }

    const assignments = await this.prisma.teacherClassAssignment.findMany({
      where: {
        teacherId: actor.id,
        class: {
          schoolId,
          isActive: true,
        },
      },
      select: {
        classId: true,
        class: {
          select: {
            gradeLevelId: true,
            students: {
              select: {
                studentId: true,
              },
            },
          },
        },
      },
    });

    const assignedClassIds = new Set(assignments.map((entry) => entry.classId));
    const assignedStudentIds = new Set(
      assignments.flatMap((entry) =>
        entry.class.students.map((student) => student.studentId),
      ),
    );
    const assignedGradeLevelIds = new Set(
      assignments
        .map((entry) => entry.class.gradeLevelId)
        .filter((gradeLevelId): gradeLevelId is string => Boolean(gradeLevelId)),
    );

    for (const classId of targets.classIds) {
      if (!assignedClassIds.has(classId)) {
        throw new ForbiddenException(
          'Teachers can only target classes they are assigned to',
        );
      }
    }

    for (const studentId of targets.studentIds) {
      if (!assignedStudentIds.has(studentId)) {
        throw new ForbiddenException(
          'Teachers can only target students in their assigned classes',
        );
      }
    }

    if (targets.gradeLevelIds.length === 0) {
      return;
    }

    for (const gradeLevelId of targets.gradeLevelIds) {
      if (!assignedGradeLevelIds.has(gradeLevelId)) {
        throw new ForbiddenException(
          'Teachers can only target grade levels connected to assigned classes',
        );
      }
    }

    const activeClassesInGrades = await this.prisma.class.findMany({
      where: {
        schoolId,
        isActive: true,
        gradeLevelId: {
          in: targets.gradeLevelIds,
        },
      },
      select: {
        id: true,
      },
    });

    const hasUnassignedClassInGrade = activeClassesInGrades.some(
      (schoolClass) => !assignedClassIds.has(schoolClass.id),
    );

    if (hasUnassignedClassInGrade) {
      throw new ForbiddenException(
        'Teacher grade-level targeting must be limited to fully assigned grade classes',
      );
    }

    const studentsInGrades = await this.prisma.user.findMany({
      where: {
        role: UserRole.STUDENT,
        isActive: true,
        gradeLevelId: {
          in: targets.gradeLevelIds,
        },
        OR: [
          { schoolId },
          {
            memberships: {
              some: {
                schoolId,
                isActive: true,
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    const hasUnassignedStudentInGrade = studentsInGrades.some(
      (student) => !assignedStudentIds.has(student.id),
    );

    if (hasUnassignedStudentInGrade) {
      throw new ForbiddenException(
        'Teacher grade-level targeting must be limited to assigned students',
      );
    }
  }

  private async assertAnnouncementsEnabledForSchool(schoolId: string) {
    await this.featureTogglesService.assertFeatureEnabledForSchool(
      schoolId,
      'ANNOUNCEMENTS',
    );
  }

  private async getEnabledAnnouncementSchoolIds(
    schoolIds: string[],
    requestedSchoolId?: string,
  ) {
    const scopedSchoolIds = requestedSchoolId
      ? schoolIds.filter((schoolId) => schoolId === requestedSchoolId)
      : schoolIds;

    if (scopedSchoolIds.length === 0) {
      return [];
    }

    if (requestedSchoolId) {
      await this.assertAnnouncementsEnabledForSchool(requestedSchoolId);
      return scopedSchoolIds;
    }

    const disabledSchoolIds =
      await this.featureTogglesService.getDisabledSchoolIdsForFeature(
        'ANNOUNCEMENTS',
        scopedSchoolIds,
      );
    const disabledSchoolIdSet = new Set(disabledSchoolIds);
    return scopedSchoolIds.filter((schoolId) => !disabledSchoolIdSet.has(schoolId));
  }

  private async buildEnabledRecipientWhere(
    scope: RecipientAnnouncementScope,
    requestedSchoolId?: string,
  ): Promise<Prisma.AnnouncementWhereInput | null> {
    const enabledSchoolIds = await this.getEnabledAnnouncementSchoolIds(
      scope.schoolIds,
      requestedSchoolId,
    );

    if (enabledSchoolIds.length === 0) {
      return null;
    }

    return {
      ...scope.where,
      schoolId: {
        in: enabledSchoolIds,
      },
    };
  }

  private async assertCanManageAnnouncement(
    actor: AuthenticatedUser,
    announcement: { schoolId: string; authorId: string },
  ) {
    if (!this.canWrite(actor.role)) {
      throw new ForbiddenException('You do not have announcement access');
    }

    if (this.isTeacherRole(actor.role)) {
      if (announcement.authorId !== actor.id) {
        throw new ForbiddenException('Teachers can only manage their own announcements');
      }
      return;
    }

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, announcement.schoolId);
    }
  }

  private buildActiveWhere(now = new Date()): Prisma.AnnouncementWhereInput {
    return {
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
  }

  private buildParentAudienceWhere(): Prisma.AnnouncementWhereInput {
    return {
      audience: {
        in: [AnnouncementAudience.PARENTS, AnnouncementAudience.PARENTS_AND_STUDENTS],
      },
    };
  }

  private buildStudentAudienceWhere(): Prisma.AnnouncementWhereInput {
    return {
      audience: {
        in: [AnnouncementAudience.STUDENTS, AnnouncementAudience.PARENTS_AND_STUDENTS],
      },
    };
  }

  private async buildParentRecipientWhere(
    parentId: string,
  ): Promise<RecipientAnnouncementScope | null> {
    const links = await this.prisma.studentParentLink.findMany({
      where: { parentId },
      select: {
        studentId: true,
        student: {
          select: {
            id: true,
            gradeLevelId: true,
            schoolId: true,
            memberships: {
              where: { isActive: true },
              select: { schoolId: true },
            },
            studentClasses: {
              select: {
                classId: true,
              },
            },
          },
        },
      },
    });

    if (links.length === 0) {
      return null;
    }

    const schoolIds = new Set<string>();
    const studentIds = new Set<string>();
    const classIds = new Set<string>();
    const gradeLevelIds = new Set<string>();

    for (const link of links) {
      studentIds.add(link.studentId);

      for (const classEnrollment of link.student.studentClasses) {
        classIds.add(classEnrollment.classId);
      }

      if (link.student.gradeLevelId) {
        gradeLevelIds.add(link.student.gradeLevelId);
      }

      for (const schoolId of getAccessibleSchoolIdsWithLegacyFallback({
        memberships: link.student.memberships,
        legacySchoolId: link.student.schoolId,
      })) {
        schoolIds.add(schoolId);
      }
    }

    if (schoolIds.size === 0) {
      return null;
    }

    const targetOr: Prisma.AnnouncementTargetWhereInput[] = [
      { targetType: AnnouncementTargetType.SCHOOL },
      {
        targetType: AnnouncementTargetType.STUDENT,
        studentId: {
          in: [...studentIds],
        },
      },
    ];

    if (classIds.size > 0) {
      targetOr.push({
        targetType: AnnouncementTargetType.CLASS,
        classId: {
          in: [...classIds],
        },
      });
    }

    if (gradeLevelIds.size > 0) {
      targetOr.push({
        targetType: AnnouncementTargetType.GRADE_LEVEL,
        gradeLevelId: {
          in: [...gradeLevelIds],
        },
      });
    }

    const scopedSchoolIds = [...schoolIds];

    return {
      schoolIds: scopedSchoolIds,
      where: {
        schoolId: {
          in: scopedSchoolIds,
        },
        targets: {
          some: {
            OR: targetOr,
          },
        },
      },
    };
  }

  private async buildStudentRecipientWhere(
    studentId: string,
  ): Promise<RecipientAnnouncementScope | null> {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        role: true,
        gradeLevelId: true,
        schoolId: true,
        memberships: {
          where: {
            isActive: true,
          },
          select: {
            schoolId: true,
          },
        },
        studentClasses: {
          select: {
            classId: true,
          },
        },
      },
    });

    if (!student || student.role !== UserRole.STUDENT) {
      throw new NotFoundException('Student not found');
    }

    const schoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId,
    });

    if (schoolIds.length === 0) {
      return null;
    }

    const classIds = student.studentClasses.map((entry) => entry.classId);

    const targetOr: Prisma.AnnouncementTargetWhereInput[] = [
      { targetType: AnnouncementTargetType.SCHOOL },
      {
        targetType: AnnouncementTargetType.STUDENT,
        studentId,
      },
    ];

    if (classIds.length > 0) {
      targetOr.push({
        targetType: AnnouncementTargetType.CLASS,
        classId: {
          in: classIds,
        },
      });
    }

    if (student.gradeLevelId) {
      targetOr.push({
        targetType: AnnouncementTargetType.GRADE_LEVEL,
        gradeLevelId: student.gradeLevelId,
      });
    }

    return {
      schoolIds,
      where: {
        schoolId: {
          in: schoolIds,
        },
        targets: {
          some: {
            OR: targetOr,
          },
        },
      },
    };
  }

  private buildStatusWhere(status: AnnouncementStatusFilter | undefined) {
    if (!status || status === AnnouncementStatusFilter.ALL) {
      return {} as Prisma.AnnouncementWhereInput;
    }

    if (status === AnnouncementStatusFilter.EXPIRED) {
      return {
        expiresAt: {
          lte: new Date(),
        },
      } satisfies Prisma.AnnouncementWhereInput;
    }

    return this.buildActiveWhere();
  }

  async create(actor: AuthenticatedUser, body: CreateAnnouncementDto) {
    if (!this.canWrite(actor.role)) {
      throw new ForbiddenException('You do not have announcement access');
    }

    const schoolId = await this.resolveSchoolIdForWrite(actor, body.schoolId);
    await this.assertAnnouncementsEnabledForSchool(schoolId);
    const targets = this.normalizeTargets(body);
    this.assertHasAtLeastOneTarget(targets);

    const expiresAt = this.parseExpiresAt(body.expiresAt);
    this.assertExpiryNotInPast(expiresAt);

    await this.validateTargetIdsBelongToSchool(schoolId, targets);
    await this.validateTeacherTargetScope(actor, schoolId, targets);

    const targetRows = this.buildTargetRows(targets);

    const created = await this.prisma.announcement.create({
      data: {
        schoolId,
        authorId: actor.id,
        title: body.title.trim(),
        body: body.body.trim(),
        audience: body.audience,
        isPinned: body.isPinned ?? false,
        expiresAt,
        targets: {
          createMany: {
            data: targetRows,
          },
        },
      },
      select: announcementSelect,
    });

    try {
      await this.notificationsService.createAnnouncementNotifications({
        announcementId: created.id,
        schoolId: created.schoolId,
        authorId: created.authorId,
        title: created.title,
        body: created.body,
        audience: created.audience,
        targets: created.targets.map((target) => ({
          targetType: target.targetType,
          gradeLevelId: target.gradeLevelId,
          classId: target.classId,
          studentId: target.studentId,
        })),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to enqueue announcement notifications for ${created.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return created;
  }

  async list(actor: AuthenticatedUser, query: ListAnnouncementsQueryDto) {
    const now = new Date();
    const normalizedSchoolId = query.schoolId?.trim();

    if (actor.role === UserRole.PARENT) {
      const recipientScope = await this.buildParentRecipientWhere(actor.id);
      if (!recipientScope) {
        return [];
      }

      const recipientWhere = await this.buildEnabledRecipientWhere(
        recipientScope,
        normalizedSchoolId,
      );
      if (!recipientWhere) {
        return [];
      }

      return this.prisma.announcement.findMany({
        where: {
          ...recipientWhere,
          ...this.buildParentAudienceWhere(),
          ...this.buildActiveWhere(now),
          publishedAt: {
            lte: now,
          },
        },
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: query.limit ?? 100,
        select: announcementSelect,
      });
    }

    if (actor.role === UserRole.STUDENT) {
      const recipientScope = await this.buildStudentRecipientWhere(actor.id);
      if (!recipientScope) {
        return [];
      }

      const recipientWhere = await this.buildEnabledRecipientWhere(
        recipientScope,
        normalizedSchoolId,
      );
      if (!recipientWhere) {
        return [];
      }

      return this.prisma.announcement.findMany({
        where: {
          ...recipientWhere,
          ...this.buildStudentAudienceWhere(),
          ...this.buildActiveWhere(now),
          publishedAt: {
            lte: now,
          },
        },
        orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: query.limit ?? 100,
        select: announcementSelect,
      });
    }

    if (!this.canWrite(actor.role)) {
      throw new ForbiddenException('You do not have announcement access');
    }

    if (normalizedSchoolId && !isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, normalizedSchoolId);
    }

    if (normalizedSchoolId) {
      await this.assertAnnouncementsEnabledForSchool(normalizedSchoolId);
    }

    const disabledSchoolIds = normalizedSchoolId
      ? []
      : await this.featureTogglesService.getDisabledSchoolIdsForFeature(
          'ANNOUNCEMENTS',
          isBypassRole(actor.role) ? undefined : getAccessibleSchoolIds(actor),
        );

    const targetFilters: Prisma.AnnouncementWhereInput[] = [];

    if (query.classId) {
      targetFilters.push({
        targets: {
          some: {
            classId: query.classId,
          },
        },
      });
    }

    if (query.gradeLevelId) {
      targetFilters.push({
        targets: {
          some: {
            gradeLevelId: query.gradeLevelId,
          },
        },
      });
    }

    const where: Prisma.AnnouncementWhereInput = {
      ...(this.isTeacherRole(actor.role)
        ? {
            authorId: actor.id,
            ...(normalizedSchoolId ? { schoolId: normalizedSchoolId } : {}),
          }
        : normalizedSchoolId
          ? {
              schoolId: normalizedSchoolId,
            }
          : isBypassRole(actor.role)
            ? {}
            : {
                schoolId: {
                  in: getAccessibleSchoolIds(actor),
                },
              }),
      ...(query.audience ? { audience: query.audience } : {}),
      ...(query.pinned !== undefined ? { isPinned: query.pinned } : {}),
      ...(targetFilters.length > 0 ? { AND: targetFilters } : {}),
      ...(disabledSchoolIds.length > 0
        ? {
            NOT: {
              schoolId: {
                in: disabledSchoolIds,
              },
            },
          }
        : {}),
      ...this.buildStatusWhere(query.status),
    };

    return this.prisma.announcement.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: query.limit ?? 100,
      select: announcementSelect,
    });
  }

  async findOne(actor: AuthenticatedUser, id: string) {
    const now = new Date();

    if (actor.role === UserRole.PARENT) {
      const recipientScope = await this.buildParentRecipientWhere(actor.id);
      if (!recipientScope) {
        throw new NotFoundException('Announcement not found');
      }

      const recipientWhere = await this.buildEnabledRecipientWhere(recipientScope);
      if (!recipientWhere) {
        throw new NotFoundException('Announcement not found');
      }

      const announcement = await this.prisma.announcement.findFirst({
        where: {
          id,
          ...recipientWhere,
          ...this.buildParentAudienceWhere(),
          ...this.buildActiveWhere(now),
          publishedAt: {
            lte: now,
          },
        },
        select: announcementSelect,
      });

      if (!announcement) {
        throw new NotFoundException('Announcement not found');
      }

      return announcement;
    }

    if (actor.role === UserRole.STUDENT) {
      const recipientScope = await this.buildStudentRecipientWhere(actor.id);
      if (!recipientScope) {
        throw new NotFoundException('Announcement not found');
      }

      const recipientWhere = await this.buildEnabledRecipientWhere(recipientScope);
      if (!recipientWhere) {
        throw new NotFoundException('Announcement not found');
      }

      const announcement = await this.prisma.announcement.findFirst({
        where: {
          id,
          ...recipientWhere,
          ...this.buildStudentAudienceWhere(),
          ...this.buildActiveWhere(now),
          publishedAt: {
            lte: now,
          },
        },
        select: announcementSelect,
      });

      if (!announcement) {
        throw new NotFoundException('Announcement not found');
      }

      return announcement;
    }

    if (!this.canWrite(actor.role)) {
      throw new ForbiddenException('You do not have announcement access');
    }

    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      select: announcementSelect,
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    await this.assertCanManageAnnouncement(actor, announcement);
    await this.assertAnnouncementsEnabledForSchool(announcement.schoolId);

    return announcement;
  }

  async update(actor: AuthenticatedUser, id: string, body: UpdateAnnouncementDto) {
    if (!this.canWrite(actor.role)) {
      throw new ForbiddenException('You do not have announcement access');
    }

    const existing = await this.prisma.announcement.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        authorId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }

    await this.assertAnnouncementsEnabledForSchool(existing.schoolId);
    await this.assertCanManageAnnouncement(actor, existing);

    const expiresAt =
      body.expiresAt === undefined ? undefined : this.parseExpiresAt(body.expiresAt);

    if (expiresAt !== undefined) {
      this.assertExpiryNotInPast(expiresAt);
    }

    const hasTargetPatch =
      body.includeWholeSchool !== undefined ||
      body.gradeLevelIds !== undefined ||
      body.classIds !== undefined ||
      body.studentIds !== undefined;

    let targetRows: ReturnType<AnnouncementsService['buildTargetRows']> | null = null;

    if (hasTargetPatch) {
      const targets = this.normalizeTargets(body);
      this.assertHasAtLeastOneTarget(targets);
      await this.validateTargetIdsBelongToSchool(existing.schoolId, targets);
      await this.validateTeacherTargetScope(actor, existing.schoolId, targets);
      targetRows = this.buildTargetRows(targets);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.announcement.update({
        where: { id },
        data: {
          ...(body.title !== undefined ? { title: body.title.trim() } : {}),
          ...(body.body !== undefined ? { body: body.body.trim() } : {}),
          ...(body.audience !== undefined ? { audience: body.audience } : {}),
          ...(body.isPinned !== undefined ? { isPinned: body.isPinned } : {}),
          ...(expiresAt !== undefined ? { expiresAt } : {}),
        },
      });

      if (targetRows) {
        await tx.announcementTarget.deleteMany({
          where: {
            announcementId: id,
          },
        });

        if (targetRows.length > 0) {
          await tx.announcementTarget.createMany({
            data: targetRows.map((row) => ({
              announcementId: id,
              ...row,
            })),
          });
        }
      }
    });

    return this.prisma.announcement.findUniqueOrThrow({
      where: { id },
      select: announcementSelect,
    });
  }

  async remove(actor: AuthenticatedUser, id: string) {
    if (!this.canWrite(actor.role)) {
      throw new ForbiddenException('You do not have announcement access');
    }

    const existing = await this.prisma.announcement.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        authorId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }

    await this.assertAnnouncementsEnabledForSchool(existing.schoolId);
    await this.assertCanManageAnnouncement(actor, existing);

    await this.prisma.announcement.delete({
      where: {
        id,
      },
    });

    return {
      success: true,
      id,
    };
  }
}
