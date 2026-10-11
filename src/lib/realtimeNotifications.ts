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
  subscribe: (callback?: (status: string) => void) => unknown;
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
  cleanup: () => void;
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
  onStatus: (status: string) => void,
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
        const notification = payload.new;
        if (!notification || typeof notification !== "object" ||
            typeof (notification as RealtimeNotification).id !== "string") return;
        onInsert(notification as RealtimeNotification);
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

  channel.subscribe(onStatus);
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

        let catchupInterval: ReturnType<typeof setInterval> | null = null;
        const clearCatchup = () => {
          if (catchupInterval) clearInterval(catchupInterval);
          catchupInterval = null;
        };
        let disposed = false;
        const handleStatus = (status: string) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            clearCatchup();
            notifySubscribers();
          } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
            notifySubscribers();
            if (!catchupInterval) catchupInterval = setInterval(notifySubscribers, 60_000);
          }
        };
        const channel = subscribeNotifications(
          client,
          createUniqueNotificationTopic(topicPrefix, userId),
          userId,
          (notification) => notifySubscribers(notification),
          () => notifySubscribers(),
          handleStatus,
        );

        entry = { channel, subscribers, cleanup: () => { disposed = true; clearCatchup(); } };
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
          currentEntry.cleanup();
          void client.removeChannel(currentEntry.channel);
        }
      };
    },
  };
}
