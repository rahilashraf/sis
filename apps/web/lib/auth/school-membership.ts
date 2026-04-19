import type { AuthenticatedUser, UserSchoolMembership } from "./types";

function uniqueBySchoolId(memberships: UserSchoolMembership[]) {
  const seen = new Set<string>();
  const unique: UserSchoolMembership[] = [];

  for (const membership of memberships) {
    if (seen.has(membership.schoolId)) {
      continue;
    }

    seen.add(membership.schoolId);
    unique.push(membership);
  }

  return unique;
}

export function getActiveSchoolMemberships(user: AuthenticatedUser | null | undefined) {
  if (!user?.memberships?.length) {
    return [] as UserSchoolMembership[];
  }

  return uniqueBySchoolId(user.memberships.filter((membership) => membership.isActive));
}

export function getAccessibleSchoolIds(user: AuthenticatedUser | null | undefined) {
  const activeMemberships = getActiveSchoolMemberships(user);
  if (activeMemberships.length > 0) {
    return activeMemberships.map((membership) => membership.schoolId);
  }

  if (user?.schoolId) {
    return [user.schoolId];
  }

  return [] as string[];
}

export function getDefaultSchoolContextId(user: AuthenticatedUser | null | undefined) {
  const [membership] = getActiveSchoolMemberships(user);
  return membership?.schoolId ?? user?.schoolId ?? null;
}

export function normalizeSchoolContextId(
  user: AuthenticatedUser | null | undefined,
  requestedSchoolId: string | null | undefined,
) {
  const accessibleSchoolIds = getAccessibleSchoolIds(user);
  if (requestedSchoolId && accessibleSchoolIds.includes(requestedSchoolId)) {
    return requestedSchoolId;
  }

  return getDefaultSchoolContextId(user);
}

export function getPrimarySchoolName(user: AuthenticatedUser | null | undefined) {
  const [membership] = getActiveSchoolMemberships(user);
  return membership?.school.name ?? null;
}
