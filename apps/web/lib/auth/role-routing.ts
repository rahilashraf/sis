import type { UserRole } from "./types";

const adminRoles: UserRole[] = ["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"];
const adminManagementRoles: UserRole[] = ["OWNER", "SUPER_ADMIN", "ADMIN"];

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
  const primaryLabel = adminRoles.includes(role)
    ? "Admin"
    : role === "TEACHER" || role === "SUPPLY_TEACHER"
      ? "Teacher"
      : role === "PARENT"
        ? "Parent"
        : "Student";

  const items = [
    { href: "/dashboard", label: "Home" },
    { href: primaryRoute, label: `${primaryLabel} Dashboard` },
  ];

  if (adminManagementRoles.includes(role)) {
    items.push(
      { href: "/admin/users", label: "Users" },
      { href: "/admin/schools", label: "Schools" },
      { href: "/admin/classes", label: "Classes" },
      { href: "/admin/forms", label: "Forms" },
      { href: "/admin/gradebook", label: "Gradebook" },
      ...(role === "OWNER" || role === "SUPER_ADMIN"
        ? ([
            { href: "/admin/grade-scales", label: "Grade Scales" },
            { href: "/admin/reporting-periods", label: "Reporting Periods" },
            { href: "/admin/assessment-types", label: "Assessment Types" },
            { href: "/admin/assessment-result-status-labels", label: "Result Codes" },
            { href: "/admin/re-registration", label: "Re-registration" },
          ] as const)
        : [{ href: "/admin/re-registration", label: "Re-registration" }]),
      { href: "/admin/attendance", label: "Attendance" },
    );
  }

  if (role === "STAFF") {
    items.push(
      { href: "/admin/classes", label: "Classes" },
      { href: "/admin/forms", label: "Forms" },
      { href: "/admin/gradebook", label: "Gradebook" },
      { href: "/admin/attendance", label: "Attendance" },
    );
  }

  if (role === "TEACHER") {
    items.push(
      { href: "/teacher/classes", label: "Classes" },
      { href: "/teacher/gradebook", label: "Gradebook" },
      { href: "/teacher/attendance", label: "Attendance" },
    );
  }

  if (role === "SUPPLY_TEACHER") {
    if (!items.some((item) => item.href === "/teacher/attendance")) {
      items.push({ href: "/teacher/attendance", label: "Attendance" });
    }
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
