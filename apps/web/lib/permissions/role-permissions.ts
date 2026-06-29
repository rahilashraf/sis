import type { UserRole } from "@/lib/auth/types";

export const ROLE_PERMISSION_ACTIONS = [
  "VIEW",
  "CREATE",
  "UPDATE",
  "DELETE",
  "EXPORT",
  "APPROVE",
  "MANAGE",
] as const;

export const ROLE_PERMISSION_RESOURCES = [
  "INCIDENT_REPORTS",
  "ATTENDANCE",
  "GRADEBOOK",
  "FORMS",
  "RE_REGISTRATION",
  "BILLING",
  "LIBRARY",
  "UNIFORM_ORDERS",
  "NOTIFICATIONS",
  "ANNOUNCEMENTS",
  "USERS",
  "CLASSES",
  "SCHOOLS",
  "REPORTING_PERIODS",
] as const;

export const ROLE_PERMISSION_TARGET_ROLES: UserRole[] = [
  "OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "STAFF",
  "TEACHER",
  "SUPPLY_TEACHER",
  "PARENT",
  "STUDENT",
];

export type PermissionActionKey = (typeof ROLE_PERMISSION_ACTIONS)[number];
export type PermissionResourceKey = (typeof ROLE_PERMISSION_RESOURCES)[number];
export type RolePermissionTargetRole = (typeof ROLE_PERMISSION_TARGET_ROLES)[number];

export const ROLE_PERMISSION_ACTION_LABELS: Record<PermissionActionKey, string> = {
  VIEW: "View",
  CREATE: "Create",
  UPDATE: "Update",
  DELETE: "Delete",
  EXPORT: "Export",
  APPROVE: "Approve",
  MANAGE: "Manage",
};

export const ROLE_PERMISSION_RESOURCE_LABELS: Record<PermissionResourceKey, string> = {
  INCIDENT_REPORTS: "Incident Reports",
  ATTENDANCE: "Attendance",
  GRADEBOOK: "Gradebook",
  FORMS: "Forms",
  RE_REGISTRATION: "Re-Registration",
  BILLING: "Billing",
  LIBRARY: "Library",
  UNIFORM_ORDERS: "Uniform Orders",
  NOTIFICATIONS: "Notifications",
  ANNOUNCEMENTS: "Announcements",
  USERS: "Users",
  CLASSES: "Classes",
  SCHOOLS: "Schools",
  REPORTING_PERIODS: "Reporting Periods",
};
