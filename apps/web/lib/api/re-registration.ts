import { apiFetch } from "./client";

export type ReRegistrationWindow = {
  id: string;
  schoolId: string;
  schoolYearId: string;
  opensAt: string;
  closesAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReRegistrationWindowStatus = {
  now: string;
  window: ReRegistrationWindow | null;
  isOpen: boolean;
  status: "OPEN" | "CLOSED" | "NOT_CONFIGURED";
};

export function getReRegistrationWindowStatus(options: { schoolId: string; schoolYearId: string }) {
  const query = new URLSearchParams({ schoolId: options.schoolId, schoolYearId: options.schoolYearId });
  return apiFetch<ReRegistrationWindowStatus>(`/re-registration/window?${query.toString()}`);
}

export function createReRegistrationWindow(input: {
  schoolId: string;
  schoolYearId: string;
  opensAt: string;
  closesAt: string;
  isActive?: boolean;
}) {
  return apiFetch<ReRegistrationWindow>("/re-registration/window", {
    method: "POST",
    json: input,
  });
}

export function updateReRegistrationWindow(
  id: string,
  input: Partial<Pick<ReRegistrationWindow, "opensAt" | "closesAt" | "isActive">>,
) {
  return apiFetch<ReRegistrationWindow>(`/re-registration/window/${id}`, {
    method: "PATCH",
    json: input,
  });
}

export function listReRegistrationWindows(options: { schoolId: string; schoolYearId: string }) {
  const query = new URLSearchParams({
    schoolId: options.schoolId,
    schoolYearId: options.schoolYearId,
  });
  return apiFetch<ReRegistrationWindow[]>(`/re-registration/windows?${query.toString()}`);
}
