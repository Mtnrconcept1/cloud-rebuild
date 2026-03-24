import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEnv } from "./auth.ts";

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
  userId?: string;
};

type NotificationDispatchFailure = {
  channel: "push" | "email";
  message: string;
};

type NotificationDispatchResult = {
  attemptedChannels: Array<"push" | "email">;
  failedChannels: NotificationDispatchFailure[];
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

async function callDispatcher(
  functionName: "send-push" | "send-email",
  input: { source?: string; userId?: string } = {},
) {
  const baseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!baseUrl || !serviceRoleKey) return;

  const response = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      source: input.source || "notifications",
      user_id: input.userId || null,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${functionName} failed: ${response.status} ${body}`);
  }
}

export async function triggerNotificationDispatch(
  input: TriggerDispatchInput = {},
): Promise<NotificationDispatchResult> {
  const tasks: Array<{ channel: "push" | "email"; promise: Promise<void> }> = [];

  if (input.push !== false) {
    tasks.push({
      channel: "push",
      promise: callDispatcher("send-push", {
        source: input.source,
        userId: input.userId,
      }),
    });
  }

  if (input.email === true) {
    tasks.push({
      channel: "email",
      promise: callDispatcher("send-email", {
        source: input.source,
        userId: input.userId,
      }),
    });
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.promise));
  const failedChannels: NotificationDispatchFailure[] = settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return [];

    return [{
      channel: tasks[index].channel,
      message: result.reason instanceof Error ? result.reason.message : "Notification dispatch failed",
    }];
  });

  if (failedChannels.length > 0) {
    console.warn("[notifications] partial dispatch failure:", failedChannels);
  }

  return {
    attemptedChannels: tasks.map((task) => task.channel),
    failedChannels,
  };
}
