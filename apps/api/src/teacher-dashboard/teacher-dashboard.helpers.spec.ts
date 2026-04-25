import type { SchoolClass } from '../../../web/lib/api/classes';
import {
  getTeacherAssignedClasses,
  getTodayAttendanceClasses,
} from '../../../web/components/teacher/teacher-dashboard.helpers';

function buildClass(overrides: Partial<SchoolClass> = {}): SchoolClass {
  return {
    id: overrides.id ?? 'class-1',
    schoolId: overrides.schoolId ?? 'school-1',
    schoolYearId: overrides.schoolYearId ?? 'year-1',
    gradeLevelId: overrides.gradeLevelId ?? null,
    subjectOptionId: overrides.subjectOptionId ?? null,
    name: overrides.name ?? 'Class',
    subject: overrides.subject ?? 'Math',
    isHomeroom: overrides.isHomeroom ?? false,
    takesAttendance: overrides.takesAttendance ?? true,
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? '2026-04-24T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-24T00:00:00.000Z',
    school:
      overrides.school ??
      ({
        id: 'school-1',
        name: 'North School',
        shortName: 'NS',
        isActive: true,
      } as SchoolClass['school']),
    schoolYear:
      overrides.schoolYear ??
      ({
        id: 'year-1',
        schoolId: 'school-1',
        name: '2025-2026',
        isActive: true,
        startsOn: '2025-09-01',
        endsOn: '2026-06-30',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      } as SchoolClass['schoolYear']),
    gradeLevel: overrides.gradeLevel,
    subjectOption: overrides.subjectOption,
    teachers: overrides.teachers ?? [],
    students: overrides.students,
    _count: overrides._count,
  };
}

describe('teacher dashboard helpers', () => {
  it('returns only the assigned classes passed to the dashboard', () => {
    const assignedClasses = [
      buildClass({ id: 'class-a', name: 'Math' }),
      buildClass({ id: 'class-b', name: 'Science' }),
    ];

    expect(getTeacherAssignedClasses(assignedClasses)).toEqual(assignedClasses);
  });

  it('excludes takesAttendance=false classes from today attendance', () => {
    const classes = [
      buildClass({ id: 'class-a', name: 'Math', takesAttendance: true }),
      buildClass({ id: 'class-b', name: 'Science', takesAttendance: false }),
      buildClass({ id: 'class-c', name: 'History', takesAttendance: true }),
    ];

    const result = getTodayAttendanceClasses(classes, new Set(['class-c']));

    expect(result.map((schoolClass) => schoolClass.id)).toEqual(['class-a']);
  });
});