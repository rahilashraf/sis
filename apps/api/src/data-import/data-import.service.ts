import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogSeverity,
  LibraryItemStatus,
  Prisma,
  StudentGender,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { AuthenticatedUser } from '../common/auth/auth-user';
import { ensureUserHasSchoolAccess } from '../common/access/school-access.util';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DataImportDto,
  DataImportDuplicateStrategy,
  DataImportEntityType,
} from './dto/data-import.dto';

type CsvRow = {
  rowNumber: number;
  values: Record<string, string>;
};

type PreviewRowStatus = 'create' | 'skip' | 'error';

type PreviewRow = {
  rowNumber: number;
  status: PreviewRowStatus;
  identifier: string;
  message: string;
};

type PreviewSummary = {
  totalRows: number;
  createCount: number;
  skipCount: number;
  errorCount: number;
  duplicateCount: number;
};

type UserImportRecord = {
  username: string;
  email: string | null;
  phone: string | null;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  gradeLevelId: string | null;
  studentNumber: string | null;
  oen: string | null;
  gender: StudentGender | null;
};

type ParentImportRecord = UserImportRecord & {
  linkedStudentUsernames: string[];
};

type ClassImportRecord = {
  name: string;
  schoolYearId: string;
  schoolYearName: string;
  gradeLevelId: string;
  gradeLevelName: string;
  subjectOptionId: string;
  subjectOptionName: string;
  isHomeroom: boolean;
  takesAttendance: boolean;
};

type LibraryItemImportRecord = {
  title: string;
  author: string | null;
  isbn: string | null;
  barcode: string | null;
  category: string | null;
  totalCopies: number;
  availableCopies: number;
  status: LibraryItemStatus;
  lostFeeOverride: Prisma.Decimal | null;
};

type PreviewPlan = {
  entityType: DataImportEntityType;
  duplicateStrategy: DataImportDuplicateStrategy;
  schoolId: string;
  rows: PreviewRow[];
  summary: PreviewSummary;
  warnings: string[];
  userRecords?: Array<{ rowNumber: number; data: UserImportRecord }>;
  parentRecords?: Array<{ rowNumber: number; data: ParentImportRecord }>;
  classRecords?: Array<{ rowNumber: number; data: ClassImportRecord }>;
  libraryItemRecords?: Array<{ rowNumber: number; data: LibraryItemImportRecord }>;
};

