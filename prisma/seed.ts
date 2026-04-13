/**
 * Demo seed data for the Student Information System (SIS).
 * All data is fictional and safe for public repositories.
 */
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
  console.log('🌱 Seeding SIS database...');

  const schoolName = 'Demo Academy';
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

  if (!school) throw new Error('Failed to create or load school');

  const schoolId = school.id;

  // --------------------------------------------------
  // School Year
  // --------------------------------------------------
  let schoolYear = await prisma.schoolYear.findFirst({
    where: { schoolId, name: schoolYearName },
  });

  if (!schoolYear) {
    schoolYear = await prisma.schoolYear.create({
      data: {
        name: schoolYearName,
        schoolId,
        startDate: new Date('2025-09-01'),
        endDate: new Date('2026-06-30'),
        isActive: true,
      },
    });
  }

  if (!schoolYear) throw new Error('Failed to create or load school year');

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
      where: { schoolId, name: level.name },
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
    where: { schoolId, name: 'Grade 1' },
  });

  // --------------------------------------------------
  // Assessment Types
  // --------------------------------------------------
  const assessmentTypes = [
    { id: 'assessment_type_quiz', key: 'QUIZ', name: 'Quiz', sortOrder: 10 },
    { id: 'assessment_type_test', key: 'TEST', name: 'Test', sortOrder: 20 },
    { id: 'assessment_type_assignment', key: 'ASSIGNMENT', name: 'Assignment', sortOrder: 30 },
    { id: 'assessment_type_project', key: 'PROJECT', name: 'Project', sortOrder: 40 },
    { id: 'assessment_type_participation', key: 'PARTICIPATION', name: 'Participation', sortOrder: 50 },
  ];

  for (const type of assessmentTypes) {
    await prisma.assessmentType.upsert({
      where: { key: type.key },
      create: { ...type, isActive: true, schoolId: null },
      update: { ...type, isActive: true, schoolId: null },
    });
  }

  // --------------------------------------------------
  // Grade Scale
  // --------------------------------------------------
  const gradeScale =
    (await prisma.gradeScale.findFirst({
      where: { schoolId, name: 'Default' },
      select: { id: true },
    })) ??
    (await prisma.gradeScale.create({
      data: {
        schoolId,
        name: 'Default',
        isDefault: true,
        isActive: true,
      },
      select: { id: true },
    }));

  const existingRules = await prisma.gradeScaleRule.count({
    where: { gradeScaleId: gradeScale.id },
  });

  if (existingRules === 0) {
    await prisma.gradeScaleRule.createMany({
      data: [
        { gradeScaleId: gradeScale.id, minPercent: 90, maxPercent: 100, letterGrade: 'A', sortOrder: 10 },
        { gradeScaleId: gradeScale.id, minPercent: 80, maxPercent: 89.99, letterGrade: 'B', sortOrder: 20 },
        { gradeScaleId: gradeScale.id, minPercent: 70, maxPercent: 79.99, letterGrade: 'C', sortOrder: 30 },
        { gradeScaleId: gradeScale.id, minPercent: 60, maxPercent: 69.99, letterGrade: 'D', sortOrder: 40 },
        { gradeScaleId: gradeScale.id, minPercent: 0, maxPercent: 59.99, letterGrade: 'F', sortOrder: 50 },
      ],
    });
  }

  // --------------------------------------------------
  // Users
  // --------------------------------------------------
  async function ensureUser(data: any) {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email: data.email }, { username: data.username }] },
    });

    if (existing) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { ...data },
      });
    }

    return prisma.user.create({ data });
  }

  const owner = await ensureUser({
    email: 'owner@demo.edu',
    username: 'owner',
    firstName: 'Owner',
    lastName: 'User',
    role: 'OWNER',
    passwordHash: ownerPasswordHash,
    isActive: true,
    schoolId,
  });

  const admin = await ensureUser({
    email: 'admin@demo.edu',
    username: 'admin',
    firstName: 'Admin',
    lastName: 'User',
    role: 'ADMIN',
    passwordHash: adminPasswordHash,
    isActive: true,
    schoolId,
  });

  const teacher = await ensureUser({
    email: 'teacher@demo.edu',
    username: 'teacher',
    firstName: 'John',
    lastName: 'Doe',
    role: 'TEACHER',
    passwordHash: teacherPasswordHash,
    isActive: true,
    schoolId,
  });

  const parent = await ensureUser({
    email: 'parent@demo.edu',
    username: 'parent',
    firstName: 'Jane',
    lastName: 'Doe',
    role: 'PARENT',
    passwordHash: parentPasswordHash,
    isActive: true,
    schoolId,
  });

  const student = await ensureUser({
    email: 'student@demo.edu',
    username: 'student',
    firstName: 'Student',
    lastName: 'One',
    role: 'STUDENT',
    passwordHash: studentPasswordHash,
    isActive: true,
    schoolId,
    gradeLevelId: grade1?.id ?? null,
    studentEmail: 'student@demo.edu',
    gender: 'MALE',
  });

  // --------------------------------------------------
  // Memberships
  // --------------------------------------------------
  for (const user of [owner, admin, teacher, parent, student]) {
    await prisma.userSchoolMembership.upsert({
      where: {
        userId_schoolId: { userId: user.id, schoolId },
      },
      create: { userId: user.id, schoolId, isActive: true },
      update: { isActive: true },
    });
  }

  // --------------------------------------------------
  // Parent ↔ Student Link
  // --------------------------------------------------
  await prisma.studentParentLink.upsert({
    where: {
      parentId_studentId: { parentId: parent.id, studentId: student.id },
    },
    create: { parentId: parent.id, studentId: student.id },
    update: {},
  });

  console.log('✅ Seed complete');
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
  