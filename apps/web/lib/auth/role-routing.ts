import type { UserRole } from "./types";

const adminRoles: UserRole[] = ["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"];

export function getDefaultRouteForRole(role: UserRole) {
  if (adminRoles.includes(role)) {
    return "/admin";
  }

  if (role === "TEACHER") {
    return "/teacher";
  }

  if (role === "SUPPLY_TEACHER") {
    return "/teacher/attendance";
  }

  if (role === "PARENT") {
    return "/parent";
  }

  return "/student";
}

export function getNavigationItems(role: UserRole) {
  const primaryRoute = getDefaultRouteForRole(role);
  const items = [{ href: primaryRoute, label: "Dashboard" }];

  if (role === "OWNER" || role === "SUPER_ADMIN") {
    items.push(
      { href: "/admin/attendance", label: "Attendance" },
      { href: "/admin/users", label: "Users" },
      { href: "/admin/classes", label: "Classes" },
      { href: "/admin/gradebook", label: "Gradebook" },
      { href: "/admin/forms", label: "Forms" },
      { href: "/admin/re-registration", label: "Re-registration" },
      { href: "/admin/schools", label: "Schools" },
      { href: "/admin/reporting-periods", label: "Reporting Periods" },
      { href: "/admin/grade-scales", label: "Grade Scales" },
      { href: "/admin/assessment-types", label: "Assessment Types" },
      {
        href: "/admin/enrollment-subject-options",
        label: "Enrollment Subjects",
      },
      {
        href: "/admin/assessment-result-status-labels",
        label: "Assessment Statuses",
      },
    );

    return items;
  }

  if (role === "ADMIN") {
    items.push(
      { href: "/admin/attendance", label: "Attendance" },
      { href: "/admin/users", label: "Users" },
      { href: "/admin/classes", label: "Classes" },
      { href: "/admin/gradebook", label: "Gradebook" },
      { href: "/admin/forms", label: "Forms" },
      { href: "/admin/re-registration", label: "Re-registration" },
      { href: "/admin/schools", label: "Schools" },
    );

    return items;
  }

  if (role === "STAFF") {
    items.push(
      { href: "/admin/attendance", label: "Attendance" },
      { href: "/admin/classes", label: "Classes" },
      { href: "/admin/gradebook", label: "Gradebook" },
      { href: "/admin/forms", label: "Forms" },
    );

    return items;
  }

  if (role === "TEACHER") {
    items.push(
      { href: "/teacher/attendance", label: "Attendance" },
      { href: "/teacher/classes", label: "Classes" },
      { href: "/teacher/gradebook", label: "Gradebook" },
    );

    return items;
  }

  if (role === "SUPPLY_TEACHER") {
    if (!items.some((item) => item.href === "/teacher/attendance")) {
      items.push({ href: "/teacher/attendance", label: "Attendance" });
    }

    return items;
  }

  if (role === "PARENT") {
    items.push({ href: "/parent/forms", label: "Forms" });
  }

  return items;
}

export function isPathAllowedForRole(role: UserRole, pathname: string) {
  if (pathname.startsWith("/dashboard")) {
    return true;
  }

  if (adminRoles.includes(role)) {
    return pathname.startsWith("/admin");
  }

  if (role === "TEACHER") {
    return pathname.startsWith("/teacher");
  }

  if (role === "SUPPLY_TEACHER") {
    return pathname === "/teacher" || pathname.startsWith("/teacher/attendance");
  }

  if (role === "PARENT") {
    return pathname.startsWith("/parent");
  }

  return pathname.startsWith("/student");
}
