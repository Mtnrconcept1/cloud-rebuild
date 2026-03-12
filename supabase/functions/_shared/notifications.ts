import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type NotificationChannels = {
  in_app?: boolean;
  push?: boolean;
  email?: boolean;
};

type EnqueueNotificationInput = {
  adminClient: ReturnType<typeof createClient>;
  userId: string;
  title: string;
  body: string;
  type: string;
  category: string;
  data?: Record<string, unknown>;
  requestedChannels?: NotificationChannels;
};

type TriggerDispatchInput = {
  push?: boolean;
  email?: boolean;
  source?: string;
};

export async function enqueueNotification(input: EnqueueNotificationInput) {
  const payload = { ...(input.data || {}) };
  if (input.requestedChannels) {
    payload.requested_channels = input.requestedChannels;
  }

  const { data, error } = await input.adminClient.rpc("enqueue_notification", {
    p_user_id: input.userId,
    p_title: input.title,
    p_body: input.body,
    p_type: input.type,
    p_category: input.category,
    p_data: payload,
  });

  if (error) throw error;
  return data as string | null;
}

async function callDispatcher(functionName: "send-push" | "send-email", source?: string) {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!baseUrl || !serviceRoleKey) return;

  const response = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ source: source || "notifications" }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${functionName} failed: ${response.status} ${body}`);
  }
}

export async function triggerNotificationDispatch(input: TriggerDispatchInput = {}) {
  const tasks: Promise<void>[] = [];

  if (input.push !== false) {
    tasks.push(callDispatcher("send-push", input.source));
  }

  if (input.email === true) {
    tasks.push(callDispatcher("send-email", input.source));
  }

  await Promise.all(tasks);
}
