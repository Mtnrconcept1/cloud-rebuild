import { supabase } from "@/integrations/supabase/client";

type DispatchNotificationOptions = {
  push?: boolean;
  email?: boolean;
};

export async function dispatchQueuedNotifications(
  source: string,
  options: DispatchNotificationOptions = {},
) {
  const { data, error } = await supabase.functions.invoke("notification-dispatch", {
    body: {
      source,
      push: options.push ?? true,
      email: options.email ?? true,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data?.error) {
    throw new Error(String(data.error));
  }

  return data;
}
