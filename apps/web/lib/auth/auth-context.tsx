"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  clearStoredSession,
  getStoredSessionSnapshot,
  getStoredSchoolContextSnapshot,
  storeSession,
  storeSchoolContext,
  subscribeToStoredSession,
  type SessionSnapshot,
} from "./storage";
import type { AuthenticatedUser, StoredSession } from "./types";
import { normalizeSchoolContextId } from "./school-membership";

type AuthContextValue = {
  session: StoredSession | null;
  status: "loading" | "authenticated" | "unauthenticated";
  user: AuthenticatedUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  selectedSchoolId: string | null;
  setSession: (session: StoredSession) => void;
  updateUser: (user: AuthenticatedUser) => void;
  setSelectedSchoolId: (schoolId: string | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const sessionSnapshot = useSyncExternalStore<SessionSnapshot>(
    subscribeToStoredSession,
    getStoredSessionSnapshot,
    () => null,
  );
  const selectedSchoolContextSnapshot = useSyncExternalStore<string | null>(
    subscribeToStoredSession,
    getStoredSchoolContextSnapshot,
    () => null,
  );

  useEffect(() => {
    setHydrated(true);
  }, []);

  const setSession = useCallback((session: StoredSession) => {
    storeSession(session);
  }, []);

  const updateUser = useCallback(
    (user: AuthenticatedUser) => {
      const currentSession = getStoredSessionSnapshot();

      if (!currentSession) {
        return;
      }

      storeSession({
        ...currentSession,
        user,
      });
    },
    [],
  );

  const logout = useCallback(() => {
    clearStoredSession();
  }, []);

  const setSelectedSchoolId = useCallback((schoolId: string | null) => {
    storeSchoolContext(schoolId);
  }, []);

  const selectedSchoolId = useMemo(
    () =>
      normalizeSchoolContextId(
        sessionSnapshot?.user ?? null,
        selectedSchoolContextSnapshot,
      ),
    [selectedSchoolContextSnapshot, sessionSnapshot?.user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session: sessionSnapshot,
      status: !hydrated
        ? "loading"
        : sessionSnapshot?.accessToken
          ? "authenticated"
          : "unauthenticated",
      user: sessionSnapshot?.user ?? null,
      accessToken: sessionSnapshot?.accessToken ?? null,
      isAuthenticated: Boolean(sessionSnapshot?.accessToken),
      selectedSchoolId,
      setSession,
      updateUser,
      setSelectedSchoolId,
      logout,
    }),
    [
      hydrated,
      selectedSchoolId,
      sessionSnapshot,
      setSelectedSchoolId,
      setSession,
      updateUser,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
