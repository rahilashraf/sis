export type SchoolMembershipLike = {
  schoolId: string;
  isActive?: boolean | null;
};

export function getActiveMembershipSchoolIds(
  memberships: SchoolMembershipLike[] | null | undefined,
) {
  if (!memberships?.length) {
    return [];
  }

  return memberships
    .filter((membership) => membership?.schoolId)
    .filter((membership) => membership.isActive !== false)
    .map((membership) => membership.schoolId);
}

export function getPrimaryMembershipSchoolId(
  memberships: SchoolMembershipLike[] | null | undefined,
) {
  const [schoolId] = getActiveMembershipSchoolIds(memberships);
  return schoolId ?? null;
}

export function getAccessibleSchoolIdsWithLegacyFallback(options: {
  memberships: SchoolMembershipLike[] | null | undefined;
  legacySchoolId?: string | null;
}) {
  const membershipSchoolIds = getActiveMembershipSchoolIds(options.memberships);

  if (membershipSchoolIds.length > 0) {
    return [...new Set(membershipSchoolIds)];
  }

  if (options.legacySchoolId) {
    return [options.legacySchoolId];
  }

  return [];
}

export function getPrimarySchoolIdWithLegacyFallback(options: {
  memberships: SchoolMembershipLike[] | null | undefined;
  legacySchoolId?: string | null;
}) {
  const membershipSchoolId = getPrimaryMembershipSchoolId(options.memberships);
  return membershipSchoolId ?? options.legacySchoolId ?? null;
}
