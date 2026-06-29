import type { UserRole } from "./types";
import {
  isSchoolFeatureEnabled,
  type SchoolFeatureToggles,
} from "@/lib/features/school-features";
import {
  isModuleVisible,
  type AccessVisibilitySnapshot,
} from "@/lib/governance/access-visibility";

const adminRoles: UserRole[] = ["OWNER", "SUPER_ADMIN", "ADMIN", "STAFF"];

export type NavigationItem = {
  href: string;
  label: string;
  children?: Array<{
    href: string;
    label: string;
  }>;
};

type NavigationOptions = {
  enabledFeatures?: SchoolFeatureToggles | null;
  accessVisibility?: AccessVisibilitySnapshot | null;
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

function pathMatches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isFeatureEnabled(
  enabledFeatures: SchoolFeatureToggles | null | undefined,
  accessVisibility: AccessVisibilitySnapshot | null | undefined,
  feature: keyof SchoolFeatureToggles,
) {
  if (accessVisibility) {
    return isModuleVisible(accessVisibility, feature);
  }

  return isSchoolFeatureEnabled(enabledFeatures, feature);
}

function isFeatureEnabledForPath(
  pathname: string,
  enabledFeatures: SchoolFeatureToggles | null | undefined,
  accessVisibility: AccessVisibilitySnapshot | null | undefined,
) {
  if (pathMatches(pathname, "/notifications")) {
    return isFeatureEnabled(enabledFeatures, accessVisibility, "NOTIFICATIONS");
  }

  if (pathMatches(pathname, "/admin/behavior") || pathMatches(pathname, "/teacher/behavior")) {
    return isFeatureEnabled(enabledFeatures, accessVisibility, "INCIDENT_REPORTS");
  }

  if (pathMatches(pathname, "/admin/attendance") || pathMatches(pathname, "/teacher/attendance")) {
    return isFeatureEnabled(enabledFeatures, accessVisibility, "ATTENDANCE");
  }

  if (
    pathMatches(pathname, "/admin/gradebook") ||
    pathMatches(pathname, "/teacher/gradebook") ||
    /^\/admin\/classes\/[^/]+\/gradebook(\/|$)/.test(pathname) ||
    /^\/teacher\/classes\/[^/]+\/gradebook(\/|$)/.test(pathname) ||
    /^\/parent\/students\/[^/]+\/(academic|academics|grades)(\/|$)/.test(pathname)
  ) {
    return isFeatureEnabled(enabledFeatures, accessVisibility, "GRADEBOOK");
  }

  if (pathMatches(pathname, "/admin/forms") || pathMatches(pathname, "/parent/forms")) {
    return isFeatureEnabled(enabledFeatures, accessVisibility, "FORMS");
  }

  if (
    pathMatches(pathname, "/admin/re-registration") ||
    /^\/parent\/students\/[^/]+\/re-registration(\/|$)/.test(pathname)
  ) {
    return isFeatureEnabled(enabledFeatures, accessVisibility, "RE_REGISTRATION");
  }

  if (
    pathMatches(pathname, "/admin/billing") ||
    /^\/parent\/students\/[^/]+\/billing(\/|$)/.test(pathname)
  ) {
    return isFeatureEnabled(enabledFeatures, accessVisibility, "BILLING");
  }

  if (
    pathMatches(pathname, "/admin/library") ||
    pathMatches(pathname, "/student/library") ||
    /^\/parent\/students\/[^/]+\/library(\/|$)/.test(pathname)
  ) {
    return isFeatureEnabled(enabledFeatures, accessVisibility, "LIBRARY");
  }

  if (pathMatches(pathname, "/admin/uniform") || pathMatches(pathname, "/parent/uniform")) {
    return isFeatureEnabled(enabledFeatures, accessVisibility, "UNIFORM_ORDERS");
  }

  return true;
}

function buildAdminBaseItems(): NavigationItem[] {
  return [
    {
      href: "/admin/users",
      label: "Users",
      children: [
        { href: "/admin/users", label: "Directory" },
        { href: "/admin/users/student-profiles", label: "Student Profiles" },
      ],
    },
    { href: "/admin/data-import", label: "Bulk Setup" },
    { href: "/admin/attendance", label: "Attendance" },
    {
      href: "/admin/classes",
      label: "Classes",
      children: [
        { href: "/admin/classes", label: "Directory" },
        { href: "/admin/classes/bulk-enrollment", label: "Bulk Enrollment" },
      ],
    },
    { href: "/admin/announcements", label: "Announcements" },
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
      children: [
        { href: "/admin/behavior-categories", label: "Incident Categories" },
      ],
    },
    {
      href: "/admin/schools",
      label: "Schools",
      children: [
        { href: "/admin/schools/rollover", label: "School Year Rollover" },
        { href: "/admin/schools/features", label: "Feature Toggles" },
        { href: "/admin/schools/permissions", label: "Role Permissions" },
        { href: "/admin/schools/governance", label: "Governance" },
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
  includeFeatureToggles: boolean;
  includeRolePermissions: boolean;
  includeGovernance: boolean;
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
          children: options.includeIncidentCategories
            ? item.children
            : undefined,
        };
      }

      if (item.href === "/admin/schools") {
        const schoolChildren =
          options.includeSchoolChildren && item.children
            ? item.children.filter((child) =>
                child.href === "/admin/schools/features"
                  ? options.includeFeatureToggles
                  : child.href === "/admin/schools/permissions"
                    ? options.includeRolePermissions
                  : child.href === "/admin/schools/governance"
                    ? options.includeGovernance
                  : true,
              )
            : undefined;

        return {
          ...item,
          children: schoolChildren,
        };
      }

      return item;
    });
}

