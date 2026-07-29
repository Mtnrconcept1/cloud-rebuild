import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export type UserRole = "client" | "restaurateur" | "admin" | "courier" | "commercial";

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /**
   * Faux tant que les roles de l'utilisateur connecte n'ont pas ete lus.
   * Une liste de roles vide ne suffit pas a conclure a un refus d'acces : elle
   * peut simplement signifier que la lecture n'a pas encore eu lieu.
   */
  rolesResolved: boolean;
  /** Currently active role (for navigation & route protection) */
  role: UserRole | null;
  /** All roles assigned to this user */
  roles: UserRole[];
  /** True when Supabase assigns the backend admin role */
  isSuperAdmin: boolean;
  /** Whether the current user is allowed to switch active spaces */
  canSwitchRole: boolean;
  /** Switch the active role */
  switchRole: (role: UserRole) => void;
  /** Reload roles after an authenticated onboarding or admin operation. */
  refreshRoles: () => Promise<UserRole[]>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  rolesResolved: false,
  role: null,
  roles: [],
  isSuperAdmin: false,
  canSwitchRole: false,
  switchRole: () => { },
  refreshRoles: async () => [],
  signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);
