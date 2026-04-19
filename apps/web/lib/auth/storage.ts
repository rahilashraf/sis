import type { AuthenticatedUser, StoredSession } from "./types";

const STORAGE_KEY = "sis_session";
const SCHOOL_CONTEXT_KEY = "sis_school_context";

export type SessionSnapshot = StoredSession | null;

let cachedRawSession: string | null = null;
let cachedParsedSession: SessionSnapshot = null;
let cachedSchoolContext: string | null = null;

export function getStoredSessionSnapshot(): SessionSnapshot {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (raw === cachedRawSession) {
    return cachedParsedSession;
  }

  cachedRawSession = raw;

  if (!raw) {
    cachedParsedSession = null;
    return cachedParsedSession;
  }

  try {
    cachedParsedSession = JSON.parse(raw) as StoredSession;
    return cachedParsedSession;
  } catch {
    cachedParsedSession = null;
    return cachedParsedSession;
  }
}

export function storeSession(session: StoredSession) {
  if (typeof window === "undefined") {
    return;
  }

  const raw = JSON.stringify(session);
  cachedRawSession = raw;
  cachedParsedSession = session;
  window.localStorage.setItem(STORAGE_KEY, raw);
  window.dispatchEvent(new Event("sis-auth-changed"));
}

export function clearStoredSession() {
  if (typeof window === "undefined") {
    return;
  }

  cachedRawSession = null;
  cachedParsedSession = null;
  cachedSchoolContext = null;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(SCHOOL_CONTEXT_KEY);
  window.dispatchEvent(new Event("sis-auth-changed"));
}

export function subscribeToStoredSession(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onChange = () => callback();

  window.addEventListener("storage", onChange);
  window.addEventListener("sis-auth-changed", onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("sis-auth-changed", onChange);
  };
}

export function getStoredSchoolContextSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  const nextValue = window.localStorage.getItem(SCHOOL_CONTEXT_KEY);
  cachedSchoolContext = nextValue;
  return cachedSchoolContext;
}

export function storeSchoolContext(schoolId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  cachedSchoolContext = schoolId;
  if (!schoolId) {
    window.localStorage.removeItem(SCHOOL_CONTEXT_KEY);
  } else {
    window.localStorage.setItem(SCHOOL_CONTEXT_KEY, schoolId);
  }
  window.dispatchEvent(new Event("sis-auth-changed"));
}

export function getAccessToken(): string | null {
  return getStoredSessionSnapshot()?.accessToken ?? null;
}

export function getStoredUser(): AuthenticatedUser | null {
  return getStoredSessionSnapshot()?.user ?? null;
}
