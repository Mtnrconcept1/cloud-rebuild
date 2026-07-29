import { useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { isCommercialDemoWorkspaceActive } from "@/integrations/supabase/demoClient";
import type { Session, User } from "@supabase/supabase-js";
import { setMonitoringUser } from "@/lib/monitoring";
import {
  clearAuthenticatedBrowserState,
  disablePushForCurrentSession,
} from "@/lib/sessionCleanup";
import {
  canSwitchRoles,
  getDefaultActiveRole,
  getEffectiveRoles,
} from "@/lib/roleAccess";
import { AuthContext, type UserRole } from "@/lib/auth-context";

const ACTIVE_ROLE_KEY = "miamz-active-role";
const DEMO_ACTIVE_ROLE_KEY = "miamz-demo-active-role";

function getActiveRoleStorageKey() {
  return isCommercialDemoWorkspaceActive() ? DEMO_ACTIVE_ROLE_KEY : ACTIVE_ROLE_KEY;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<UserRole[]>([]);
  // Utilisateur dont les roles sont effectivement lus. Distingue « aucun role »
  // de « roles pas encore charges » : sans cette distinction, le rendu qui
  // precede l'effet de chargement expose un utilisateur connecte avec une liste
  // vide, et les gardes de route y lisent un refus d'acces.
  const [resolvedRolesUserId, setResolvedRolesUserId] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole | null>(null);
  const [initialSessionReceived, setInitialSessionReceived] = useState(false);
  const lastSessionUserIdRef = useRef<string | null>(null);
  const userId = user?.id ?? null;

  const clearLocalAuthenticatedState = useCallback(() => {
    clearAuthenticatedBrowserState();
    queryClient.clear();
  }, [queryClient]);

  const resolveRolesWithFallback = useCallback(async (userId: string) => {
    const supabase = getSupabase();
    const resolvedRoles = new Set<UserRole>();

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (!error) {
      for (const row of data || []) {
        const role = row.role as UserRole;
        if (role === "client" || role === "restaurateur" || role === "admin" || role === "courier" || role === "commercial") {
          resolvedRoles.add(role);
        }
      }

      if (resolvedRoles.size > 0) {
        return Array.from(resolvedRoles);
      }
    } else {
      console.error("[auth] failed to read user_roles directly, trying has_role fallback", error.message);
    }

    const privilegedRoles: UserRole[] = ["admin", "restaurateur", "courier", "commercial"];

    const fallbackChecks = await Promise.all(
      privilegedRoles.map(async (role) => {
        const { data: hasRole, error: hasRoleError } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: role,
        });

        if (hasRoleError) {
          console.error(`[auth] has_role fallback failed for ${role}`, hasRoleError.message);
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

    // Legacy customer accounts may have no explicit user_roles row. Keep the
    // client fallback only for that case; never inject it into a commercial,
    // courier, restaurant or admin account that already has an assigned role.
    if (resolvedRoles.size === 0) {
      resolvedRoles.add("client");
    }

    return Array.from(resolvedRoles);
  }, []);

  const fetchRoles = useCallback(async (userId: string) => {
    return resolveRolesWithFallback(userId);
  }, [resolveRolesWithFallback]);

  const applyRoles = useCallback((fetchedRoles: UserRole[]) => {
    const effectiveRoles = getEffectiveRoles(fetchedRoles);
    setRoles(effectiveRoles);

    const storageKey = getActiveRoleStorageKey();
    const saved = localStorage.getItem(storageKey) as UserRole | null;
    if (canSwitchRoles(effectiveRoles) && saved && effectiveRoles.includes(saved)) {
      setActiveRole(saved);
      return;
    }

    const best = getDefaultActiveRole(effectiveRoles);
    setActiveRole(best);
    localStorage.setItem(storageKey, best);
  }, []);

  const switchRole = useCallback((role: UserRole) => {
    if (!user || !canSwitchRoles(roles) || !roles.includes(role)) return;

    setActiveRole(role);
    localStorage.setItem(getActiveRoleStorageKey(), role);
  }, [roles, user]);

  const refreshRoles = useCallback(async () => {
    if (!userId) return [];
    const fetchedRoles = await fetchRoles(userId);
    applyRoles(fetchedRoles);
    setResolvedRolesUserId(userId);
    return getEffectiveRoles(fetchedRoles);
  }, [applyRoles, fetchRoles, userId]);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return;
        setSession(session);
        setUser(session?.user ?? null);
        setMonitoringUser(session?.user ?? null);
        lastSessionUserIdRef.current = session?.user?.id ?? null;
        setInitialSessionReceived(true);
      })
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : "unknown";
        console.error("[auth] failed to refresh initial session", message);

        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch (signOutError) {
          const signOutMessage = signOutError instanceof Error ? signOutError.message : "unknown";
          console.error("[auth] failed to clear local session after refresh error", signOutMessage);
        }

        if (cancelled) return;
        clearLocalAuthenticatedState();
        setSession(null);
        setUser(null);
        setMonitoringUser(null);
        setRoles([]);
        setResolvedRolesUserId(null);
        setActiveRole(null);
        lastSessionUserIdRef.current = null;
        setInitialSessionReceived(true);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;
        const previousUserId = lastSessionUserIdRef.current;
        const nextUserId = session?.user?.id ?? null;

        if (
          event === "SIGNED_OUT"
          || (previousUserId && (!nextUserId || previousUserId !== nextUserId))
        ) {
          clearLocalAuthenticatedState();
        }

        setSession(session);
        setUser(session?.user ?? null);
        setMonitoringUser(session?.user ?? null);
        if (!session?.user) {
          setRoles([]);
          setResolvedRolesUserId(null);
          setActiveRole(null);
        }
        lastSessionUserIdRef.current = nextUserId;
        setInitialSessionReceived(true);
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [clearLocalAuthenticatedState]);

  useEffect(() => {
    let cancelled = false;

    if (!initialSessionReceived) return;

    if (!userId) {
      setRoles([]);
      setResolvedRolesUserId(null);
      setActiveRole(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void fetchRoles(userId)
      .then((fetchedRoles) => {
        if (cancelled) return;
        applyRoles(fetchedRoles);
          setResolvedRolesUserId(userId);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applyRoles, fetchRoles, userId, initialSessionReceived]);

  const signOut = async () => {
    const signedOutUserId = user?.id ?? session?.user?.id ?? null;
    if (signedOutUserId) {
      try {
        await disablePushForCurrentSession(signedOutUserId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        console.warn("[auth] failed to disable current push token during sign out", message);
      }
    }

    clearLocalAuthenticatedState();
    try {
      const { error } = await getSupabase().auth.signOut();
      if (error) {
        console.warn("[auth] remote sign out failed after local cleanup", error.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      console.warn("[auth] remote sign out failed after local cleanup", message);
    }
    setUser(null);
    setSession(null);
    setMonitoringUser(null);
    setRoles([]);
    setResolvedRolesUserId(null);
    setActiveRole(null);
    lastSessionUserIdRef.current = null;
    localStorage.removeItem(getActiveRoleStorageKey());
  };

  const isSuperAdmin = roles.includes("admin");
  const canSwitchRole = canSwitchRoles(roles);

  return (
    <AuthContext.Provider value={{ user, session, loading, rolesResolved: !user || resolvedRolesUserId === user.id, role: activeRole, roles, isSuperAdmin, canSwitchRole, switchRole, refreshRoles, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export type { UserRole } from "@/lib/auth-context";
