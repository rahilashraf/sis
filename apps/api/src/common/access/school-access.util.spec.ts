import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ensureUserHasSchoolAccess, isBypassRole } from './school-access.util';

describe('school-access util', () => {
  it('treats only owner and super admin as bypass roles', () => {
    expect(isBypassRole(UserRole.OWNER)).toBe(true);
    expect(isBypassRole(UserRole.SUPER_ADMIN)).toBe(true);
    expect(isBypassRole(UserRole.ADMIN)).toBe(false);
  });

  it('enforces school membership checks for admin users', () => {
    expect(() =>
      ensureUserHasSchoolAccess(
        {
          id: 'admin-1',
          role: UserRole.ADMIN,
          memberships: [{ schoolId: 'school-1' }],
        },
        'school-2',
      ),
    ).toThrow(ForbiddenException);
  });
});
