import { apiFetch } from "./client";

export type AuditSettings = {
  enabled: boolean;
};

export function getAuditSettings() {
  return apiFetch<AuditSettings>("/settings/audit");
}

export function updateAuditSettings(input: { enabled: boolean }) {
  return apiFetch<AuditSettings>("/settings/audit", {
    method: "PATCH",
    json: input,
  });
}
