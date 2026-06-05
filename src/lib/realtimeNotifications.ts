import type { QueryClient } from "@tanstack/react-query";

export type RealtimeNotification = {
  id: string;
  title: string;
  body: string;
  type?: string | null;
  category?: string | null;
  data?: Record<string, unknown> | null;
  created_at?: string;
  read_at?: string | null;
};

type NotificationRealtimeFilter = {
  event: "INSERT" | "UPDATE";
  schema: "public";
  table: "notifications";
  filter: string;
};

type NotificationRealtimePayload = {
  new?: unknown;
};

export type RealtimeNotificationChannel = {
  on: (
    type: "postgres_changes",
    filter: NotificationRealtimeFilter,
    callback: (payload: NotificationRealtimePayload) => void,
  ) => RealtimeNotificationChannel;
  subscribe: () => unknown;
};

export type RealtimeNotificationClient = {
  channel: (topic: string) => RealtimeNotificationChannel;
  removeChannel: (channel: RealtimeNotificationChannel) => unknown;
};

type NotificationSubscriber = {
  queryClient: QueryClient;
  onInsert?: (notification: RealtimeNotification) => void;
};

type RealtimeNotificationEntry = {
  channel: RealtimeNotificationChannel;
  subscribers: Map<symbol, NotificationSubscriber>;
};

type RealtimeNotificationManagerOptions = {
  client: RealtimeNotificationClient;
  topicPrefix?: string;
};

let globalNotificationTopicSequence = 0;

function createUniqueNotificationTopic(topicPrefix: string, userId: string) {
  globalNotificationTopicSequence += 1;
  const randomPart = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${topicPrefix}:${userId}:${globalNotificationTopicSequence}:${randomPart}`;
}

function invalidateNotificationQueries(queryClient: QueryClient, userId: string) {
  queryClient.invalidateQueries({ queryKey: ["navbar-notifications", userId] });
  queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
}

function subscribeNotifications(
  client: RealtimeNotificationClient,
  topic: string,
  userId: string,
  onInsert: (notification: RealtimeNotification) => void,
  onUpdate: () => void,
) {
  const channel = client
    .channel(topic)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onInsert(payload.new as RealtimeNotification);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      onUpdate,
    );

  channel.subscribe();
  return channel;
}

export function createRealtimeNotificationManager({
  client,
  topicPrefix = "realtime-notifications",
}: RealtimeNotificationManagerOptions) {
  const entries = new Map<string, RealtimeNotificationEntry>();

  return {
    retain(userId: string, subscriber: NotificationSubscriber) {
      let entry = entries.get(userId);

      if (!entry) {
        const subscribers = new Map<symbol, NotificationSubscriber>();
        const notifySubscribers = (notification?: RealtimeNotification) => {
          for (const current of subscribers.values()) {
            invalidateNotificationQueries(current.queryClient, userId);
            if (notification) {
              current.onInsert?.(notification);
            }
          }
        };

        const channel = subscribeNotifications(
          client,
          createUniqueNotificationTopic(topicPrefix, userId),
          userId,
          (notification) => notifySubscribers(notification),
          () => notifySubscribers(),
        );

        entry = { channel, subscribers };
        entries.set(userId, entry);
      }

      const subscriberId = Symbol(userId);
      entry.subscribers.set(subscriberId, subscriber);

      let released = false;
      return () => {
        if (released) return;
        released = true;

        const currentEntry = entries.get(userId);
        if (!currentEntry) return;

        currentEntry.subscribers.delete(subscriberId);
        if (currentEntry.subscribers.size === 0) {
          entries.delete(userId);
          void client.removeChannel(currentEntry.channel);
        }
      };
    },
  };
}
