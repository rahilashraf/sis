import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

console.log('seed file started');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const PASSWORDS = {
  owner: 'owner123',
  admin: 'admin123',
  teacher: 'teacher123',
  parent: 'parent123',
  student: 'student123',
};

async function hash(password: string) {
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log('calling main()');
  console.log('🌱 Seeding SIS database...');

  const schoolName = 'IOK Islamic School';
  const schoolYearName = '2025-2026';

  const [
    ownerPasswordHash,
    adminPasswordHash,
    teacherPasswordHash,
    parentPasswordHash,
    studentPasswordHash,
  ] = await Promise.all([
    hash(PASSWORDS.owner),
    hash(PASSWORDS.admin),
    hash(PASSWORDS.teacher),
    hash(PASSWORDS.parent),
    hash(PASSWORDS.student),
  ]);

  // --------------------------------------------------
  // School
  // --------------------------------------------------
  let school = await prisma.school.findFirst({
    where: { name: schoolName },
  });

  if (!school) {
    school = await prisma.school.create({
      data: {
        name: schoolName,
        isActive: true,
      },
    });
  }

  if (!school) {
    throw new Error('Failed to create or load school');
  }

  const schoolId = school.id;

  // --------------------------------------------------
  // School Year
  // --------------------------------------------------
  let schoolYear = await prisma.schoolYear.findFirst({
    where: {
      schoolId,
      name: schoolYearName,
    },
  });

  if (!schoolYear) {
    schoolYear = await prisma.schoolYear.create({
      data: {
        name: schoolYearName,
        schoolId,
        startDate: new Date('2025-09-01T00:00:00.000Z'),
        endDate: new Date('2026-06-30T23:59:59.999Z'),
        isActive: true,
      },
    });
  }

  if (!schoolYear) {
    throw new Error('Failed to create or load school year');
  }

  // --------------------------------------------------
  // Grade Levels
  // --------------------------------------------------
  const gradeLevels = [
    { name: 'JK', sortOrder: 1 },
    { name: 'SK', sortOrder: 2 },
    { name: 'Grade 1', sortOrder: 3 },
    { name: 'Grade 2', sortOrder: 4 },
    { name: 'Grade 3', sortOrder: 5 },
    { name: 'Grade 4', sortOrder: 6 },
    { name: 'Grade 5', sortOrder: 7 },
    { name: 'Grade 6', sortOrder: 8 },
    { name: 'Grade 7', sortOrder: 9 },
    { name: 'Grade 8', sortOrder: 10 },
  ];

  for (const level of gradeLevels) {
    const existing = await prisma.gradeLevel.findFirst({
      where: {
        schoolId,
        name: level.name,
      },
    });

    if (!existing) {
      await prisma.gradeLevel.create({
        data: {
          schoolId,
          name: level.name,
          sortOrder: level.sortOrder,
          isActive: true,
        },
      });
    }
  }

  const grade1 = await prisma.gradeLevel.findFirst({
    where: {
      schoolId,
      name: 'Grade 1',
    },
  });

  // --------------------------------------------------
  // Assessment Types (global defaults)
  // --------------------------------------------------
  const assessmentTypes = [
    { id: 'assessment_type_quiz', key: 'QUIZ', name: 'Quiz', sortOrder: 10 },
    { id: 'assessment_type_test', key: 'TEST', name: 'Test', sortOrder: 20 },
    {
      id: 'assessment_type_assignment',
      key: 'ASSIGNMENT',
      name: 'Assignment',
      sortOrder: 30,
    },
    { id: 'assessment_type_project', key: 'PROJECT', name: 'Project', sortOrder: 40 },
    {
      id: 'assessment_type_participation',
      key: 'PARTICIPATION',
      name: 'Participation',
      sortOrder: 50,
    },
  ];

  for (const assessmentType of assessmentTypes) {
    await prisma.assessmentType.upsert({
      where: { key: assessmentType.key },
      create: {
        id: assessmentType.id,
        key: assessmentType.key,
        name: assessmentType.name,
        sortOrder: assessmentType.sortOrder,
        isActive: true,
        schoolId: null,
      },
      update: {
        name: assessmentType.name,
        sortOrder: assessmentType.sortOrder,
        isActive: true,
        schoolId: null,
      },
    });
  }

  // --------------------------------------------------
  // Grade scale (default percentage -> letter mapping)
  // --------------------------------------------------
  const defaultGradeScaleName = 'Default';
  const gradeScale =
    (await prisma.gradeScale.findFirst({
      where: { schoolId, name: defaultGradeScaleName },
      select: { id: true },
    })) ??
    (await prisma.gradeScale.create({
      data: {
        schoolId,
        name: defaultGradeScaleName,
        isDefault: true,
        isActive: true,
      },
      select: { id: true },
    }));

  await prisma.gradeScale.updateMany({
    where: {
      schoolId,
      id: { not: gradeScale.id },
      isDefault: true,
    },
    data: {
      isDefault: false,
    },
  });

  const existingRules = await prisma.gradeScaleRule.count({
    where: { gradeScaleId: gradeScale.id },
  });

  if (existingRules === 0) {
    await prisma.gradeScaleRule.createMany({
      data: [
        { gradeScaleId: gradeScale.id, minPercent: 90, maxPercent: 100, letterGrade: 'A', sortOrder: 10 },
        { gradeScaleId: gradeScale.id, minPercent: 80, maxPercent: 89.999, letterGrade: 'B', sortOrder: 20 },
        { gradeScaleId: gradeScale.id, minPercent: 70, maxPercent: 79.999, letterGrade: 'C', sortOrder: 30 },
        { gradeScaleId: gradeScale.id, minPercent: 60, maxPercent: 69.999, letterGrade: 'D', sortOrder: 40 },
        { gradeScaleId: gradeScale.id, minPercent: 0, maxPercent: 59.999, letterGrade: 'F', sortOrder: 50 },
      ],
    });
  }

  // --------------------------------------------------
  // Users
  // --------------------------------------------------
  async function ensureUser(data: {
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    role: 'OWNER' | 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER' | 'PARENT' | 'STUDENT';
    passwordHash: string;
    isActive?: boolean;
    schoolId?: string | null;
    studentNumber?: string | null;
    oen?: string | null;
    gradeLevelId?: string | null;
    studentEmail?: string | null;
    gender?: 'MALE' | 'FEMALE' | null;
  }) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { username: data.username }],
      },
    });

    if (existing) {
      return prisma.user.update({
        where: { id: existing.id },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
          isActive: data.isActive ?? true,
          passwordHash: data.passwordHash,
          schoolId: data.schoolId ?? existing.schoolId ?? null,
          studentNumber: data.studentNumber ?? existing.studentNumber ?? null,
          oen: data.oen ?? existing.oen ?? null,
          gradeLevelId: data.gradeLevelId ?? existing.gradeLevelId ?? null,
          studentEmail: data.studentEmail ?? existing.studentEmail ?? null,
          gender: data.gender ?? existing.gender ?? null,
        },
      });
    }

    return prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        passwordHash: data.passwordHash,
        isActive: data.isActive ?? true,
        schoolId: data.schoolId ?? null,
        studentNumber: data.studentNumber ?? null,
        oen: data.oen ?? null,
        gradeLevelId: data.gradeLevelId ?? null,
        studentEmail: data.studentEmail ?? null,
        gender: data.gender ?? null,
      },
    });
  }

  const owner = await ensureUser({
    email: 'owner@iok.com',
    username: 'owner1',
    firstName: 'Owner',
    lastName: 'User',
    role: 'OWNER',
    passwordHash: ownerPasswordHash,
    isActive: true,
    schoolId,
  });

  const admin = await ensureUser({
    email: 'admin@iok.com',
    username: 'admin1',
    firstName: 'Admin',
    lastName: 'User',
    role: 'ADMIN',
    passwordHash: adminPasswordHash,
    isActive: true,
    schoolId,
  });

  const teacher = await ensureUser({
    email: 'teacher1@iok.com',
    username: 'teacher1',
    firstName: 'Ali',
    lastName: 'Teacher',
    role: 'TEACHER',
    passwordHash: teacherPasswordHash,
    isActive: true,
    schoolId,
  });

  const parent = await ensureUser({
    email: 'parent1@iok.com',
    username: 'parent1',
    firstName: 'Fatima',
    lastName: 'Parent',
    role: 'PARENT',
    passwordHash: parentPasswordHash,
    isActive: true,
    schoolId,
  });

  const student = await ensureUser({
    email: 'student1@iok.com',
    username: 'student1',
    firstName: 'Student',
    lastName: 'One',
    role: 'STUDENT',
    passwordHash: studentPasswordHash,
    isActive: true,
    schoolId,
    studentNumber: '1001',
    oen: '123456789',
    gradeLevelId: grade1?.id ?? null,
    studentEmail: 'student1@iok.com',
    gender: 'MALE',
  });

  // --------------------------------------------------
  // School Memberships
  // --------------------------------------------------
  async function ensureMembership(userId: string) {
    const existing = await prisma.userSchoolMembership.findFirst({
      where: {
        userId,
        schoolId,
      },
    });

    if (existing) {
      return prisma.userSchoolMembership.update({
        where: { id: existing.id },
        data: {
          isActive: true,
        },
      });
    }

    return prisma.userSchoolMembership.create({
      data: {
        userId,
        schoolId,
        isActive: true,
      },
    });
  }

  await ensureMembership(owner.id);
  await ensureMembership(admin.id);
  await ensureMembership(teacher.id);
  await ensureMembership(parent.id);
  await ensureMembership(student.id);

  // --------------------------------------------------
  // Parent ↔ Student Link
  // --------------------------------------------------
  const existingLink = await prisma.studentParentLink.findFirst({
    where: {
      parentId: parent.id,
      studentId: student.id,
    },
  });

  if (!existingLink) {
    await prisma.studentParentLink.create({
      data: {
        parentId: parent.id,
        studentId: student.id,
      },
    });
  }

  console.log('✅ Seed complete');
  console.log('');
  console.log('Login credentials:');
  console.log(`OWNER   → username: owner1   | password: ${PASSWORDS.owner}`);
  console.log(`ADMIN   → username: admin1   | password: ${PASSWORDS.admin}`);
  console.log(`TEACHER → username: teacher1 | password: ${PASSWORDS.teacher}`);
  console.log(`PARENT  → username: parent1  | password: ${PASSWORDS.parent}`);
  console.log(`STUDENT → username: student1 | password: ${PASSWORDS.student}`);
  console.log('');
  console.log(`School: ${school.name}`);
  console.log(`School Year: ${schoolYear.name}`);
}

main()
  .catch((error) => {
    console.error('❌ Seed failed');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
