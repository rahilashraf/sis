import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogSeverity,
  Prisma,
  StudentDocumentVisibility,
  TeacherClassAssignmentType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import { getAccessibleSchoolIds, isBypassRole } from '../common/access/school-access.util';
import {
  getAccessibleSchoolIdsWithLegacyFallback,
  getPrimarySchoolIdWithLegacyFallback,
} from '../common/access/school-membership.util';
import { AuditService } from '../audit/audit.service';

const staffDocumentSelect = Prisma.validator<Prisma.StudentDocumentSelect>()({
  id: true,
  studentId: true,
  schoolId: true,
  type: true,
  visibility: true,
  label: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  storagePath: true,
  uploadedByUserId: true,
  isActive: true,
  archivedAt: true,
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

const portalDocumentSelect = Prisma.validator<Prisma.StudentDocumentSelect>()({
  id: true,
  studentId: true,
  schoolId: true,
  type: true,
  visibility: true,
  label: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  uploadedByUserId: true,
  isActive: true,
  archivedAt: true,
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

type StaffDocRecord = Prisma.StudentDocumentGetPayload<{ select: typeof staffDocumentSelect }>;
type PortalDocRecord = Prisma.StudentDocumentGetPayload<{ select: typeof portalDocumentSelect }>;

@Injectable()
export class StudentDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private isTeacherLike(role: UserRole) {
    return role === UserRole.TEACHER || role === UserRole.SUPPLY_TEACHER;
  }

  private buildActiveSupplyAssignmentWindowWhere(now: Date) {
    return {
      assignmentType: TeacherClassAssignmentType.SUPPLY,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    } satisfies Prisma.TeacherClassAssignmentWhereInput;
  }

  private async ensureTeacherCanAccessStudent(
    actor: AuthenticatedUser,
    studentId: string,
  ) {
    const now = new Date();
    const assignment = await this.prisma.teacherClassAssignment.findFirst({
      where: {
        teacherId: actor.id,
        class: {
          students: {
            some: {
              studentId,
            },
          },
        },
        ...(actor.role === UserRole.SUPPLY_TEACHER
          ? {
              OR: [
                { assignmentType: TeacherClassAssignmentType.REGULAR },
                this.buildActiveSupplyAssignmentWindowWhere(now),
              ],
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (!assignment) {
      throw new ForbiddenException('You do not have student access');
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

  private async ensureActorCanAccessStudent(
    actor: AuthenticatedUser,
    studentId: string,
    student: Awaited<ReturnType<StudentDocumentsService['getStudentOrThrow']>>,
  ) {
    if (isBypassRole(actor.role)) {
      return;
    }

    if (actor.role === UserRole.STUDENT) {
      if (actor.id !== studentId) {
        throw new ForbiddenException('You do not have student access');
      }

      return;
    }

    if (actor.role === UserRole.PARENT) {
      const link = await this.prisma.studentParentLink.findUnique({
        where: {
          parentId_studentId: {
            parentId: actor.id,
            studentId,
          },
        },
        select: { id: true },
      });

      if (!link) {
        throw new ForbiddenException('You do not have student access');
      }

      return;
    }

    if (this.isTeacherLike(actor.role)) {
      await this.ensureTeacherCanAccessStudent(actor, studentId);
      return;
    }

    const accessibleSchoolIds = new Set(getAccessibleSchoolIds(actor));
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

  async list(actor: AuthenticatedUser, studentId: string) {
    const student = await this.getStudentOrThrow(studentId);
    await this.ensureActorCanAccessStudent(actor, studentId, student);

    const select =
      actor.role === UserRole.PARENT || actor.role === UserRole.STUDENT
        ? portalDocumentSelect
        : staffDocumentSelect;

    return this.prisma.studentDocument.findMany({
      where: {
        studentId,
        ...(actor.role === UserRole.PARENT || actor.role === UserRole.STUDENT
          ? {
              isActive: true,
              visibility: StudentDocumentVisibility.PARENT_PORTAL,
            }
          : {}),
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      select,
    });
  }

  async create(
    actor: AuthenticatedUser,
    studentId: string,
    input: {
      type: Prisma.StudentDocumentCreateInput['type'];
      visibility?: StudentDocumentVisibility | null;
      label?: string | null;
      fileName: string;
      mimeType: string;
      fileSize: number;
      storagePath: string;
    },
  ) {
    const student = await this.getStudentOrThrow(studentId);
    await this.ensureActorCanAccessStudent(actor, studentId, student);

    if (actor.role === UserRole.PARENT || actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('You do not have document access');
    }

    if (!input.fileName || !input.storagePath) {
      throw new BadRequestException('Invalid document upload');
    }

    const schoolId = getPrimarySchoolIdWithLegacyFallback({
      memberships: student.memberships,
      legacySchoolId: student.schoolId,
    });

    return this.prisma.studentDocument.create({
      data: {
        student: { connect: { id: studentId } },
        school: schoolId ? { connect: { id: schoolId } } : undefined,
        type: input.type,
        visibility: input.visibility ?? StudentDocumentVisibility.STAFF_ONLY,
        label: input.label ?? null,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        storagePath: input.storagePath,
        uploadedBy: { connect: { id: actor.id } },
        isActive: true,
      },
      select: staffDocumentSelect,
    });
  }

  private async getDocumentOrThrow(studentId: string, docId: string): Promise<StaffDocRecord> {
    const doc = await this.prisma.studentDocument.findUnique({
      where: { id: docId },
      select: staffDocumentSelect,
    });

    if (!doc || doc.studentId !== studentId) {
      throw new NotFoundException('Document not found');
    }

    return doc;
  }

  async archive(actor: AuthenticatedUser, studentId: string, docId: string) {
    const student = await this.getStudentOrThrow(studentId);
    await this.ensureActorCanAccessStudent(actor, studentId, student);

    if (actor.role === UserRole.PARENT || actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('You do not have document access');
    }

    const doc = await this.getDocumentOrThrow(studentId, docId);
    if (!doc.isActive) {
      return doc;
    }

    return this.prisma.studentDocument.update({
      where: { id: docId },
      data: { isActive: false, archivedAt: new Date() },
      select: staffDocumentSelect,
    });
  }

  async remove(actor: AuthenticatedUser, studentId: string, docId: string) {
    const student = await this.getStudentOrThrow(studentId);
    await this.ensureActorCanAccessStudent(actor, studentId, student);

    if (actor.role === UserRole.PARENT || actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('You do not have document access');
    }

    const doc = await this.getDocumentOrThrow(studentId, docId);
    await this.prisma.studentDocument.delete({ where: { id: docId } });

    await this.auditService.log({
      actor,
      schoolId: doc.schoolId,
      entityType: 'StudentDocument',
      entityId: doc.id,
      action: 'DELETE',
      severity: AuditLogSeverity.WARNING,
      summary: `Deleted student document ${doc.fileName}`,
      targetDisplay: doc.fileName,
    });

    return { success: true as const, storagePath: doc.storagePath };
  }

  async getDownload(actor: AuthenticatedUser, studentId: string, docId: string) {
    const student = await this.getStudentOrThrow(studentId);
    await this.ensureActorCanAccessStudent(actor, studentId, student);

    if (actor.role === UserRole.PARENT || actor.role === UserRole.STUDENT) {
      const doc = await this.prisma.studentDocument.findUnique({
        where: { id: docId },
        select: portalDocumentSelect,
      });

      if (
        !doc ||
        doc.studentId !== studentId ||
        !doc.isActive ||
        doc.visibility !== StudentDocumentVisibility.PARENT_PORTAL
      ) {
        throw new NotFoundException('Document not found');
      }

      await this.auditService.log({
        actor,
        schoolId: doc.schoolId,
        entityType: 'StudentDocument',
        entityId: doc.id,
        action: 'DOWNLOAD',
        severity: AuditLogSeverity.INFO,
        summary: `Downloaded student document ${doc.fileName}`,
        targetDisplay: doc.fileName,
      });

      return doc as PortalDocRecord;
    }

    const doc = await this.getDocumentOrThrow(studentId, docId);
    await this.auditService.log({
      actor,
      schoolId: doc.schoolId,
      entityType: 'StudentDocument',
      entityId: doc.id,
      action: 'DOWNLOAD',
      severity: AuditLogSeverity.INFO,
      summary: `Downloaded student document ${doc.fileName}`,
      targetDisplay: doc.fileName,
    });

    return doc;
  }
}
