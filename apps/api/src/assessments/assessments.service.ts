import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ResultCalculationBehavior, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  isBypassRole,
  isSchoolAdminRole,
  isTeacherRole,
} from '../common/access/school-access.util';
import { safeUserSelect } from '../common/prisma/safe-user-response';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { UpsertAssessmentGradesDto } from './dto/upsert-assessment-grades.dto';

type AuthUser = AuthenticatedUser;

function isSchemaMissingError(error: unknown) {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    ((error as { code: string }).code === 'P2021' ||
      (error as { code: string }).code === 'P2022')
  );
}

function isUnknownFieldError(error: unknown, fieldName: string) {
  return (
    error instanceof Error &&
    typeof error.message === 'string' &&
    error.message.includes(`Unknown field \`${fieldName}\``)
  );
}

const assessmentTypeSelect = {
  id: true,
  key: true,
  name: true,
} satisfies Prisma.AssessmentTypeSelect;

const assessmentResponseInclude = {
  assessmentType: {
    select: assessmentTypeSelect,
  },
} satisfies Prisma.AssessmentInclude;

@Injectable()
export class AssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private isAdminLike(role: UserRole) {
    return isBypassRole(role) || isSchoolAdminRole(role);
  }

  private isTeacherLike(role: UserRole) {
    return isTeacherRole(role);
  }

  private async ensureTeacherAssignedToClass(teacherId: string, classId: string) {
    const assignment = await this.prisma.teacherClassAssignment.findFirst({
      where: { teacherId, classId },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException('You do not have class access');
    }
  }

  private async getClassContextOrThrow(classId: string) {
    let existingClass: {
      id: string;
      schoolId: string;
      schoolYearId: string;
      gradebookWeightingMode: 'UNWEIGHTED' | 'ASSESSMENT_WEIGHTED' | 'CATEGORY_WEIGHTED';
    } | null = null;

    try {
      existingClass = await this.prisma.class.findUnique({
        where: { id: classId },
        select: {
          id: true,
          schoolId: true,
          schoolYearId: true,
          gradebookWeightingMode: true,
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error) || isUnknownFieldError(error, 'gradebookWeightingMode')) {
        const fallback = await this.prisma.class.findUnique({
          where: { id: classId },
          select: {
            id: true,
            schoolId: true,
            schoolYearId: true,
          },
        });

        existingClass = fallback
          ? { ...fallback, gradebookWeightingMode: 'UNWEIGHTED' }
          : null;
      } else {
        throw error;
      }
    }

    if (!existingClass) {
      throw new NotFoundException('Class not found');
    }

    return existingClass;
  }

  private async ensureSystemStatusLabelsExist(schoolId: string) {
    try {
      const existing = await this.prisma.assessmentResultStatusLabel.findMany({
        where: {
          schoolId,
          isSystem: true,
          key: { in: ['COMPLETED', 'LATE', 'ABSENT', 'EXEMPT', 'MISSING'] },
        },
        select: { key: true },
      });

      const existingKeys = new Set(existing.map((label) => label.key));
      const createData = [
        { key: 'COMPLETED', label: 'Completed', sortOrder: 5 },
        { key: 'LATE', label: 'Late', sortOrder: 10 },
        { key: 'ABSENT', label: 'Absent', sortOrder: 20 },
        { key: 'EXEMPT', label: 'Exempt', sortOrder: 30 },
        { key: 'MISSING', label: 'Missing', sortOrder: 40 },
      ]
        .filter((entry) => !existingKeys.has(entry.key))
        .map((entry) => ({
          schoolId,
          key: entry.key,
          label: entry.label,
          behavior:
            entry.key === 'EXEMPT'
              ? ResultCalculationBehavior.EXCLUDE_FROM_CALCULATION
              : entry.key === 'ABSENT' || entry.key === 'MISSING'
                ? ResultCalculationBehavior.COUNT_AS_ZERO
                : ResultCalculationBehavior.INFORMATION_ONLY,
          sortOrder: entry.sortOrder,
          isSystem: true,
          isActive: true,
        }));

      if (createData.length === 0) {
        return;
      }

      await this.prisma.assessmentResultStatusLabel.createMany({
        data: createData,
        skipDuplicates: true,
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return;
      }

      throw error;
    }
  }

  private async ensureUserCanManageClass(user: AuthUser, classId: string) {
    const existingClass = await this.getClassContextOrThrow(classId);

    if (this.isAdminLike(user.role)) {
      ensureUserHasSchoolAccess(user, existingClass.schoolId);
      return existingClass;
    }

    if (this.isTeacherLike(user.role)) {
      await this.ensureTeacherAssignedToClass(user.id, classId);
      return existingClass;
    }

    throw new ForbiddenException('You do not have class access');
  }

  private async ensureAssessmentTypeExistsOrThrow(assessmentTypeId: string) {
    const assessmentType = await this.prisma.assessmentType.findUnique({
      where: { id: assessmentTypeId },
      select: { id: true, isActive: true },
    });

    if (!assessmentType) {
      throw new NotFoundException('Assessment type not found');
    }

    if (!assessmentType.isActive) {
      throw new BadRequestException('Assessment type is inactive');
    }
  }

  private async ensureReportingPeriodMatchesClassOrThrow(
    reportingPeriodId: string,
    classContext: { schoolId: string; schoolYearId: string },
  ) {
    const reportingPeriod = await this.prisma.reportingPeriod.findUnique({
      where: { id: reportingPeriodId },
      select: { id: true, schoolId: true, schoolYearId: true },
    });

    if (!reportingPeriod) {
      throw new NotFoundException('Reporting period not found');
    }

    if (
      reportingPeriod.schoolId !== classContext.schoolId ||
      reportingPeriod.schoolYearId !== classContext.schoolYearId
    ) {
      throw new BadRequestException(
        'Reporting period does not match class school year',
      );
    }
  }

  private async resolveReportingPeriodIdForDueDateOrThrow(
    dueAt: string | null | undefined,
    classContext: { schoolId: string; schoolYearId: string },
  ) {
    if (!dueAt) {
      return null;
    }

    const dueDate = new Date(dueAt);
    if (Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('dueAt must be a valid ISO date');
    }

    const reportingPeriod = await this.prisma.reportingPeriod.findFirst({
      where: {
        schoolId: classContext.schoolId,
        schoolYearId: classContext.schoolYearId,
        isActive: true,
        startsAt: { lte: dueDate },
        endsAt: { gte: dueDate },
      },
      orderBy: [{ order: 'asc' }],
      select: {
        id: true,
        isLocked: true,
      },
    });

    if (!reportingPeriod) {
      throw new BadRequestException(
        'No reporting period matches the selected due date.',
      );
    }

    if (reportingPeriod.isLocked) {
      throw new BadRequestException(
        'The reporting period for the selected due date is locked.',
      );
    }

    return reportingPeriod.id;
  }

  private async ensureAssessmentCategoryMatchesClassOrThrow(classId: string, categoryId: string) {
    try {
      const category = await this.prisma.assessmentCategory.findUnique({
        where: { id: categoryId },
        select: { id: true, classId: true, isActive: true },
      });

      if (!category || category.classId !== classId) {
        throw new NotFoundException('Assessment category not found');
      }

      if (!category.isActive) {
        throw new BadRequestException('Assessment category is inactive');
      }
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Category-weighting migrations are required before using assessment categories. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }

  async create(user: AuthUser, data: CreateAssessmentDto) {
    const classContext = await this.ensureUserCanManageClass(user, data.classId);
    await this.ensureAssessmentTypeExistsOrThrow(data.assessmentTypeId);

    if (data.reportingPeriodId !== undefined && data.reportingPeriodId !== null) {
      throw new BadRequestException(
        'Reporting period is assigned automatically from the selected due date.',
      );
    }

    if (classContext.gradebookWeightingMode === 'CATEGORY_WEIGHTED' && !data.categoryId) {
      throw new BadRequestException('categoryId is required for category-weighted classes');
    }

    if (data.categoryId) {
      await this.ensureAssessmentCategoryMatchesClassOrThrow(classContext.id, data.categoryId);
    }

    const reportingPeriodId = await this.resolveReportingPeriodIdForDueDateOrThrow(data.dueAt, {
      schoolId: classContext.schoolId,
      schoolYearId: classContext.schoolYearId,
    });

    return this.prisma.assessment.create({
      data: {
        classId: classContext.id,
        schoolId: classContext.schoolId,
        schoolYearId: classContext.schoolYearId,
        reportingPeriodId,
        categoryId: data.categoryId ?? null,
        title: data.title.trim(),
        assessmentTypeId: data.assessmentTypeId,
        maxScore: data.maxScore,
        weight:
          classContext.gradebookWeightingMode === 'ASSESSMENT_WEIGHTED'
            ? (data.weight ?? 1)
            : 1,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        isPublishedToParents: data.isPublishedToParents ?? false,
        isActive: true,
        createdByUserId: user.id,
      },
      include: assessmentResponseInclude,
    });
  }

  async listByClass(user: AuthUser, classId: string, includeInactive = false) {
    await this.ensureUserCanManageClass(user, classId);

    return this.prisma.assessment.findMany({
      where: {
        classId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ isActive: 'desc' }, { dueAt: 'desc' }, { createdAt: 'desc' }],
      include: assessmentResponseInclude,
    });
  }

  private async getAssessmentOrThrow(assessmentId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: assessmentResponseInclude,
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    return assessment;
  }

  private async ensureUserCanManageAssessment(user: AuthUser, assessmentId: string) {
    const assessment = await this.getAssessmentOrThrow(assessmentId);
    await this.ensureUserCanManageClass(user, assessment.classId);
    return assessment;
  }

  async findOne(user: AuthUser, assessmentId: string) {
    return this.ensureUserCanManageAssessment(user, assessmentId);
  }

  async update(user: AuthUser, assessmentId: string, data: UpdateAssessmentDto) {
    const assessment = await this.ensureUserCanManageAssessment(user, assessmentId);
    const classContext = await this.getClassContextOrThrow(assessment.classId);

    if (!assessment.isActive) {
      throw new BadRequestException('Assessment is archived');
    }

    if (data.assessmentTypeId) {
      await this.ensureAssessmentTypeExistsOrThrow(data.assessmentTypeId);
    }

    if (data.reportingPeriodId !== undefined) {
      throw new BadRequestException(
        'Reporting period is assigned automatically from the selected due date.',
      );
    }

    if (classContext.gradebookWeightingMode === 'CATEGORY_WEIGHTED') {
      const nextCategoryId =
        data.categoryId === undefined ? assessment.categoryId : data.categoryId;

      if (!nextCategoryId) {
        throw new BadRequestException('categoryId is required for category-weighted classes');
      }
    }

    if (data.categoryId) {
      await this.ensureAssessmentCategoryMatchesClassOrThrow(classContext.id, data.categoryId);
    }

    if (data.maxScore !== undefined) {
      const maxScore = data.maxScore;
      const violatingGrade = await this.prisma.assessmentResult.findFirst({
        where: {
          assessmentId,
          score: {
            gt: maxScore,
          },
        },
        select: { id: true },
      });

      if (violatingGrade) {
        throw new BadRequestException(
          'maxScore cannot be lower than an existing student score',
        );
      }
    }

    const reportingPeriodId =
      data.dueAt === undefined
        ? undefined
        : await this.resolveReportingPeriodIdForDueDateOrThrow(data.dueAt, {
            schoolId: classContext.schoolId,
            schoolYearId: classContext.schoolYearId,
          });

    return this.prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        title: data.title?.trim(),
        assessmentTypeId: data.assessmentTypeId,
        maxScore: data.maxScore,
        weight:
          classContext.gradebookWeightingMode === 'ASSESSMENT_WEIGHTED'
            ? data.weight
            : data.weight === undefined
              ? undefined
              : 1,
        dueAt: data.dueAt === undefined ? undefined : data.dueAt ? new Date(data.dueAt) : null,
        reportingPeriodId,
        categoryId: data.categoryId === undefined ? undefined : data.categoryId,
        isPublishedToParents: data.isPublishedToParents,
      },
      include: assessmentResponseInclude,
    });
  }

  async archive(user: AuthUser, assessmentId: string) {
    const assessment = await this.ensureUserCanManageAssessment(user, assessmentId);

    if (!assessment.isActive) {
      return assessment;
    }

    return this.prisma.assessment.update({
      where: { id: assessmentId },
      data: { isActive: false, archivedAt: new Date() },
      include: assessmentResponseInclude,
    });
  }

  async activate(user: AuthUser, assessmentId: string) {
    const assessment = await this.ensureUserCanManageAssessment(user, assessmentId);

    if (assessment.isActive) {
      return assessment;
    }

    return this.prisma.assessment.update({
      where: { id: assessmentId },
      data: { isActive: true, archivedAt: null },
      include: assessmentResponseInclude,
    });
  }

  async publish(user: AuthUser, assessmentId: string) {
    const assessment = await this.ensureUserCanManageAssessment(user, assessmentId);

    if (!assessment.isActive) {
      throw new BadRequestException('Assessment is archived');
    }

    return this.prisma.assessment.update({
      where: { id: assessmentId },
      data: { isPublishedToParents: true },
      include: assessmentResponseInclude,
    });
  }

  async unpublish(user: AuthUser, assessmentId: string) {
    const assessment = await this.ensureUserCanManageAssessment(user, assessmentId);

    if (!assessment.isActive) {
      throw new BadRequestException('Assessment is archived');
    }

    return this.prisma.assessment.update({
      where: { id: assessmentId },
      data: { isPublishedToParents: false },
      include: assessmentResponseInclude,
    });
  }

  async remove(user: AuthUser, assessmentId: string) {
    await this.ensureUserCanManageAssessment(user, assessmentId);

    const resultCount = await this.prisma.assessmentResult.count({
      where: { assessmentId },
    });

    if (resultCount === 0) {
      await this.prisma.assessment.delete({ where: { id: assessmentId } });
      return { success: true, removalMode: 'deleted' as const };
    }

    await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: { isActive: false, archivedAt: new Date() },
    });

    return { success: true, removalMode: 'archived' as const };
  }

  async getGrades(user: AuthUser, assessmentId: string) {
    const assessment = await this.ensureUserCanManageAssessment(user, assessmentId);
    await this.ensureSystemStatusLabelsExist(assessment.schoolId);

    const enrollments = await this.prisma.studentClassEnrollment.findMany({
      where: { classId: assessment.classId },
      orderBy: { createdAt: 'asc' },
      include: {
        student: { select: safeUserSelect },
      },
    });

    let results: Array<{
      id: string;
      studentId: string;
      score: number | null;
      statusLabelId: string | null;
      statusLabel: { id: string; key: string; label: string; behavior: string } | null;
      comment: string | null;
      createdAt: Date;
      updatedAt: Date;
    }> = [];

    try {
      results = await this.prisma.assessmentResult.findMany({
        where: { assessmentId },
        select: {
          id: true,
          studentId: true,
          score: true,
          statusLabelId: true,
          statusLabel: {
            select: {
              id: true,
              key: true,
              label: true,
              behavior: true,
            },
          },
          comment: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (isSchemaMissingError(error)) {
        const fallback = await this.prisma.assessmentResult.findMany({
          where: { assessmentId },
          select: {
            id: true,
            studentId: true,
            score: true,
            comment: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        results = fallback.map((entry) => ({
          ...entry,
          statusLabelId: null,
          statusLabel: null,
        }));
      } else {
        throw error;
      }
    }

    const resultsByStudentId = new Map(results.map((result) => [result.studentId, result]));

    return {
      assessment,
      grades: enrollments.map((enrollment) => ({
        student: enrollment.student,
        result: resultsByStudentId.get(enrollment.studentId) ?? null,
      })),
    };
  }

  async upsertGrades(user: AuthUser, assessmentId: string, body: UpsertAssessmentGradesDto) {
    const assessment = await this.ensureUserCanManageAssessment(user, assessmentId);

    if (!assessment.isActive) {
      throw new BadRequestException('Assessment is archived');
    }

    await this.ensureSystemStatusLabelsExist(assessment.schoolId);

    const grades = body.grades ?? [];
    const studentIds = grades.map((grade) => grade.studentId);

    if (studentIds.length === 0) {
      return [];
    }

    const uniqueIds = new Set(studentIds);
    if (uniqueIds.size !== studentIds.length) {
      throw new BadRequestException('Duplicate studentId entries are not allowed');
    }

    const statusLabelIds = new Set<string>();
    const statusLabelKeys = new Set<string>();

    for (const grade of grades) {
      if (grade.statusLabelId && grade.statusLabelKey) {
        throw new BadRequestException('statusLabelId and statusLabelKey cannot both be set');
      }

      if (grade.statusLabelId) {
        statusLabelIds.add(grade.statusLabelId);
      }

      if (grade.statusLabelKey) {
        statusLabelKeys.add(grade.statusLabelKey.toUpperCase());
      }

      if (grade.score !== null && grade.score !== undefined) {
        if (grade.score > assessment.maxScore) {
          throw new BadRequestException('score must be less than or equal to maxScore');
        }
      }
    }

    const enrollments = await this.prisma.studentClassEnrollment.findMany({
      where: {
        classId: assessment.classId,
        studentId: { in: studentIds },
      },
      select: {
        studentId: true,
      },
    });

    const enrolledIds = new Set(enrollments.map((enrollment) => enrollment.studentId));
    const missing = studentIds.filter((studentId) => !enrolledIds.has(studentId));

    if (missing.length > 0) {
      throw new BadRequestException('One or more students are not enrolled in this class');
    }

    const statusLabelsById = new Map<string, { id: string; schoolId: string; key: string; isActive: boolean }>();
    const statusLabelsByKey = new Map<string, { id: string; schoolId: string; key: string; isActive: boolean }>();

    if (statusLabelIds.size > 0 || statusLabelKeys.size > 0) {
      try {
        const labels = await this.prisma.assessmentResultStatusLabel.findMany({
          where: {
            schoolId: assessment.schoolId,
            OR: [
              ...(statusLabelIds.size > 0 ? [{ id: { in: Array.from(statusLabelIds) } }] : []),
              ...(statusLabelKeys.size > 0 ? [{ key: { in: Array.from(statusLabelKeys) } }] : []),
            ],
          },
          select: { id: true, schoolId: true, key: true, isActive: true },
        });

        for (const label of labels) {
          statusLabelsById.set(label.id, label);
          statusLabelsByKey.set(label.key.toUpperCase(), label);
        }
      } catch (error) {
        if (isSchemaMissingError(error)) {
          throw new ConflictException(
            'Result-status migrations are required before saving status labels. Apply the latest Prisma migrations and try again.',
          );
        }

        throw error;
      }
    }

    try {
      const results = await this.prisma.$transaction(async (tx) => {
        const updated: Array<{
          id: string;
          studentId: string;
          score: number | null;
          statusLabelId: string | null;
        comment: string | null;
        createdAt: Date;
        updatedAt: Date;
      }> = [];

      for (const grade of grades) {
        const wantsClear =
          grade.clear === true ||
          (grade.score === null &&
            (grade.statusLabelId === null || grade.statusLabelId === undefined) &&
            (grade.statusLabelKey === null || grade.statusLabelKey === undefined) &&
            (grade.comment === null || grade.comment === undefined));

        if (wantsClear) {
          await tx.assessmentResult.deleteMany({
            where: { assessmentId, studentId: grade.studentId },
          });
          continue;
        }

        const statusLabelKey = grade.statusLabelKey?.toUpperCase() ?? null;
        const resolvedLabel =
          grade.statusLabelId
            ? statusLabelsById.get(grade.statusLabelId)
            : statusLabelKey
              ? statusLabelsByKey.get(statusLabelKey)
              : null;

        if (grade.statusLabelId || statusLabelKey) {
          if (!resolvedLabel) {
            throw new BadRequestException('Status label not found');
          }

          if (!resolvedLabel.isActive) {
            throw new BadRequestException('Status label is inactive');
          }
        }

        const updateData: Prisma.AssessmentResultUpdateInput = {
          score: grade.score === undefined ? undefined : grade.score,
          ...(grade.statusLabelId === undefined && grade.statusLabelKey === undefined
            ? {}
            : resolvedLabel
              ? { statusLabel: { connect: { id: resolvedLabel.id } } }
              : { statusLabel: { disconnect: true } }),
        };

        if (grade.comment !== undefined) {
          updateData.comment = grade.comment ?? null;
        }

        const row = await tx.assessmentResult.upsert({
          where: {
            assessmentId_studentId: {
              assessmentId,
              studentId: grade.studentId,
            },
          },
          create: {
            assessmentId,
            studentId: grade.studentId,
            score: grade.score ?? null,
            statusLabelId: resolvedLabel?.id ?? null,
            comment: grade.comment ?? null,
          },
          update: updateData,
          select: {
            id: true,
            studentId: true,
            score: true,
            statusLabelId: true,
            comment: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        updated.push(row);
      }

        return updated;
      });

      return results;
    } catch (error) {
      if (isSchemaMissingError(error)) {
        throw new ConflictException(
          'Result-status migrations are required before saving status labels. Apply the latest Prisma migrations and try again.',
        );
      }

      throw error;
    }
  }
}
