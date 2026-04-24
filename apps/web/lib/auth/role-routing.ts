import type { UserRole } from "./types";

const adminRoles: UserRole[] = ["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"];

export type NavigationItem = {
  href: string;
  label: string;
  children?: Array<{
    href: string;
    label: string;
  }>;
};

const chargesNavigationChildren: NavigationItem["children"] = [
  { href: "/admin/billing/payments", label: "Payments" },
  { href: "/admin/billing/overdue", label: "Overdue" },
  { href: "/admin/billing/categories", label: "Categories" },
];

const libraryNavigationChildren: NavigationItem["children"] = [
  { href: "/admin/library/items", label: "Items" },
  { href: "/admin/library/loans", label: "Loans" },
  { href: "/admin/library/overdue", label: "Overdue" },
  { href: "/admin/library/fines", label: "Fines" },
];

const uniformNavigationChildren: NavigationItem["children"] = [
  { href: "/admin/uniform/items", label: "Items" },
  { href: "/admin/uniform/orders", label: "Orders" },
];

const interviewNavigationChildren: NavigationItem["children"] = [
  { href: "/admin/interviews", label: "Events" },
];

function buildAdminBaseItems(): NavigationItem[] {
  return [
    { href: "/admin/users", label: "Users" },
    { href: "/admin/attendance", label: "Attendance" },
    { href: "/admin/classes", label: "Classes" },
    { href: "/admin/gradebook", label: "Gradebook" },
    { href: "/admin/timetable", label: "Timetable" },
    {
      href: "/admin/forms",
      label: "Forms",
      children: [{ href: "/admin/re-registration", label: "Re-Registration" }],
    },
    {
      href: "/admin/library/items",
      label: "Library",
      children: libraryNavigationChildren,
    },
    {
      href: "/admin/uniform/items",
      label: "Uniform",
      children: uniformNavigationChildren,
    },
    {
      href: "/admin/interviews",
      label: "Interviews",
      children: interviewNavigationChildren,
    },
    {
      href: "/admin/billing/charges",
      label: "Charges",
      children: chargesNavigationChildren,
    },
    {
      href: "/admin/behavior",
      label: "Incident Reports",
      children: [{ href: "/admin/behavior-categories", label: "Incident Categories" }],
    },
    {
      href: "/admin/schools",
      label: "Schools",
      children: [
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
      ],
    },
  ];
}

function buildAdminItems(options: {
  includeUsers: boolean;
  includeReRegistration: boolean;
  includeIncidentCategories: boolean;
  includeSchools: boolean;
  includeSchoolChildren: boolean;
}) {
  return buildAdminBaseItems()
    .filter((item) => {
      if (item.href === "/admin/users") {
        return options.includeUsers;
      }

      if (item.href === "/admin/schools") {
        return options.includeSchools;
      }

      return true;
    })
    .map((item) => {
      if (item.href === "/admin/forms") {
        return {
          ...item,
          children: options.includeReRegistration ? item.children : undefined,
        };
      }

      if (item.href === "/admin/behavior") {
        return {
          ...item,
          children: options.includeIncidentCategories ? item.children : undefined,
        };
      }

      if (item.href === "/admin/schools") {
        return {
          ...item,
          children: options.includeSchoolChildren ? item.children : undefined,
        };
      }

      return item;
    });
}

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
  const items: NavigationItem[] = [{ href: primaryRoute, label: "Dashboard" }];

  if (role === "OWNER") {
    items.push(
      ...buildAdminItems({
        includeUsers: true,
        includeReRegistration: true,
        includeIncidentCategories: true,
        includeSchools: true,
        includeSchoolChildren: true,
      }),
      { href: "/notifications", label: "Notifications" },
      { href: "/admin/audit", label: "Audit Logs" },
    );

    return items;
  }

  if (role === "SUPER_ADMIN") {
    items.push(
      ...buildAdminItems({
        includeUsers: true,
        includeReRegistration: true,
        includeIncidentCategories: true,
        includeSchools: true,
        includeSchoolChildren: true,
      }),
      { href: "/notifications", label: "Notifications" },
    );

    return items;
  }

  if (role === "ADMIN") {
    items.push(
      ...buildAdminItems({
        includeUsers: true,
        includeReRegistration: true,
        includeIncidentCategories: false,
        includeSchools: true,
        includeSchoolChildren: false,
      }),
      { href: "/notifications", label: "Notifications" },
    );

    return items;
  }

  if (role === "STAFF") {
    items.push(
      ...buildAdminItems({
        includeUsers: false,
        includeReRegistration: false,
        includeIncidentCategories: false,
        includeSchools: false,
        includeSchoolChildren: false,
      }),
      { href: "/notifications", label: "Notifications" },
    );

    return items;
  }

  if (role === "TEACHER") {
    items.push(
      { href: "/teacher/attendance", label: "Attendance" },
      { href: "/teacher/timetable", label: "Timetable" },
      { href: "/teacher/classes", label: "Classes" },
      { href: "/teacher/interviews", label: "Interviews" },
      { href: "/teacher/gradebook", label: "Gradebook" },
      { href: "/teacher/behavior", label: "Incident Reports" },
    );

    items.push({ href: "/notifications", label: "Notifications" });
    return items;
  }

  if (role === "SUPPLY_TEACHER") {
    if (!items.some((item) => item.href === "/teacher/attendance")) {
      items.push({ href: "/teacher/attendance", label: "Attendance" });
    }

    if (!items.some((item) => item.href === "/teacher/interviews")) {
      items.push({ href: "/teacher/interviews", label: "Interviews" });
    }

    items.push({ href: "/notifications", label: "Notifications" });
    return items;
  }

  if (role === "PARENT") {
    items.push(
      { href: "/parent/account", label: "My Account" },
      { href: "/parent/interviews", label: "Interviews" },
      { href: "/parent/uniform", label: "Uniform" },
      { href: "/parent/forms", label: "Forms" },
      { href: "/notifications", label: "Notifications" },
    );

    return items;
  }

  if (role === "STUDENT") {
    items.push(
      { href: "/student/timetable", label: "Timetable" },
      { href: "/notifications", label: "Notifications" },
    );
  }

  return items;
}

export function isPathAllowedForRole(role: UserRole, pathname: string) {
  if (pathname.startsWith("/notifications")) {
    return true;
  }

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
    return (
      pathname === "/teacher" ||
      pathname.startsWith("/teacher/attendance") ||
      pathname.startsWith("/teacher/interviews")
    );
  }

  if (role === "PARENT") {
    return pathname.startsWith("/parent");
  }

  return pathname.startsWith("/student");
}
