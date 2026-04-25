import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogSeverity,
  InterviewSlotStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
} from '../common/access/school-access.util';
import { getAccessibleSchoolIdsWithLegacyFallback } from '../common/access/school-membership.util';
import { PrismaService } from '../prisma/prisma.service';
import { BulkGenerateInterviewSlotsDto } from './dto/bulk-generate-interview-slots.dto';
import { AdminBookInterviewSlotDto } from './dto/admin-book-interview-slot.dto';
import { BookInterviewSlotDto } from './dto/book-interview-slot.dto';
import { CreateInterviewEventDto } from './dto/create-interview-event.dto';
import { CreateInterviewSlotDto } from './dto/create-interview-slot.dto';
import { ListInterviewEventsQueryDto } from './dto/list-interview-events-query.dto';
import { ListInterviewSlotsQueryDto } from './dto/list-interview-slots-query.dto';
import { ListParentInterviewBookingsQueryDto } from './dto/list-parent-interview-bookings-query.dto';
import { ListParentInterviewEventsQueryDto } from './dto/list-parent-interview-events-query.dto';
import { ListTeacherInterviewSlotsQueryDto } from './dto/list-teacher-interview-slots-query.dto';
import { UpdateInterviewEventDto } from './dto/update-interview-event.dto';
import { UpdateInterviewSlotDto } from './dto/update-interview-slot.dto';

const INTERVIEW_MANAGE_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.STAFF,
];

const TEACHER_ROLES: UserRole[] = [UserRole.TEACHER, UserRole.SUPPLY_TEACHER];

const interviewEventSelect = Prisma.validator<Prisma.InterviewEventSelect>()({
  id: true,
  schoolId: true,
  title: true,
  description: true,
  bookingOpensAt: true,
  bookingClosesAt: true,
  startsAt: true,
  endsAt: true,
  isPublished: true,
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
  _count: {
    select: {
      slots: true,
    },
  },
});

const interviewSlotAdminSelect = Prisma.validator<Prisma.InterviewSlotSelect>()({
  id: true,
  interviewEventId: true,
  schoolId: true,
  teacherId: true,
  classId: true,
  startTime: true,
  endTime: true,
  location: true,
  meetingMode: true,
  notes: true,
  status: true,
  bookedParentId: true,
  bookedStudentId: true,
  bookedAt: true,
  bookingNotes: true,
  createdAt: true,
  updatedAt: true,
  interviewEvent: {
    select: {
      id: true,
      title: true,
      bookingOpensAt: true,
      bookingClosesAt: true,
      startsAt: true,
      endsAt: true,
      isPublished: true,
      isActive: true,
    },
  },
  teacher: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      username: true,
      role: true,
    },
  },
  class: {
    select: {
      id: true,
      name: true,
      subject: true,
      isActive: true,
    },
  },
  bookedParent: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      username: true,
    },
  },
  bookedStudent: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      username: true,
    },
  },
});

const interviewSlotParentSelect = Prisma.validator<Prisma.InterviewSlotSelect>()({
  id: true,
  interviewEventId: true,
  schoolId: true,
  teacherId: true,
  classId: true,
  startTime: true,
  endTime: true,
  location: true,
  meetingMode: true,
  notes: true,
  status: true,
  bookedParentId: true,
  bookedStudentId: true,
  bookedAt: true,
  bookingNotes: true,
  createdAt: true,
  updatedAt: true,
  interviewEvent: {
    select: {
      id: true,
      title: true,
      bookingOpensAt: true,
      bookingClosesAt: true,
      startsAt: true,
      endsAt: true,
      isPublished: true,
      isActive: true,
    },
  },
  teacher: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      username: true,
    },
  },
  class: {
    select: {
      id: true,
      name: true,
      subject: true,
    },
  },
});

