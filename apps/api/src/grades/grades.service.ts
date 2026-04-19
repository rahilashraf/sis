import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogSeverity, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGradeRecordDto } from './dto/create-grade-record.dto';
import { UpdateGradeRecordDto } from './dto/update-grade-record.dto';
import { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
  isSchoolAdminRole,
  isTeacherRole,
} from '../common/access/school-access.util';
import { getAccessibleSchoolIdsWithLegacyFallback } from '../common/access/school-membership.util';
import {
  safeUserSelect,
  schoolSummarySelect,
  schoolYearSummarySelect,
} from '../common/prisma/safe-user-response';
import { AuditService } from '../audit/audit.service';
import { buildAuditDiff } from '../audit/audit-diff.util';

type AuthUser = AuthenticatedUser;

type ReportingPeriodWindow = {
  key: string;
  order: number;
  startsAt: Date;
  endsAt: Date;
};

type ClassContext = {
  id: string;
  schoolId: string;
  schoolYearId: string;
};

type GradeSummaryRecord = {
  score: number;
  maxScore: number;
  gradedAt: Date;
  class: {
    schoolId: string;
    schoolYearId: string;
  };
};

@Injectable()
export class GradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private isAdminLike(role: UserRole) {
    return isBypassRole(role) || isSchoolAdminRole(role);
  }

  private isTeacherLike(role: UserRole) {
    return isTeacherRole(role);
  }

  private canOverrideReportingPeriodLock(role: UserRole) {
    return ['OWNER', 'SUPER_ADMIN', 'ADMIN'].includes(role);
  }

  private buildInclude() {
    return {
      class: {
        select: {
          id: true,
          schoolId: true,
          schoolYearId: true,
          name: true,
          subject: true,
          isHomeroom: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          school: {
            select: schoolSummarySelect,
          },
          schoolYear: {
            select: schoolYearSummarySelect,
          },
        },
      },
      student: {
        select: safeUserSelect,
      },
    };
  }

  private validateScoreRange(score: number, maxScore: number) {
    if (score > maxScore) {
      throw new BadRequestException(
        'score must be less than or equal to maxScore',
      );
    }
  }

  private getContextKey(schoolId: string, schoolYearId: string) {
    return `${schoolId}:${schoolYearId}`;
  }

  private buildStudentGradeWhere(user: AuthUser, studentId: string) {
    if (this.isTeacherLike(user.role) && !this.isAdminLike(user.role)) {
      return {
        studentId,
        class: {
          teachers: {
            some: {
              teacherId: user.id,
            },
          },
        },
      };
    }

    if (isSchoolAdminRole(user.role)) {
      return {
        studentId,
        class: {
          schoolId: {
            in: getAccessibleSchoolIds(user),
          },
        },
      };
    }

    return {
      studentId,
    };
  }

  private buildStudentEnrollmentWhere(user: AuthUser, studentId: string) {
    if (this.isTeacherLike(user.role) && !this.isAdminLike(user.role)) {
      return {
        studentId,
        class: {
          teachers: {
            some: {
              teacherId: user.id,
            },
          },
        },
      };
    }

    if (isSchoolAdminRole(user.role)) {
      return {
        studentId,
        class: {
          schoolId: {
            in: getAccessibleSchoolIds(user),
          },
        },
      };
    }

    return {
      studentId,
    };
  }

  private async ensureSchoolAdminCanAccessStudent(
    user: AuthUser,
    studentId: string,
  ) {
    if (isBypassRole(user.role)) {
      return;
    }

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
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
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const accessibleSchoolIds = new Set(getAccessibleSchoolIds(user));
    const studentSchoolIds = getAccessibleSchoolIdsWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId,
    });
    const hasAccess = studentSchoolIds.some((schoolId) =>
      accessibleSchoolIds.has(schoolId),
    );

    if (!hasAccess) {
      throw new ForbiddenException('You do not have student access');
    }
  }

  private async ensureTeacherAssignedToClass(
    teacherId: string,
    classId: string,
  ) {
    const assignment = await this.prisma.teacherClassAssignment.findFirst({
      where: {
        teacherId,
        classId,
      },
      select: {
        id: true,
      },
    });

    if (!assignment) {
      throw new ForbiddenException('You do not have class access');
    }
  }

  private async ensureStudentEnrolledInClass(
    studentId: string,
    classId: string,
  ) {
    const enrollment = await this.prisma.studentClassEnrollment.findFirst({
      where: {
        studentId,
        classId,
      },
      select: {
        id: true,
      },
    });

    if (!enrollment) {
      throw new BadRequestException('Student is not enrolled in this class');
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

  private async ensureTeacherCanAccessStudent(
    user: AuthUser,
    studentId: string,
  ) {
    const enrollment = await this.prisma.studentClassEnrollment.findFirst({
      where: {
        studentId,
        class: {
          teachers: {
            some: {
              teacherId: user.id,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!enrollment) {
      throw new ForbiddenException('You do not have student access');
    }
  }

  private async ensureUserCanManageClass(user: AuthUser, classId: string) {
    const classContext = await this.getClassContext(classId);

    if (this.isAdminLike(user.role)) {
      ensureUserHasSchoolAccess(user, classContext.schoolId);
      return classContext;
    }

    if (!this.isTeacherLike(user.role)) {
      throw new ForbiddenException('You do not have class access');
    }

    await this.ensureTeacherAssignedToClass(user.id, classId);
    return classContext;
  }

  private async ensureUserCanReadStudentGrades(
    user: AuthUser,
    studentId: string,
  ) {
    if (this.isAdminLike(user.role)) {
      await this.ensureSchoolAdminCanAccessStudent(user, studentId);
      return;
    }

    if (user.role === 'STUDENT') {
      if (user.id !== studentId) {
        throw new ForbiddenException('You do not have student access');
      }

      return;
    }

    if (user.role === 'PARENT') {
      await this.ensureParentLinkedToStudent(user.id, studentId);
      return;
    }

    if (this.isTeacherLike(user.role)) {
      await this.ensureTeacherCanAccessStudent(user, studentId);
      return;
    }

    throw new ForbiddenException('You do not have student access');
  }

  private async ensureClassExists(classId: string) {
    const existingClass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true },
    });

    if (!existingClass) {
      throw new NotFoundException('Class not found');
    }
  }

  private async getClassContext(classId: string): Promise<ClassContext> {
    const existingClass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        schoolId: true,
        schoolYearId: true,
      },
    });

    if (!existingClass) {
      throw new NotFoundException('Class not found');
    }

    return existingClass;
  }

  private parseGradedAt(gradedAt: string) {
    const parsedDate = new Date(gradedAt);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException('gradedAt must be a valid date');
    }

    return parsedDate;
  }

  private async findReportingPeriodForDate(classId: string, gradedAt: Date) {
    const existingClass = await this.getClassContext(classId);

    const reportingPeriod = await this.prisma.reportingPeriod.findFirst({
      where: {
        schoolId: existingClass.schoolId,
        schoolYearId: existingClass.schoolYearId,
        startsAt: {
          lte: gradedAt,
        },
        endsAt: {
          gte: gradedAt,
        },
      },
      select: {
        id: true,
        isLocked: true,
      },
    });

    if (!reportingPeriod) {
      throw new BadRequestException(
        'gradedAt must fall within a reporting period',
      );
    }

    return reportingPeriod;
  }

  private async loadReportingPeriodsForContext(
    schoolId: string,
    schoolYearId: string,
  ): Promise<ReportingPeriodWindow[]> {
    return this.prisma.reportingPeriod.findMany({
      where: {
        schoolId,
        schoolYearId,
      },
      orderBy: [{ order: 'asc' }, { startsAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        key: true,
        order: true,
        startsAt: true,
        endsAt: true,
      },
    });
  }

  private selectCumulativeReportingPeriods(
    reportingPeriods: ReportingPeriodWindow[],
    periodKey: string,
  ) {
    const targetPeriod = reportingPeriods.find(
      (period) => period.key === periodKey,
    );

    if (!targetPeriod) {
      throw new BadRequestException('Invalid reporting period key');
    }

    return reportingPeriods.filter(
      (period) => period.order <= targetPeriod.order,
    );
  }

  private isGradeWithinReportingPeriods(
    gradedAt: Date,
    reportingPeriods: ReportingPeriodWindow[],
  ) {
    return reportingPeriods.some(
      (period) => period.startsAt <= gradedAt && gradedAt <= period.endsAt,
    );
  }

  private async buildAllowedReportingPeriodsByContext(
    contexts: Array<Pick<ClassContext, 'schoolId' | 'schoolYearId'>>,
    periodKey: string,
  ) {
    const uniqueContexts = new Map<
      string,
      Pick<ClassContext, 'schoolId' | 'schoolYearId'>
    >();

    for (const context of contexts) {
      uniqueContexts.set(
        this.getContextKey(context.schoolId, context.schoolYearId),
        context,
      );
    }

    const entries = await Promise.all(
      [...uniqueContexts.values()].map(async (context) => {
        const reportingPeriods = await this.loadReportingPeriodsForContext(
          context.schoolId,
          context.schoolYearId,
        );

        return [
          this.getContextKey(context.schoolId, context.schoolYearId),
          this.selectCumulativeReportingPeriods(reportingPeriods, periodKey),
        ] as const;
      }),
    );

    return new Map(entries);
  }

  private filterGradesByReportingPeriodWindows(
    grades: GradeSummaryRecord[],
    allowedReportingPeriodsByContext: Map<string, ReportingPeriodWindow[]>,
  ) {
    return grades.filter((grade) => {
      const contextKey = this.getContextKey(
        grade.class.schoolId,
        grade.class.schoolYearId,
      );
      const reportingPeriods = allowedReportingPeriodsByContext.get(contextKey);

      if (!reportingPeriods) {
        return false;
      }

      return this.isGradeWithinReportingPeriods(
        grade.gradedAt,
        reportingPeriods,
      );
    });
  }

  private buildSummary(
    idField: 'studentId' | 'classId',
    id: string,
    grades: Array<Pick<GradeSummaryRecord, 'score' | 'maxScore'>>,
  ) {
    const totalScore = grades.reduce((sum, grade) => sum + grade.score, 0);
    const totalMaxScore = grades.reduce(
      (sum, grade) => sum + grade.maxScore,
      0,
    );

    return {
      [idField]: id,
      gradeCount: grades.length,
      totalScore,
      totalMaxScore,
      percentage: totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : null,
    };
  }

  private async getStudentSummaryGrades(user: AuthUser, studentId: string) {
    return this.prisma.gradeRecord.findMany({
      where: this.buildStudentGradeWhere(user, studentId),
      select: {
        score: true,
        maxScore: true,
        gradedAt: true,
        class: {
          select: {
            schoolId: true,
            schoolYearId: true,
          },
        },
      },
      orderBy: [{ gradedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async getStudentSummaryContexts(
    user: AuthUser,
    studentId: string,
    grades: GradeSummaryRecord[],
  ) {
    const contexts = new Map<
      string,
      Pick<ClassContext, 'schoolId' | 'schoolYearId'>
    >();

    for (const grade of grades) {
      contexts.set(
        this.getContextKey(grade.class.schoolId, grade.class.schoolYearId),
        grade.class,
      );
    }

    if (contexts.size > 0) {
      return [...contexts.values()];
    }

    const enrollments = await this.prisma.studentClassEnrollment.findMany({
      where: this.buildStudentEnrollmentWhere(user, studentId),
      select: {
        class: {
          select: {
            schoolId: true,
            schoolYearId: true,
          },
        },
      },
    });

    for (const enrollment of enrollments) {
      contexts.set(
        this.getContextKey(
          enrollment.class.schoolId,
          enrollment.class.schoolYearId,
        ),
        enrollment.class,
      );
    }

    return [...contexts.values()];
  }

  private async ensureUserCanWriteGradeForDate(
    user: AuthUser,
    classId: string,
    gradedAt: Date,
  ) {
    const reportingPeriod = await this.findReportingPeriodForDate(
      classId,
      gradedAt,
    );

    if (
      reportingPeriod.isLocked &&
      !this.canOverrideReportingPeriodLock(user.role)
    ) {
      throw new ForbiddenException('Reporting period is locked');
    }
  }

  async create(user: AuthUser, data: CreateGradeRecordDto) {
    this.validateScoreRange(data.score, data.maxScore);

    const gradedAt = this.parseGradedAt(data.gradedAt);

    await this.ensureUserCanManageClass(user, data.classId);
    await this.ensureStudentEnrolledInClass(data.studentId, data.classId);
    await this.ensureUserCanWriteGradeForDate(user, data.classId, gradedAt);

    const created = await this.prisma.gradeRecord.create({
      data: {
        classId: data.classId,
        studentId: data.studentId,
        title: data.title,
        score: data.score,
        maxScore: data.maxScore,
        gradedAt,
        comment: data.comment,
      },
      include: this.buildInclude(),
    });

    await this.auditService.log({
      actor: user,
      schoolId: created.class.schoolId,
      entityType: 'GradeRecord',
      entityId: created.id,
      action: 'CREATE',
      severity: AuditLogSeverity.WARNING,
      summary: `Created grade record ${created.title} for student ${created.student.firstName} ${created.student.lastName}`,
      targetDisplay: created.title,
      changesJson:
        buildAuditDiff({
          after: {
            classId: created.classId,
            studentId: created.studentId,
            title: created.title,
            score: created.score,
            maxScore: created.maxScore,
            gradedAt: created.gradedAt,
          },
        }) ?? undefined,
    });

    return created;
  }

  async update(user: AuthUser, id: string, data: UpdateGradeRecordDto) {
    const existingGrade = await this.prisma.gradeRecord.findUnique({
      where: { id },
      select: {
        id: true,
        classId: true,
        studentId: true,
        title: true,
        score: true,
        maxScore: true,
        gradedAt: true,
        comment: true,
      },
    });

    if (!existingGrade) {
      throw new NotFoundException('Grade record not found');
    }

    await this.ensureUserCanManageClass(user, existingGrade.classId);

    if (!this.canOverrideReportingPeriodLock(user.role)) {
      await this.ensureUserCanWriteGradeForDate(
        user,
        existingGrade.classId,
        existingGrade.gradedAt,
      );
    }

    const gradedAt = data.gradedAt
      ? this.parseGradedAt(data.gradedAt)
      : existingGrade.gradedAt;
    const score = data.score ?? existingGrade.score;
    const maxScore = data.maxScore ?? existingGrade.maxScore;

    this.validateScoreRange(score, maxScore);
    await this.ensureUserCanWriteGradeForDate(
      user,
      existingGrade.classId,
      gradedAt,
    );

    const updated = await this.prisma.gradeRecord.update({
      where: { id: existingGrade.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.score !== undefined ? { score: data.score } : {}),
        ...(data.maxScore !== undefined ? { maxScore: data.maxScore } : {}),
        ...(data.gradedAt !== undefined ? { gradedAt } : {}),
        ...(data.comment !== undefined ? { comment: data.comment } : {}),
      },
      include: this.buildInclude(),
    });

    await this.auditService.log({
      actor: user,
      schoolId: updated.class.schoolId,
      entityType: 'GradeRecord',
      entityId: updated.id,
      action: 'UPDATE',
      severity: AuditLogSeverity.WARNING,
      summary: `Updated grade record ${updated.title} for student ${updated.student.firstName} ${updated.student.lastName}`,
      targetDisplay: updated.title,
      changesJson:
        buildAuditDiff({
          before: existingGrade,
          after: {
            classId: updated.classId,
            studentId: updated.studentId,
            title: updated.title,
            score: updated.score,
            maxScore: updated.maxScore,
            gradedAt: updated.gradedAt,
            comment: updated.comment,
          },
        }) ?? undefined,
    });

    return updated;
  }

  async findByClass(user: AuthUser, classId: string) {
    await this.ensureUserCanManageClass(user, classId);

    return this.prisma.gradeRecord.findMany({
      where: {
        classId,
      },
      orderBy: [{ gradedAt: 'desc' }, { createdAt: 'desc' }],
      include: this.buildInclude(),
    });
  }

  async findByStudent(user: AuthUser, studentId: string) {
    await this.ensureUserCanReadStudentGrades(user, studentId);

    return this.prisma.gradeRecord.findMany({
      where: this.buildStudentGradeWhere(user, studentId),
      orderBy: [{ gradedAt: 'desc' }, { createdAt: 'desc' }],
      include: this.buildInclude(),
    });
  }

  async getStudentSummary(
    user: AuthUser,
    studentId: string,
    periodKey?: string,
  ) {
    await this.ensureUserCanReadStudentGrades(user, studentId);

    const grades = await this.getStudentSummaryGrades(user, studentId);

    if (!periodKey) {
      return this.buildSummary('studentId', studentId, grades);
    }

    const contexts = await this.getStudentSummaryContexts(
      user,
      studentId,
      grades,
    );

    if (contexts.length === 0) {
      return this.buildSummary('studentId', studentId, []);
    }

    const allowedReportingPeriodsByContext =
      await this.buildAllowedReportingPeriodsByContext(contexts, periodKey);

    return this.buildSummary(
      'studentId',
      studentId,
      this.filterGradesByReportingPeriodWindows(
        grades,
        allowedReportingPeriodsByContext,
      ),
    );
  }

  async getClassSummary(user: AuthUser, classId: string, periodKey?: string) {
    const classContext = await this.ensureUserCanManageClass(user, classId);

    const grades = await this.prisma.gradeRecord.findMany({
      where: { classId },
      select: {
        score: true,
        maxScore: true,
        gradedAt: true,
        class: {
          select: {
            schoolId: true,
            schoolYearId: true,
          },
        },
      },
      orderBy: [{ gradedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!periodKey) {
      return this.buildSummary('classId', classId, grades);
    }

    const allowedReportingPeriodsByContext =
      await this.buildAllowedReportingPeriodsByContext(
        [classContext],
        periodKey,
      );

    return this.buildSummary(
      'classId',
      classId,
      this.filterGradesByReportingPeriodWindows(
        grades,
        allowedReportingPeriodsByContext,
      ),
    );
  }
}
