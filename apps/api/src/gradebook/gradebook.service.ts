import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GradebookWeightingMode, Prisma, ResultCalculationBehavior, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import {
  ensureUserHasSchoolAccess,
  getAccessibleSchoolIds,
  isBypassRole,
  isSchoolAdminRole,
  isTeacherRole,
} from '../common/access/school-access.util';
import { safeUserSelect } from '../common/prisma/safe-user-response';
import { computeGradebookAveragePercent } from './gradebook-calculation.util';

type AuthUser = AuthenticatedUser;

function isPublishedFilterRequired(role: UserRole) {
  return role === UserRole.PARENT || role === UserRole.STUDENT;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function roundWholePercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return Math.round(value);
}

function mapPercentToLetterGrade(
  percent: number | null,
  rules: Array<{ minPercent: number; maxPercent: number; letterGrade: string }>,
) {
  if (percent === null) {
    return null;
  }

  const match = rules.find(
    (rule) => percent >= rule.minPercent && percent <= rule.maxPercent,
  );

  return match?.letterGrade ?? null;
}

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

@Injectable()
export class GradebookService {
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

  private async ensureStudentEnrolledInClass(studentId: string, classId: string) {
    const enrollment = await this.prisma.studentClassEnrollment.findFirst({
      where: { studentId, classId },
      select: { id: true },
    });

    if (!enrollment) {
      throw new BadRequestException('Student is not enrolled in this class');
    }
  }

  private async ensureParentLinkedToStudent(parentId: string, studentId: string) {
    const link = await this.prisma.studentParentLink.findUnique({
      where: {
        parentId_studentId: {
          parentId,
          studentId,
        },
      },
      select: { id: true },
    });

    if (!link) {
      throw new ForbiddenException('You do not have student access');
    }
  }

  private async getClassContextOrThrow(classId: string) {
    let existingClass:
      | {
          id: string;
          schoolId: string;
          schoolYearId: string;
          gradebookWeightingMode: GradebookWeightingMode;
        }
      | null = null;

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
          ? { ...fallback, gradebookWeightingMode: GradebookWeightingMode.UNWEIGHTED }
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

  private async getGradeScaleRulesForSchool(schoolId: string) {
    try {
      const scale = await this.prisma.gradeScale.findFirst({
        where: {
          schoolId,
          isActive: true,
        },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        include: {
          rules: {
            orderBy: [{ sortOrder: 'asc' }, { minPercent: 'desc' }],
            select: {
              minPercent: true,
              maxPercent: true,
              letterGrade: true,
            },
          },
        },
      });

      return scale?.rules ?? [];
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return [];
      }

      throw error;
    }
  }

  private async getGradeScaleRulesForSchools(schoolIds: string[]) {
    const unique = Array.from(new Set(schoolIds.filter(Boolean)));

    if (unique.length === 0) {
      return new Map<string, Array<{ minPercent: number; maxPercent: number; letterGrade: string }>>();
    }

    try {
      const scales = await this.prisma.gradeScale.findMany({
        where: {
          schoolId: { in: unique },
          isActive: true,
        },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        include: {
          rules: {
            orderBy: [{ sortOrder: 'asc' }, { minPercent: 'desc' }],
            select: {
              minPercent: true,
              maxPercent: true,
              letterGrade: true,
            },
          },
        },
      });

      const map = new Map<
        string,
        Array<{ minPercent: number; maxPercent: number; letterGrade: string }>
      >();

      for (const scale of scales) {
        if (!map.has(scale.schoolId)) {
          map.set(scale.schoolId, scale.rules ?? []);
        }
      }

      return map;
    } catch (error) {
      if (isSchemaMissingError(error)) {
        return new Map();
      }

      throw error;
    }
  }

