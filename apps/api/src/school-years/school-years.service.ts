import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogSeverity,
  EnrollmentHistoryStatus,
  GradebookWeightingMode,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSchoolYearDto } from './dto/create-school-year.dto';
import { AuthenticatedUser } from '../common/auth/auth-user';
import { ensureUserHasSchoolAccess } from '../common/access/school-access.util';
import { UpdateSchoolYearDto } from './dto/update-school-year.dto';
import { parseDateOnlyOrThrow } from '../common/dates/date-only.util';
import { AuditService } from '../audit/audit.service';
import { buildAuditDiff } from '../audit/audit-diff.util';
import { RolloverSchoolYearDto } from './dto/rollover-school-year.dto';

type NormalizedRolloverOptions = {
  copyGradeLevels: boolean;
  copyClassTemplates: boolean;
  promoteStudents: boolean;
  graduateFinalGradeStudents: boolean;
  archivePriorYearLeftovers: boolean;
  activateTargetSchoolYear: boolean;
};

type StudentTransitionPlan = {
  studentId: string;
  fromGradeLevelId: string;
  toGradeLevelId: string;
};

type StudentGraduationPlan = {
  studentId: string;
  fromGradeLevelId: string;
};

type RolloverPlanContext = {
  sourceSchoolYear: {
    id: string;
    schoolId: string;
    name: string;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
  };
  existingTargetSchoolYear: {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
  } | null;
  targetStartDate: Date;
  targetEndDate: Date;
  options: NormalizedRolloverOptions;
  sourceClasses: Array<{
    id: string;
    name: string;
    isActive: boolean;
    gradeLevelId: string | null;
    subjectOptionId: string | null;
    subject: string | null;
    isHomeroom: boolean;
    takesAttendance: boolean;
    gradebookWeightingMode: GradebookWeightingMode;
  }>;
  classesToCreate: Array<{
    name: string;
    gradeLevelId: string | null;
    subjectOptionId: string | null;
    subject: string | null;
    isHomeroom: boolean;
    takesAttendance: boolean;
    gradebookWeightingMode: GradebookWeightingMode;
  }>;
  classTemplatesAlreadyInTargetCount: number;
  activeStudentsCount: number;
  promotableStudents: StudentTransitionPlan[];
  graduatingStudents: StudentGraduationPlan[];
  studentsMissingGradeLevelCount: number;
  studentsWithoutNextGradeCount: number;
  highestGradeLevelName: string | null;
  inactiveGradeLevelsToReactivate: string[];
  activeSourceClassesToArchiveCount: number;
  warnings: string[];
};

