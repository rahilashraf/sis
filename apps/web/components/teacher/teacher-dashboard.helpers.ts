import type { SchoolClass } from "@/lib/api/classes";

export function getTeacherAssignedClasses(classes: SchoolClass[]) {
  return classes;
}

export function getTodayAttendanceClasses(
  classes: SchoolClass[],
  todaySessionClassIds: Set<string>,
) {
  return classes.filter(
    (schoolClass) =>
      schoolClass.isActive &&
      schoolClass.takesAttendance &&
      !todaySessionClassIds.has(schoolClass.id),
  );
}
