import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { setMonitoringUser } from "@/lib/monitoring";

export type UserRole = "client" | "restaurateur" | "admin" | "courier";

const ACTIVE_ROLE_KEY = "miamz-active-role";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Currently active role (for navigation & route protection) */
  role: UserRole | null;
  /** All roles assigned to this user */
  roles: UserRole[];
  /** Switch the active role */
  switchRole: (role: UserRole) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  role: null,
  roles: [],
  switchRole: () => { },
  signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [activeRole, setActiveRole] = useState<UserRole | null>(null);

  const fetchRoles = useCallback(async (userId: string) => {
    const { data } = await getSupabase()
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const fetchedRoles = (data || []).map((r) => r.role as UserRole);
    // Always include "client" as a base role
    if (!fetchedRoles.includes("client")) fetchedRoles.unshift("client");
    return fetchedRoles;
  }, []);

  const applyRoles = useCallback((fetchedRoles: UserRole[]) => {
    setRoles(fetchedRoles);

    const saved = localStorage.getItem(ACTIVE_ROLE_KEY) as UserRole | null;
    if (saved && fetchedRoles.includes(saved)) {
      setActiveRole(saved);
      return;
    }

    const priority: UserRole[] = ["admin", "restaurateur", "courier", "client"];
    const best = priority.find((role) => fetchedRoles.includes(role)) || "client";
    setActiveRole(best);
  }, []);

  const switchRole = useCallback((role: UserRole) => {
    setActiveRole(role);
    localStorage.setItem(ACTIVE_ROLE_KEY, role);
  }, []);

  useEffect(() => {
    let initialised = false;
    let cancelled = false;

    const { data: { subscription } } = getSupabase().auth.onAuthStateChange(
      (_event, session) => {
        // Skip until getSession has finished the first load
        if (!initialised) return;
        if (cancelled) return;
        setSession(session);
        setUser(session?.user ?? null);
        setMonitoringUser(session?.user ?? null);
        if (!session?.user) {
          setRoles([]);
          setActiveRole(null);
        }
      }
    );

    getSupabase().auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setSession(session);
      setUser(session?.user ?? null);
      setMonitoringUser(session?.user ?? null);
      if (!session?.user) {
        setRoles([]);
        setActiveRole(null);
        setLoading(false);
      }
      initialised = true;
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!user?.id) {
      setRoles([]);
      setActiveRole(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    void fetchRoles(user.id)
      .then((fetchedRoles) => {
        if (cancelled) return;
        applyRoles(fetchedRoles);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applyRoles, fetchRoles, user?.id]);

  const signOut = async () => {
    await getSupabase().auth.signOut();
    setUser(null);
    setSession(null);
    setMonitoringUser(null);
    setRoles([]);
    setActiveRole(null);
    localStorage.removeItem(ACTIVE_ROLE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role: activeRole, roles, switchRole, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
