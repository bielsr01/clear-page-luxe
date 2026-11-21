import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "master_admin" | "manager" | "customer";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  rolesLoading: boolean;
  isMasterAdmin: boolean;
  isManager: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(false);
  const identityRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const roleRequestRef = useRef(0);
  const rolesRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRoles = useCallback(async (userId: string) => {
    if (!mountedRef.current || identityRef.current !== userId) return;
    const request = ++roleRequestRef.current;
    if (rolesRetryRef.current) clearTimeout(rolesRetryRef.current);
    setRolesLoading(true);
    try {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (!mountedRef.current || identityRef.current !== userId || request !== roleRequestRef.current) return;
      if (error) throw error;
      setRoles((data?.map((r) => r.role) as AppRole[]) ?? []);
      setRolesLoading(false);
    } catch {
      if (!mountedRef.current || identityRef.current !== userId || request !== roleRequestRef.current) return;
      // A failed lookup is not proof that the user has no role. Keep the
      // access gate pending and retry; RLS remains authoritative throughout.
      rolesRetryRef.current = setTimeout(() => { void loadRoles(userId); }, 2_000);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let receivedAuthEvent = false;
    let stopped = false;
    let sessionRetry: ReturnType<typeof setTimeout> | undefined;
    const roleTimers = new Set<ReturnType<typeof setTimeout>>();

    const applySession = (newSession: Session | null) => {
      if (stopped) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      const newId = newSession?.user?.id ?? null;
      // Only (re)load roles when the user identity actually changes.
      // Avoids unmounting the app on TOKEN_REFRESHED when switching browser tabs.
      if (newId && newId !== identityRef.current) {
        identityRef.current = newId;
        setRoles([]);
        setRolesLoading(true);
        // Do not call Supabase inside its auth callback (auth lock).
        const timer = setTimeout(() => {
          roleTimers.delete(timer);
          void loadRoles(newId);
        }, 0);
        roleTimers.add(timer);
      } else if (!newId) {
        identityRef.current = null;
        ++roleRequestRef.current;
        if (rolesRetryRef.current) clearTimeout(rolesRetryRef.current);
        setRoles([]);
        setRolesLoading(false);
      }
      setLoading(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      receivedAuthEvent = true;
      applySession(newSession);
    });

    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        // A newer auth event wins over a stale bootstrap response, including
        // a null response that arrived after successful sign-in.
        if (stopped || receivedAuthEvent) return;
        if (error) throw error;
        applySession(data.session);
      } catch {
        if (!stopped && !receivedAuthEvent) sessionRetry = setTimeout(restoreSession, 2_000);
      }
    };
    void restoreSession();

    return () => {
      stopped = true;
      mountedRef.current = false;
      ++roleRequestRef.current;
      clearTimeout(sessionRetry);
      if (rolesRetryRef.current) clearTimeout(rolesRetryRef.current);
      roleTimers.forEach(clearTimeout);
      sub.subscription.unsubscribe();
    };
  }, [loadRoles]);

  const signOut = async () => {
    try {
      const { cleanupIfoodWidgetDom } = await import("@/components/dashboard/IfoodWidgetMount");
      cleanupIfoodWidgetDom();
    } catch {}
    await supabase.auth.signOut();
    setRoles([]);
  };

  const refreshRoles = async () => {
    if (user) await loadRoles(user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        roles,
        loading,
        rolesLoading,
        isMasterAdmin: roles.includes("master_admin"),
        isManager: roles.includes("manager"),
        signOut,
        refreshRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
