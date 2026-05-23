import { describe, expect, it } from "vitest";

import {
  SOCIAL_REACTIONS,
  buildSocialCommentThread,
  summarizeSocialReactions,
  type SocialFeedComment,
  type SocialReactionType,
} from "@/lib/socialFeed";

const baseComment = {
  postId: "post-1",
  userId: "user-1",
  body: "Commentaire",
  status: "published",
  createdAt: "2026-05-22T08:00:00.000Z",
  reactionsCount: 0,
  reactionCounts: {},
  myReaction: null,
} satisfies Omit<SocialFeedComment, "id" | "parentCommentId">;

describe("social interactions", () => {
  it("supports a like plus five additional reactions", () => {
    expect(SOCIAL_REACTIONS.map((reaction) => reaction.type)).toEqual([
      "like",
      "love",
      "miam",
      "wow",
      "bravo",
      "fire",
    ]);
  });

  it("summarizes reactions in display order", () => {
    const summary = summarizeSocialReactions({
      fire: 2,
      like: 3,
      love: 1,
    } as Partial<Record<SocialReactionType, number>>);

    expect(summary).toEqual([
      { type: "like", count: 3 },
      { type: "love", count: 1 },
      { type: "fire", count: 2 },
    ]);
  });

  it("groups replies below their parent comments", () => {
    const comments: SocialFeedComment[] = [
      { ...baseComment, id: "reply-1", parentCommentId: "root-1", body: "Reponse" },
      { ...baseComment, id: "root-1", parentCommentId: null, body: "Parent" },
      { ...baseComment, id: "root-2", parentCommentId: null, body: "Autre parent" },
    ];

    const tree = buildSocialCommentThread(comments);

    expect(tree).toHaveLength(2);
    expect(tree[0].comment.id).toBe("root-1");
    expect(tree[0].replies.map((reply) => reply.comment.id)).toEqual(["reply-1"]);
    expect(tree[1].comment.id).toBe("root-2");
  });
});
