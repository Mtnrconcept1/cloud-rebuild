import { useQuery } from "@tanstack/react-query";

import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { SignupApplication, SignupRole } from "@/lib/signup";

const supabase = getSupabase();

export function useSignupApplication(role?: SignupRole) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["signup-application", user?.id, role || "all"],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) {
        return role ? null : [];
      }

      let query = supabase.from("signup_applications")
        .select(`
          *,
          signup_application_documents (*)
        `)
        .eq("user_id", user.id)
        .order("submitted_at", { ascending: false });

      if (role) {
        query = query.eq("requested_role", role).limit(1);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const rows = (data || []) as SignupApplication[];
      return role ? rows[0] || null : rows;
    },
  });
}
