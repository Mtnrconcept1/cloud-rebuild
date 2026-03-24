import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

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

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const fetchedRoles = (data || []).map((r) => r.role as UserRole);
    // Always include "client" as a base role
    if (!fetchedRoles.includes("client")) fetchedRoles.unshift("client");
    setRoles(fetchedRoles);

    // Restore saved role preference or pick highest priority
    const saved = localStorage.getItem(ACTIVE_ROLE_KEY) as UserRole | null;
    if (saved && fetchedRoles.includes(saved)) {
      setActiveRole(saved);
    } else {
      // Priority: admin > restaurateur > courier > client
      const priority: UserRole[] = ["admin", "restaurateur", "courier", "client"];
      const best = priority.find((r) => fetchedRoles.includes(r)) || "client";
      setActiveRole(best);
    }
  };

  const switchRole = useCallback((role: UserRole) => {
    setActiveRole(role);
    localStorage.setItem(ACTIVE_ROLE_KEY, role);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchRoles(session.user.id), 0);
        } else {
          setRoles([]);
          setActiveRole(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchRoles(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
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