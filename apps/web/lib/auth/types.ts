export type UserRole =
  | "OWNER"
  | "SUPER_ADMIN"
  | "ADMIN"
  | "STAFF"
  | "TEACHER"
  | "PARENT"
  | "STUDENT"
  | "SUPPLY_TEACHER";

export type UserSchoolMembership = {
  id: string;
  schoolId: string;
  isActive: boolean;
  createdAt: string;
  school: {
    id: string;
    name: string;
    shortName: string | null;
    isActive: boolean;
  };
};

export type AuthenticatedUser = {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  memberships: UserSchoolMembership[];
};

export type StoredSession = {
  accessToken: string;
  user: AuthenticatedUser;
};

export type LoginResponse = {
  accessToken: string;
  user: AuthenticatedUser;
};
