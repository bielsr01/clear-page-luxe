import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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

  const loadRoles = async (userId: string) => {
    setRolesLoading(true);
    try {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (error) {
        console.error("Error loading roles:", error);
        setRoles([]);
      } else {
        setRoles((data?.map((r) => r.role) as AppRole[]) ?? []);
      }
    } catch (err) {
      console.error("Exception loading roles:", err);
      setRoles([]);
    } finally {
      setRolesLoading(false);
    }
  };

  useEffect(() => {
    let currentUserId: string | null = null;

    const initAuth = async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      
      if (initialSession?.user) {
        currentUserId = initialSession.user.id;
        setRolesLoading(true);
        await loadRoles(initialSession.user.id);
      }
      setLoading(false);
    };

    initAuth();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      const newId = newSession?.user?.id ?? null;
      
      if (newId && newId !== currentUserId) {
        currentUserId = newId;
        setRolesLoading(true);
        loadRoles(newId);
      } else if (!newId) {
        currentUserId = null;
        setRoles([]);
        setRolesLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

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