  private async ensureUserCanAccessClass(user: AuthUser, classId: string) {
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

  private async ensureUserCanReadStudentInClass(
    user: AuthUser,
    studentId: string,
    classId: string,
  ) {
    if (this.isAdminLike(user.role)) {
      const existingClass = await this.getClassContextOrThrow(classId);
      ensureUserHasSchoolAccess(user, existingClass.schoolId);
      await this.ensureStudentEnrolledInClass(studentId, classId);
      return;
    }

    if (this.isTeacherLike(user.role)) {
      await this.ensureTeacherAssignedToClass(user.id, classId);
      await this.ensureStudentEnrolledInClass(studentId, classId);
      return;
    }

    if (user.role === UserRole.PARENT) {
      await this.ensureParentLinkedToStudent(user.id, studentId);
      await this.ensureStudentEnrolledInClass(studentId, classId);
      return;
    }

    if (user.role === UserRole.STUDENT) {
      if (user.id !== studentId) {
        throw new ForbiddenException('You do not have student access');
      }

      await this.ensureStudentEnrolledInClass(studentId, classId);
      return;
    }

    throw new ForbiddenException('You do not have student access');
  }

  async getStudentGrades(user: AuthUser, studentId: string, classId: string) {
    if (!classId) {
      throw new BadRequestException('classId is required');
    }

    await this.getClassContextOrThrow(classId);
    await this.ensureUserCanReadStudentInClass(user, studentId, classId);

    const publishedOnly = isPublishedFilterRequired(user.role);

    const assessments = await this.prisma.assessment.findMany({
      where: {
        classId,
        isActive: true,
        ...(publishedOnly ? { isPublishedToParents: true } : {}),
      },
      orderBy: [{ dueAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        assessmentType: {
          select: { id: true, key: true, name: true },
        },
        reportingPeriod: {
          select: {
            id: true,
            name: true,
            order: true,
            isLocked: true,
            startsAt: true,
            endsAt: true,
          },
        },
        results: {
          where: {
            studentId,
          },
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
        },
      },
    });

    return assessments.map((assessment) => {
      const { results, ...rest } = assessment;

      return {
        ...rest,
        result: results[0] ?? null,
      };
    });
  }

  async getStudentSummary(user: AuthUser, studentId: string, classId: string) {
    if (!classId) {
      throw new BadRequestException('classId is required');
    }

    await this.ensureUserCanReadStudentInClass(user, studentId, classId);

    const classContext = await this.getClassContextOrThrow(classId);
    const gradeScaleRules = await this.getGradeScaleRulesForSchool(classContext.schoolId);
    const weightingMode = classContext.gradebookWeightingMode ?? GradebookWeightingMode.UNWEIGHTED;

    const categories =
      weightingMode === GradebookWeightingMode.CATEGORY_WEIGHTED
        ? await this.prisma.assessmentCategory.findMany({
            where: { classId },
            select: { id: true, weight: true },
          })
        : [];

    const categoryWeightById = new Map(categories.map((category) => [category.id, category.weight]));

    const assessments = await this.prisma.assessment.findMany({
      where: {
        classId,
        isActive: true,
      },
      orderBy: [{ dueAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        assessmentType: {
          select: { id: true, key: true, name: true },
        },
        reportingPeriod: {
          select: {
            id: true,
            name: true,
            order: true,
            isLocked: true,
            startsAt: true,
            endsAt: true,
          },
        },
        results: {
          where: { studentId },
          select: {
            id: true,
            studentId: true,
            score: true,
            statusLabelId: true,
            statusLabel: {
              select: { id: true, key: true, label: true, behavior: true },
            },
            comment: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    const calcInputs = assessments.map((assessment) => {
      const result = assessment.results[0] ?? null;

      return {
        maxScore: assessment.maxScore,
        weight: assessment.weight,
        categoryId: assessment.categoryId ?? null,
        categoryWeight:
          assessment.categoryId && categoryWeightById.has(assessment.categoryId)
            ? (categoryWeightById.get(assessment.categoryId) ?? null)
            : null,
        result: result
          ? {
              score: result.score ?? null,
              statusBehavior: (result.statusLabel?.behavior ?? null) as ResultCalculationBehavior | null,
            }
          : null,
      };
    });

    const calculated = computeGradebookAveragePercent(weightingMode, calcInputs);

    let override: {
      id: string;
      overridePercent: number | null;
      overrideLetterGrade: string | null;
      overrideReason: string | null;
      overriddenByUserId: string;
      updatedAt: Date;
    } | null = null;

    try {
      override = await this.prisma.gradeOverride.findFirst({
        where: {
          classId,
          studentId,
          reportingPeriodId: null,
        },
        select: {
          id: true,
          overridePercent: true,
          overrideLetterGrade: true,
          overrideReason: true,
          overriddenByUserId: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (!isSchemaMissingError(error) && !isUnknownFieldError(error, 'gradebookWeightingMode')) {
        throw error;
      }
    }

    const calculatedAveragePercentRaw = calculated.averagePercent;
    const calculatedAveragePercent = roundWholePercent(calculatedAveragePercentRaw);
    const calculatedAverageLetterGrade = mapPercentToLetterGrade(
      calculatedAveragePercent,
      gradeScaleRules,
    );

    const finalAveragePercentRaw =
      override?.overridePercent !== null && override?.overridePercent !== undefined
        ? override.overridePercent
        : calculatedAveragePercentRaw;
    const finalAveragePercent = roundWholePercent(finalAveragePercentRaw);

    const finalAverageLetterGrade = mapPercentToLetterGrade(
      finalAveragePercent,
      gradeScaleRules,
    );

    const publishedOnly = isPublishedFilterRequired(user.role);
    const visibleAssessments = publishedOnly
      ? assessments.filter((assessment) => assessment.isPublishedToParents)
      : assessments;

    const gradedVisibleCount = visibleAssessments.filter((assessment) => {
      const result = assessment.results[0];
      if (!result) {
        return false;
      }

      const behavior = result.statusLabel?.behavior ?? null;
      if (behavior === ResultCalculationBehavior.EXCLUDE_FROM_CALCULATION) {
        return false;
      }

      if (behavior === ResultCalculationBehavior.COUNT_AS_ZERO) {
        return true;
      }

      return !(result.score === null || result.score === undefined);
    }).length;

    return {
      classId,
      studentId,
      assessmentCount: visibleAssessments.length,
      gradedCount: gradedVisibleCount,
      averagePercent: finalAveragePercent,
      averageLetterGrade: finalAverageLetterGrade,
      calculatedAveragePercent,
      calculatedAverageLetterGrade,
      usesWeights: calculated.usesWeights,
      weightingMode,
      override,
      assessments: visibleAssessments.map((assessment) => {
        const result = assessment.results[0] ?? null;
        const behavior = result?.statusLabel?.behavior ?? null;
        const effectiveScore =
          behavior === ResultCalculationBehavior.COUNT_AS_ZERO ? 0 : result?.score ?? null;
        const percent =
          behavior === ResultCalculationBehavior.EXCLUDE_FROM_CALCULATION
            ? null
            : effectiveScore === null || effectiveScore === undefined
              ? null
              : round1((effectiveScore / assessment.maxScore) * 100);

        return {
          id: assessment.id,
          title: assessment.title,
          maxScore: assessment.maxScore,
          weight: assessment.weight,
          dueAt: assessment.dueAt,
          reportingPeriod: assessment.reportingPeriod,
          isPublishedToParents: assessment.isPublishedToParents,
          assessmentType: assessment.assessmentType,
          categoryId: assessment.categoryId ?? null,
          statusLabel: result?.statusLabel
            ? {
                key: result.statusLabel.key,
                label: result.statusLabel.label,
                behavior: result.statusLabel.behavior,
              }
            : null,
          percent,
          score: effectiveScore ?? null,
          rawScore: result?.score ?? null,
          statusLabelId: result?.statusLabelId ?? null,
          comment: result?.comment ?? null,
        };
      }),
    };
  }

  async getClassSummary(user: AuthUser, classId: string) {
    const existingClass = await this.ensureUserCanAccessClass(user, classId);
    const gradeScaleRules = await this.getGradeScaleRulesForSchool(existingClass.schoolId);
    const weightingMode = existingClass.gradebookWeightingMode ?? GradebookWeightingMode.UNWEIGHTED;

    const categories =
      weightingMode === GradebookWeightingMode.CATEGORY_WEIGHTED
        ? await this.prisma.assessmentCategory.findMany({
            where: { classId },
            select: { id: true, weight: true },
          })
        : [];

    const categoryWeightById = new Map(categories.map((category) => [category.id, category.weight]));

    const assessments = await this.prisma.assessment.findMany({
      where: {
        classId,
        isActive: true,
      },
      orderBy: [{ dueAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        assessmentType: {
          select: { id: true, key: true, name: true },
        },
        reportingPeriod: {
          select: {
            id: true,
            name: true,
            order: true,
            isLocked: true,
            startsAt: true,
            endsAt: true,
          },
        },
        results: {
          select: {
            studentId: true,
            score: true,
            statusLabel: {
              select: { behavior: true, key: true, label: true },
            },
          },
        },
      },
    });

    const enrollments = await this.prisma.studentClassEnrollment.findMany({
      where: { classId },
      orderBy: { createdAt: 'asc' },
      include: {
        student: {
          select: safeUserSelect,
        },
      },
    });

    const studentIds = enrollments.map((enrollment) => enrollment.studentId);
    const overridesByStudentId = new Map<
      string,
      {
        id: string;
        overridePercent: number | null;
        overrideLetterGrade: string | null;
        overrideReason: string | null;
        overriddenByUserId: string;
        updatedAt: Date;
      }
    >();

    try {
      const overrides = await this.prisma.gradeOverride.findMany({
        where: {
          classId,
          studentId: { in: studentIds },
          reportingPeriodId: null,
        },
        select: {
          id: true,
          studentId: true,
          overridePercent: true,
          overrideLetterGrade: true,
          overrideReason: true,
          overriddenByUserId: true,
          updatedAt: true,
        },
      });

      for (const override of overrides) {
        overridesByStudentId.set(override.studentId, override);
      }
    } catch (error) {
      if (!isSchemaMissingError(error)) {
        throw error;
      }
    }

    const studentSummaries = enrollments.map((enrollment) => {
      const calcInputs = assessments.map((assessment) => {
        const result = assessment.results.find((entry) => entry.studentId === enrollment.studentId) ?? null;

        return {
          maxScore: assessment.maxScore,
          weight: assessment.weight,
          categoryId: assessment.categoryId ?? null,
          categoryWeight:
            assessment.categoryId && categoryWeightById.has(assessment.categoryId)
              ? (categoryWeightById.get(assessment.categoryId) ?? null)
              : null,
          result: result
            ? {
                score: result.score ?? null,
                statusBehavior: (result.statusLabel?.behavior ?? null) as ResultCalculationBehavior | null,
              }
            : null,
        };
      });

      const calculated = computeGradebookAveragePercent(weightingMode, calcInputs);
      const calculatedAveragePercentRaw = calculated.averagePercent;
      const calculatedAveragePercent = roundWholePercent(calculatedAveragePercentRaw);
      const calculatedAverageLetterGrade = mapPercentToLetterGrade(
        calculatedAveragePercent,
        gradeScaleRules,
      );

      const override = overridesByStudentId.get(enrollment.studentId) ?? null;

      const finalAveragePercentRaw =
        override?.overridePercent !== null && override?.overridePercent !== undefined
          ? override.overridePercent
          : calculatedAveragePercentRaw;
      const finalAveragePercent = roundWholePercent(finalAveragePercentRaw);

      const finalAverageLetterGrade = mapPercentToLetterGrade(
        finalAveragePercent,
        gradeScaleRules,
      );

      return {
        student: enrollment.student,
        assessmentCount: assessments.length,
        gradedCount: calculated.includedCount,
        averagePercent: finalAveragePercent,
        averageLetterGrade: finalAverageLetterGrade,
        calculatedAveragePercent,
        calculatedAverageLetterGrade,
        usesWeights: calculated.usesWeights,
        weightingMode,
        override,
      };
    });

    const assessmentSummaries = assessments.map((assessment) => {
      const percents = assessment.results
        .map((entry) => {
          const behavior = entry.statusLabel?.behavior ?? null;
          if (behavior === ResultCalculationBehavior.EXCLUDE_FROM_CALCULATION) {
            return null;
          }

          const effectiveScore =
            behavior === ResultCalculationBehavior.COUNT_AS_ZERO ? 0 : entry.score ?? null;

          if (effectiveScore === null || effectiveScore === undefined) {
            return null;
          }

          return (effectiveScore / assessment.maxScore) * 100;
        })
        .filter((value): value is number => typeof value === 'number');

      const averagePercent =
        percents.length === 0
          ? null
          : round1(percents.reduce((sum, value) => sum + value, 0) / percents.length);

      return {
        id: assessment.id,
        title: assessment.title,
        maxScore: assessment.maxScore,
        weight: assessment.weight,
        dueAt: assessment.dueAt,
        reportingPeriod: assessment.reportingPeriod,
        isPublishedToParents: assessment.isPublishedToParents,
        assessmentType: assessment.assessmentType,
        categoryId: assessment.categoryId ?? null,
        gradedCount: percents.length,
        averagePercent,
      };
    });

    const classAverageEntries = studentSummaries
      .map((summary) =>
        summary.averagePercent === null ? null : { percent: summary.averagePercent },
      )
      .filter(Boolean) as Array<{ percent: number }>;

    const overallAveragePercentRaw =
      classAverageEntries.length === 0
        ? null
        : classAverageEntries.reduce((sum, entry) => sum + entry.percent, 0) /
          classAverageEntries.length;
    const overallAveragePercent = roundWholePercent(overallAveragePercentRaw);

    return {
      classId: existingClass.id,
      schoolId: existingClass.schoolId,
      schoolYearId: existingClass.schoolYearId,
      assessmentCount: assessments.length,
      studentCount: enrollments.length,
      overallAveragePercent,
      overallLetterGrade: mapPercentToLetterGrade(overallAveragePercent, gradeScaleRules),
      weightingMode,
      assessments: assessmentSummaries,
      students: studentSummaries,
    };
  }

  async getClassGradebookGrid(user: AuthUser, classId: string) {
    const existingClass = await this.ensureUserCanAccessClass(user, classId);

    const [assessments, enrollments] = await Promise.all([
      this.prisma.assessment.findMany({
        where: {
          classId,
          isActive: true,
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        include: {
          assessmentType: {
            select: { id: true, key: true, name: true },
          },
          reportingPeriod: {
            select: {
              id: true,
              name: true,
              order: true,
              isLocked: true,
              startsAt: true,
              endsAt: true,
            },
          },
          results: {
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
              updatedAt: true,
            },
          },
        },
      }),
      this.prisma.studentClassEnrollment.findMany({
        where: { classId },
        orderBy: { createdAt: 'asc' },
        include: {
          student: {
            select: safeUserSelect,
          },
        },
      }),
    ]);

    return {
      classId: existingClass.id,
      schoolId: existingClass.schoolId,
      schoolYearId: existingClass.schoolYearId,
      weightingMode: existingClass.gradebookWeightingMode ?? GradebookWeightingMode.UNWEIGHTED,
      assessmentCount: assessments.length,
      studentCount: enrollments.length,
      assessments,
      students: enrollments.map((enrollment) => enrollment.student),
    };
  }

  async getStudentInClassSummary(user: AuthUser, classId: string, studentId: string) {
    if (!classId) {
      throw new BadRequestException('classId is required');
    }

    await this.ensureUserCanReadStudentInClass(user, studentId, classId);
    const classContext = await this.getClassContextOrThrow(classId);
    const gradeScaleRules = await this.getGradeScaleRulesForSchool(classContext.schoolId);
    const weightingMode = classContext.gradebookWeightingMode ?? GradebookWeightingMode.UNWEIGHTED;

    const categories =
      weightingMode === GradebookWeightingMode.CATEGORY_WEIGHTED
        ? await this.prisma.assessmentCategory.findMany({
            where: { classId },
            select: { id: true, weight: true },
          })
        : [];

    const categoryWeightById = new Map(categories.map((category) => [category.id, category.weight]));

    const publishedOnly = isPublishedFilterRequired(user.role);

    const assessments = await this.prisma.assessment.findMany({
      where: {
        classId,
        isActive: true,
      },
      orderBy: [
        { reportingPeriod: { order: 'asc' } },
        { dueAt: 'asc' },
        { createdAt: 'asc' },
      ],
      include: {
        assessmentType: {
          select: { id: true, key: true, name: true },
        },
        reportingPeriod: {
          select: {
            id: true,
            name: true,
            order: true,
            isLocked: true,
            startsAt: true,
            endsAt: true,
          },
        },
        results: {
          where: {
            studentId,
          },
          select: {
            id: true,
            studentId: true,
            score: true,
            statusLabelId: true,
            statusLabel: {
              select: { id: true, key: true, label: true, behavior: true },
            },
            comment: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    const calcInputs = assessments.map((assessment) => {
      const result = assessment.results[0] ?? null;

      return {
        maxScore: assessment.maxScore,
        weight: assessment.weight,
        categoryId: assessment.categoryId ?? null,
        categoryWeight:
          assessment.categoryId && categoryWeightById.has(assessment.categoryId)
            ? (categoryWeightById.get(assessment.categoryId) ?? null)
            : null,
        result: result
          ? {
              score: result.score ?? null,
              statusBehavior: (result.statusLabel?.behavior ?? null) as ResultCalculationBehavior | null,
            }
          : null,
      };
    });

    const calculated = computeGradebookAveragePercent(weightingMode, calcInputs);
    const calculatedAveragePercentRaw = calculated.averagePercent;
    const calculatedAveragePercent = roundWholePercent(calculatedAveragePercentRaw);
    const calculatedAverageLetterGrade = mapPercentToLetterGrade(
      calculatedAveragePercent,
      gradeScaleRules,
    );

    let override: {
      id: string;
      overridePercent: number | null;
      overrideLetterGrade: string | null;
      overrideReason: string | null;
      overriddenByUserId: string;
      updatedAt: Date;
    } | null = null;

    try {
      override = await this.prisma.gradeOverride.findFirst({
        where: {
          classId,
          studentId,
          reportingPeriodId: null,
        },
        select: {
          id: true,
          overridePercent: true,
          overrideLetterGrade: true,
          overrideReason: true,
          overriddenByUserId: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (!isSchemaMissingError(error)) {
        throw error;
      }
    }

    const finalAveragePercentRaw =
      override?.overridePercent !== null && override?.overridePercent !== undefined
        ? override.overridePercent
        : calculatedAveragePercentRaw;
    const finalAveragePercent = roundWholePercent(finalAveragePercentRaw);

    const finalAverageLetterGrade = mapPercentToLetterGrade(
      finalAveragePercent,
      gradeScaleRules,
    );

    const visibleAssessments = publishedOnly
      ? assessments.filter((assessment) => assessment.isPublishedToParents)
      : assessments;

    const flattened = visibleAssessments.map((assessment) => {
      const result = assessment.results[0] ?? null;
      const behavior = result?.statusLabel?.behavior ?? null;
      const effectiveScore =
        behavior === ResultCalculationBehavior.COUNT_AS_ZERO ? 0 : result?.score ?? null;

      const percent =
        behavior === ResultCalculationBehavior.EXCLUDE_FROM_CALCULATION
          ? null
          : effectiveScore === null || effectiveScore === undefined
            ? null
            : round1((effectiveScore / assessment.maxScore) * 100);

      return {
        id: assessment.id,
        title: assessment.title,
        maxScore: assessment.maxScore,
        weight: assessment.weight,
        categoryId: assessment.categoryId ?? null,
        dueAt: assessment.dueAt,
        isPublishedToParents: assessment.isPublishedToParents,
        assessmentType: assessment.assessmentType,
        reportingPeriod: assessment.reportingPeriod,
        result,
        effectiveScore,
        percent,
      };
    });

    const groupMap = new Map<
      string,
      {
        reportingPeriod: {
          id: string;
          name: string;
          order: number;
          isLocked: boolean;
          startsAt: Date;
          endsAt: Date;
        } | null;
        assessments: typeof flattened;
      }
    >();

    for (const entry of flattened) {
      const key = entry.reportingPeriod?.id ?? 'unassigned';

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          reportingPeriod: entry.reportingPeriod
            ? {
                id: entry.reportingPeriod.id,
                name: entry.reportingPeriod.name,
                order: entry.reportingPeriod.order,
                isLocked: entry.reportingPeriod.isLocked,
                startsAt: entry.reportingPeriod.startsAt,
                endsAt: entry.reportingPeriod.endsAt,
              }
            : null,
          assessments: [],
        });
      }

      groupMap.get(key)!.assessments.push(entry);
    }

    const groups = Array.from(groupMap.values()).sort((a, b) => {
      if (!a.reportingPeriod && !b.reportingPeriod) {
        return 0;
      }

      if (!a.reportingPeriod) {
        return 1;
      }

      if (!b.reportingPeriod) {
        return -1;
      }

      return a.reportingPeriod.order - b.reportingPeriod.order;
    });

    return {
      classId,
      studentId,
      schoolId: classContext.schoolId,
      schoolYearId: classContext.schoolYearId,
      assessmentCount: flattened.length,
      gradedCount: flattened.filter((entry) => entry.percent !== null).length,
      averagePercent: finalAveragePercent,
      averageLetterGrade: finalAverageLetterGrade,
      calculatedAveragePercent,
      calculatedAverageLetterGrade,
      usesWeights: calculated.usesWeights,
      weightingMode,
      override,
      groups: groups.map((group) => ({
        reportingPeriod: group.reportingPeriod,
        assessments: group.assessments.map((entry) => ({
          id: entry.id,
          title: entry.title,
          maxScore: entry.maxScore,
          weight: entry.weight,
          categoryId: entry.categoryId,
          dueAt: entry.dueAt,
          reportingPeriod: entry.reportingPeriod,
          isPublishedToParents: entry.isPublishedToParents,
          assessmentType: entry.assessmentType,
          percent: entry.percent,
          score: entry.effectiveScore ?? null,
          rawScore: entry.result?.score ?? null,
          statusLabelId: entry.result?.statusLabelId ?? null,
          statusLabel: entry.result?.statusLabel
            ? {
                key: entry.result.statusLabel.key,
                label: entry.result.statusLabel.label,
                behavior: entry.result.statusLabel.behavior,
              }
            : null,
          comment: entry.result?.comment ?? null,
        })),
      })),
    };
  }

  async getStudentAcademicOverview(user: AuthUser, studentId: string) {
    if (!studentId) {
      throw new BadRequestException('studentId is required');
    }

    if (user.role === UserRole.STUDENT) {
      if (user.id !== studentId) {
        throw new ForbiddenException('You do not have student access');
      }
    } else if (user.role === UserRole.PARENT) {
      await this.ensureParentLinkedToStudent(user.id, studentId);
    } else if (!this.isAdminLike(user.role)) {
      throw new ForbiddenException('You do not have student access');
    }

    const enrollments = await this.prisma.studentClassEnrollment.findMany({
      where: {
        studentId,
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            subject: true,
            schoolId: true,
            schoolYearId: true,
            school: {
              select: { id: true, name: true, shortName: true, isActive: true },
            },
            schoolYear: {
              select: {
                id: true,
                schoolId: true,
                name: true,
                startDate: true,
                endDate: true,
                isActive: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const accessibleSchoolIds = new Set(getAccessibleSchoolIds(user));
    const visibleClasses = enrollments
      .map((enrollment) => enrollment.class)
      .filter((schoolClass) => {
        if (isBypassRole(user.role) || user.role === UserRole.PARENT || user.role === UserRole.STUDENT) {
          return true;
        }

        return accessibleSchoolIds.has(schoolClass.schoolId);
      });

    if (visibleClasses.length === 0) {
      return {
        studentId,
        classes: [],
      };
    }

    const classIds = visibleClasses.map((schoolClass) => schoolClass.id);
    const publishedOnly = isPublishedFilterRequired(user.role);

    let weightingModeByClassId = new Map<string, GradebookWeightingMode>();

    try {
      const classSettings = await this.prisma.class.findMany({
        where: { id: { in: classIds } },
        select: { id: true, gradebookWeightingMode: true },
      });

      weightingModeByClassId = new Map(
        classSettings.map((entry) => [entry.id, entry.gradebookWeightingMode]),
      );
    } catch (error) {
      if (!isSchemaMissingError(error)) {
        throw error;
      }
    }

    const categoriesByClassId = new Map<string, Map<string, number | null>>();

    try {
      const categories = await this.prisma.assessmentCategory.findMany({
        where: { classId: { in: classIds } },
        select: { id: true, classId: true, weight: true },
      });

      for (const category of categories) {
        const map = categoriesByClassId.get(category.classId) ?? new Map();
        map.set(category.id, category.weight);
        categoriesByClassId.set(category.classId, map);
      }
    } catch (error) {
      if (!isSchemaMissingError(error)) {
        throw error;
      }
    }

    const assessments = await this.prisma.assessment.findMany({
      where: {
        classId: { in: classIds },
        isActive: true,
      },
      include: {
        assessmentType: {
          select: { id: true, key: true, name: true },
        },
        results: {
          where: { studentId },
          select: {
            score: true,
            statusLabel: {
              select: { behavior: true },
            },
          },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });

    const overridesByClassId = new Map<
      string,
      {
        id: string;
        overridePercent: number | null;
        overrideLetterGrade: string | null;
        overrideReason: string | null;
        overriddenByUserId: string;
        updatedAt: Date;
      }
    >();

    try {
      const overrides = await this.prisma.gradeOverride.findMany({
        where: {
          studentId,
          classId: { in: classIds },
          reportingPeriodId: null,
        },
        select: {
          id: true,
          classId: true,
          overridePercent: true,
          overrideLetterGrade: true,
          overrideReason: true,
          overriddenByUserId: true,
          updatedAt: true,
        },
      });

      for (const override of overrides) {
        overridesByClassId.set(override.classId, override);
      }
    } catch (error) {
      if (!isSchemaMissingError(error)) {
        throw error;
      }
    }

    const rulesBySchoolId = await this.getGradeScaleRulesForSchools(
      visibleClasses.map((schoolClass) => schoolClass.schoolId),
    );

    const assessmentsByClassId = new Map<string, typeof assessments>();
    for (const assessment of assessments) {
      const list = assessmentsByClassId.get(assessment.classId) ?? [];
      list.push(assessment);
      assessmentsByClassId.set(assessment.classId, list);
    }

    const classSummaries = visibleClasses.map((schoolClass) => {
      const classAssessments = assessmentsByClassId.get(schoolClass.id) ?? [];
      const weightingMode =
        weightingModeByClassId.get(schoolClass.id) ?? GradebookWeightingMode.UNWEIGHTED;
      const categoryWeights = categoriesByClassId.get(schoolClass.id) ?? new Map<string, number | null>();

      const calcInputs = classAssessments.map((assessment) => ({
        maxScore: assessment.maxScore,
        weight: assessment.weight,
        categoryId: assessment.categoryId ?? null,
        categoryWeight:
          assessment.categoryId && categoryWeights.has(assessment.categoryId)
            ? (categoryWeights.get(assessment.categoryId) ?? null)
            : null,
        result: assessment.results[0]
          ? {
              score: assessment.results[0].score ?? null,
              statusBehavior: (assessment.results[0].statusLabel?.behavior ?? null) as ResultCalculationBehavior | null,
            }
          : null,
      }));

      const calculated = computeGradebookAveragePercent(weightingMode, calcInputs);
      const calculatedAveragePercentRaw = calculated.averagePercent;
      const calculatedAveragePercent = roundWholePercent(calculatedAveragePercentRaw);

      const override = overridesByClassId.get(schoolClass.id) ?? null;

      const finalAveragePercentRaw =
        override?.overridePercent !== null && override?.overridePercent !== undefined
          ? override.overridePercent
          : calculatedAveragePercentRaw;
      const finalAveragePercent = roundWholePercent(finalAveragePercentRaw);

      const finalAverageLetterGrade =
        mapPercentToLetterGrade(
          finalAveragePercent,
          rulesBySchoolId.get(schoolClass.schoolId) ?? [],
        );

      const visibleCount = publishedOnly
        ? classAssessments.filter((assessment) => assessment.isPublishedToParents).length
        : classAssessments.length;

      const gradedVisibleCount = publishedOnly
        ? classAssessments.filter((assessment) => {
            if (!assessment.isPublishedToParents) {
              return false;
            }

            const result = assessment.results[0];
            if (!result) {
              return false;
            }

            const behavior = result.statusLabel?.behavior ?? null;
            if (behavior === ResultCalculationBehavior.EXCLUDE_FROM_CALCULATION) {
              return false;
            }

            if (behavior === ResultCalculationBehavior.COUNT_AS_ZERO) {
              return true;
            }

            return !(result.score === null || result.score === undefined);
          }).length
        : calculated.includedCount;

      const calculatedAverageLetterGrade = mapPercentToLetterGrade(
        calculatedAveragePercent,
        rulesBySchoolId.get(schoolClass.schoolId) ?? [],
      );

      return {
        class: schoolClass,
        assessmentCount: visibleCount,
        gradedCount: gradedVisibleCount,
        averagePercent: finalAveragePercent,
        averageLetterGrade: finalAverageLetterGrade,
        calculatedAveragePercent,
        calculatedAverageLetterGrade,
        usesWeights: calculated.usesWeights,
        weightingMode,
        override,
      };
    });

    return {
      studentId,
      classes: classSummaries,
    };
  }
}
