import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogSeverity, Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
  isSchoolAdminRole,
  isTeacherRole,
} from '../common/access/school-access.util';
import { getAccessibleSchoolIdsWithLegacyFallback } from '../common/access/school-membership.util';
import { safeUserSelect } from '../common/prisma/safe-user-response';
import { AuditService } from '../audit/audit.service';
import { buildAuditDiff } from '../audit/audit-diff.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimetableBlockDto } from './dto/create-timetable-block.dto';
import { CreateBulkTimetableBlockDto } from './dto/create-bulk-timetable-block.dto';
import { ListTimetableQueryDto } from './dto/list-timetable-query.dto';
import { UpdateTimetableBlockDto } from './dto/update-timetable-block.dto';

type ConflictCheckInput = {
  blockIdToExclude?: string;
  schoolId: string;
  schoolYearId: string;
  teacherId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  roomLabel?: string | null;
  classIds: string[];
};

const timetableBlockSelect = Prisma.validator<Prisma.TimetableBlockSelect>()({
  id: true,
  schoolId: true,
  schoolYearId: true,
  teacherId: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  roomLabel: true,
  notes: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  school: {
    select: {
      id: true,
      name: true,
      shortName: true,
    },
  },
  schoolYear: {
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
    },
  },
  teacher: {
    select: safeUserSelect,
  },
  classes: {
    select: {
      id: true,
      classId: true,
      class: {
        select: {
          id: true,
          schoolId: true,
          schoolYearId: true,
          name: true,
          subject: true,
          isActive: true,
          gradeLevel: {
            select: {
              id: true,
              name: true,
            },
          },
          subjectOption: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
});

@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private parseMinutes(value: string, label: string) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());

    if (!match) {
      throw new BadRequestException(`${label} must be in HH:mm format`);
    }

    return Number(match[1]) * 60 + Number(match[2]);
  }

  private validateTimeRange(startTime: string, endTime: string) {
    const start = this.parseMinutes(startTime, 'startTime');
    const end = this.parseMinutes(endTime, 'endTime');

    if (start >= end) {
      throw new BadRequestException('startTime must be before endTime');
    }

    return { start, end };
  }

  private timesOverlap(
    startA: string,
    endA: string,
    startB: string,
    endB: string,
  ) {
    const aStart = this.parseMinutes(startA, 'startTime');
    const aEnd = this.parseMinutes(endA, 'endTime');
    const bStart = this.parseMinutes(startB, 'startTime');
    const bEnd = this.parseMinutes(endB, 'endTime');

    return aStart < bEnd && aEnd > bStart;
  }

  private normalizeRoomLabel(value?: string | null) {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeClassIds(classIds: string[]) {
    const normalized = Array.from(
      new Set(classIds.map((entry) => entry.trim()).filter(Boolean)),
    );

    if (normalized.length === 0) {
      throw new BadRequestException('classIds must include at least one class');
    }

    return normalized;
  }

  private async ensureTeacherValid(teacherId: string) {
    const teacher = await this.prisma.user.findUnique({
      where: { id: teacherId },
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

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    if (!isTeacherRole(teacher.role)) {
      throw new BadRequestException('teacherId must belong to a teacher user');
    }

    return teacher;
  }

  private async ensureSchoolYearInSchool(schoolYearId: string, schoolId: string) {
    const schoolYear = await this.prisma.schoolYear.findUnique({
      where: { id: schoolYearId },
      select: {
        id: true,
        schoolId: true,
      },
    });

    if (!schoolYear || schoolYear.schoolId !== schoolId) {
      throw new BadRequestException('schoolYearId does not belong to schoolId');
    }
  }

  private async resolveClassesForBlock(
    schoolId: string,
    schoolYearId: string,
    classIds: string[],
  ) {
    const classes = await this.prisma.class.findMany({
      where: {
        id: {
          in: classIds,
        },
      },
      select: {
        id: true,
        schoolId: true,
        schoolYearId: true,
        name: true,
      },
    });

    if (classes.length !== classIds.length) {
      throw new BadRequestException('classIds contains one or more invalid classes');
    }

    for (const schoolClass of classes) {
      if (schoolClass.schoolId !== schoolId) {
        throw new BadRequestException('Every class must belong to schoolId');
      }

      if (schoolClass.schoolYearId !== schoolYearId) {
        throw new BadRequestException(
          'Every class must belong to schoolYearId',
        );
      }
    }

    return classes;
  }

  private getSchoolIdsFromMembershipShape(entity: {
    schoolId: string | null;
    memberships: Array<{ schoolId: string }>;
  }) {
    return getAccessibleSchoolIdsWithLegacyFallback({
      memberships: entity.memberships,
      legacySchoolId: entity.schoolId,
    });
  }

  private ensureActorCanAccessSchool(user: AuthenticatedUser, schoolId: string) {
    ensureUserHasSchoolAccess(user, schoolId);
  }

  private async getBlockOrThrow(blockId: string) {
    const block = await this.prisma.timetableBlock.findUnique({
      where: { id: blockId },
      select: {
        id: true,
        schoolId: true,
        schoolYearId: true,
        teacherId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        roomLabel: true,
        notes: true,
        isActive: true,
        classes: {
          select: {
            classId: true,
          },
        },
      },
    });

    if (!block) {
      throw new NotFoundException('Timetable block not found');
    }

    return block;
  }

  private buildListWhere(
    user: AuthenticatedUser,
    query: ListTimetableQueryDto,
  ): Prisma.TimetableBlockWhereInput {
    const normalized = query.normalize();
    const includeInactive = normalized.includeInactive ?? false;

    const where: Prisma.TimetableBlockWhereInput = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(normalized.schoolId ? { schoolId: normalized.schoolId } : {}),
      ...(normalized.schoolYearId ? { schoolYearId: normalized.schoolYearId } : {}),
      ...(normalized.teacherId ? { teacherId: normalized.teacherId } : {}),
      ...(normalized.dayOfWeek ? { dayOfWeek: normalized.dayOfWeek as any } : {}),
      ...(normalized.roomLabel
        ? {
            roomLabel: {
              contains: normalized.roomLabel,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(normalized.classId
        ? {
            classes: {
              some: {
                classId: normalized.classId,
              },
            },
          }
        : {}),
    };

    if (isBypassRole(user.role)) {
      return where;
    }

    if (user.role === UserRole.STAFF) {
      const accessible = getAccessibleSchoolIds(user);
      return {
        ...where,
        schoolId: {
          in: accessible,
        },
      };
    }

    throw new ForbiddenException('You do not have timetable access');
  }

  private async assertNoConflicts(input: ConflictCheckInput) {
    const candidateWhere: Prisma.TimetableBlockWhereInput = {
      schoolId: input.schoolId,
      schoolYearId: input.schoolYearId,
      dayOfWeek: input.dayOfWeek as any,
      isActive: true,
      ...(input.blockIdToExclude
        ? {
            id: {
              not: input.blockIdToExclude,
            },
          }
        : {}),
    };

    const sameTeacherCandidates = await this.prisma.timetableBlock.findMany({
      where: {
        ...candidateWhere,
        teacherId: input.teacherId,
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
      },
    });

    for (const candidate of sameTeacherCandidates) {
      if (
        this.timesOverlap(
          input.startTime,
          input.endTime,
          candidate.startTime,
          candidate.endTime,
        )
      ) {
        throw new ConflictException(
          'Teacher has an overlapping timetable block',
        );
      }
    }

    if (input.roomLabel) {
      const sameRoomCandidates = await this.prisma.timetableBlock.findMany({
        where: {
          ...candidateWhere,
          roomLabel: {
            equals: input.roomLabel,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          startTime: true,
          endTime: true,
        },
      });

      for (const candidate of sameRoomCandidates) {
        if (
          this.timesOverlap(
            input.startTime,
            input.endTime,
            candidate.startTime,
            candidate.endTime,
          )
        ) {
          throw new ConflictException(
            'Room label has an overlapping timetable block',
          );
        }
      }
    }

    const sameClassCandidates = await this.prisma.timetableBlockClass.findMany({
      where: {
        classId: {
          in: input.classIds,
        },
        timetableBlock: candidateWhere,
      },
      select: {
        classId: true,
        timetableBlock: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    for (const candidate of sameClassCandidates) {
      if (
        this.timesOverlap(
          input.startTime,
          input.endTime,
          candidate.timetableBlock.startTime,
          candidate.timetableBlock.endTime,
        )
      ) {
        throw new ConflictException(
          `Class ${candidate.classId} has an overlapping timetable block`,
        );
      }
    }
  }

  async list(user: AuthenticatedUser, query: ListTimetableQueryDto) {
    const normalized = query.normalize();
    const page = normalized.page ?? 1;
    const pageSize = normalized.pageSize ?? 50;
    const where = this.buildListWhere(user, normalized);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.timetableBlock.count({ where }),
      this.prisma.timetableBlock.findMany({
        where,
        select: timetableBlockSelect,
        orderBy: [
          { dayOfWeek: 'asc' },
          { startTime: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      rows,
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  async create(user: AuthenticatedUser, data: CreateTimetableBlockDto) {
    if (
      user.role !== UserRole.OWNER &&
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException('You do not have timetable write access');
    }

    this.validateTimeRange(data.startTime, data.endTime);
    this.ensureActorCanAccessSchool(user, data.schoolId);

    const normalizedClassIds = this.normalizeClassIds(data.classIds);
    const normalizedRoomLabel = this.normalizeRoomLabel(data.roomLabel);

    const teacher = await this.ensureTeacherValid(data.teacherId);
    const teacherSchoolIds = this.getSchoolIdsFromMembershipShape(teacher);

    if (!teacherSchoolIds.includes(data.schoolId)) {
      throw new BadRequestException('Teacher does not belong to schoolId');
    }

    await this.ensureSchoolYearInSchool(data.schoolYearId, data.schoolId);
    await this.resolveClassesForBlock(
      data.schoolId,
      data.schoolYearId,
      normalizedClassIds,
    );

    await this.assertNoConflicts({
      schoolId: data.schoolId,
      schoolYearId: data.schoolYearId,
      teacherId: data.teacherId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      roomLabel: normalizedRoomLabel,
      classIds: normalizedClassIds,
    });

    const created = await this.prisma.timetableBlock.create({
      data: {
        schoolId: data.schoolId,
        schoolYearId: data.schoolYearId,
        teacherId: data.teacherId,
        dayOfWeek: data.dayOfWeek as any,
        startTime: data.startTime,
        endTime: data.endTime,
        roomLabel: normalizedRoomLabel,
        notes: data.notes?.trim() || null,
        classes: {
          createMany: {
            data: normalizedClassIds.map((classId) => ({ classId })),
          },
        },
      },
      select: timetableBlockSelect,
    });

    await this.auditService.log({
      actor: user,
      schoolId: created.schoolId,
      entityType: 'TimetableBlock',
      entityId: created.id,
      action: 'TIMETABLE_BLOCK_CREATED',
      severity: AuditLogSeverity.INFO,
      summary: `Created timetable block ${created.dayOfWeek} ${created.startTime}-${created.endTime}`,
      targetDisplay: `${created.dayOfWeek} ${created.startTime}-${created.endTime}`,
      metadataJson: {
        classIds: created.classes.map((entry) => entry.classId),
        teacherId: created.teacherId,
        roomLabel: created.roomLabel,
      },
    });

    return created;
  }

  async createBulk(
    user: AuthenticatedUser,
    data: {
      schoolId: string;
      schoolYearId: string;
      teacherId: string;
      daysOfWeek: string[];
      startTime: string;
      endTime: string;
      roomLabel?: string;
      notes?: string;
      classIds: string[];
    },
  ) {
    if (
      user.role !== UserRole.OWNER &&
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException('You do not have timetable write access');
    }

    this.validateTimeRange(data.startTime, data.endTime);
    this.ensureActorCanAccessSchool(user, data.schoolId);

    const normalizedClassIds = this.normalizeClassIds(data.classIds);
    const normalizedRoomLabel = this.normalizeRoomLabel(data.roomLabel);

    const teacher = await this.ensureTeacherValid(data.teacherId);
    const teacherSchoolIds = this.getSchoolIdsFromMembershipShape(teacher);

    if (!teacherSchoolIds.includes(data.schoolId)) {
      throw new BadRequestException('Teacher does not belong to schoolId');
    }

    await this.ensureSchoolYearInSchool(data.schoolYearId, data.schoolId);
    await this.resolveClassesForBlock(
      data.schoolId,
      data.schoolYearId,
      normalizedClassIds,
    );

    // Check conflicts for each day and collect errors
    const conflictsByDay: Record<string, string> = {};

    for (const dayOfWeek of data.daysOfWeek) {
      try {
        await this.assertNoConflicts({
          schoolId: data.schoolId,
          schoolYearId: data.schoolYearId,
          teacherId: data.teacherId,
          dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime,
          roomLabel: normalizedRoomLabel,
          classIds: normalizedClassIds,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown conflict';
        conflictsByDay[dayOfWeek] = message;
      }
    }

    // If any conflicts found, return error with details
    if (Object.keys(conflictsByDay).length > 0) {
      const conflictDays = Object.entries(conflictsByDay)
        .map(([day, msg]) => `${day}: ${msg}`)
        .join('; ');
      throw new ConflictException(
        `Conflicts detected on selected days: ${conflictDays}`,
      );
    }

    // Bulk create blocks for each day
    const createdBlocks = await Promise.all(
      data.daysOfWeek.map((dayOfWeek) =>
        this.prisma.timetableBlock.create({
          data: {
            schoolId: data.schoolId,
            schoolYearId: data.schoolYearId,
            teacherId: data.teacherId,
            dayOfWeek: dayOfWeek as any,
            startTime: data.startTime,
            endTime: data.endTime,
            roomLabel: normalizedRoomLabel,
            notes: data.notes?.trim() || null,
            classes: {
              createMany: {
                data: normalizedClassIds.map((classId) => ({ classId })),
              },
            },
          },
          select: timetableBlockSelect,
        }),
      ),
    );

    // Audit log for each created block
    for (const created of createdBlocks) {
      await this.auditService.log({
        actor: user,
        schoolId: created.schoolId,
        entityType: 'TimetableBlock',
        entityId: created.id,
        action: 'TIMETABLE_BLOCK_CREATED',
        severity: AuditLogSeverity.INFO,
        summary: `Created timetable block ${created.dayOfWeek} ${created.startTime}-${created.endTime}`,
        targetDisplay: `${created.dayOfWeek} ${created.startTime}-${created.endTime}`,
        metadataJson: {
          classIds: created.classes.map((entry) => entry.classId),
          teacherId: created.teacherId,
          roomLabel: created.roomLabel,
        },
      });
    }

    return {
      created: createdBlocks,
      count: createdBlocks.length,
    };
  }

  async update(
    user: AuthenticatedUser,
    blockId: string,
    data: UpdateTimetableBlockDto,
  ) {
    if (
      user.role !== UserRole.OWNER &&
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException('You do not have timetable write access');
    }

    const existing = await this.getBlockOrThrow(blockId);
    this.ensureActorCanAccessSchool(user, existing.schoolId);

    const nextTeacherId = data.teacherId ?? existing.teacherId;
    const nextDayOfWeek = data.dayOfWeek ?? existing.dayOfWeek;
    const nextStartTime = data.startTime ?? existing.startTime;
    const nextEndTime = data.endTime ?? existing.endTime;
    const nextIsActive = data.isActive ?? existing.isActive;
    const nextRoomLabel =
      data.roomLabel !== undefined
        ? this.normalizeRoomLabel(data.roomLabel)
        : this.normalizeRoomLabel(existing.roomLabel);

    this.validateTimeRange(nextStartTime, nextEndTime);

    const nextClassIds = data.classIds
      ? this.normalizeClassIds(data.classIds)
      : existing.classes.map((entry) => entry.classId);

    const teacher = await this.ensureTeacherValid(nextTeacherId);
    const teacherSchoolIds = this.getSchoolIdsFromMembershipShape(teacher);

    if (!teacherSchoolIds.includes(existing.schoolId)) {
      throw new BadRequestException('Teacher does not belong to block school');
    }

    await this.resolveClassesForBlock(
      existing.schoolId,
      existing.schoolYearId,
      nextClassIds,
    );

    if (nextIsActive) {
      await this.assertNoConflicts({
        blockIdToExclude: blockId,
        schoolId: existing.schoolId,
        schoolYearId: existing.schoolYearId,
        teacherId: nextTeacherId,
        dayOfWeek: nextDayOfWeek,
        startTime: nextStartTime,
        endTime: nextEndTime,
        roomLabel: nextRoomLabel,
        classIds: nextClassIds,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (data.classIds) {
        await tx.timetableBlockClass.deleteMany({
          where: {
            timetableBlockId: blockId,
          },
        });

        await tx.timetableBlockClass.createMany({
          data: nextClassIds.map((classId) => ({
            timetableBlockId: blockId,
            classId,
          })),
        });
      }

      return tx.timetableBlock.update({
        where: {
          id: blockId,
        },
        data: {
          teacherId: nextTeacherId,
          dayOfWeek: nextDayOfWeek as any,
          startTime: nextStartTime,
          endTime: nextEndTime,
          roomLabel: nextRoomLabel,
          notes: data.notes !== undefined ? data.notes?.trim() || null : existing.notes,
          isActive: nextIsActive,
        },
        select: timetableBlockSelect,
      });
    });

    await this.auditService.log({
      actor: user,
      schoolId: updated.schoolId,
      entityType: 'TimetableBlock',
      entityId: updated.id,
      action: 'TIMETABLE_BLOCK_UPDATED',
      severity: AuditLogSeverity.INFO,
      summary: `Updated timetable block ${updated.dayOfWeek} ${updated.startTime}-${updated.endTime}`,
      targetDisplay: `${updated.dayOfWeek} ${updated.startTime}-${updated.endTime}`,
      changesJson:
        buildAuditDiff({
          before: {
            teacherId: existing.teacherId,
            dayOfWeek: existing.dayOfWeek,
            startTime: existing.startTime,
            endTime: existing.endTime,
            roomLabel: existing.roomLabel,
            notes: existing.notes,
            isActive: existing.isActive,
            classIds: existing.classes.map((entry) => entry.classId),
          },
          after: {
            teacherId: updated.teacherId,
            dayOfWeek: updated.dayOfWeek,
            startTime: updated.startTime,
            endTime: updated.endTime,
            roomLabel: updated.roomLabel,
            notes: updated.notes,
            isActive: updated.isActive,
            classIds: updated.classes.map((entry) => entry.classId),
          },
        }) ?? undefined,
    });

    return updated;
  }

  async remove(user: AuthenticatedUser, blockId: string) {
    if (
      user.role !== UserRole.OWNER &&
      user.role !== UserRole.SUPER_ADMIN &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException('You do not have timetable write access');
    }

    const existing = await this.getBlockOrThrow(blockId);
    this.ensureActorCanAccessSchool(user, existing.schoolId);

    await this.prisma.timetableBlock.delete({
      where: {
        id: blockId,
      },
    });

    await this.auditService.log({
      actor: user,
      schoolId: existing.schoolId,
      entityType: 'TimetableBlock',
      entityId: existing.id,
      action: 'TIMETABLE_BLOCK_DELETED',
      severity: AuditLogSeverity.WARNING,
      summary: `Deleted timetable block ${existing.dayOfWeek} ${existing.startTime}-${existing.endTime}`,
      targetDisplay: `${existing.dayOfWeek} ${existing.startTime}-${existing.endTime}`,
      metadataJson: {
        teacherId: existing.teacherId,
        classIds: existing.classes.map((entry) => entry.classId),
        roomLabel: existing.roomLabel,
      },
    });

    return { success: true };
  }

  async listMine(user: AuthenticatedUser) {
    if (user.role === UserRole.TEACHER || user.role === UserRole.SUPPLY_TEACHER) {
      return this.prisma.timetableBlock.findMany({
        where: {
          teacherId: user.id,
          isActive: true,
        },
        select: timetableBlockSelect,
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });
    }

    if (user.role === UserRole.STUDENT) {
      return this.prisma.timetableBlock.findMany({
        where: {
          isActive: true,
          classes: {
            some: {
              class: {
                students: {
                  some: {
                    studentId: user.id,
                  },
                },
              },
            },
          },
        },
        select: timetableBlockSelect,
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });
    }

    if (user.role === UserRole.PARENT) {
      return this.prisma.timetableBlock.findMany({
        where: {
          isActive: true,
          classes: {
            some: {
              class: {
                students: {
                  some: {
                    student: {
                      studentLinks: {
                        some: {
                          parentId: user.id,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        select: timetableBlockSelect,
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });
    }

    throw new ForbiddenException('You do not have timetable access');
  }

  async listByClass(user: AuthenticatedUser, classId: string) {
    const schoolClass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        schoolId: true,
      },
    });

    if (!schoolClass) {
      throw new NotFoundException('Class not found');
    }

    if (user.role === UserRole.OWNER || user.role === UserRole.SUPER_ADMIN) {
      this.ensureActorCanAccessSchool(user, schoolClass.schoolId);
    } else if (user.role === UserRole.ADMIN || isSchoolAdminRole(user.role)) {
      this.ensureActorCanAccessSchool(user, schoolClass.schoolId);
    } else if (user.role === UserRole.TEACHER || user.role === UserRole.SUPPLY_TEACHER) {
      this.ensureActorCanAccessSchool(user, schoolClass.schoolId);

      const assignment = await this.prisma.teacherClassAssignment.findFirst({
        where: {
          teacherId: user.id,
          classId,
        },
        select: { id: true },
      });

      if (!assignment) {
        throw new ForbiddenException('You do not have class access');
      }
    } else if (user.role === UserRole.PARENT) {
      const link = await this.prisma.studentClassEnrollment.findFirst({
        where: {
          classId,
          student: {
            studentLinks: {
              some: {
                parentId: user.id,
              },
            },
          },
        },
        select: { id: true },
      });

      if (!link) {
        throw new ForbiddenException('You do not have class access');
      }
    } else if (user.role === UserRole.STUDENT) {
      const enrollment = await this.prisma.studentClassEnrollment.findUnique({
        where: {
          studentId_classId: {
            studentId: user.id,
            classId,
          },
        },
        select: { id: true },
      });

      if (!enrollment) {
        throw new ForbiddenException('You do not have class access');
      }
    } else {
      throw new ForbiddenException('You do not have timetable access');
    }

    return this.prisma.timetableBlock.findMany({
      where: {
        isActive: true,
        classes: {
          some: {
            classId,
          },
        },
      },
      select: timetableBlockSelect,
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async listByStudent(user: AuthenticatedUser, studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: {
        id: studentId,
      },
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

    const studentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId,
    });

    if (user.role === UserRole.STUDENT) {
      if (user.id !== studentId) {
        throw new ForbiddenException('You do not have student access');
      }
    } else if (user.role === UserRole.PARENT) {
      const link = await this.prisma.studentParentLink.findUnique({
        where: {
          parentId_studentId: {
            parentId: user.id,
            studentId,
          },
        },
        select: { id: true },
      });

      if (!link) {
        throw new ForbiddenException('You do not have student access');
      }
    } else if (user.role === UserRole.TEACHER || user.role === UserRole.SUPPLY_TEACHER) {
      const accessibleSchoolIds = new Set(getAccessibleSchoolIds(user));
      const hasSchoolAccess = studentSchoolIds.some((schoolId) =>
        accessibleSchoolIds.has(schoolId),
      );

      if (!hasSchoolAccess) {
        throw new ForbiddenException('You do not have student access');
      }

      const assignment = await this.prisma.teacherClassAssignment.findFirst({
        where: {
          teacherId: user.id,
          class: {
            students: {
              some: {
                studentId,
              },
            },
          },
        },
        select: { id: true },
      });

      if (!assignment) {
        throw new ForbiddenException('You do not have student access');
      }
    } else if (user.role === UserRole.OWNER || user.role === UserRole.SUPER_ADMIN) {
      // full access
    } else if (user.role === UserRole.ADMIN || isSchoolAdminRole(user.role)) {
      const accessibleSchoolIds = new Set(getAccessibleSchoolIds(user));
      const hasAccess = studentSchoolIds.some((schoolId) =>
        accessibleSchoolIds.has(schoolId),
      );

      if (!hasAccess) {
        throw new ForbiddenException('You do not have student access');
      }
    } else {
      throw new ForbiddenException('You do not have student access');
    }

    return this.prisma.timetableBlock.findMany({
      where: {
        isActive: true,
        classes: {
          some: {
            class: {
              students: {
                some: {
                  studentId,
                },
              },
            },
          },
        },
      },
      select: timetableBlockSelect,
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }
}
