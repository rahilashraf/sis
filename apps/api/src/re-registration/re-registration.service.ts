import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  ReRegistrationNonReturnReason,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  isBypassRole,
  isSchoolAdminRole,
} from '../common/access/school-access.util';
import { NotificationsService } from '../notifications/notifications.service';
import { ListReRegistrationTrackingDto } from './dto/list-re-registration-tracking.dto';

type AuthUser = AuthenticatedUser;

function isSchemaMissingError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2021' || error.code === 'P2022')
  );
}

function isWindowOpen(now: Date, opensAt: Date, closesAt: Date) {
  return now >= opensAt && now <= closesAt;
}

function normalizeText(value?: string | null) {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type TrackingSubmissionStatus = 'ALL' | 'SUBMITTED' | 'PENDING';
type TrackingReturningIntent = 'ALL' | 'RETURNING' | 'NOT_RETURNING';

type TrackingRow = {
  studentId: string;
  firstName: string;
  lastName: string;
  gradeLevelId: string | null;
  gradeLevelName: string | null;
  classNames: string[];
  isSubmitted: boolean;
  submittedAt: Date | null;
  returningNextYear: boolean | null;
  nonReturningReason: ReRegistrationNonReturnReason | null;
  nonReturningComment: string | null;
  lastRemindedAt: Date | null;
};

const REMINDER_ENTITY_TYPE = 'ReRegistrationReminder';
const REMINDER_THROTTLE_MINUTES = 15;

@Injectable()
export class ReRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private canManageWindows(role: UserRole) {
    return (
      role === UserRole.OWNER ||
      role === UserRole.SUPER_ADMIN ||
      role === UserRole.ADMIN
    );
  }

  private ensureUserCanManageWindows(user: AuthUser, schoolId: string) {
    if (!this.canManageWindows(user.role)) {
      throw new ForbiddenException('You do not have re-registration access');
    }

    if (!isBypassRole(user.role)) {
      ensureUserHasSchoolAccess(user, schoolId);
    }
  }

  private ensureUserCanReadWindow(user: AuthUser, schoolId: string) {
    if (user.role === UserRole.PARENT) {
      return;
    }

    if (isBypassRole(user.role) || isSchoolAdminRole(user.role)) {
      if (!isBypassRole(user.role)) {
        ensureUserHasSchoolAccess(user, schoolId);
      }
      return;
    }

    throw new ForbiddenException('You do not have re-registration access');
  }

  private buildEligibleStudentWhereForSchool(schoolId: string): Prisma.UserWhereInput {
    return {
      role: UserRole.STUDENT,
      isActive: true,
      OR: [
        {
          memberships: {
            some: {
              schoolId,
              isActive: true,
            },
          },
        },
        {
          schoolId,
        },
      ],
    };
  }

  private async ensureSchoolYearMatchesSchoolOrThrow(schoolId: string, schoolYearId: string) {
    const year = await this.prisma.schoolYear.findUnique({
      where: { id: schoolYearId },
      select: { id: true, schoolId: true },
    });

    if (!year) {
      throw new NotFoundException('School year not found');
    }

    if (year.schoolId !== schoolId) {
      throw new BadRequestException('schoolYearId does not belong to schoolId');
    }
  }

  private parseDateTimeOrThrow(value: string, field: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid datetime`);
    }
    return parsed;
  }

  /**
   * Resolves the student's school from memberships (or legacy schoolId),
   * checks all school years in parallel, and returns the best window status:
   * OPEN > UPCOMING > CLOSED > NOT_CONFIGURED.
   * Used by the parent re-registration gate — single authoritative source.
   */
  async getWindowStatusForStudent(user: AuthUser, studentId: string, now = new Date()) {
    if (user.role !== UserRole.PARENT && !isBypassRole(user.role) && !isSchoolAdminRole(user.role)) {
      throw new ForbiddenException('You do not have re-registration access');
    }

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        schoolId: true,
        role: true,
        memberships: {
          where: { isActive: true },
          select: { schoolId: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!student || student.role !== UserRole.STUDENT) {
      throw new NotFoundException('Student not found');
    }

    // Parents must be linked to the student
    if (user.role === UserRole.PARENT) {
      const link = await this.prisma.studentParentLink.findUnique({
        where: { parentId_studentId: { parentId: user.id, studentId } },
        select: { id: true },
      });
      if (!link) {
        throw new ForbiddenException('You do not have access to this student');
      }
    }

    const schoolId =
      student.memberships[0]?.schoolId ?? student.schoolId ?? null;

    if (!schoolId) {
      return {
        studentId,
        schoolId: null,
        schoolYearId: null,
        now,
        window: null,
        existingSubmission: null,
        submittedAt: null,
        canEdit: false,
        isOpen: false,
        status: 'NOT_CONFIGURED' as const,
      };
    }

    // Fetch all school years for this school
    let schoolYears: Array<{ id: string }>;
    try {
      schoolYears = await this.prisma.schoolYear.findMany({
        where: { schoolId },
        select: { id: true },
        orderBy: { startDate: 'asc' },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return {
          studentId,
          schoolId,
          schoolYearId: null,
          now,
          window: null,
          existingSubmission: null,
          submittedAt: null,
          canEdit: false,
          isOpen: false,
          status: 'NOT_CONFIGURED' as const,
        };
      }
      throw error;
    }

    if (schoolYears.length === 0) {
      return {
        studentId,
        schoolId,
        schoolYearId: null,
        now,
        window: null,
        existingSubmission: null,
        submittedAt: null,
        canEdit: false,
        isOpen: false,
        status: 'NOT_CONFIGURED' as const,
      };
    }

    // Check all school years in parallel — no user permission check needed,
    // parent access to status is allowed
    const results = await Promise.all(
      schoolYears.map(async (year) => {
        try {
          const raw = await this.prisma.reRegistrationWindow.findFirst({
            where: { schoolId, schoolYearId: year.id, isActive: true },
            orderBy: [{ opensAt: 'desc' }, { createdAt: 'desc' }],
          });
          if (!raw) return null;
          const open = isWindowOpen(now, raw.opensAt, raw.closesAt);
          const upcoming = !open && now < raw.opensAt;
          return {
            schoolYearId: year.id,
            window: raw,
            isOpen: open,
            status: open
              ? ('OPEN' as const)
              : upcoming
                ? ('UPCOMING' as const)
                : ('CLOSED' as const),
          };
        } catch {
          return null;
        }
      }),
    );

    const valid = results.filter((r) => r !== null);
    const best =
      valid.find((r) => r!.status === 'OPEN') ??
      valid.find((r) => r!.status === 'UPCOMING') ??
      valid.find((r) => r!.status === 'CLOSED') ??
      null;

    if (!best) {
      return {
        studentId,
        schoolId,
        schoolYearId: null,
        now,
        window: null,
        existingSubmission: null,
        submittedAt: null,
        canEdit: false,
        isOpen: false,
        status: 'NOT_CONFIGURED' as const,
      };
    }

    const existingSubmission = await this.prisma.reRegistrationSubmission.findUnique({
      where: {
        windowId_studentId: {
          windowId: best.window.id,
          studentId,
        },
      },
      select: {
        submittedAt: true,
        returningNextYear: true,
        nonReturningReason: true,
        nonReturningComment: true,
      },
    });

    const canEdit = best.status === 'OPEN';

    return {
      studentId,
      schoolId,
      schoolYearId: best.schoolYearId,
      now,
      window: best.window,
      existingSubmission,
      submittedAt: existingSubmission?.submittedAt ?? null,
      canEdit,
      isOpen: best.isOpen,
      status: best.status,
    };
  }

  async getWindowStatus(
    user: AuthUser,
    schoolId: string,
    schoolYearId: string,
    now = new Date(),
  ) {
    this.ensureUserCanReadWindow(user, schoolId);

    let window:
      | {
          id: string;
          schoolId: string;
          schoolYearId: string;
          opensAt: Date;
          closesAt: Date;
          isActive: boolean;
          createdAt: Date;
          updatedAt: Date;
        }
      | null = null;

    try {
      window = await this.prisma.reRegistrationWindow.findFirst({
        where: {
          schoolId,
          schoolYearId,
          isActive: true,
        },
        orderBy: [{ opensAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          schoolId: true,
          schoolYearId: true,
          opensAt: true,
          closesAt: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return {
          now,
          window: null,
          isOpen: false,
          status: 'NOT_CONFIGURED' as const,
        };
      }

      throw error;
    }

    if (!window) {
      return {
        now,
        window: null,
        isOpen: false,
        status: 'NOT_CONFIGURED' as const,
      };
    }

    const open = isWindowOpen(now, window.opensAt, window.closesAt);
    const upcoming = !open && now < window.opensAt;

    return {
      now,
      window,
      isOpen: open,
      status: open ? ('OPEN' as const) : upcoming ? ('UPCOMING' as const) : ('CLOSED' as const),
    };
  }

  async listWindows(user: AuthUser, schoolId: string, schoolYearId: string) {
    this.ensureUserCanManageWindows(user, schoolId);
    await this.ensureSchoolYearMatchesSchoolOrThrow(schoolId, schoolYearId);

    try {
      return await this.prisma.reRegistrationWindow.findMany({
        where: { schoolId, schoolYearId },
        orderBy: [{ opensAt: 'desc' }, { createdAt: 'desc' }],
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return [];
      }

      throw error;
    }
  }

  async isReRegistrationOpenForSchool(
    schoolId: string,
    schoolYearId: string | null,
    now = new Date(),
  ) {
    try {
      const window = await this.prisma.reRegistrationWindow.findFirst({
        where: {
          schoolId,
          ...(schoolYearId ? { schoolYearId } : {}),
          isActive: true,
          opensAt: { lte: now },
          closesAt: { gte: now },
        },
        select: {
          id: true,
          opensAt: true,
          closesAt: true,
        },
        orderBy: [{ opensAt: 'desc' }, { createdAt: 'desc' }],
      });

      return Boolean(window);
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return false;
      }

      throw error;
    }
  }

  private parseSubmissionStatus(input?: string): TrackingSubmissionStatus {
    const normalized = (input ?? 'ALL').toUpperCase();

    if (
      normalized === 'ALL' ||
      normalized === 'SUBMITTED' ||
      normalized === 'PENDING'
    ) {
      return normalized;
    }

    throw new BadRequestException(
      'submissionStatus must be one of ALL, SUBMITTED, or PENDING',
    );
  }

  private parseReturningIntent(input?: string): TrackingReturningIntent {
    const normalized = (input ?? 'ALL').toUpperCase();

    if (
      normalized === 'ALL' ||
      normalized === 'RETURNING' ||
      normalized === 'NOT_RETURNING'
    ) {
      return normalized;
    }

    throw new BadRequestException(
      'returningIntent must be one of ALL, RETURNING, or NOT_RETURNING',
    );
  }

  private async findActiveOpenWindowOrThrow(
    schoolId: string,
    schoolYearId: string | null,
    now = new Date(),
  ) {
    const window = await this.prisma.reRegistrationWindow.findFirst({
      where: {
        schoolId,
        ...(schoolYearId ? { schoolYearId } : {}),
        isActive: true,
        opensAt: { lte: now },
        closesAt: { gte: now },
      },
      orderBy: [{ opensAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        schoolId: true,
        schoolYearId: true,
      },
    });

    if (!window) {
      throw new ForbiddenException('Re-registration is currently closed');
    }

    return window;
  }

  private buildReminderEntityId(windowId: string, studentId: string) {
    return `${windowId}:${studentId}`;
  }

  private isWindowCurrentlyOpen(window: {
    opensAt: Date;
    closesAt: Date;
    isActive: boolean;
  }) {
    return window.isActive && isWindowOpen(new Date(), window.opensAt, window.closesAt);
  }

  private formatReminderCloseDate(closesAt: Date) {
    return closesAt.toISOString().slice(0, 10);
  }

  private async getReminderCandidateByStudentId(input: {
    windowId: string;
    schoolId: string;
    studentId: string;
  }) {
    const student = await this.prisma.user.findFirst({
      where: {
        ...this.buildEligibleStudentWhereForSchool(input.schoolId),
        id: input.studentId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found for this re-registration window');
    }

    const submission = await this.prisma.reRegistrationSubmission.findUnique({
      where: {
        windowId_studentId: {
          windowId: input.windowId,
          studentId: input.studentId,
        },
      },
      select: { id: true },
    });

    const parentLinks = await this.prisma.studentParentLink.findMany({
      where: {
        studentId: input.studentId,
        parent: {
          isActive: true,
        },
      },
      select: {
        parentId: true,
      },
    });

    const parentIds = Array.from(new Set(parentLinks.map((link) => link.parentId)));

    return {
      student,
      parentIds,
      isSubmitted: Boolean(submission),
    };
  }

  private async getRecentReminderRecipientSet(input: {
    entityIds: string[];
  }) {
    if (input.entityIds.length === 0) {
      return new Set<string>();
    }

    const cutoff = new Date(Date.now() - REMINDER_THROTTLE_MINUTES * 60 * 1000);
    const recent = await this.prisma.notification.findMany({
      where: {
        entityType: REMINDER_ENTITY_TYPE,
        entityId: { in: input.entityIds },
        createdAt: { gte: cutoff },
      },
      select: {
        entityId: true,
        recipientUserId: true,
      },
    });

    return new Set(
      recent
        .filter((row) => row.entityId)
        .map((row) => `${row.entityId}:${row.recipientUserId}`),
    );
  }

  async remindAllPending(user: AuthUser, windowId: string) {
    const window = await this.prisma.reRegistrationWindow.findUnique({
      where: { id: windowId },
      select: {
        id: true,
        schoolId: true,
        schoolYearId: true,
        opensAt: true,
        closesAt: true,
        isActive: true,
      },
    });

    if (!window) {
      throw new NotFoundException('Re-registration window not found');
    }

    this.ensureUserCanManageWindows(user, window.schoolId);

    if (!this.isWindowCurrentlyOpen(window)) {
      throw new BadRequestException(
        'Reminders can only be sent while the re-registration window is open',
      );
    }

    const students = await this.prisma.user.findMany({
      where: this.buildEligibleStudentWhereForSchool(window.schoolId),
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    const submissions = await this.prisma.reRegistrationSubmission.findMany({
      where: { windowId: window.id },
      select: { studentId: true },
    });

    const submittedStudentIds = new Set(submissions.map((submission) => submission.studentId));
    const pendingStudents = students.filter((student) => !submittedStudentIds.has(student.id));

    const pendingStudentIds = pendingStudents.map((student) => student.id);
    const pendingParentLinks =
      pendingStudentIds.length > 0
        ? await this.prisma.studentParentLink.findMany({
            where: {
              studentId: { in: pendingStudentIds },
              parent: {
                isActive: true,
              },
            },
            select: {
              studentId: true,
              parentId: true,
            },
          })
        : [];

    const parentIdsByStudentId = new Map<string, string[]>();
    for (const link of pendingParentLinks) {
      const existing = parentIdsByStudentId.get(link.studentId) ?? [];
      if (!existing.includes(link.parentId)) {
        existing.push(link.parentId);
      }
      parentIdsByStudentId.set(link.studentId, existing);
    }

    const reminderEntityIds = pendingStudents.map((student) =>
      this.buildReminderEntityId(window.id, student.id),
    );
    const recentlyRemindedRecipients = await this.getRecentReminderRecipientSet({
      entityIds: reminderEntityIds,
    });

    let studentsReminded = 0;
    let notificationsSent = 0;
    let skippedNoLinkedParent = 0;
    let skippedAlreadySubmitted = submittedStudentIds.size;
    let skippedRecentlyReminded = 0;

    const reminderDeadline = this.formatReminderCloseDate(window.closesAt);

    for (const student of pendingStudents) {
      const parentIds = parentIdsByStudentId.get(student.id) ?? [];

      if (parentIds.length === 0) {
        skippedNoLinkedParent += 1;
        continue;
      }

      const entityId = this.buildReminderEntityId(window.id, student.id);
      const alreadyRecentlyReminded = parentIds.some((parentId) =>
        recentlyRemindedRecipients.has(`${entityId}:${parentId}`),
      );

      if (alreadyRecentlyReminded) {
        skippedRecentlyReminded += 1;
        continue;
      }

      const studentName = `${student.firstName} ${student.lastName}`.trim() || 'Student';
      const result = await this.notificationsService.createMany(
        parentIds.map((parentId) => ({
          schoolId: window.schoolId,
          recipientUserId: parentId,
          type: NotificationType.SYSTEM_ANNOUNCEMENT,
          title: 'Re-Registration Reminder',
          message: `Please complete re-registration for ${studentName} before ${reminderDeadline}.`,
          entityType: REMINDER_ENTITY_TYPE,
          entityId,
        })),
      );

      studentsReminded += 1;
      notificationsSent += result.count;
    }

    return {
      windowId: window.id,
      eligibleStudents: students.length,
      pendingStudents: pendingStudents.length,
      studentsReminded,
      notificationsSent,
      skippedNoLinkedParent,
      skippedAlreadySubmitted,
      skippedRecentlyReminded,
      throttleMinutes: REMINDER_THROTTLE_MINUTES,
    };
  }

  async remindStudent(user: AuthUser, windowId: string, studentId: string) {
    const window = await this.prisma.reRegistrationWindow.findUnique({
      where: { id: windowId },
      select: {
        id: true,
        schoolId: true,
        opensAt: true,
        closesAt: true,
        isActive: true,
      },
    });

    if (!window) {
      throw new NotFoundException('Re-registration window not found');
    }

    this.ensureUserCanManageWindows(user, window.schoolId);

    if (!this.isWindowCurrentlyOpen(window)) {
      throw new BadRequestException(
        'Reminders can only be sent while the re-registration window is open',
      );
    }

    const candidate = await this.getReminderCandidateByStudentId({
      windowId,
      schoolId: window.schoolId,
      studentId,
    });

    if (candidate.isSubmitted) {
      return {
        windowId,
        studentId,
        status: 'SKIPPED_ALREADY_SUBMITTED' as const,
        notificationsSent: 0,
      };
    }

    if (candidate.parentIds.length === 0) {
      return {
        windowId,
        studentId,
        status: 'SKIPPED_NO_LINKED_PARENT' as const,
        notificationsSent: 0,
      };
    }

    const entityId = this.buildReminderEntityId(window.id, studentId);
    const recentlyRemindedRecipients = await this.getRecentReminderRecipientSet({
      entityIds: [entityId],
    });

    const alreadyRecentlyReminded = candidate.parentIds.some((parentId) =>
      recentlyRemindedRecipients.has(`${entityId}:${parentId}`),
    );

    if (alreadyRecentlyReminded) {
      return {
        windowId,
        studentId,
        status: 'SKIPPED_RECENTLY_REMINDED' as const,
        notificationsSent: 0,
        throttleMinutes: REMINDER_THROTTLE_MINUTES,
      };
    }

    const studentName =
      `${candidate.student.firstName} ${candidate.student.lastName}`.trim() || 'Student';
    const reminderDeadline = this.formatReminderCloseDate(window.closesAt);

    const result = await this.notificationsService.createMany(
      candidate.parentIds.map((parentId) => ({
        schoolId: window.schoolId,
        recipientUserId: parentId,
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
        title: 'Re-Registration Reminder',
        message: `Please complete re-registration for ${studentName} before ${reminderDeadline}.`,
        entityType: REMINDER_ENTITY_TYPE,
        entityId,
      })),
    );

    return {
      windowId,
      studentId,
      status: 'REMINDER_SENT' as const,
      notificationsSent: result.count,
    };
  }

  async recordSubmission(input: {
    actorUserId: string;
    studentId: string;
    schoolId: string;
    schoolYearId: string | null;
    returningNextYear: boolean;
    nonReturningReason?: ReRegistrationNonReturnReason | null;
    nonReturningComment?: string | null;
  }) {
    const nonReturningReason = input.nonReturningReason ?? null;
    const nonReturningComment = normalizeText(input.nonReturningComment);

    if (!input.returningNextYear && !nonReturningReason) {
      throw new BadRequestException(
        'nonReturningReason is required when returningNextYear is false',
      );
    }

    const activeWindow = await this.findActiveOpenWindowOrThrow(
      input.schoolId,
      input.schoolYearId,
    );

    return this.prisma.reRegistrationSubmission.upsert({
      where: {
        windowId_studentId: {
          windowId: activeWindow.id,
          studentId: input.studentId,
        },
      },
      create: {
        windowId: activeWindow.id,
        studentId: input.studentId,
        submittedByUserId: input.actorUserId,
        returningNextYear: input.returningNextYear,
        nonReturningReason: input.returningNextYear ? null : nonReturningReason,
        nonReturningComment: input.returningNextYear ? null : nonReturningComment,
      },
      update: {
        submittedByUserId: input.actorUserId,
        submittedAt: new Date(),
        returningNextYear: input.returningNextYear,
        nonReturningReason: input.returningNextYear ? null : nonReturningReason,
        nonReturningComment: input.returningNextYear ? null : nonReturningComment,
      },
      select: {
        id: true,
        windowId: true,
      },
    });
  }

  async getWindowTracking(
    user: AuthUser,
    windowId: string,
    query: ListReRegistrationTrackingDto,
  ) {
    const window = await this.prisma.reRegistrationWindow.findUnique({
      where: { id: windowId },
      select: {
        id: true,
        schoolId: true,
        schoolYearId: true,
        opensAt: true,
        closesAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!window) {
      throw new NotFoundException('Re-registration window not found');
    }

    this.ensureUserCanManageWindows(user, window.schoolId);

    const submissionStatus = this.parseSubmissionStatus(query.submissionStatus);
    const returningIntent = this.parseReturningIntent(query.returningIntent);
    const reasonFilter = normalizeText(query.reason);
    const searchText = normalizeText(query.query)?.toLowerCase() ?? '';
    const gradeLevelIdFilter = normalizeText(query.gradeLevelId);
    const classIdFilter = normalizeText(query.classId);

    const students = await this.prisma.user.findMany({
      where: this.buildEligibleStudentWhereForSchool(window.schoolId),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        gradeLevelId: true,
        gradeLevel: {
          select: {
            name: true,
          },
        },
        studentClasses: {
          where: {
            class: {
              schoolId: window.schoolId,
              schoolYearId: window.schoolYearId,
            },
          },
          select: {
            classId: true,
            class: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const submissions = await this.prisma.reRegistrationSubmission.findMany({
      where: {
        windowId: window.id,
      },
      select: {
        studentId: true,
        submittedAt: true,
        returningNextYear: true,
        nonReturningReason: true,
        nonReturningComment: true,
      },
    });

    const reminderNotifications = await this.prisma.notification.findMany({
      where: {
        entityType: REMINDER_ENTITY_TYPE,
        entityId: {
          startsWith: `${window.id}:`,
        },
      },
      select: {
        entityId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const lastRemindedAtByStudentId = new Map<string, Date>();
    for (const notification of reminderNotifications) {
      if (!notification.entityId) {
        continue;
      }

      const [, studentId] = notification.entityId.split(':');
      if (!studentId || lastRemindedAtByStudentId.has(studentId)) {
        continue;
      }

      lastRemindedAtByStudentId.set(studentId, notification.createdAt);
    }

    const submissionByStudentId = new Map(
      submissions.map((submission) => [submission.studentId, submission]),
    );

    const rows: TrackingRow[] = students.map((student) => {
      const submission = submissionByStudentId.get(student.id) ?? null;
      return {
        studentId: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        gradeLevelId: student.gradeLevelId,
        gradeLevelName: student.gradeLevel?.name ?? null,
        classNames: student.studentClasses
          .map((enrollment) => enrollment.class.name)
          .filter((name, index, all) => all.indexOf(name) === index)
          .sort((a, b) => a.localeCompare(b)),
        isSubmitted: Boolean(submission),
        submittedAt: submission?.submittedAt ?? null,
        returningNextYear: submission?.returningNextYear ?? null,
        nonReturningReason: submission?.nonReturningReason ?? null,
        nonReturningComment: submission?.nonReturningComment ?? null,
        lastRemindedAt: lastRemindedAtByStudentId.get(student.id) ?? null,
      };
    });

    const summary = {
      totalStudents: rows.length,
      submittedCount: rows.filter((row) => row.isSubmitted).length,
      pendingCount: rows.filter((row) => !row.isSubmitted).length,
      returningCount: rows.filter((row) => row.returningNextYear === true).length,
      nonReturningCount: rows.filter((row) => row.returningNextYear === false).length,
    };

    const filteredRows = rows.filter((row) => {
      if (submissionStatus === 'SUBMITTED' && !row.isSubmitted) {
        return false;
      }

      if (submissionStatus === 'PENDING' && row.isSubmitted) {
        return false;
      }

      if (returningIntent === 'RETURNING' && row.returningNextYear !== true) {
        return false;
      }

      if (returningIntent === 'NOT_RETURNING' && row.returningNextYear !== false) {
        return false;
      }

      if (reasonFilter && row.nonReturningReason !== reasonFilter) {
        return false;
      }

      if (gradeLevelIdFilter && row.gradeLevelId !== gradeLevelIdFilter) {
        return false;
      }

      if (classIdFilter) {
        const inClass = students
          .find((student) => student.id === row.studentId)
          ?.studentClasses.some((enrollment) => enrollment.classId === classIdFilter);

        if (!inClass) {
          return false;
        }
      }

      if (searchText) {
        const fullName = `${row.firstName} ${row.lastName}`.toLowerCase();
        if (!fullName.includes(searchText)) {
          return false;
        }
      }

      return true;
    });

    const classes = Array.from(
      new Map(
        students
          .flatMap((student) => student.studentClasses)
          .map((enrollment) => [enrollment.class.id, enrollment.class.name]),
      ).entries(),
    )
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const gradeLevels = Array.from(
      new Map(
        students
          .filter((student) => student.gradeLevelId && student.gradeLevel?.name)
          .map((student) => [student.gradeLevelId as string, student.gradeLevel?.name as string]),
      ).entries(),
    )
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      window,
      summary,
      availableFilters: {
        classes,
        gradeLevels,
        reasons: Object.values(ReRegistrationNonReturnReason),
      },
      filtersApplied: {
        submissionStatus,
        returningIntent,
        reason: reasonFilter,
        gradeLevelId: gradeLevelIdFilter,
        classId: classIdFilter,
        query: searchText || null,
      },
      rows: filteredRows,
    };
  }

  async create(
    user: AuthUser,
    data: {
      schoolId: string;
      schoolYearId: string;
      opensAt: string;
      closesAt: string;
      isActive?: boolean;
    },
  ) {
    const schoolId = data.schoolId.trim();
    const schoolYearId = data.schoolYearId.trim();

    if (!schoolId) {
      throw new BadRequestException('schoolId is required');
    }

    if (!schoolYearId) {
      throw new BadRequestException('schoolYearId is required');
    }

    this.ensureUserCanManageWindows(user, schoolId);
    await this.ensureSchoolYearMatchesSchoolOrThrow(schoolId, schoolYearId);

    const opensAt = this.parseDateTimeOrThrow(data.opensAt, 'opensAt');
    const closesAt = this.parseDateTimeOrThrow(data.closesAt, 'closesAt');

    if (opensAt >= closesAt) {
      throw new BadRequestException('opensAt must be before closesAt');
    }

    const isActive = data.isActive ?? true;

    if (isActive) {
      const existing = await this.prisma.reRegistrationWindow.findFirst({
        where: {
          schoolId,
          schoolYearId,
          isActive: true,
        },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException(
          'An active re-registration window already exists for this school year',
        );
      }
    }

    try {
      return await this.prisma.reRegistrationWindow.create({
        data: {
          schoolId,
          schoolYearId,
          opensAt,
          closesAt,
          isActive,
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Re-registration migrations are required before managing windows. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }

  private async getWindowOrThrow(id: string) {
    const existing = await this.prisma.reRegistrationWindow.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Re-registration window not found');
    }

    return existing;
  }

  async update(
    user: AuthUser,
    id: string,
    data: { opensAt?: string; closesAt?: string; isActive?: boolean },
  ) {
    const existing = await this.getWindowOrThrow(id);
    this.ensureUserCanManageWindows(user, existing.schoolId);
    await this.ensureSchoolYearMatchesSchoolOrThrow(existing.schoolId, existing.schoolYearId);

    const opensAt = data.opensAt ? this.parseDateTimeOrThrow(data.opensAt, 'opensAt') : existing.opensAt;
    const closesAt = data.closesAt ? this.parseDateTimeOrThrow(data.closesAt, 'closesAt') : existing.closesAt;

    if (opensAt >= closesAt) {
      throw new BadRequestException('opensAt must be before closesAt');
    }

    const isActive = data.isActive ?? existing.isActive;

    if (isActive) {
      const conflict = await this.prisma.reRegistrationWindow.findFirst({
        where: {
          id: { not: existing.id },
          schoolId: existing.schoolId,
          schoolYearId: existing.schoolYearId,
          isActive: true,
        },
        select: { id: true },
      });

      if (conflict) {
        throw new ConflictException(
          'An active re-registration window already exists for this school year',
        );
      }
    }

    try {
      return await this.prisma.reRegistrationWindow.update({
        where: { id },
        data: {
          opensAt,
          closesAt,
          isActive,
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Re-registration migrations are required before managing windows. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }
}
