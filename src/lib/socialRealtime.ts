export const SOCIAL_REALTIME_TABLES = [
  "social_posts",
  "social_post_media",
  "social_post_likes",
  "social_post_comments",
  "social_comment_reactions",
  "social_post_reposts",
  "restaurant_follows",
  "social_post_saves",
  "social_feed_feedback",
  "social_feed_events",
  "social_post_metrics_daily",
] as const;

type SocialRealtimeFilter = {
  event: "*";
  schema: "public";
  table: (typeof SOCIAL_REALTIME_TABLES)[number];
};

export type SocialRealtimeChannel = {
  on: (type: "postgres_changes", filter: SocialRealtimeFilter, callback: () => void) => SocialRealtimeChannel;
  subscribe: () => unknown;
};

export type SocialRealtimeClient = {
  channel: (topic: string) => SocialRealtimeChannel;
  removeChannel: (channel: SocialRealtimeChannel) => unknown;
};

type SocialRealtimeEntry<TQueryClient> = {
  channel: SocialRealtimeChannel;
  clientRefs: Map<TQueryClient, number>;
  refCount: number;
};

type SocialRealtimeManagerOptions<TQueryClient> = {
  client: SocialRealtimeClient;
  onInvalidate: (queryClient: TQueryClient) => void;
  topicPrefix?: string;
};

export function createSocialRealtimeManager<TQueryClient>({
  client,
  onInvalidate,
  topicPrefix = "social-feed",
}: SocialRealtimeManagerOptions<TQueryClient>) {
  let sequence = 0;
  const entries = new Map<string, SocialRealtimeEntry<TQueryClient>>();

  return {
    retain(userId: string, queryClient: TQueryClient) {
      let entry = entries.get(userId);

      if (!entry) {
        sequence += 1;
        const topic = `${topicPrefix}:${userId}:${sequence}`;
        const clientRefs = new Map<TQueryClient, number>();
        const notifySubscribers = () => {
          for (const clientRef of clientRefs.keys()) {
            onInvalidate(clientRef);
          }
        };

        const channel = client.channel(topic);
        for (const table of SOCIAL_REALTIME_TABLES) {
          channel.on("postgres_changes", { event: "*", schema: "public", table }, notifySubscribers);
        }
        channel.subscribe();

        entry = { channel, clientRefs, refCount: 0 };
        entries.set(userId, entry);
      }

      entry.refCount += 1;
      entry.clientRefs.set(queryClient, (entry.clientRefs.get(queryClient) ?? 0) + 1);

      let released = false;
      return () => {
        if (released) return;
        released = true;

        const currentClientCount = entry.clientRefs.get(queryClient) ?? 0;
        if (currentClientCount <= 1) {
          entry.clientRefs.delete(queryClient);
        } else {
          entry.clientRefs.set(queryClient, currentClientCount - 1);
        }

        entry.refCount -= 1;
        if (entry.refCount <= 0) {
          entries.delete(userId);
          void client.removeChannel(entry.channel);
        }
      };
    },
  };
}
