import type { AuthenticatedUser, UserRole } from "../auth/types";
import { apiFetch } from "./client";

export type ManagedUser = AuthenticatedUser;
export type UserRemovalResult = {
  success: boolean;
  removalMode: "deleted" | "deactivated";
  reason?: string;
};

export type CreateUserInput = {
  username: string;
  email?: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive?: boolean;
  schoolId?: string;
};

export type UpdateUserInput = {
  username?: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  isActive?: boolean;
};

export function listUsers(options?: {
  includeInactive?: boolean;
  role?: UserRole;
  gradeLevelId?: string;
  sort?: "name" | "createdAt";
}) {
  const query = new URLSearchParams();

  if (options?.includeInactive) {
    query.set("includeInactive", "true");
  }

  if (options?.role) {
    query.set("role", options.role);
  }

  if (options?.gradeLevelId) {
    query.set("gradeLevelId", options.gradeLevelId);
  }

  if (options?.sort && options.sort !== "name") {
    query.set("sort", options.sort);
  }

  return apiFetch<ManagedUser[]>(`/users${query.size ? `?${query.toString()}` : ""}`);
}

export function createUser(input: CreateUserInput) {
  return apiFetch<ManagedUser>("/users", {
    method: "POST",
    json: input,
  });
}

export function updateUser(userId: string, input: UpdateUserInput) {
  return apiFetch<ManagedUser>(`/users/${userId}`, {
    method: "PATCH",
    json: input,
  });
}

export function deleteUser(userId: string) {
  return apiFetch<UserRemovalResult>(`/users/${userId}`, {
    method: "DELETE",
  });
}
