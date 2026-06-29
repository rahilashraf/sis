export const SCHOOL_FEATURE_MODULES = [
  'INCIDENT_REPORTS',
  'ATTENDANCE',
  'GRADEBOOK',
  'FORMS',
  'RE_REGISTRATION',
  'BILLING',
  'LIBRARY',
  'UNIFORM_ORDERS',
  'NOTIFICATIONS',
  'ANNOUNCEMENTS',
] as const;

export type FeatureModuleKey = (typeof SCHOOL_FEATURE_MODULES)[number];
export type SchoolFeatureTogglesMap = Record<FeatureModuleKey, boolean>;

export function buildDefaultSchoolFeatureToggles(): SchoolFeatureTogglesMap {
  return {
    INCIDENT_REPORTS: true,
    ATTENDANCE: true,
    GRADEBOOK: true,
    FORMS: true,
    RE_REGISTRATION: true,
    BILLING: true,
    LIBRARY: true,
    UNIFORM_ORDERS: true,
    NOTIFICATIONS: true,
    ANNOUNCEMENTS: true,
  };
}
