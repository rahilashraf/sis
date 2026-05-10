export const GOVERNANCE_VISIBILITY_KEYS = [
  'PARENT_CAN_VIEW_GRADES',
  'PARENT_CAN_VIEW_ATTENDANCE',
  'STUDENT_CAN_VIEW_GRADES',
  'STUDENT_CAN_VIEW_ATTENDANCE',
] as const;

export type GovernanceVisibilityKey = (typeof GOVERNANCE_VISIBILITY_KEYS)[number];

export type GovernanceVisibilitySettings = Record<GovernanceVisibilityKey, boolean>;

export const DEFAULT_GOVERNANCE_VISIBILITY_SETTINGS: GovernanceVisibilitySettings = {
  PARENT_CAN_VIEW_GRADES: true,
  PARENT_CAN_VIEW_ATTENDANCE: true,
  STUDENT_CAN_VIEW_GRADES: true,
  STUDENT_CAN_VIEW_ATTENDANCE: true,
};

export const GOVERNANCE_VISIBILITY_LABELS: Record<GovernanceVisibilityKey, string> = {
  PARENT_CAN_VIEW_GRADES: 'Parents can view grades',
  PARENT_CAN_VIEW_ATTENDANCE: 'Parents can view attendance',
  STUDENT_CAN_VIEW_GRADES: 'Students can view grades',
  STUDENT_CAN_VIEW_ATTENDANCE: 'Students can view attendance',
};

export function withDefaultGovernanceVisibilitySettings(
  value?: Partial<GovernanceVisibilitySettings> | null,
): GovernanceVisibilitySettings {
  return {
    ...DEFAULT_GOVERNANCE_VISIBILITY_SETTINGS,
    ...(value ?? {}),
  };
}
