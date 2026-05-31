import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export type UserRole = "client" | "restaurateur" | "admin" | "courier";

export interface AuthContextType {
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

export const AuthContext = createContext<AuthContextType>({
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