export function getDefaultRouteForRole(
  role: UserRole,
  options?: NavigationOptions,
) {
  const enabledFeatures = options?.enabledFeatures;
  const accessVisibility = options?.accessVisibility;

  if (adminRoles.includes(role)) {
    return "/admin";
  }

  if (role === "TEACHER") {
    return "/teacher/dashboard";
  }

  if (role === "SUPPLY_TEACHER") {
    if (!isFeatureEnabled(enabledFeatures, accessVisibility, "ATTENDANCE")) {
      return "/teacher/interviews";
    }
    return "/teacher/attendance";
  }

  if (role === "PARENT") {
    return "/parent";
  }

  return "/student";
}

export function getNavigationItems(role: UserRole, options?: NavigationOptions) {
  const enabledFeatures = options?.enabledFeatures;
  const accessVisibility = options?.accessVisibility;
  const primaryRoute = getDefaultRouteForRole(role, options);
  const items: NavigationItem[] = [{ href: primaryRoute, label: "Dashboard" }];

  if (role === "OWNER") {
    const adminItems = buildAdminItems({
      includeUsers: true,
      includeReRegistration: true,
      includeIncidentCategories: true,
      includeSchools: true,
      includeSchoolChildren: true,
      includeFeatureToggles: true,
      includeRolePermissions: true,
      includeGovernance: true,
    }).filter((item) => {
      if (item.href === "/admin/attendance") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "ATTENDANCE");
      }
      if (item.href === "/admin/gradebook") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "GRADEBOOK");
      }
      if (item.href === "/admin/forms") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "FORMS");
      }
      if (item.href === "/admin/library/items") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "LIBRARY");
      }
      if (item.href === "/admin/uniform/items") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "UNIFORM_ORDERS");
      }
      if (item.href === "/admin/billing/charges") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "BILLING");
      }
      if (item.href === "/admin/behavior") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "INCIDENT_REPORTS");
      }
      return true;
    });

    items.push(...adminItems);
    if (isFeatureEnabled(enabledFeatures, accessVisibility, "NOTIFICATIONS")) {
      items.push({ href: "/notifications", label: "Notifications" });
    }
    items.push({ href: "/admin/audit", label: "Audit Logs" });

    return items;
  }

  if (role === "SUPER_ADMIN") {
    const adminItems = buildAdminItems({
      includeUsers: true,
      includeReRegistration: true,
      includeIncidentCategories: true,
      includeSchools: true,
      includeSchoolChildren: true,
      includeFeatureToggles: false,
      includeRolePermissions: true,
      includeGovernance: true,
    }).filter((item) => {
      if (item.href === "/admin/attendance") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "ATTENDANCE");
      }
      if (item.href === "/admin/gradebook") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "GRADEBOOK");
      }
      if (item.href === "/admin/forms") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "FORMS");
      }
      if (item.href === "/admin/library/items") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "LIBRARY");
      }
      if (item.href === "/admin/uniform/items") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "UNIFORM_ORDERS");
      }
      if (item.href === "/admin/billing/charges") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "BILLING");
      }
      if (item.href === "/admin/behavior") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "INCIDENT_REPORTS");
      }
      return true;
    });

    items.push(...adminItems);
    if (isFeatureEnabled(enabledFeatures, accessVisibility, "NOTIFICATIONS")) {
      items.push({ href: "/notifications", label: "Notifications" });
    }
    items.push({ href: "/admin/audit", label: "Audit Logs" });

    return items;
  }

  if (role === "ADMIN") {
    const adminItems = buildAdminItems({
      includeUsers: true,
      includeReRegistration: true,
      includeIncidentCategories: false,
      includeSchools: true,
      includeSchoolChildren: false,
      includeFeatureToggles: false,
      includeRolePermissions: true,
      includeGovernance: false,
    }).filter((item) => {
      if (item.href === "/admin/attendance") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "ATTENDANCE");
      }
      if (item.href === "/admin/gradebook") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "GRADEBOOK");
      }
      if (item.href === "/admin/forms") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "FORMS");
      }
      if (item.href === "/admin/library/items") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "LIBRARY");
      }
      if (item.href === "/admin/uniform/items") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "UNIFORM_ORDERS");
      }
      if (item.href === "/admin/billing/charges") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "BILLING");
      }
      if (item.href === "/admin/behavior") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "INCIDENT_REPORTS");
      }
      return true;
    });

    items.push(...adminItems);
    if (isFeatureEnabled(enabledFeatures, accessVisibility, "NOTIFICATIONS")) {
      items.push({ href: "/notifications", label: "Notifications" });
    }
    items.push({ href: "/admin/schools/permissions", label: "Role Permissions" });

    return items;
  }

  if (role === "STAFF") {
    const adminItems = buildAdminItems({
      includeUsers: false,
      includeReRegistration: false,
      includeIncidentCategories: false,
      includeSchools: false,
      includeSchoolChildren: false,
      includeFeatureToggles: false,
      includeRolePermissions: false,
      includeGovernance: false,
    }).filter((item) => {
      if (item.href === "/admin/attendance") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "ATTENDANCE");
      }
      if (item.href === "/admin/gradebook") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "GRADEBOOK");
      }
      if (item.href === "/admin/forms") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "FORMS");
      }
      if (item.href === "/admin/library/items") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "LIBRARY");
      }
      if (item.href === "/admin/uniform/items") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "UNIFORM_ORDERS");
      }
      if (item.href === "/admin/billing/charges") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "BILLING");
      }
      if (item.href === "/admin/behavior") {
        return isFeatureEnabled(enabledFeatures, accessVisibility, "INCIDENT_REPORTS");
      }
      return true;
    });

    items.push(...adminItems);
    if (isFeatureEnabled(enabledFeatures, accessVisibility, "NOTIFICATIONS")) {
      items.push({ href: "/notifications", label: "Notifications" });
    }

    return items;
  }

  if (role === "TEACHER") {
    if (isFeatureEnabled(enabledFeatures, accessVisibility, "ATTENDANCE")) {
      items.push({ href: "/teacher/attendance", label: "Attendance" });
    }
    items.push(
      { href: "/teacher/timetable", label: "Timetable" },
      { href: "/teacher/classes", label: "Classes" },
      { href: "/teacher/announcements", label: "Announcements" },
      { href: "/teacher/interviews", label: "Interviews" },
    );
    if (isFeatureEnabled(enabledFeatures, accessVisibility, "GRADEBOOK")) {
      items.push({ href: "/teacher/gradebook", label: "Gradebook" });
    }
    if (isFeatureEnabled(enabledFeatures, accessVisibility, "INCIDENT_REPORTS")) {
      items.push({ href: "/teacher/behavior", label: "Incident Reports" });
    }
    if (isFeatureEnabled(enabledFeatures, accessVisibility, "NOTIFICATIONS")) {
      items.push({ href: "/notifications", label: "Notifications" });
    }
    return items;
  }

  if (role === "SUPPLY_TEACHER") {
    if (
      isFeatureEnabled(enabledFeatures, accessVisibility, "ATTENDANCE") &&
      !items.some((item) => item.href === "/teacher/attendance")
    ) {
      items.push({ href: "/teacher/attendance", label: "Attendance" });
    }

    if (!items.some((item) => item.href === "/teacher/interviews")) {
      items.push({ href: "/teacher/interviews", label: "Interviews" });
    }

    if (isFeatureEnabled(enabledFeatures, accessVisibility, "NOTIFICATIONS")) {
      items.push({ href: "/notifications", label: "Notifications" });
    }
    return items;
  }

  if (role === "PARENT") {
    items.push(
      { href: "/parent/account", label: "My Account" },
      { href: "/parent/announcements", label: "Announcements" },
      { href: "/parent/interviews", label: "Interviews" },
    );
    if (isFeatureEnabled(enabledFeatures, accessVisibility, "UNIFORM_ORDERS")) {
      items.push({ href: "/parent/uniform", label: "Uniform" });
    }
    if (isFeatureEnabled(enabledFeatures, accessVisibility, "FORMS")) {
      items.push({ href: "/parent/forms", label: "Forms" });
    }
    if (isFeatureEnabled(enabledFeatures, accessVisibility, "NOTIFICATIONS")) {
      items.push({ href: "/notifications", label: "Notifications" });
    }

    return items;
  }

  if (role === "STUDENT") {
    items.push({ href: "/student/timetable", label: "Timetable" });
    items.push({ href: "/student/announcements", label: "Announcements" });
    if (isFeatureEnabled(enabledFeatures, accessVisibility, "LIBRARY")) {
      items.push({ href: "/student/library", label: "Library" });
    }
    if (isFeatureEnabled(enabledFeatures, accessVisibility, "NOTIFICATIONS")) {
      items.push({ href: "/notifications", label: "Notifications" });
    }
  }

  return items;
}

export function isPathAllowedForRole(
  role: UserRole,
  pathname: string,
  options?: NavigationOptions,
) {
  if (
    !isFeatureEnabledForPath(
      pathname,
      options?.enabledFeatures,
      options?.accessVisibility,
    )
  ) {
    return false;
  }

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
