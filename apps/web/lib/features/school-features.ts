export const SCHOOL_FEATURE_KEYS = [
  'INCIDENT_REPORTS',
  'ATTENDANCE',
  'GRADEBOOK',
  'FORMS',
  'RE_REGISTRATION',
  'BILLING',
  'LIBRARY',
  'UNIFORM_ORDERS',
  'NOTIFICATIONS',
] as const;

export type SchoolFeatureKey = (typeof SCHOOL_FEATURE_KEYS)[number];

export type SchoolFeatureToggles = Record<SchoolFeatureKey, boolean>;

export const DEFAULT_SCHOOL_FEATURE_TOGGLES: SchoolFeatureToggles = {
  INCIDENT_REPORTS: true,
  ATTENDANCE: true,
  GRADEBOOK: true,
  FORMS: true,
  RE_REGISTRATION: true,
  BILLING: true,
  LIBRARY: true,
  UNIFORM_ORDERS: true,
  NOTIFICATIONS: true,
};

export const SCHOOL_FEATURE_LABELS: Record<SchoolFeatureKey, string> = {
  INCIDENT_REPORTS: 'Incident Reports',
  ATTENDANCE: 'Attendance',
  GRADEBOOK: 'Gradebook',
  FORMS: 'Forms',
  RE_REGISTRATION: 'Re-Registration',
  BILLING: 'Billing',
  LIBRARY: 'Library',
  UNIFORM_ORDERS: 'Uniform Orders',
  NOTIFICATIONS: 'Notifications',
};

export function withDefaultSchoolFeatureToggles(
  features?: Partial<SchoolFeatureToggles> | null,
): SchoolFeatureToggles {
  return {
    ...DEFAULT_SCHOOL_FEATURE_TOGGLES,
    ...(features ?? {}),
  };
}

export function isSchoolFeatureEnabled(
  features: SchoolFeatureToggles | null | undefined,
  feature: SchoolFeatureKey,
) {
  if (!features) {
    return true;
  }

  return features[feature] !== false;
}
