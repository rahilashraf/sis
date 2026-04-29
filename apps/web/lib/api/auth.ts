import { apiConfig } from "./config";
import { apiFetch } from "./client";
import type { AuthenticatedUser, LoginResponse } from "../auth/types";

export function login(username: string, password: string) {
  return apiFetch<LoginResponse>(apiConfig.endpoints.login, {
    method: "POST",
    auth: false,
    json: {
      username,
      password,
    },
  });
}

export function getCurrentUser() {
  return apiFetch<AuthenticatedUser>(apiConfig.endpoints.me);
}

export function logout() {
  return apiFetch<{ success: true }>(apiConfig.endpoints.logout, {
    method: "POST",
    auth: false,
  });
}

export type UpdateMyProfileInput = {
  firstName?: string;
  lastName?: string;
  phone?: string;
};

export type ChangeMyPasswordInput = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type MySecurityInfo = {
  username: string;
  email: string | null;
  role: string;
  linkedChildrenCount: number;
  mfaEnabled: boolean;
  activeSessionsTracked: boolean;
  lastPasswordChangeAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChangeMyPasswordResponse = {
  success: boolean;
  message: string;
  shouldReauthenticate: boolean;
  sessionInvalidationSupported: boolean;
};

export function updateMyProfile(input: UpdateMyProfileInput) {
  return apiFetch<AuthenticatedUser>("/auth/me/profile", {
    method: "PATCH",
    json: input,
  });
}

export function changeMyPassword(input: ChangeMyPasswordInput) {
  return apiFetch<ChangeMyPasswordResponse>("/auth/me/change-password", {
    method: "POST",
    json: input,
  });
}

export function getMySecurity() {
  return apiFetch<MySecurityInfo>("/auth/me/security");
}