@Injectable()
export class SchoolYearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private buildInclude() {
    return {
      school: true,
    };
  }

  private ensureValidDateRange(startDate: Date, endDate: Date) {
    if (startDate >= endDate) {
      throw new BadRequestException('startDate must be before endDate');
    }
  }

  private handleRemoveError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new NotFoundException('School year not found');
      }

      if (error.code === 'P2003') {
        throw new ConflictException(
          'School year cannot be deleted because related records still exist',
        );
      }
    }

    throw new InternalServerErrorException(
      'Unable to delete school year right now',
    );
  }

  private normalizeRolloverOptions(
    data: RolloverSchoolYearDto,
  ): NormalizedRolloverOptions {
    return {
      copyGradeLevels: data.copyGradeLevels ?? true,
      copyClassTemplates: data.copyClassTemplates ?? false,
      promoteStudents: data.promoteStudents ?? true,
      graduateFinalGradeStudents: data.graduateFinalGradeStudents ?? true,
      archivePriorYearLeftovers: data.archivePriorYearLeftovers ?? true,
      activateTargetSchoolYear: data.activateTargetSchoolYear ?? true,
    };
  }

  private toClassTemplateKey(input: {
    name: string;
    gradeLevelId: string | null;
    subjectOptionId: string | null;
  }) {
    return `${input.name.toLowerCase()}::${input.gradeLevelId ?? 'none'}::${input.subjectOptionId ?? 'none'}`;
  }

  private async buildRolloverPlanContext(
    user: AuthenticatedUser,
    data: RolloverSchoolYearDto,
  ): Promise<RolloverPlanContext> {
    ensureUserHasSchoolAccess(user, data.schoolId);

    const options = this.normalizeRolloverOptions(data);
    const targetStartDate = parseDateOnlyOrThrow(
      data.targetStartDate,
      'targetStartDate',
    );
    const targetEndDate = parseDateOnlyOrThrow(
      data.targetEndDate,
      'targetEndDate',
    );
    this.ensureValidDateRange(targetStartDate, targetEndDate);

    const sourceSchoolYear = await this.prisma.schoolYear.findUnique({
      where: { id: data.sourceSchoolYearId },
      select: {
        id: true,
        schoolId: true,
        name: true,
        startDate: true,
        endDate: true,
        isActive: true,
      },
    });

    if (!sourceSchoolYear) {
      throw new NotFoundException('Source school year not found');
    }

    if (sourceSchoolYear.schoolId !== data.schoolId) {
      throw new BadRequestException(
        'sourceSchoolYearId does not belong to schoolId',
      );
    }

    const existingTargetSchoolYear = await this.prisma.schoolYear.findUnique({
      where: {
        schoolId_name: {
          schoolId: data.schoolId,
          name: data.targetSchoolYearName,
        },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        isActive: true,
      },
    });

    const [gradeLevels, sourceClasses, activeStudents] = await Promise.all([
      this.prisma.gradeLevel.findMany({
        where: {
          schoolId: data.schoolId,
        },
        select: {
          id: true,
          name: true,
          sortOrder: true,
          isActive: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.class.findMany({
        where: {
          schoolId: data.schoolId,
          schoolYearId: data.sourceSchoolYearId,
        },
        select: {
          id: true,
          name: true,
          isActive: true,
          gradeLevelId: true,
          subjectOptionId: true,
          subject: true,
          isHomeroom: true,
          takesAttendance: true,
          gradebookWeightingMode: true,
        },
      }),
      this.prisma.user.findMany({
        where: {
          role: UserRole.STUDENT,
          isActive: true,
          OR: [
            {
              schoolId: data.schoolId,
            },
            {
              memberships: {
                some: {
                  schoolId: data.schoolId,
                  isActive: true,
                },
              },
            },
          ],
        },
        select: {
          id: true,
          gradeLevelId: true,
        },
      }),
    ]);

    const warnings: string[] = [];

    if (existingTargetSchoolYear) {
      if (
        existingTargetSchoolYear.startDate.getTime() !==
          targetStartDate.getTime() ||
        existingTargetSchoolYear.endDate.getTime() !== targetEndDate.getTime()
      ) {
        warnings.push(
          'A school year with the target name already exists with different dates. Execute will reuse the existing school year and keep its stored dates.',
        );
      }

      if (existingTargetSchoolYear.id === sourceSchoolYear.id) {
        throw new BadRequestException(
          'Target school year must be different from source school year',
        );
      }
    }

    const activeGradeLevels = gradeLevels.filter(
      (gradeLevel) => gradeLevel.isActive,
    );
    if (activeGradeLevels.length === 0) {
      warnings.push(
        'No active grade levels exist for this school. Student promotion and graduation will be skipped.',
      );
    }

    const nextGradeLevelById = new Map<string, string>();
    for (let index = 0; index < activeGradeLevels.length - 1; index += 1) {
      nextGradeLevelById.set(
        activeGradeLevels[index].id,
        activeGradeLevels[index + 1].id,
      );
    }

    const highestGradeLevel =
      activeGradeLevels.length > 0
        ? activeGradeLevels[activeGradeLevels.length - 1]
        : null;

    const promotableStudents: StudentTransitionPlan[] = [];
    const graduatingStudents: StudentGraduationPlan[] = [];
    let studentsMissingGradeLevelCount = 0;
    let studentsWithoutNextGradeCount = 0;

    for (const student of activeStudents) {
      if (!student.gradeLevelId) {
        studentsMissingGradeLevelCount += 1;
        continue;
      }

      if (highestGradeLevel && student.gradeLevelId === highestGradeLevel.id) {
        graduatingStudents.push({
          studentId: student.id,
          fromGradeLevelId: student.gradeLevelId,
        });
        continue;
      }

      const nextGradeLevelId = nextGradeLevelById.get(student.gradeLevelId);
      if (!nextGradeLevelId) {
        studentsWithoutNextGradeCount += 1;
        continue;
      }

      promotableStudents.push({
        studentId: student.id,
        fromGradeLevelId: student.gradeLevelId,
        toGradeLevelId: nextGradeLevelId,
      });
    }

    if (studentsMissingGradeLevelCount > 0) {
      warnings.push(
        `${studentsMissingGradeLevelCount} active students have no grade level assigned and will be left unchanged.`,
      );
    }

    if (studentsWithoutNextGradeCount > 0) {
      warnings.push(
        `${studentsWithoutNextGradeCount} active students do not have a configured next grade level and will be left unchanged.`,
      );
    }

    const referencedGradeLevelIds = new Set<string>();
    for (const schoolClass of sourceClasses) {
      if (schoolClass.gradeLevelId) {
        referencedGradeLevelIds.add(schoolClass.gradeLevelId);
      }
    }
    for (const student of activeStudents) {
      if (student.gradeLevelId) {
        referencedGradeLevelIds.add(student.gradeLevelId);
      }
    }

    const inactiveGradeLevelsToReactivate = gradeLevels
      .filter(
        (gradeLevel) =>
          !gradeLevel.isActive && referencedGradeLevelIds.has(gradeLevel.id),
      )
      .map((gradeLevel) => gradeLevel.id);

    const activeSourceClasses = sourceClasses.filter(
      (schoolClass) => schoolClass.isActive,
    );

    let classTemplatesAlreadyInTargetCount = 0;
    let classesToCreate: RolloverPlanContext['classesToCreate'] = [];

    if (options.copyClassTemplates) {
      const existingTargetClassKeys = new Set<string>();

      if (existingTargetSchoolYear) {
        const existingTargetClasses = await this.prisma.class.findMany({
          where: {
            schoolId: data.schoolId,
            schoolYearId: existingTargetSchoolYear.id,
          },
          select: {
            name: true,
            gradeLevelId: true,
            subjectOptionId: true,
          },
        });

        for (const existingClass of existingTargetClasses) {
          existingTargetClassKeys.add(
            this.toClassTemplateKey({
              name: existingClass.name,
              gradeLevelId: existingClass.gradeLevelId,
              subjectOptionId: existingClass.subjectOptionId,
            }),
          );
        }
      }

      classesToCreate = activeSourceClasses
        .filter((schoolClass) => {
          const classKey = this.toClassTemplateKey({
            name: schoolClass.name,
            gradeLevelId: schoolClass.gradeLevelId,
            subjectOptionId: schoolClass.subjectOptionId,
          });

          if (existingTargetClassKeys.has(classKey)) {
            classTemplatesAlreadyInTargetCount += 1;
            return false;
          }

          return true;
        })
        .map((schoolClass) => ({
          name: schoolClass.name,
          gradeLevelId: schoolClass.gradeLevelId,
          subjectOptionId: schoolClass.subjectOptionId,
          subject: schoolClass.subject,
          isHomeroom: schoolClass.isHomeroom,
          takesAttendance: schoolClass.takesAttendance,
          gradebookWeightingMode: schoolClass.gradebookWeightingMode,
        }));
    }

    return {
      sourceSchoolYear,
      existingTargetSchoolYear,
      targetStartDate,
      targetEndDate,
      options,
      sourceClasses,
      classesToCreate,
      classTemplatesAlreadyInTargetCount,
      activeStudentsCount: activeStudents.length,
      promotableStudents,
      graduatingStudents,
      studentsMissingGradeLevelCount,
      studentsWithoutNextGradeCount,
      highestGradeLevelName: highestGradeLevel?.name ?? null,
      inactiveGradeLevelsToReactivate,
      activeSourceClassesToArchiveCount: activeSourceClasses.length,
      warnings,
    };
  }

  async previewRollover(user: AuthenticatedUser, data: RolloverSchoolYearDto) {
    const plan = await this.buildRolloverPlanContext(user, data);

    const reversibleNotes = [
      'Preview is non-destructive and safe to run repeatedly.',
      'Class template copy is idempotent and skips templates already present in the target school year.',
      'Student promotions and graduation updates change student profile and enrollment-history state; reversing requires a follow-up admin action.',
      'Archiving the source school year can be reversed by reactivating the school year and classes.',
    ];

    return {
      sourceSchoolYear: {
        id: plan.sourceSchoolYear.id,
        name: plan.sourceSchoolYear.name,
        startDate: plan.sourceSchoolYear.startDate,
        endDate: plan.sourceSchoolYear.endDate,
        isActive: plan.sourceSchoolYear.isActive,
      },
      targetSchoolYear: {
        mode: plan.existingTargetSchoolYear ? 'reuse' : 'create',
        id: plan.existingTargetSchoolYear?.id ?? null,
        name: data.targetSchoolYearName,
        startDate:
          plan.existingTargetSchoolYear?.startDate ?? plan.targetStartDate,
        endDate: plan.existingTargetSchoolYear?.endDate ?? plan.targetEndDate,
        isActive: plan.existingTargetSchoolYear?.isActive ?? false,
      },
      options: plan.options,
      summary: {
        gradeLevelsToReactivate: plan.options.copyGradeLevels
          ? plan.inactiveGradeLevelsToReactivate.length
          : 0,
        classTemplatesToCreate: plan.options.copyClassTemplates
          ? plan.classesToCreate.length
          : 0,
        classTemplatesAlreadyPresent: plan.options.copyClassTemplates
          ? plan.classTemplatesAlreadyInTargetCount
          : 0,
        promotableStudents: plan.options.promoteStudents
          ? plan.promotableStudents.length
          : 0,
        graduatingStudents: plan.options.graduateFinalGradeStudents
          ? plan.graduatingStudents.length
          : 0,
        studentsWithoutGradeLevel: plan.studentsMissingGradeLevelCount,
        studentsWithoutNextGradeLevel: plan.studentsWithoutNextGradeCount,
        activeStudentsInSchool: plan.activeStudentsCount,
        activeClassesToArchiveFromSource: plan.options.archivePriorYearLeftovers
          ? plan.activeSourceClassesToArchiveCount
          : 0,
      },
      warnings: plan.warnings,
      highestGradeLevelName: plan.highestGradeLevelName,
      reversibleNotes,
    };
  }

  async executeRollover(user: AuthenticatedUser, data: RolloverSchoolYearDto) {
    const plan = await this.buildRolloverPlanContext(user, data);

    const result = await this.prisma.$transaction(async (tx) => {
      const targetSchoolYear = plan.existingTargetSchoolYear
        ? plan.existingTargetSchoolYear
        : await tx.schoolYear.create({
            data: {
              schoolId: data.schoolId,
              name: data.targetSchoolYearName,
              startDate: plan.targetStartDate,
              endDate: plan.targetEndDate,
              isActive: false,
            },
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
              isActive: true,
            },
          });

      let reactivatedGradeLevels = 0;
      if (
        plan.options.copyGradeLevels &&
        plan.inactiveGradeLevelsToReactivate.length > 0
      ) {
        const updateResult = await tx.gradeLevel.updateMany({
          where: {
            schoolId: data.schoolId,
            id: {
              in: plan.inactiveGradeLevelsToReactivate,
            },
            isActive: false,
          },
          data: {
            isActive: true,
          },
        });
        reactivatedGradeLevels = updateResult.count;
      }

      let createdClassTemplates = 0;
      if (plan.options.copyClassTemplates) {
        for (const templateClass of plan.classesToCreate) {
          await tx.class.create({
            data: {
              schoolId: data.schoolId,
              schoolYearId: targetSchoolYear.id,
              name: templateClass.name,
              gradeLevelId: templateClass.gradeLevelId,
              subjectOptionId: templateClass.subjectOptionId,
              subject: templateClass.subject,
              isHomeroom: templateClass.isHomeroom,
              takesAttendance: templateClass.takesAttendance,
              isActive: true,
              gradebookWeightingMode: templateClass.gradebookWeightingMode,
            },
          });
          createdClassTemplates += 1;
        }
      }

      let promotedStudentCount = 0;
      if (plan.options.promoteStudents && plan.promotableStudents.length > 0) {
        const studentIdsByNextGrade = new Map<string, string[]>();
        for (const promotion of plan.promotableStudents) {
          const ids = studentIdsByNextGrade.get(promotion.toGradeLevelId) ?? [];
          ids.push(promotion.studentId);
          studentIdsByNextGrade.set(promotion.toGradeLevelId, ids);
        }

        for (const [
          toGradeLevelId,
          studentIds,
        ] of studentIdsByNextGrade.entries()) {
          const updateResult = await tx.user.updateMany({
            where: {
              id: {
                in: studentIds,
              },
              role: UserRole.STUDENT,
              isActive: true,
            },
            data: {
              gradeLevelId: toGradeLevelId,
            },
          });
          promotedStudentCount += updateResult.count;
        }
      }

      let graduatedStudentCount = 0;
      if (
        plan.options.graduateFinalGradeStudents &&
        plan.graduatingStudents.length > 0
      ) {
        const graduationDate = plan.sourceSchoolYear.endDate;
        for (const graduation of plan.graduatingStudents) {
          await tx.enrollmentHistory.upsert({
            where: {
              studentId: graduation.studentId,
            },
            create: {
              studentId: graduation.studentId,
              dateOfEnrollment: plan.sourceSchoolYear.startDate,
              dateOfDeparture: graduationDate,
              status: EnrollmentHistoryStatus.GRADUATED,
              notes: `Graduated during rollover from ${plan.sourceSchoolYear.name} to ${targetSchoolYear.name}`,
            },
            update: {
              dateOfDeparture: graduationDate,
              status: EnrollmentHistoryStatus.GRADUATED,
              notes: `Graduated during rollover from ${plan.sourceSchoolYear.name} to ${targetSchoolYear.name}`,
            },
          });

          graduatedStudentCount += 1;
        }
      }

      let archivedSourceClassCount = 0;
      if (plan.options.archivePriorYearLeftovers) {
        const archiveClassesResult = await tx.class.updateMany({
          where: {
            schoolYearId: plan.sourceSchoolYear.id,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });
        archivedSourceClassCount = archiveClassesResult.count;

        await tx.schoolYear.update({
          where: {
            id: plan.sourceSchoolYear.id,
          },
          data: {
            isActive: false,
          },
        });
      }

      if (plan.options.activateTargetSchoolYear) {
        await tx.schoolYear.updateMany({
          where: {
            schoolId: data.schoolId,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        await tx.schoolYear.update({
          where: {
            id: targetSchoolYear.id,
          },
          data: {
            isActive: true,
          },
        });
      }

      return {
        targetSchoolYearId: targetSchoolYear.id,
        targetSchoolYearName: targetSchoolYear.name,
        reactivatedGradeLevels,
        createdClassTemplates,
        skippedExistingClassTemplates: plan.classTemplatesAlreadyInTargetCount,
        promotedStudentCount,
        graduatedStudentCount,
        archivedSourceClassCount,
      };
    });

    await this.auditService.log({
      actor: user,
      schoolId: data.schoolId,
      entityType: 'SchoolYear',
      entityId: result.targetSchoolYearId,
      action: 'ROLLOVER',
      severity: AuditLogSeverity.WARNING,
      summary: `Executed rollover from ${plan.sourceSchoolYear.name} to ${result.targetSchoolYearName}`,
      targetDisplay: result.targetSchoolYearName,
      metadataJson: {
        options: plan.options,
        reactivatedGradeLevels: result.reactivatedGradeLevels,
        createdClassTemplates: result.createdClassTemplates,
        skippedExistingClassTemplates: result.skippedExistingClassTemplates,
        promotedStudentCount: result.promotedStudentCount,
        graduatedStudentCount: result.graduatedStudentCount,
        archivedSourceClassCount: result.archivedSourceClassCount,
      },
    });

    return {
      success: true,
      sourceSchoolYearId: plan.sourceSchoolYear.id,
      targetSchoolYearId: result.targetSchoolYearId,
      targetSchoolYearName: result.targetSchoolYearName,
      summary: {
        reactivatedGradeLevels: result.reactivatedGradeLevels,
        createdClassTemplates: result.createdClassTemplates,
        skippedExistingClassTemplates: result.skippedExistingClassTemplates,
        promotedStudentCount: result.promotedStudentCount,
        graduatedStudentCount: result.graduatedStudentCount,
        archivedSourceClassCount: result.archivedSourceClassCount,
      },
      warnings: plan.warnings,
      reversibleNotes: [
        'Rerunning execute is safe for class template copy because existing templates are skipped.',
        'Student promotion and graduation changes require follow-up admin edits if reversal is needed.',
      ],
    };
  }

  async create(user: AuthenticatedUser, data: CreateSchoolYearDto) {
    ensureUserHasSchoolAccess(user, data.schoolId);

    const school = await this.prisma.school.findUnique({
      where: { id: data.schoolId },
      select: { id: true },
    });

    if (!school) {
      throw new NotFoundException('School not found');
    }

    const startDate = parseDateOnlyOrThrow(data.startDate, 'startDate');
    const endDate = parseDateOnlyOrThrow(data.endDate, 'endDate');

    this.ensureValidDateRange(startDate, endDate);

    const created = await this.prisma.schoolYear.create({
      data: {
        schoolId: data.schoolId,
        name: data.name,
        startDate,
        endDate,
        isActive: true,
      },
      include: this.buildInclude(),
    });

    await this.auditService.log({
      actor: user,
      schoolId: created.schoolId,
      entityType: 'SchoolYear',
      entityId: created.id,
      action: 'CREATE',
      severity: AuditLogSeverity.INFO,
      summary: `Created school year ${created.name}`,
      targetDisplay: created.name,
    });

    return created;
  }

  findAllForSchool(
    user: AuthenticatedUser,
    schoolId: string,
    includeInactive = false,
  ) {
    ensureUserHasSchoolAccess(user, schoolId);

    return this.prisma.schoolYear.findMany({
      where: {
        schoolId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      include: this.buildInclude(),
    });
  }

  async update(user: AuthenticatedUser, id: string, data: UpdateSchoolYearDto) {
    const existing = await this.prisma.schoolYear.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        startDate: true,
        endDate: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('School year not found');
    }

    ensureUserHasSchoolAccess(user, existing.schoolId);
    const before = await this.prisma.schoolYear.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        isActive: true,
      },
    });

    const nextStartDate = data.startDate
      ? parseDateOnlyOrThrow(data.startDate, 'startDate')
      : existing.startDate;
    const nextEndDate = data.endDate
      ? parseDateOnlyOrThrow(data.endDate, 'endDate')
      : existing.endDate;

    this.ensureValidDateRange(nextStartDate, nextEndDate);

    const updateData: {
      name?: string;
      startDate?: Date;
      endDate?: Date;
    } = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    if (data.startDate !== undefined) {
      updateData.startDate = nextStartDate;
    }

    if (data.endDate !== undefined) {
      updateData.endDate = nextEndDate;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    const updated = await this.prisma.schoolYear.update({
      where: { id },
      data: updateData,
      include: this.buildInclude(),
    });

    await this.auditService.log({
      actor: user,
      schoolId: existing.schoolId,
      entityType: 'SchoolYear',
      entityId: updated.id,
      action: 'UPDATE',
      severity: AuditLogSeverity.INFO,
      summary: `Updated school year ${updated.name}`,
      targetDisplay: updated.name,
      changesJson:
        buildAuditDiff({
          before,
          after: {
            name: updated.name,
            startDate: updated.startDate,
            endDate: updated.endDate,
            isActive: updated.isActive,
          },
        }) ?? undefined,
    });

    return updated;
  }

  async activate(user: AuthenticatedUser, id: string) {
    const { updated, schoolId } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.schoolYear.findUnique({
        where: { id },
        select: {
          id: true,
          schoolId: true,
        },
      });

      if (!existing) {
        throw new NotFoundException('School year not found');
      }

      ensureUserHasSchoolAccess(user, existing.schoolId);

      await tx.schoolYear.updateMany({
        where: {
          schoolId: existing.schoolId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      const updated = await tx.schoolYear.update({
        where: { id: existing.id },
        data: {
          isActive: true,
        },
        include: this.buildInclude(),
      });
      return { updated, schoolId: existing.schoolId };
    });

    await this.auditService.log({
      actor: user,
      schoolId,
      entityType: 'SchoolYear',
      entityId: updated.id,
      action: 'ACTIVATE',
      severity: AuditLogSeverity.INFO,
      summary: `Activated school year ${updated.name}`,
      targetDisplay: updated.name,
    });

    return updated;
  }

  async archive(user: AuthenticatedUser, id: string) {
    const { updated, archivedClassCount, schoolId } =
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.schoolYear.findUnique({
          where: { id },
          select: {
            id: true,
            schoolId: true,
          },
        });

        if (!existing) {
          throw new NotFoundException('School year not found');
        }

        ensureUserHasSchoolAccess(user, existing.schoolId);

        const archivedClasses = await tx.class.updateMany({
          where: {
            schoolYearId: existing.id,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        const updated = await tx.schoolYear.update({
          where: { id: existing.id },
          data: {
            isActive: false,
          },
          include: this.buildInclude(),
        });

        return {
          updated,
          archivedClassCount: archivedClasses.count,
          schoolId: existing.schoolId,
        };
      });

    await this.auditService.log({
      actor: user,
      schoolId,
      entityType: 'SchoolYear',
      entityId: updated.id,
      action: 'END',
      severity: AuditLogSeverity.WARNING,
      summary: `Ended school year ${updated.name}`,
      targetDisplay: updated.name,
      metadataJson: {
        archivedClassCount,
      },
    });

    return updated;
  }

  async autoEndExpiredSchoolYearsAndArchiveClasses(referenceDate = new Date()) {
    const thresholdDate = new Date(referenceDate);
    thresholdDate.setHours(0, 0, 0, 0);
    thresholdDate.setDate(thresholdDate.getDate() - 15);

    const candidates = await this.prisma.schoolYear.findMany({
      where: {
        endDate: {
          lt: thresholdDate,
        },
        OR: [
          { isActive: true },
          {
            classes: {
              some: {
                isActive: true,
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
      orderBy: [{ endDate: 'asc' }, { createdAt: 'asc' }],
    });

    let endedSchoolYearCount = 0;
    let archivedClassCount = 0;

    for (const year of candidates) {
      const result = await this.prisma.$transaction(async (tx) => {
        const endedYears = await tx.schoolYear.updateMany({
          where: {
            id: year.id,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        const archivedClasses = await tx.class.updateMany({
          where: {
            schoolYearId: year.id,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        return {
          endedSchoolYears: endedYears.count,
          archivedClasses: archivedClasses.count,
        };
      });

      endedSchoolYearCount += result.endedSchoolYears;
      archivedClassCount += result.archivedClasses;
    }

    return {
      evaluatedSchoolYears: candidates.length,
      endedSchoolYearCount,
      archivedClassCount,
      thresholdDate: thresholdDate.toISOString(),
      rule: 'endDate_plus_15_days',
    };
  }

  async remove(user: AuthenticatedUser, id: string) {
    try {
      const existing = await this.prisma.schoolYear.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          schoolId: true,
          _count: {
            select: {
              classes: true,
              attendanceSessions: true,
              reportingPeriods: true,
            },
          },
        },
      });

      if (!existing) {
        throw new NotFoundException('School year not found');
      }

      ensureUserHasSchoolAccess(user, existing.schoolId);

      const dependencyPairs: Array<[string, number]> = [
        ['classes', existing._count.classes],
        ['attendance sessions', existing._count.attendanceSessions],
        ['reporting periods', existing._count.reportingPeriods],
      ];
      const dependencyLabels: string[] = dependencyPairs.flatMap(
        ([label, count]) => (count > 0 ? [label] : []),
      );

      if (dependencyLabels.length === 0) {
        await this.prisma.schoolYear.delete({
          where: { id: existing.id },
        });

        await this.auditService.log({
          actor: user,
          schoolId: existing.schoolId,
          entityType: 'SchoolYear',
          entityId: existing.id,
          action: 'DELETE',
          severity: AuditLogSeverity.HIGH,
          summary: `Deleted school year ${existing.name}`,
          targetDisplay: existing.name,
        });

        return {
          success: true,
          removalMode: 'deleted' as const,
        };
      }

      await this.prisma.$transaction([
        this.prisma.schoolYear.update({
          where: { id: existing.id },
          data: {
            isActive: false,
          },
        }),
        this.prisma.class.updateMany({
          where: {
            schoolYearId: existing.id,
          },
          data: {
            isActive: false,
          },
        }),
      ]);

      await this.auditService.log({
        actor: user,
        schoolId: existing.schoolId,
        entityType: 'SchoolYear',
        entityId: existing.id,
        action: 'ARCHIVE',
        severity: AuditLogSeverity.WARNING,
        summary: `Archived school year ${existing.name} because dependencies exist`,
        targetDisplay: existing.name,
        changesJson: {
          dependencyLabels,
        },
      });

      return {
        success: true,
        removalMode: 'archived' as const,
        reason: `School year was archived because related ${dependencyLabels.join(', ')} still exist`,
      };
    } catch (error) {
      this.handleRemoveError(error);
    }
  }
}
