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
