import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { setMonitoringUser } from "@/lib/monitoring";
import {
  canSwitchRoles,
  getDefaultActiveRole,
  getEffectiveRoles,
  isSuperAdminEmail,
} from "@/lib/roleAccess";

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
  /** True only for the configured cross-role super admin account */
  isSuperAdmin: boolean;
  /** Whether the current user is allowed to switch active spaces */
  canSwitchRole: boolean;
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
  isSuperAdmin: false,
  canSwitchRole: false,
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
  const [initialSessionReceived, setInitialSessionReceived] = useState(false);

  const resolveRolesWithFallback = useCallback(async (userId: string) => {
    const supabase = getSupabase();
    const resolvedRoles = new Set<UserRole>(["client"]);

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (!error) {
      for (const row of data || []) {
        const role = row.role as UserRole;
        if (role === "client" || role === "restaurateur" || role === "admin" || role === "courier") {
          resolvedRoles.add(role);
        }
      }

      if (resolvedRoles.size > 1) {
        return Array.from(resolvedRoles);
      }
    } else {
      console.error("[auth] failed to read user_roles directly, trying has_role fallback", error);
    }

    const privilegedRoles: UserRole[] = ["admin", "restaurateur", "courier"];

    const fallbackChecks = await Promise.all(
      privilegedRoles.map(async (role) => {
        const { data: hasRole, error: hasRoleError } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: role,
        });

        if (hasRoleError) {
          console.error(`[auth] has_role fallback failed for ${role}`, hasRoleError);
          return null;
        }

        return hasRole ? role : null;
      }),
    );

    for (const role of fallbackChecks) {
      if (role) {
        resolvedRoles.add(role);
      }
    }

    return Array.from(resolvedRoles);
  }, []);

  const fetchRoles = useCallback(async (userId: string) => {
    return resolveRolesWithFallback(userId);
  }, [resolveRolesWithFallback]);

  const applyRoles = useCallback((fetchedRoles: UserRole[], currentUser: User) => {
    const effectiveRoles = getEffectiveRoles(fetchedRoles, currentUser.email);
    setRoles(effectiveRoles);

    const saved = localStorage.getItem(ACTIVE_ROLE_KEY) as UserRole | null;
    if (canSwitchRoles(effectiveRoles, currentUser.email) && saved && effectiveRoles.includes(saved)) {
      setActiveRole(saved);
      return;
    }

    const best = getDefaultActiveRole(effectiveRoles, currentUser.email);
    setActiveRole(best);
    localStorage.setItem(ACTIVE_ROLE_KEY, best);
  }, []);

  const switchRole = useCallback((role: UserRole) => {
    if (!user || !canSwitchRoles(roles, user.email) || !roles.includes(role)) return;

    setActiveRole(role);
    localStorage.setItem(ACTIVE_ROLE_KEY, role);
  }, [roles, user]);

  useEffect(() => {
    let cancelled = false;

    getSupabase().auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setSession(session);
      setUser(session?.user ?? null);
      setMonitoringUser(session?.user ?? null);
      setInitialSessionReceived(true);
    });

    const { data: { subscription } } = getSupabase().auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return;
        setSession(session);
        setUser(session?.user ?? null);
        setMonitoringUser(session?.user ?? null);
        if (!session?.user) {
          setRoles([]);
          setActiveRole(null);
        }
        setInitialSessionReceived(true);
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!initialSessionReceived) return;

    if (!user?.id) {
      setRoles([]);
      setActiveRole(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void fetchRoles(user.id)
      .then((fetchedRoles) => {
        if (cancelled) return;
        applyRoles(fetchedRoles, user);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applyRoles, fetchRoles, user, initialSessionReceived]);

  const signOut = async () => {
    await getSupabase().auth.signOut();
    setUser(null);
    setSession(null);
    setMonitoringUser(null);
    setRoles([]);
    setActiveRole(null);
    localStorage.removeItem(ACTIVE_ROLE_KEY);
  };

  const isSuperAdmin = isSuperAdminEmail(user?.email);
  const canSwitchRole = canSwitchRoles(roles, user?.email);

  return (
    <AuthContext.Provider value={{ user, session, loading, role: activeRole, roles, isSuperAdmin, canSwitchRole, switchRole, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