const BOOLEAN_TRUE_VALUES = new Set(['true', '1', 'yes', 'y']);
const BOOLEAN_FALSE_VALUES = new Set(['false', '0', 'no', 'n', '']);
const ALLOWED_STAFF_IMPORT_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.STAFF,
  UserRole.TEACHER,
  UserRole.SUPPLY_TEACHER,
]);

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeKey(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function buildSummary(rows: PreviewRow[]): PreviewSummary {
  return rows.reduce(
    (summary, row) => {
      summary.totalRows += 1;
      if (row.status === 'create') {
        summary.createCount += 1;
      }
      if (row.status === 'skip') {
        summary.skipCount += 1;
        summary.duplicateCount += 1;
      }
      if (row.status === 'error') {
        summary.errorCount += 1;
      }
      return summary;
    },
    {
      totalRows: 0,
      createCount: 0,
      skipCount: 0,
      errorCount: 0,
      duplicateCount: 0,
    },
  );
}

@Injectable()
export class DataImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async preview(actor: AuthenticatedUser, input: DataImportDto) {
    const plan = await this.buildPlan(actor, input);
    return {
      entityType: plan.entityType,
      duplicateStrategy: plan.duplicateStrategy,
      schoolId: plan.schoolId,
      summary: plan.summary,
      warnings: plan.warnings,
      rows: plan.rows,
    };
  }

  async execute(actor: AuthenticatedUser, input: DataImportDto) {
    const plan = await this.buildPlan(actor, input);

    if (plan.summary.errorCount > 0) {
      throw new BadRequestException(
        'Fix preview errors before running the import',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      if (plan.entityType === DataImportEntityType.STUDENTS) {
        return this.executeUserImport(tx, plan.userRecords ?? [], input.schoolId);
      }

      if (plan.entityType === DataImportEntityType.USERS) {
        return this.executeUserImport(tx, plan.userRecords ?? [], input.schoolId);
      }

      if (plan.entityType === DataImportEntityType.PARENTS) {
        return this.executeParentImport(tx, plan.parentRecords ?? [], input.schoolId);
      }

      if (plan.entityType === DataImportEntityType.CLASSES) {
        return this.executeClassImport(tx, plan.classRecords ?? [], input.schoolId);
      }

      return this.executeLibraryItemImport(
        tx,
        plan.libraryItemRecords ?? [],
        input.schoolId,
      );
    });

    await this.auditService.log({
      actor,
      schoolId: input.schoolId,
      entityType: 'DataImport',
      entityId: `${input.entityType}:${new Date().toISOString()}`,
      action: 'IMPORT',
      severity: AuditLogSeverity.WARNING,
      summary: `Executed ${input.entityType} import`,
      targetDisplay: input.entityType,
      metadataJson: {
        duplicateStrategy: input.duplicateStrategy,
        summary: result,
      },
    });

    return {
      success: true,
      entityType: input.entityType,
      schoolId: input.schoolId,
      summary: {
        ...plan.summary,
        importedCount: result.importedCount,
        skippedCount: plan.summary.skipCount,
      },
      warnings: plan.warnings,
      rollback: 'Automatic rollback is applied if any create step fails during execution.',
    };
  }

  private async buildPlan(
    actor: AuthenticatedUser,
    input: DataImportDto,
  ): Promise<PreviewPlan> {
    ensureUserHasSchoolAccess(actor, input.schoolId);
    await this.ensureSchoolExists(input.schoolId);

    const rows = this.parseCsv(input.csvContent);

    if (rows.length === 0) {
      throw new BadRequestException('CSV does not contain any data rows');
    }

    if (input.entityType === DataImportEntityType.STUDENTS) {
      return this.previewStudents(rows, input);
    }

    if (input.entityType === DataImportEntityType.PARENTS) {
      return this.previewParents(rows, input);
    }

    if (input.entityType === DataImportEntityType.USERS) {
      return this.previewUsers(rows, input);
    }

    if (input.entityType === DataImportEntityType.CLASSES) {
      return this.previewClasses(rows, input);
    }

    return this.previewLibraryItems(rows, input);
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

  private parseCsv(csvContent: string): CsvRow[] {
    const rows: string[][] = [];
    let currentValue = '';
    let currentRow: string[] = [];
    let inQuotes = false;

    for (let index = 0; index < csvContent.length; index += 1) {
      const char = csvContent[index];
      const nextChar = csvContent[index + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentValue += '"';
          index += 1;
          continue;
        }

        inQuotes = !inQuotes;
        continue;
      }

      if (char === ',' && !inQuotes) {
        currentRow.push(currentValue.trim());
        currentValue = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          index += 1;
        }
        currentRow.push(currentValue.trim());
        currentValue = '';
        if (currentRow.some((entry) => entry.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        continue;
      }

      currentValue += char;
    }

    if (currentValue.length > 0 || currentRow.length > 0) {
      currentRow.push(currentValue.trim());
      if (currentRow.some((entry) => entry.length > 0)) {
        rows.push(currentRow);
      }
    }

    if (rows.length < 2) {
      return [];
    }

    const rawHeaders = rows[0];
    const headerKeys = rawHeaders.map(normalizeHeader);
    if (new Set(headerKeys).size !== headerKeys.length) {
      throw new BadRequestException('CSV contains duplicate headers');
    }

    return rows.slice(1).map((row, rowIndex) => {
      const values: Record<string, string> = {};
      for (let columnIndex = 0; columnIndex < rawHeaders.length; columnIndex += 1) {
        values[headerKeys[columnIndex]] = row[columnIndex]?.trim() ?? '';
      }
      return {
        rowNumber: rowIndex + 2,
        values,
      };
    });
  }

  private requireValue(row: CsvRow, header: string) {
    const value = row.values[normalizeHeader(header)] ?? '';
    if (!value.trim()) {
      throw new BadRequestException(`${header} is required`);
    }
    return value.trim();
  }

  private optionalValue(row: CsvRow, header: string) {
    const value = row.values[normalizeHeader(header)] ?? '';
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private parseBoolean(value: string | null, fieldName: string) {
    const normalized = normalizeKey(value);
    if (BOOLEAN_TRUE_VALUES.has(normalized)) {
      return true;
    }
    if (BOOLEAN_FALSE_VALUES.has(normalized)) {
      return false;
    }
    throw new BadRequestException(`${fieldName} must be true or false`);
  }

  private parsePositiveInt(value: string | null, fieldName: string, min = 0) {
    const normalized = value?.trim() ?? '';
    if (!/^\d+$/.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be a whole number`);
    }
    const parsed = Number.parseInt(normalized, 10);
    if (parsed < min) {
      throw new BadRequestException(`${fieldName} must be at least ${min}`);
    }
    return parsed;
  }

  private parseOptionalMoney(value: string | null, fieldName: string) {
    if (!value) {
      return null;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(value)) {
      throw new BadRequestException(
        `${fieldName} must be a non-negative number with at most 2 decimals`,
      );
    }
    return new Prisma.Decimal(value);
  }

  private async previewStudents(rows: CsvRow[], input: DataImportDto): Promise<PreviewPlan> {
    const previewRows: PreviewRow[] = [];
    const warnings: string[] = [];
    const candidateUsernames = new Set<string>();
    const candidateEmails = new Set<string>();
    const candidateStudentNumbers = new Set<string>();
    const inFileUsernames = new Set<string>();
    const inFileEmails = new Set<string>();
    const inFileStudentNumbers = new Set<string>();
    const gradeLevelNames = new Set<string>();
    const parsedRows: Array<{ rowNumber: number; data: UserImportRecord }> = [];

    for (const row of rows) {
      try {
        const username = this.requireValue(row, 'username');
        const email = this.optionalValue(row, 'email');
        const studentNumber = this.optionalValue(row, 'studentNumber');
        const gradeLevelName = this.optionalValue(row, 'gradeLevelName');
        const password = this.requireValue(row, 'password');
        if (password.length < 6) {
          throw new BadRequestException('password must be at least 6 characters');
        }

        const usernameKey = normalizeKey(username);
        if (inFileUsernames.has(usernameKey)) {
          previewRows.push({
            rowNumber: row.rowNumber,
            status: 'error',
            identifier: username,
            message: 'Duplicate username in CSV',
          });
          continue;
        }
        inFileUsernames.add(usernameKey);
        candidateUsernames.add(usernameKey);

        if (email) {
          const emailKey = normalizeKey(email);
          if (inFileEmails.has(emailKey)) {
            previewRows.push({
              rowNumber: row.rowNumber,
              status: 'error',
              identifier: username,
              message: 'Duplicate email in CSV',
            });
            continue;
          }
          inFileEmails.add(emailKey);
          candidateEmails.add(emailKey);
        }

        if (studentNumber) {
          const studentNumberKey = normalizeKey(studentNumber);
          if (inFileStudentNumbers.has(studentNumberKey)) {
            previewRows.push({
              rowNumber: row.rowNumber,
              status: 'error',
              identifier: username,
              message: 'Duplicate student number in CSV',
            });
            continue;
          }
          inFileStudentNumbers.add(studentNumberKey);
          candidateStudentNumbers.add(studentNumberKey);
        }

        if (gradeLevelName) {
          gradeLevelNames.add(normalizeKey(gradeLevelName));
        }

        parsedRows.push({
          rowNumber: row.rowNumber,
          data: {
            username,
            email,
            phone: this.optionalValue(row, 'phone'),
            password,
            firstName: this.requireValue(row, 'firstName'),
            lastName: this.requireValue(row, 'lastName'),
            role: UserRole.STUDENT,
            gradeLevelId: gradeLevelName ?? null,
            studentNumber,
            oen: this.optionalValue(row, 'oen'),
            gender: this.parseOptionalGender(this.optionalValue(row, 'gender')),
          },
        });
      } catch (error) {
        previewRows.push({
          rowNumber: row.rowNumber,
          status: 'error',
          identifier: this.optionalValue(row, 'username') ?? `row-${row.rowNumber}`,
          message: error instanceof Error ? error.message : 'Invalid student row',
        });
      }
    }

    const [existingUsers, existingStudentNumbers, gradeLevels] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          OR: [
            { username: { in: [...candidateUsernames] } },
            ...(candidateEmails.size > 0
              ? [{ email: { in: [...candidateEmails] } }]
              : []),
          ],
        },
        select: { id: true, username: true, email: true },
      }),
      candidateStudentNumbers.size > 0
        ? this.prisma.user.findMany({
            where: {
              schoolId: input.schoolId,
              studentNumber: { in: [...candidateStudentNumbers] },
            },
            select: { id: true, studentNumber: true },
          })
        : Promise.resolve([]),
      this.prisma.gradeLevel.findMany({
        where: { schoolId: input.schoolId },
        select: { id: true, name: true, isActive: true },
      }),
    ]);

    const existingUsernameKeys = new Set(
      existingUsers.map((user) => normalizeKey(user.username)),
    );
    const existingEmailKeys = new Set(
      existingUsers.map((user) => normalizeKey(user.email ?? '')),
    );
    const existingStudentNumberKeys = new Set(
      existingStudentNumbers.map((user) => normalizeKey(user.studentNumber ?? '')),
    );
    const gradeLevelByName = new Map(
      gradeLevels.map((gradeLevel) => [normalizeKey(gradeLevel.name), gradeLevel]),
    );

    for (const parsed of parsedRows) {
      const duplicateMessage = this.resolveUserDuplicateMessage(
        parsed.data,
        existingUsernameKeys,
        existingEmailKeys,
        existingStudentNumberKeys,
      );

      if (duplicateMessage) {
        previewRows.push({
          rowNumber: parsed.rowNumber,
          status:
            input.duplicateStrategy === DataImportDuplicateStrategy.SKIP
              ? 'skip'
              : 'error',
          identifier: parsed.data.username,
          message: duplicateMessage,
        });
        continue;
      }

      let resolvedGradeLevelId: string | null = null;
      if (parsed.data.gradeLevelId) {
        const gradeLevel = gradeLevelByName.get(normalizeKey(parsed.data.gradeLevelId));
        if (!gradeLevel) {
          previewRows.push({
            rowNumber: parsed.rowNumber,
            status: 'error',
            identifier: parsed.data.username,
            message: `Unknown grade level ${parsed.data.gradeLevelId}`,
          });
          continue;
        }
        resolvedGradeLevelId = gradeLevel.id;
        if (!gradeLevel.isActive) {
          warnings.push(
            `Grade level ${gradeLevel.name} is inactive but will still be used during import.`,
          );
        }
      }

      parsed.data.gradeLevelId = resolvedGradeLevelId;
      previewRows.push({
        rowNumber: parsed.rowNumber,
        status: 'create',
        identifier: parsed.data.username,
        message: 'Ready to import student',
      });
    }

    return {
      entityType: input.entityType,
      duplicateStrategy: input.duplicateStrategy,
      schoolId: input.schoolId,
      rows: previewRows.sort((left, right) => left.rowNumber - right.rowNumber),
      summary: buildSummary(previewRows),
      warnings: [...new Set(warnings)],
      userRecords: parsedRows.filter((parsed) =>
        previewRows.some(
          (row) => row.rowNumber === parsed.rowNumber && row.status === 'create',
        ),
      ),
    };
  }

  private async previewParents(rows: CsvRow[], input: DataImportDto): Promise<PreviewPlan> {
    const basePlan = await this.previewUserLikeRows(
      rows,
      input,
      UserRole.PARENT,
      'linkedStudentUsernames',
    );

    const linkedStudentUsernames = new Set<string>();
    const parentRecords: Array<{ rowNumber: number; data: ParentImportRecord }> = [];

    for (const record of basePlan.records) {
      const linkedStudentUsernamesValue = this.splitList(
        this.optionalValueByRow(rows, record.rowNumber, 'linkedStudentUsernames'),
      );
      linkedStudentUsernamesValue.forEach((username) =>
        linkedStudentUsernames.add(normalizeKey(username)),
      );
      parentRecords.push({
        rowNumber: record.rowNumber,
        data: {
          ...record.data,
          linkedStudentUsernames: linkedStudentUsernamesValue,
        },
      });
    }

    const linkedStudents = linkedStudentUsernames.size
      ? await this.prisma.user.findMany({
          where: {
            role: UserRole.STUDENT,
            username: { in: [...linkedStudentUsernames] },
            OR: [
              { schoolId: input.schoolId },
              {
                memberships: {
                  some: {
                    schoolId: input.schoolId,
                    isActive: true,
                  },
                },
              },
            ],
          },
          select: { id: true, username: true },
        })
      : [];

    const linkedStudentByUsername = new Map(
      linkedStudents.map((student) => [normalizeKey(student.username), student]),
    );

    const previewRows = basePlan.rows.map((row) => ({ ...row }));
    const warnings = [...basePlan.warnings];
    const executableRecords: Array<{ rowNumber: number; data: ParentImportRecord }> = [];

    for (const record of parentRecords) {
      const targetRow = previewRows.find((row) => row.rowNumber === record.rowNumber);
      if (!targetRow || targetRow.status !== 'create') {
        continue;
      }

      const missingStudentUsernames = record.data.linkedStudentUsernames.filter(
        (username) => !linkedStudentByUsername.has(normalizeKey(username)),
      );
      if (missingStudentUsernames.length > 0) {
        targetRow.status = 'error';
        targetRow.message = `Unknown linked students: ${missingStudentUsernames.join(', ')}`;
        continue;
      }

      if (record.data.linkedStudentUsernames.length === 0) {
        warnings.push(
          'Parent rows without linkedStudentUsernames will import the parent account only.',
        );
      }

      executableRecords.push(record);
    }

    return {
      entityType: input.entityType,
      duplicateStrategy: input.duplicateStrategy,
      schoolId: input.schoolId,
      rows: previewRows,
      summary: buildSummary(previewRows),
      warnings: [...new Set(warnings)],
      parentRecords: executableRecords,
    };
  }

  private async previewUsers(rows: CsvRow[], input: DataImportDto): Promise<PreviewPlan> {
    const basePlan = await this.previewUserLikeRows(rows, input, null, null);
    const previewRows = basePlan.rows.map((row) => ({ ...row }));
    const executableRecords: Array<{ rowNumber: number; data: UserImportRecord }> = [];

    for (const record of basePlan.records) {
      const targetRow = previewRows.find((row) => row.rowNumber === record.rowNumber);
      if (!targetRow || targetRow.status !== 'create') {
        continue;
      }

      if (!ALLOWED_STAFF_IMPORT_ROLES.has(record.data.role)) {
        targetRow.status = 'error';
        targetRow.message =
          'users import only supports ADMIN, STAFF, TEACHER, or SUPPLY_TEACHER roles';
        continue;
      }

      executableRecords.push(record);
    }

    return {
      entityType: input.entityType,
      duplicateStrategy: input.duplicateStrategy,
      schoolId: input.schoolId,
      rows: previewRows,
      summary: buildSummary(previewRows),
      warnings: basePlan.warnings,
      userRecords: executableRecords,
    };
  }

  private async previewUserLikeRows(
    rows: CsvRow[],
    input: DataImportDto,
    forcedRole: UserRole | null,
    ignoredHeader: string | null,
  ) {
    const previewRows: PreviewRow[] = [];
    const warnings: string[] = [];
    const parsedRows: Array<{ rowNumber: number; data: UserImportRecord }> = [];
    const inFileUsernames = new Set<string>();
    const inFileEmails = new Set<string>();
    const candidateUsernames = new Set<string>();
    const candidateEmails = new Set<string>();

    for (const row of rows) {
      try {
        const username = this.requireValue(row, 'username');
        const email = this.optionalValue(row, 'email');
        const password = this.requireValue(row, 'password');
        const role = forcedRole ?? this.parseRole(this.requireValue(row, 'role'));

        if (password.length < 6) {
          throw new BadRequestException('password must be at least 6 characters');
        }

        const usernameKey = normalizeKey(username);
        if (inFileUsernames.has(usernameKey)) {
          previewRows.push({
            rowNumber: row.rowNumber,
            status: 'error',
            identifier: username,
            message: 'Duplicate username in CSV',
          });
          continue;
        }
        inFileUsernames.add(usernameKey);
        candidateUsernames.add(usernameKey);

        if (email) {
          const emailKey = normalizeKey(email);
          if (inFileEmails.has(emailKey)) {
            previewRows.push({
              rowNumber: row.rowNumber,
              status: 'error',
              identifier: username,
              message: 'Duplicate email in CSV',
            });
            continue;
          }
          inFileEmails.add(emailKey);
          candidateEmails.add(emailKey);
        }

        parsedRows.push({
          rowNumber: row.rowNumber,
          data: {
            username,
            email,
            phone: this.optionalValue(row, 'phone'),
            password,
            firstName: this.requireValue(row, 'firstName'),
            lastName: this.requireValue(row, 'lastName'),
            role,
            gradeLevelId: null,
            studentNumber: null,
            oen: null,
            gender: null,
          },
        });
      } catch (error) {
        previewRows.push({
          rowNumber: row.rowNumber,
          status: 'error',
          identifier: this.optionalValue(row, 'username') ?? `row-${row.rowNumber}`,
          message: error instanceof Error ? error.message : 'Invalid row',
        });
      }
    }

    const existingUsers = await this.prisma.user.findMany({
      where: {
        OR: [
          { username: { in: [...candidateUsernames] } },
          ...(candidateEmails.size > 0
            ? [{ email: { in: [...candidateEmails] } }]
            : []),
        ],
      },
      select: { id: true, username: true, email: true },
    });

    const existingUsernameKeys = new Set(
      existingUsers.map((user) => normalizeKey(user.username)),
    );
    const existingEmailKeys = new Set(
      existingUsers.map((user) => normalizeKey(user.email ?? '')),
    );

    for (const parsed of parsedRows) {
      const duplicateMessage = this.resolveUserDuplicateMessage(
        parsed.data,
        existingUsernameKeys,
        existingEmailKeys,
        new Set<string>(),
      );
      if (duplicateMessage) {
        previewRows.push({
          rowNumber: parsed.rowNumber,
          status:
            input.duplicateStrategy === DataImportDuplicateStrategy.SKIP
              ? 'skip'
              : 'error',
          identifier: parsed.data.username,
          message: duplicateMessage,
        });
        continue;
      }

      previewRows.push({
        rowNumber: parsed.rowNumber,
        status: 'create',
        identifier: parsed.data.username,
        message: 'Ready to import user',
      });
    }

    return {
      rows: previewRows.sort((left, right) => left.rowNumber - right.rowNumber),
      summary: buildSummary(previewRows),
      warnings: [...new Set(warnings)],
      records: parsedRows.filter((parsed) =>
        previewRows.some(
          (row) => row.rowNumber === parsed.rowNumber && row.status === 'create',
        ),
      ),
      ignoredHeader,
    };
  }

  private async previewClasses(rows: CsvRow[], input: DataImportDto): Promise<PreviewPlan> {
    const previewRows: PreviewRow[] = [];
    const warnings: string[] = [];
    const schoolYearNames = new Set<string>();
    const gradeLevelNames = new Set<string>();
    const subjectOptionNames = new Set<string>();
    const inFileKeys = new Set<string>();
    const parsedRows: Array<{ rowNumber: number; raw: Record<string, string> }> = [];

    for (const row of rows) {
      try {
        const name = this.requireValue(row, 'name');
        const schoolYearName = this.requireValue(row, 'schoolYearName');
        const gradeLevelName = this.requireValue(row, 'gradeLevelName');
        const subjectOptionName = this.requireValue(row, 'subjectOptionName');
        const key = [name, schoolYearName, gradeLevelName, subjectOptionName]
          .map(normalizeKey)
          .join('::');
        if (inFileKeys.has(key)) {
          previewRows.push({
            rowNumber: row.rowNumber,
            status: 'error',
            identifier: name,
            message: 'Duplicate class definition in CSV',
          });
          continue;
        }
        inFileKeys.add(key);
        schoolYearNames.add(normalizeKey(schoolYearName));
        gradeLevelNames.add(normalizeKey(gradeLevelName));
        subjectOptionNames.add(normalizeKey(subjectOptionName));
        parsedRows.push({ rowNumber: row.rowNumber, raw: row.values });
      } catch (error) {
        previewRows.push({
          rowNumber: row.rowNumber,
          status: 'error',
          identifier: this.optionalValue(row, 'name') ?? `row-${row.rowNumber}`,
          message: error instanceof Error ? error.message : 'Invalid class row',
        });
      }
    }

    const [schoolYears, gradeLevels, subjectOptions, existingClasses] = await Promise.all([
      this.prisma.schoolYear.findMany({
        where: { schoolId: input.schoolId },
        select: { id: true, name: true },
      }),
      this.prisma.gradeLevel.findMany({
        where: { schoolId: input.schoolId },
        select: { id: true, name: true, isActive: true },
      }),
      this.prisma.enrollmentSubjectOption.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.class.findMany({
        where: { schoolId: input.schoolId },
        select: {
          schoolYearId: true,
          gradeLevelId: true,
          subjectOptionId: true,
          name: true,
        },
      }),
    ]);

    const schoolYearByName = new Map(
      schoolYears.map((schoolYear) => [normalizeKey(schoolYear.name), schoolYear]),
    );
    const gradeLevelByName = new Map(
      gradeLevels.map((gradeLevel) => [normalizeKey(gradeLevel.name), gradeLevel]),
    );
    const subjectOptionByName = new Map(
      subjectOptions.map((option) => [normalizeKey(option.name), option]),
    );
    const existingKeys = new Set(
      existingClasses.map((schoolClass) =>
        [
          normalizeKey(schoolClass.name),
          schoolClass.schoolYearId,
          schoolClass.gradeLevelId ?? 'none',
          schoolClass.subjectOptionId ?? 'none',
        ].join('::'),
      ),
    );

    const classRecords: Array<{ rowNumber: number; data: ClassImportRecord }> = [];

    for (const parsed of parsedRows) {
      const row = rows.find((entry) => entry.rowNumber === parsed.rowNumber);
      if (!row) {
        continue;
      }

      const name = this.requireValue(row, 'name');
      const schoolYearName = this.requireValue(row, 'schoolYearName');
      const gradeLevelName = this.requireValue(row, 'gradeLevelName');
      const subjectOptionName = this.requireValue(row, 'subjectOptionName');
      const schoolYear = schoolYearByName.get(normalizeKey(schoolYearName));
      const gradeLevel = gradeLevelByName.get(normalizeKey(gradeLevelName));
      const subjectOption = subjectOptionByName.get(normalizeKey(subjectOptionName));

      if (!schoolYear || !gradeLevel || !subjectOption) {
        previewRows.push({
          rowNumber: parsed.rowNumber,
          status: 'error',
          identifier: name,
          message: [
            !schoolYear ? `Unknown school year ${schoolYearName}` : null,
            !gradeLevel ? `Unknown grade level ${gradeLevelName}` : null,
            !subjectOption ? `Unknown subject option ${subjectOptionName}` : null,
          ]
            .filter(Boolean)
            .join('; '),
        });
        continue;
      }

      if (!gradeLevel.isActive) {
        warnings.push(
          `Inactive grade level ${gradeLevel.name} is referenced by class import rows.`,
        );
      }

      const key = [
        normalizeKey(name),
        schoolYear.id,
        gradeLevel.id,
        subjectOption.id,
      ].join('::');

      if (existingKeys.has(key)) {
        previewRows.push({
          rowNumber: parsed.rowNumber,
          status:
            input.duplicateStrategy === DataImportDuplicateStrategy.SKIP
              ? 'skip'
              : 'error',
          identifier: name,
          message: 'Matching class already exists',
        });
        continue;
      }

      const record: ClassImportRecord = {
        name,
        schoolYearId: schoolYear.id,
        schoolYearName: schoolYear.name,
        gradeLevelId: gradeLevel.id,
        gradeLevelName: gradeLevel.name,
        subjectOptionId: subjectOption.id,
        subjectOptionName: subjectOption.name,
        isHomeroom: this.parseBoolean(
          this.optionalValue(row, 'isHomeroom'),
          'isHomeroom',
        ),
        takesAttendance: this.parseBoolean(
          this.optionalValue(row, 'takesAttendance') ?? 'true',
          'takesAttendance',
        ),
      };
      classRecords.push({ rowNumber: parsed.rowNumber, data: record });
      previewRows.push({
        rowNumber: parsed.rowNumber,
        status: 'create',
        identifier: name,
        message: 'Ready to import class',
      });
    }

    return {
      entityType: input.entityType,
      duplicateStrategy: input.duplicateStrategy,
      schoolId: input.schoolId,
      rows: previewRows.sort((left, right) => left.rowNumber - right.rowNumber),
      summary: buildSummary(previewRows),
      warnings: [...new Set(warnings)],
      classRecords,
    };
  }

  private async previewLibraryItems(rows: CsvRow[], input: DataImportDto): Promise<PreviewPlan> {
    const previewRows: PreviewRow[] = [];
    const warnings: string[] = [];
    const inFileKeys = new Set<string>();
    const candidateBarcodes = new Set<string>();
    const candidateIsbns = new Set<string>();
    const candidateTitles = new Set<string>();
    const parsedRows: Array<{ rowNumber: number; data: LibraryItemImportRecord }> = [];

    for (const row of rows) {
      try {
        const title = this.requireValue(row, 'title');
        const author = this.optionalValue(row, 'author');
        const isbn = this.optionalValue(row, 'isbn');
        const barcode = this.optionalValue(row, 'barcode');
        const dedupeKey = this.buildLibraryDuplicateKey(title, author, isbn, barcode);
        if (inFileKeys.has(dedupeKey)) {
          previewRows.push({
            rowNumber: row.rowNumber,
            status: 'error',
            identifier: title,
            message: 'Duplicate library item in CSV',
          });
          continue;
        }
        inFileKeys.add(dedupeKey);
        if (barcode) {
          candidateBarcodes.add(normalizeKey(barcode));
        }
        if (isbn) {
          candidateIsbns.add(normalizeKey(isbn));
        }
        candidateTitles.add(normalizeKey(title));

        const totalCopies = this.parsePositiveInt(
          this.optionalValue(row, 'totalCopies') ?? '1',
          'totalCopies',
          1,
        );
        const availableCopies = this.parsePositiveInt(
          this.optionalValue(row, 'availableCopies') ?? String(totalCopies),
          'availableCopies',
          0,
        );
        if (availableCopies > totalCopies) {
          throw new BadRequestException(
            'availableCopies cannot exceed totalCopies',
          );
        }

        const status = this.parseLibraryItemStatus(
          this.optionalValue(row, 'status'),
          availableCopies,
        );

        parsedRows.push({
          rowNumber: row.rowNumber,
          data: {
            title,
            author,
            isbn,
            barcode,
            category: this.optionalValue(row, 'category'),
            totalCopies,
            availableCopies,
            status,
            lostFeeOverride: this.parseOptionalMoney(
              this.optionalValue(row, 'lostFeeOverride'),
              'lostFeeOverride',
            ),
          },
        });
      } catch (error) {
        previewRows.push({
          rowNumber: row.rowNumber,
          status: 'error',
          identifier: this.optionalValue(row, 'title') ?? `row-${row.rowNumber}`,
          message:
            error instanceof Error ? error.message : 'Invalid library item row',
        });
      }
    }

    const existingItems = await this.prisma.libraryItem.findMany({
      where: { schoolId: input.schoolId },
      select: {
        title: true,
        author: true,
        isbn: true,
        barcode: true,
      },
    });
    const existingKeys = new Set(
      existingItems.map((item) =>
        this.buildLibraryDuplicateKey(item.title, item.author, item.isbn, item.barcode),
      ),
    );

    for (const parsed of parsedRows) {
      const itemKey = this.buildLibraryDuplicateKey(
        parsed.data.title,
        parsed.data.author,
        parsed.data.isbn,
        parsed.data.barcode,
      );
      if (existingKeys.has(itemKey)) {
        previewRows.push({
          rowNumber: parsed.rowNumber,
          status:
            input.duplicateStrategy === DataImportDuplicateStrategy.SKIP
              ? 'skip'
              : 'error',
          identifier: parsed.data.title,
          message: 'Matching library item already exists',
        });
        continue;
      }

      if (!parsed.data.barcode && !parsed.data.isbn) {
        warnings.push(
          'Library items without barcode or ISBN use title/author duplicate matching only.',
        );
      }

      previewRows.push({
        rowNumber: parsed.rowNumber,
        status: 'create',
        identifier: parsed.data.title,
        message: 'Ready to import library item',
      });
    }

    return {
      entityType: input.entityType,
      duplicateStrategy: input.duplicateStrategy,
      schoolId: input.schoolId,
      rows: previewRows.sort((left, right) => left.rowNumber - right.rowNumber),
      summary: buildSummary(previewRows),
      warnings: [...new Set(warnings)],
      libraryItemRecords: parsedRows.filter((parsed) =>
        previewRows.some(
          (row) => row.rowNumber === parsed.rowNumber && row.status === 'create',
        ),
      ),
    };
  }

  private resolveUserDuplicateMessage(
    record: UserImportRecord,
    existingUsernameKeys: Set<string>,
    existingEmailKeys: Set<string>,
    existingStudentNumberKeys: Set<string>,
  ) {
    if (existingUsernameKeys.has(normalizeKey(record.username))) {
      return 'Username already exists';
    }
    if (record.email && existingEmailKeys.has(normalizeKey(record.email))) {
      return 'Email already exists';
    }
    if (
      record.studentNumber &&
      existingStudentNumberKeys.has(normalizeKey(record.studentNumber))
    ) {
      return 'Student number already exists in this school';
    }
    return null;
  }

  private parseOptionalGender(value: string | null) {
    if (!value) {
      return null;
    }
    const normalized = normalizeKey(value);
    if (normalized === 'male' || normalized === 'm') {
      return StudentGender.MALE;
    }
    if (normalized === 'female' || normalized === 'f') {
      return StudentGender.FEMALE;
    }
    throw new BadRequestException('gender must be MALE or FEMALE');
  }

  private parseRole(value: string) {
    const normalized = value.trim().toUpperCase();
    if (!Object.values(UserRole).includes(normalized as UserRole)) {
      throw new BadRequestException('role is invalid');
    }
    return normalized as UserRole;
  }

  private parseLibraryItemStatus(value: string | null, availableCopies: number) {
    if (!value) {
      return availableCopies > 0
        ? LibraryItemStatus.AVAILABLE
        : LibraryItemStatus.CHECKED_OUT;
    }
    const normalized = value.trim().toUpperCase();
    if (!Object.values(LibraryItemStatus).includes(normalized as LibraryItemStatus)) {
      throw new BadRequestException('status is invalid');
    }
    return normalized as LibraryItemStatus;
  }

  private buildLibraryDuplicateKey(
    title: string,
    author: string | null,
    isbn: string | null,
    barcode: string | null,
  ) {
    if (barcode) {
      return `barcode::${normalizeKey(barcode)}`;
    }
    if (isbn) {
      return `isbn::${normalizeKey(isbn)}`;
    }
    return `titleauthor::${normalizeKey(title)}::${normalizeKey(author)}`;
  }

  private splitList(value: string | null) {
    if (!value) {
      return [];
    }
    return value
      .split(/[;|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private optionalValueByRow(rows: CsvRow[], rowNumber: number, header: string) {
    const row = rows.find((entry) => entry.rowNumber === rowNumber);
    return row ? this.optionalValue(row, header) : null;
  }

  private async executeUserImport(
    tx: Prisma.TransactionClient,
    records: Array<{ rowNumber: number; data: UserImportRecord }>,
    schoolId: string,
  ) {
    let importedCount = 0;

    for (const record of records) {
      const passwordHash = await bcrypt.hash(record.data.password, 10);
      await tx.user.create({
        data: {
          username: record.data.username,
          email: record.data.email,
          phone: record.data.phone,
          passwordHash,
          firstName: record.data.firstName,
          lastName: record.data.lastName,
          role: record.data.role,
          schoolId,
          gradeLevelId: record.data.gradeLevelId,
          studentNumber: record.data.studentNumber,
          oen: record.data.oen,
          gender: record.data.gender,
          memberships: {
            createMany: {
              data: [{ schoolId }],
            },
          },
        },
      });
      importedCount += 1;
    }

    return { importedCount };
  }

  private async executeParentImport(
    tx: Prisma.TransactionClient,
    records: Array<{ rowNumber: number; data: ParentImportRecord }>,
    schoolId: string,
  ) {
    let importedCount = 0;

    for (const record of records) {
      const passwordHash = await bcrypt.hash(record.data.password, 10);
      const createdParent = await tx.user.create({
        data: {
          username: record.data.username,
          email: record.data.email,
          phone: record.data.phone,
          passwordHash,
          firstName: record.data.firstName,
          lastName: record.data.lastName,
          role: UserRole.PARENT,
          schoolId,
          memberships: {
            createMany: {
              data: [{ schoolId }],
            },
          },
        },
        select: { id: true },
      });

      if (record.data.linkedStudentUsernames.length > 0) {
        const linkedStudents = await tx.user.findMany({
          where: {
            username: { in: record.data.linkedStudentUsernames },
            role: UserRole.STUDENT,
          },
          select: { id: true },
        });
        for (const student of linkedStudents) {
          await tx.studentParentLink.create({
            data: {
              parentId: createdParent.id,
              studentId: student.id,
            },
          });
        }
      }

      importedCount += 1;
    }

    return { importedCount };
  }

  private async executeClassImport(
    tx: Prisma.TransactionClient,
    records: Array<{ rowNumber: number; data: ClassImportRecord }>,
    schoolId: string,
  ) {
    let importedCount = 0;

    for (const record of records) {
      await tx.class.create({
        data: {
          schoolId,
          schoolYearId: record.data.schoolYearId,
          gradeLevelId: record.data.gradeLevelId,
          subjectOptionId: record.data.subjectOptionId,
          name: record.data.name,
          subject: record.data.subjectOptionName,
          isHomeroom: record.data.isHomeroom,
          takesAttendance: record.data.takesAttendance,
        },
      });
      importedCount += 1;
    }

    return { importedCount };
  }

  private async executeLibraryItemImport(
    tx: Prisma.TransactionClient,
    records: Array<{ rowNumber: number; data: LibraryItemImportRecord }>,
    schoolId: string,
  ) {
    let importedCount = 0;

    for (const record of records) {
      await tx.libraryItem.create({
        data: {
          schoolId,
          title: record.data.title,
          author: record.data.author,
          isbn: record.data.isbn,
          barcode: record.data.barcode,
          category: record.data.category,
          totalCopies: record.data.totalCopies,
          availableCopies: record.data.availableCopies,
          status: record.data.status,
          lostFeeOverride: record.data.lostFeeOverride,
        },
      });
      importedCount += 1;
    }

    return { importedCount };
  }
}