const interviewSlotTeacherSelect = Prisma.validator<Prisma.InterviewSlotSelect>()({
  id: true,
  interviewEventId: true,
  schoolId: true,
  teacherId: true,
  classId: true,
  startTime: true,
  endTime: true,
  location: true,
  meetingMode: true,
  notes: true,
  status: true,
  bookedParentId: true,
  bookedStudentId: true,
  bookedAt: true,
  bookingNotes: true,
  createdAt: true,
  updatedAt: true,
  interviewEvent: {
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      isPublished: true,
      isActive: true,
    },
  },
  class: {
    select: {
      id: true,
      name: true,
      subject: true,
    },
  },
  bookedParent: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  bookedStudent: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
});

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private ensureCanManage(actor: AuthenticatedUser) {
    if (!INTERVIEW_MANAGE_ROLES.includes(actor.role)) {
      throw new ForbiddenException(
        'You do not have permission to manage interview scheduling',
      );
    }
  }

  private ensureParent(actor: AuthenticatedUser) {
    if (actor.role !== UserRole.PARENT) {
      throw new ForbiddenException('Only parents can access this endpoint');
    }
  }

  private ensureTeacherRole(actor: AuthenticatedUser) {
    if (!TEACHER_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Only teachers can access this endpoint');
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

  private parseDateTimeOrThrow(value: string, fieldName: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} must be a valid datetime`);
    }

    return parsed;
  }

  private parseNullableDateTimeOrThrow(
    value: string | null | undefined,
    fieldName: string,
  ) {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    return this.parseDateTimeOrThrow(value, fieldName);
  }

  private validateDateRange(
    start: Date,
    end: Date,
    startLabel: string,
    endLabel: string,
  ) {
    if (start >= end) {
      throw new BadRequestException(`${startLabel} must be before ${endLabel}`);
    }
  }

  private validateEventWindow(options: {
    startsAt: Date;
    endsAt: Date;
    bookingOpensAt: Date | null;
    bookingClosesAt: Date | null;
  }) {
    this.validateDateRange(options.startsAt, options.endsAt, 'startsAt', 'endsAt');

    if (options.bookingOpensAt && options.bookingClosesAt) {
      this.validateDateRange(
        options.bookingOpensAt,
        options.bookingClosesAt,
        'bookingOpensAt',
        'bookingClosesAt',
      );
    }

    if (options.bookingOpensAt && options.bookingOpensAt > options.endsAt) {
      throw new BadRequestException(
        'bookingOpensAt must be on or before event endsAt',
      );
    }

    if (options.bookingClosesAt && options.bookingClosesAt < options.startsAt) {
      throw new BadRequestException(
        'bookingClosesAt must be on or after event startsAt',
      );
    }
  }

  private validateSlotWithinEventWindow(options: {
    startTime: Date;
    endTime: Date;
    eventStartsAt: Date;
    eventEndsAt: Date;
  }) {
    this.validateDateRange(options.startTime, options.endTime, 'startTime', 'endTime');

    if (options.startTime < options.eventStartsAt || options.endTime > options.eventEndsAt) {
      throw new BadRequestException(
        'Slot time must be within the interview event date range',
      );
    }
  }

  private async ensureSchoolExists(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });

    if (!school) {
      throw new NotFoundException('School not found');
    }
  }

  private async getInterviewEventOrThrow(eventId: string) {
    const event = await this.prisma.interviewEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        schoolId: true,
        startsAt: true,
        endsAt: true,
        bookingOpensAt: true,
        bookingClosesAt: true,
        isPublished: true,
        isActive: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Interview event not found');
    }

    return event;
  }

  private async ensureTeacherAssignableToSchool(
    teacherId: string,
    schoolId: string,
  ) {
    const teacher = await this.prisma.user.findUnique({
      where: { id: teacherId },
      select: {
        id: true,
        role: true,
        schoolId: true,
        memberships: {
          where: { isActive: true },
          select: {
            schoolId: true,
          },
        },
      },
    });

    if (!teacher || !TEACHER_ROLES.includes(teacher.role)) {
      throw new BadRequestException('teacherId must reference an active teacher user');
    }

    const teacherSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: teacher.memberships,
      legacySchoolId: teacher.schoolId,
    });

    if (!teacherSchoolIds.includes(schoolId)) {
      throw new BadRequestException('Selected teacher is not assigned to this school');
    }
  }

  private async ensureClassBelongsToSchool(classId: string, schoolId: string) {
    const schoolClass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        schoolId: true,
      },
    });

    if (!schoolClass || schoolClass.schoolId !== schoolId) {
      throw new BadRequestException('classId must belong to the interview event school');
    }
  }

  private async ensureTeacherAssignedToClass(teacherId: string, classId: string) {
    const assignment = await this.prisma.teacherClassAssignment.findFirst({
      where: {
        teacherId,
        classId,
      },
      select: { id: true },
    });

    if (!assignment) {
      throw new BadRequestException(
        'Selected teacher is not assigned to the selected class',
      );
    }
  }

  private async ensureNoTeacherSlotOverlap(
    tx: PrismaService | Prisma.TransactionClient,
    options: {
      interviewEventId: string;
      teacherId: string;
      startTime: Date;
      endTime: Date;
      excludeSlotId?: string;
    },
  ) {
    const overlapping = await tx.interviewSlot.findFirst({
      where: {
        interviewEventId: options.interviewEventId,
        teacherId: options.teacherId,
        status: {
          not: InterviewSlotStatus.CANCELLED,
        },
        startTime: {
          lt: options.endTime,
        },
        endTime: {
          gt: options.startTime,
        },
        ...(options.excludeSlotId ? { id: { not: options.excludeSlotId } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (overlapping) {
      throw new ConflictException(
        'The selected teacher already has an overlapping interview slot',
      );
    }
  }

  private async getParentLinkedStudentOrThrow(parentId: string, studentId: string) {
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
            role: true,
            schoolId: true,
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
            role: true,
            schoolId: true,
            memberships: {
              where: {
                isActive: true,
              },
              select: {
                schoolId: true,
              },
            },
          },
        },
      },
    });
  }

  private async getParentStudentLinkOrThrow(parentId: string, studentId: string) {
    const link = await this.prisma.studentParentLink.findUnique({
      where: {
        parentId_studentId: {
          parentId,
          studentId,
        },
      },
      select: {
        parent: {
          select: {
            id: true,
            role: true,
            schoolId: true,
            memberships: {
              where: {
                isActive: true,
              },
              select: {
                schoolId: true,
              },
            },
          },
        },
        student: {
          select: {
            id: true,
            role: true,
            schoolId: true,
            memberships: {
              where: {
                isActive: true,
              },
              select: {
                schoolId: true,
              },
            },
          },
        },
      },
    });

    if (!link || link.parent.role !== UserRole.PARENT || link.student.role !== UserRole.STUDENT) {
      throw new BadRequestException('Selected parent is not linked to the selected student');
    }

    return link;
  }

  private async ensureStudentCanBookTeacherSlot(
    tx: Prisma.TransactionClient,
    options: {
      studentId: string;
      schoolId: string;
      teacherId: string;
      classId: string | null;
    },
  ) {
    const assignment = await tx.teacherClassAssignment.findFirst({
      where: {
        teacherId: options.teacherId,
        ...(options.classId ? { classId: options.classId } : {}),
        class: {
          schoolId: options.schoolId,
          students: {
            some: {
              studentId: options.studentId,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'This interview slot is not available for the selected student',
      );
    }
  }

  async listEvents(actor: AuthenticatedUser, query: ListInterviewEventsQueryDto) {
    this.ensureCanManage(actor);

    const scopeSchoolIds = this.buildScopeSchoolIds(actor, query.schoolId);
    const includeInactive = query.includeInactive ?? true;
    const includeUnpublished = query.includeUnpublished ?? true;

    return this.prisma.interviewEvent.findMany({
      where: {
        ...(scopeSchoolIds ? { schoolId: { in: scopeSchoolIds } } : {}),
        ...(includeInactive ? {} : { isActive: true }),
        ...(includeUnpublished ? {} : { isPublished: true }),
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      select: interviewEventSelect,
    });
  }

  async getEvent(actor: AuthenticatedUser, id: string) {
    this.ensureCanManage(actor);

    const event = await this.prisma.interviewEvent.findUnique({
      where: { id },
      select: interviewEventSelect,
    });

    if (!event) {
      throw new NotFoundException('Interview event not found');
    }

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, event.schoolId);
    }

    return event;
  }

  async createEvent(actor: AuthenticatedUser, data: CreateInterviewEventDto) {
    this.ensureCanManage(actor);

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, data.schoolId);
    }

    await this.ensureSchoolExists(data.schoolId);

    const startsAt = this.parseDateTimeOrThrow(data.startsAt, 'startsAt');
    const endsAt = this.parseDateTimeOrThrow(data.endsAt, 'endsAt');
    const bookingOpensAt = data.bookingOpensAt
      ? this.parseDateTimeOrThrow(data.bookingOpensAt, 'bookingOpensAt')
      : null;
    const bookingClosesAt = data.bookingClosesAt
      ? this.parseDateTimeOrThrow(data.bookingClosesAt, 'bookingClosesAt')
      : null;

    this.validateEventWindow({
      startsAt,
      endsAt,
      bookingOpensAt,
      bookingClosesAt,
    });

    return this.prisma.interviewEvent.create({
      data: {
        schoolId: data.schoolId,
        title: data.title.trim(),
        description: data.description ?? null,
        bookingOpensAt,
        bookingClosesAt,
        startsAt,
        endsAt,
        isPublished: data.isPublished ?? false,
        isActive: data.isActive ?? true,
      },
      select: interviewEventSelect,
    });
  }

  async updateEvent(
    actor: AuthenticatedUser,
    id: string,
    data: UpdateInterviewEventDto,
  ) {
    this.ensureCanManage(actor);

    const existing = await this.prisma.interviewEvent.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        startsAt: true,
        endsAt: true,
        bookingOpensAt: true,
        bookingClosesAt: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Interview event not found');
    }

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, existing.schoolId);
    }

    const startsAt =
      data.startsAt !== undefined
        ? this.parseDateTimeOrThrow(data.startsAt, 'startsAt')
        : existing.startsAt;
    const endsAt =
      data.endsAt !== undefined
        ? this.parseDateTimeOrThrow(data.endsAt, 'endsAt')
        : existing.endsAt;

    const parsedBookingOpensAt = this.parseNullableDateTimeOrThrow(
      data.bookingOpensAt,
      'bookingOpensAt',
    );
    const parsedBookingClosesAt = this.parseNullableDateTimeOrThrow(
      data.bookingClosesAt,
      'bookingClosesAt',
    );

    const bookingOpensAt =
      parsedBookingOpensAt !== undefined
        ? parsedBookingOpensAt
        : existing.bookingOpensAt;
    const bookingClosesAt =
      parsedBookingClosesAt !== undefined
        ? parsedBookingClosesAt
        : existing.bookingClosesAt;

    this.validateEventWindow({
      startsAt,
      endsAt,
      bookingOpensAt,
      bookingClosesAt,
    });

    return this.prisma.interviewEvent.update({
      where: { id: existing.id },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isPublished !== undefined
          ? { isPublished: data.isPublished }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.startsAt !== undefined ? { startsAt } : {}),
        ...(data.endsAt !== undefined ? { endsAt } : {}),
        ...(parsedBookingOpensAt !== undefined
          ? { bookingOpensAt: parsedBookingOpensAt }
          : {}),
        ...(parsedBookingClosesAt !== undefined
          ? { bookingClosesAt: parsedBookingClosesAt }
          : {}),
      },
      select: interviewEventSelect,
    });
  }

  async listParentEvents(
    actor: AuthenticatedUser,
    query: ListParentInterviewEventsQueryDto,
  ) {
    this.ensureParent(actor);

    const studentId = query.studentId?.trim() || null;

    let schoolIds: string[] = [];

    if (studentId) {
      const student = await this.getParentLinkedStudentOrThrow(actor.id, studentId);
      schoolIds = getAccessibleSchoolIdsWithLegacyFallback({
        memberships: student.memberships,
        legacySchoolId: student.schoolId,
      });
    } else {
      const links = await this.getParentLinkedStudents(actor.id);
      schoolIds = links.flatMap((entry) =>
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

    const now = new Date();

    return this.prisma.interviewEvent.findMany({
      where: {
        schoolId: {
          in: uniqueSchoolIds,
        },
        isActive: true,
        isPublished: true,
        endsAt: {
          gte: now,
        },
      },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'desc' }],
      select: interviewEventSelect,
    });
  }

  async listParentEventSlots(
    actor: AuthenticatedUser,
    eventId: string,
    studentId: string,
  ) {
    this.ensureParent(actor);

    const student = await this.getParentLinkedStudentOrThrow(actor.id, studentId);
    const studentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId,
    });

    const event = await this.prisma.interviewEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        schoolId: true,
        isActive: true,
        isPublished: true,
      },
    });

    if (!event || !event.isActive || !event.isPublished) {
      throw new NotFoundException('Interview event not found');
    }

    if (!studentSchoolIds.includes(event.schoolId)) {
      throw new ForbiddenException('You do not have access to this interview event');
    }

    const teacherAssignments = await this.prisma.teacherClassAssignment.findMany({
      where: {
        class: {
          schoolId: event.schoolId,
          students: {
            some: {
              studentId: student.id,
            },
          },
        },
      },
      select: {
        teacherId: true,
        classId: true,
      },
    });

    const relevantTeacherIds = [
      ...new Set(teacherAssignments.map((entry) => entry.teacherId)),
    ];
    const relevantClassIds = [
      ...new Set(teacherAssignments.map((entry) => entry.classId)),
    ];

    if (relevantTeacherIds.length === 0) {
      return [];
    }

    return this.prisma.interviewSlot.findMany({
      where: {
        interviewEventId: event.id,
        teacherId: {
          in: relevantTeacherIds,
        },
        status: {
          in: [InterviewSlotStatus.AVAILABLE, InterviewSlotStatus.BOOKED],
        },
        AND: [
          {
            OR: [
              { classId: null },
              { classId: { in: relevantClassIds } },
            ],
          },
        ],
        OR: [
          {
            status: InterviewSlotStatus.AVAILABLE,
          },
          {
            status: InterviewSlotStatus.BOOKED,
            bookedParentId: actor.id,
            bookedStudentId: student.id,
          },
        ],
      },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
      select: interviewSlotParentSelect,
    });
  }

  async listSlots(actor: AuthenticatedUser, query: ListInterviewSlotsQueryDto) {
    this.ensureCanManage(actor);

    const scopeSchoolIds = this.buildScopeSchoolIds(actor, query.schoolId);

    return this.prisma.interviewSlot.findMany({
      where: {
        ...(scopeSchoolIds ? { schoolId: { in: scopeSchoolIds } } : {}),
        ...(query.interviewEventId
          ? { interviewEventId: query.interviewEventId }
          : {}),
        ...(query.teacherId ? { teacherId: query.teacherId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.booked === true
          ? { bookedParentId: { not: null } }
          : query.booked === false
            ? { bookedParentId: null }
            : {}),
      },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
      select: interviewSlotAdminSelect,
    });
  }

  async createSlot(actor: AuthenticatedUser, data: CreateInterviewSlotDto) {
    this.ensureCanManage(actor);

    const event = await this.getInterviewEventOrThrow(data.interviewEventId);

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, event.schoolId);
    }

    await this.ensureTeacherAssignableToSchool(data.teacherId, event.schoolId);

    const classId = data.classId?.trim() || null;
    if (classId) {
      await this.ensureClassBelongsToSchool(classId, event.schoolId);
      await this.ensureTeacherAssignedToClass(data.teacherId, classId);
    }

    const startTime = this.parseDateTimeOrThrow(data.startTime, 'startTime');
    const endTime = this.parseDateTimeOrThrow(data.endTime, 'endTime');

    this.validateSlotWithinEventWindow({
      startTime,
      endTime,
      eventStartsAt: event.startsAt,
      eventEndsAt: event.endsAt,
    });

    await this.ensureNoTeacherSlotOverlap(this.prisma, {
      interviewEventId: event.id,
      teacherId: data.teacherId,
      startTime,
      endTime,
    });

    return this.prisma.interviewSlot.create({
      data: {
        interviewEventId: event.id,
        schoolId: event.schoolId,
        teacherId: data.teacherId,
        classId,
        startTime,
        endTime,
        location: data.location ?? null,
        meetingMode: data.meetingMode ?? null,
        notes: data.notes ?? null,
        status: InterviewSlotStatus.AVAILABLE,
      },
      select: interviewSlotAdminSelect,
    });
  }

  async bulkGenerateSlots(
    actor: AuthenticatedUser,
    data: BulkGenerateInterviewSlotsDto,
  ) {
    this.ensureCanManage(actor);

    const event = await this.getInterviewEventOrThrow(data.interviewEventId);

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, event.schoolId);
    }

    await this.ensureTeacherAssignableToSchool(data.teacherId, event.schoolId);

    const classId = data.classId?.trim() || null;
    if (classId) {
      await this.ensureClassBelongsToSchool(classId, event.schoolId);
      await this.ensureTeacherAssignedToClass(data.teacherId, classId);
    }

    const windowStart = this.parseDateTimeOrThrow(data.windowStart, 'windowStart');
    const windowEnd = this.parseDateTimeOrThrow(data.windowEnd, 'windowEnd');

    this.validateDateRange(windowStart, windowEnd, 'windowStart', 'windowEnd');

    if (windowStart < event.startsAt || windowEnd > event.endsAt) {
      throw new BadRequestException(
        'Bulk generation window must be within the interview event date range',
      );
    }

    const slotDurationMinutes = data.slotDurationMinutes;
    const breakMinutes = data.breakMinutes ?? 0;

    const slotDurationMs = slotDurationMinutes * 60_000;
    const intervalMs = (slotDurationMinutes + breakMinutes) * 60_000;

    const generatedSlots: Array<{ startTime: Date; endTime: Date }> = [];

    let cursor = new Date(windowStart);
    while (cursor.getTime() + slotDurationMs <= windowEnd.getTime()) {
      const startTime = new Date(cursor);
      const endTime = new Date(cursor.getTime() + slotDurationMs);
      generatedSlots.push({ startTime, endTime });
      cursor = new Date(cursor.getTime() + intervalMs);
    }

    if (generatedSlots.length === 0) {
      throw new BadRequestException(
        'Bulk generation window does not produce any slots with the requested duration',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const generated of generatedSlots) {
        await this.ensureNoTeacherSlotOverlap(tx, {
          interviewEventId: event.id,
          teacherId: data.teacherId,
          startTime: generated.startTime,
          endTime: generated.endTime,
        });
      }

      await tx.interviewSlot.createMany({
        data: generatedSlots.map((generated) => ({
          interviewEventId: event.id,
          schoolId: event.schoolId,
          teacherId: data.teacherId,
          classId,
          startTime: generated.startTime,
          endTime: generated.endTime,
          location: data.location ?? null,
          meetingMode: data.meetingMode ?? null,
          notes: data.notes ?? null,
          status: InterviewSlotStatus.AVAILABLE,
        })),
      });
    });

    return {
      createdCount: generatedSlots.length,
    };
  }

  async updateSlot(
    actor: AuthenticatedUser,
    id: string,
    data: UpdateInterviewSlotDto,
  ) {
    this.ensureCanManage(actor);

    const existing = await this.prisma.interviewSlot.findUnique({
      where: { id },
      select: {
        id: true,
        interviewEventId: true,
        schoolId: true,
        teacherId: true,
        classId: true,
        startTime: true,
        endTime: true,
        location: true,
        meetingMode: true,
        notes: true,
        status: true,
        bookedParentId: true,
        interviewEvent: {
          select: {
            startsAt: true,
            endsAt: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Interview slot not found');
    }

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, existing.schoolId);
    }

    const isBooked =
      existing.status === InterviewSlotStatus.BOOKED &&
      existing.bookedParentId !== null;

    if (data.status === InterviewSlotStatus.BOOKED) {
      throw new BadRequestException('Slot status cannot be set to BOOKED manually');
    }

    const modifiesBookingCriticalFields =
      data.teacherId !== undefined ||
      data.classId !== undefined ||
      data.startTime !== undefined ||
      data.endTime !== undefined ||
      data.status !== undefined;

    if (isBooked && modifiesBookingCriticalFields) {
      throw new BadRequestException(
        'Booked slots can only update location, meeting mode, or notes',
      );
    }

    const teacherId = data.teacherId?.trim() ?? existing.teacherId;
    const classId =
      data.classId !== undefined ? data.classId?.trim() || null : existing.classId;
    const startTime =
      data.startTime !== undefined
        ? this.parseDateTimeOrThrow(data.startTime, 'startTime')
        : existing.startTime;
    const endTime =
      data.endTime !== undefined
        ? this.parseDateTimeOrThrow(data.endTime, 'endTime')
        : existing.endTime;

    if (!isBooked) {
      await this.ensureTeacherAssignableToSchool(teacherId, existing.schoolId);
      if (classId) {
        await this.ensureClassBelongsToSchool(classId, existing.schoolId);
        await this.ensureTeacherAssignedToClass(teacherId, classId);
      }

      this.validateSlotWithinEventWindow({
        startTime,
        endTime,
        eventStartsAt: existing.interviewEvent.startsAt,
        eventEndsAt: existing.interviewEvent.endsAt,
      });

      await this.ensureNoTeacherSlotOverlap(this.prisma, {
        interviewEventId: existing.interviewEventId,
        teacherId,
        startTime,
        endTime,
        excludeSlotId: existing.id,
      });
    }

    const nextStatus = data.status ?? existing.status;

    return this.prisma.interviewSlot.update({
      where: { id: existing.id },
      data: {
        ...(data.teacherId !== undefined ? { teacherId } : {}),
        ...(data.classId !== undefined ? { classId } : {}),
        ...(data.startTime !== undefined ? { startTime } : {}),
        ...(data.endTime !== undefined ? { endTime } : {}),
        ...(data.location !== undefined ? { location: data.location } : {}),
        ...(data.meetingMode !== undefined
          ? { meetingMode: data.meetingMode }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.status !== undefined ? { status: nextStatus } : {}),
      },
      select: interviewSlotAdminSelect,
    });
  }

  async removeSlot(actor: AuthenticatedUser, id: string) {
    this.ensureCanManage(actor);

    const existing = await this.prisma.interviewSlot.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        status: true,
        bookedParentId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Interview slot not found');
    }

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, existing.schoolId);
    }

    if (
      existing.status === InterviewSlotStatus.BOOKED ||
      existing.bookedParentId !== null
    ) {
      throw new ConflictException('Booked interview slots cannot be deleted');
    }

    await this.prisma.interviewSlot.delete({
      where: {
        id: existing.id,
      },
    });

    return {
      success: true,
    };
  }

  async bookSlot(actor: AuthenticatedUser, slotId: string, data: BookInterviewSlotDto) {
    this.ensureParent(actor);

    const student = await this.getParentLinkedStudentOrThrow(
      actor.id,
      data.studentId.trim(),
    );

    const studentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId,
    });

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.interviewSlot.findUnique({
        where: {
          id: slotId,
        },
        select: {
          id: true,
          interviewEventId: true,
          schoolId: true,
          teacherId: true,
          classId: true,
          startTime: true,
          endTime: true,
          status: true,
          bookedParentId: true,
          bookedStudentId: true,
          interviewEvent: {
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              bookingOpensAt: true,
              bookingClosesAt: true,
              isPublished: true,
              isActive: true,
            },
          },
        },
      });

      if (!slot) {
        throw new NotFoundException('Interview slot not found');
      }

      if (!studentSchoolIds.includes(slot.schoolId)) {
        throw new ForbiddenException('You do not have access to this interview slot');
      }

      if (!slot.interviewEvent.isActive || !slot.interviewEvent.isPublished) {
        throw new BadRequestException('Interview event is not open for parent booking');
      }

      if (slot.startTime <= now) {
        throw new BadRequestException('Past interview slots cannot be booked');
      }

      if (slot.interviewEvent.bookingOpensAt && now < slot.interviewEvent.bookingOpensAt) {
        throw new BadRequestException('Booking has not opened for this interview event');
      }

      if (slot.interviewEvent.bookingClosesAt && now > slot.interviewEvent.bookingClosesAt) {
        throw new BadRequestException('Booking is closed for this interview event');
      }

      if (
        slot.status !== InterviewSlotStatus.AVAILABLE ||
        slot.bookedParentId !== null ||
        slot.bookedStudentId !== null
      ) {
        throw new ConflictException('Interview slot is no longer available');
      }

      await this.ensureStudentCanBookTeacherSlot(tx, {
        studentId: student.id,
        schoolId: slot.schoolId,
        teacherId: slot.teacherId,
        classId: slot.classId,
      });

      const existingEventBooking = await tx.interviewSlot.findFirst({
        where: {
          interviewEventId: slot.interviewEventId,
          status: InterviewSlotStatus.BOOKED,
          bookedStudentId: student.id,
        },
        select: {
          id: true,
        },
      });

      if (existingEventBooking) {
        throw new ConflictException(
          'Selected student already has an interview booking in this event',
        );
      }

      const overlappingBooking = await tx.interviewSlot.findFirst({
        where: {
          status: InterviewSlotStatus.BOOKED,
          bookedStudentId: student.id,
          startTime: { lt: slot.endTime },
          endTime: { gt: slot.startTime },
        },
        select: {
          id: true,
        },
      });

      if (overlappingBooking) {
        throw new ConflictException(
          'Selected student already has an overlapping interview booking',
        );
      }

      const bookingResult = await tx.interviewSlot.updateMany({
        where: {
          id: slot.id,
          status: InterviewSlotStatus.AVAILABLE,
          bookedParentId: null,
          bookedStudentId: null,
        },
        data: {
          status: InterviewSlotStatus.BOOKED,
          bookedParentId: actor.id,
          bookedStudentId: student.id,
          bookedAt: now,
          bookingNotes: data.bookingNotes ?? null,
        },
      });

      if (bookingResult.count !== 1) {
        throw new ConflictException('Interview slot is no longer available');
      }

      return tx.interviewSlot.findUniqueOrThrow({
        where: {
          id: slot.id,
        },
        select: interviewSlotParentSelect,
      });
    });
  }

  async bookSlotByAdmin(
    actor: AuthenticatedUser,
    slotId: string,
    data: AdminBookInterviewSlotDto,
  ) {
    this.ensureCanManage(actor);

    const link = await this.getParentStudentLinkOrThrow(
      data.parentId.trim(),
      data.studentId.trim(),
    );
    const studentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: link.student.memberships,
      legacySchoolId: link.student.schoolId,
    });

    const now = new Date();

    const bookedSlot = await this.prisma.$transaction(async (tx) => {
      const slot = await tx.interviewSlot.findUnique({
        where: {
          id: slotId,
        },
        select: {
          id: true,
          interviewEventId: true,
          schoolId: true,
          teacherId: true,
          classId: true,
          startTime: true,
          endTime: true,
          status: true,
          bookedParentId: true,
          bookedStudentId: true,
          interviewEvent: {
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              bookingOpensAt: true,
              bookingClosesAt: true,
              isPublished: true,
              isActive: true,
            },
          },
        },
      });

      if (!slot) {
        throw new NotFoundException('Interview slot not found');
      }

      if (!isBypassRole(actor.role)) {
        ensureUserHasSchoolAccess(actor, slot.schoolId);
      }

      if (!studentSchoolIds.includes(slot.schoolId)) {
        throw new BadRequestException(
          'Selected student is not in the same school as the interview slot',
        );
      }

      if (!slot.interviewEvent.isActive || !slot.interviewEvent.isPublished) {
        throw new BadRequestException('Interview event is not open for booking');
      }

      if (slot.startTime <= now) {
        throw new BadRequestException('Past interview slots cannot be booked');
      }

      if (slot.interviewEvent.bookingOpensAt && now < slot.interviewEvent.bookingOpensAt) {
        throw new BadRequestException('Booking has not opened for this interview event');
      }

      if (slot.interviewEvent.bookingClosesAt && now > slot.interviewEvent.bookingClosesAt) {
        throw new BadRequestException('Booking is closed for this interview event');
      }

      if (
        slot.status !== InterviewSlotStatus.AVAILABLE ||
        slot.bookedParentId !== null ||
        slot.bookedStudentId !== null
      ) {
        throw new ConflictException('Interview slot is no longer available');
      }

      await this.ensureStudentCanBookTeacherSlot(tx, {
        studentId: link.student.id,
        schoolId: slot.schoolId,
        teacherId: slot.teacherId,
        classId: slot.classId,
      });

      const existingEventBooking = await tx.interviewSlot.findFirst({
        where: {
          interviewEventId: slot.interviewEventId,
          status: InterviewSlotStatus.BOOKED,
          bookedStudentId: link.student.id,
        },
        select: {
          id: true,
        },
      });

      if (existingEventBooking) {
        throw new ConflictException(
          'Selected student already has an interview booking in this event',
        );
      }

      const overlappingBooking = await tx.interviewSlot.findFirst({
        where: {
          status: InterviewSlotStatus.BOOKED,
          bookedStudentId: link.student.id,
          startTime: { lt: slot.endTime },
          endTime: { gt: slot.startTime },
        },
        select: {
          id: true,
        },
      });

      if (overlappingBooking) {
        throw new ConflictException(
          'Selected student already has an overlapping interview booking',
        );
      }

      const bookingResult = await tx.interviewSlot.updateMany({
        where: {
          id: slot.id,
          status: InterviewSlotStatus.AVAILABLE,
          bookedParentId: null,
          bookedStudentId: null,
        },
        data: {
          status: InterviewSlotStatus.BOOKED,
          bookedParentId: link.parent.id,
          bookedStudentId: link.student.id,
          bookedAt: now,
          bookingNotes: data.bookingNotes ?? null,
        },
      });

      if (bookingResult.count !== 1) {
        throw new ConflictException('Interview slot is no longer available');
      }

      return tx.interviewSlot.findUniqueOrThrow({
        where: {
          id: slot.id,
        },
        select: interviewSlotAdminSelect,
      });
    });

    await this.auditService.log({
      actor,
      schoolId: bookedSlot.schoolId,
      entityType: 'InterviewSlot',
      entityId: bookedSlot.id,
      action: 'ADMIN_BOOK_FOR_PARENT',
      severity: AuditLogSeverity.WARNING,
      summary: `Booked interview slot ${bookedSlot.id} for parent ${bookedSlot.bookedParentId} and student ${bookedSlot.bookedStudentId}`,
      targetDisplay: bookedSlot.interviewEvent.title,
      metadataJson: {
        interviewEventId: bookedSlot.interviewEventId,
        slotId: bookedSlot.id,
        teacherId: bookedSlot.teacherId,
        studentId: bookedSlot.bookedStudentId,
        parentId: bookedSlot.bookedParentId,
      },
    });

    return bookedSlot;
  }

  async cancelBookingByParent(actor: AuthenticatedUser, slotId: string) {
    this.ensureParent(actor);

    const existing = await this.prisma.interviewSlot.findFirst({
      where: {
        id: slotId,
        status: InterviewSlotStatus.BOOKED,
        bookedParentId: actor.id,
      },
      select: {
        id: true,
        startTime: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Interview booking not found');
    }

    if (existing.startTime <= new Date()) {
      throw new BadRequestException('Started interview slots cannot be cancelled');
    }

    return this.prisma.interviewSlot.update({
      where: {
        id: existing.id,
      },
      data: {
        status: InterviewSlotStatus.AVAILABLE,
        bookedParentId: null,
        bookedStudentId: null,
        bookedAt: null,
        bookingNotes: null,
      },
      select: interviewSlotParentSelect,
    });
  }

  async unbookSlotByAdmin(actor: AuthenticatedUser, slotId: string) {
    this.ensureCanManage(actor);

    const existing = await this.prisma.interviewSlot.findUnique({
      where: {
        id: slotId,
      },
      select: {
        id: true,
        schoolId: true,
        status: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Interview slot not found');
    }

    if (!isBypassRole(actor.role)) {
      ensureUserHasSchoolAccess(actor, existing.schoolId);
    }

    if (existing.status !== InterviewSlotStatus.BOOKED) {
      throw new BadRequestException('Only booked slots can be unbooked');
    }

    return this.prisma.interviewSlot.update({
      where: {
        id: existing.id,
      },
      data: {
        status: InterviewSlotStatus.AVAILABLE,
        bookedParentId: null,
        bookedStudentId: null,
        bookedAt: null,
        bookingNotes: null,
      },
      select: interviewSlotAdminSelect,
    });
  }

  async listParentBookings(
    actor: AuthenticatedUser,
    query: ListParentInterviewBookingsQueryDto,
  ) {
    this.ensureParent(actor);

    const studentId = query.studentId?.trim() || null;
    if (studentId) {
      await this.getParentLinkedStudentOrThrow(actor.id, studentId);
    }

    return this.prisma.interviewSlot.findMany({
      where: {
        status: InterviewSlotStatus.BOOKED,
        bookedParentId: actor.id,
        ...(studentId ? { bookedStudentId: studentId } : {}),
        ...(query.interviewEventId
          ? { interviewEventId: query.interviewEventId }
          : {}),
      },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'desc' }],
      select: interviewSlotParentSelect,
    });
  }

  async listTeacherSlots(
    actor: AuthenticatedUser,
    query: ListTeacherInterviewSlotsQueryDto,
  ) {
    this.ensureTeacherRole(actor);

    return this.prisma.interviewSlot.findMany({
      where: {
        teacherId: actor.id,
        ...(query.interviewEventId
          ? { interviewEventId: query.interviewEventId }
          : {}),
        interviewEvent: {
          isActive: true,
        },
      },
      orderBy: [{ startTime: 'asc' }, { createdAt: 'desc' }],
      select: interviewSlotTeacherSelect,
    });
  }
}
