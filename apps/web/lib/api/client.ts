import { apiConfig } from "./config";
import { clearStoredSession, getStoredSessionSnapshot } from "../auth/storage";

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  auth?: boolean;
  body?: BodyInit | null;
  json?: unknown;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "message" in payload
        ? Array.isArray(payload.message)
          ? payload.message.join(", ")
          : typeof payload.message === "string"
            ? payload.message
            : response.statusText || "Request failed"
        : response.statusText || "Request failed";

    throw new Error(message);
  }

  return payload as T;
}

function handleUnauthorized() {
  clearStoredSession();

  if (typeof window !== "undefined") {
    window.location.assign("/login");
  }
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
) {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (options.auth !== false) {
    const session = getStoredSessionSnapshot();

    if (session?.accessToken) {
      headers.set("Authorization", `Bearer ${session.accessToken}`);
    }
  }

  const url = path.startsWith("http") ? path : `${apiConfig.baseUrl}${path}`;

  const response = await fetch(url, {
    ...options,
    headers,
    body:
      options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Unauthorized");
  }

  return parseResponse<T>(response);
}
