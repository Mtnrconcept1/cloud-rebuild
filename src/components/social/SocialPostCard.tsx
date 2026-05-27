import { FormEvent, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Bookmark,
  CalendarCheck,
  EyeOff,
  Flag,
  MessageCircle,
  Repeat2,
  Send,
  Share2,
  ShoppingBag,
  Sparkles,
  Store,
  Target,
  Trash2,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddSocialComment,
  useDeleteSocialComment,
  useDeleteSocialPost,
  useRecordExternalShare,
  useRecordSocialFeedEvent,
  useReportSocialItem,
  useSetSocialCommentReaction,
  useSetSocialPostReaction,
  useSocialComments,
  useSocialFeedFeedback,
  useToggleSocialSave,
  useToggleRestaurantFollow,
  useToggleSocialRepost,
} from "@/hooks/useSocialFeed";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  SOCIAL_AUDIENCE_SEGMENTS,
  SOCIAL_MARKETING_GOALS,
  SOCIAL_REACTIONS,
  buildSocialCommentThread,
  getSocialPostShareUrl,
  getSocialReaction,
  summarizeSocialReactions,
  type SocialCommentThread,
  type SocialFeedComment,
  type SocialFeedPost,
  type SocialReactionCounts,
  type SocialReactionType,
} from "@/lib/socialFeed";
import SocialMediaCarousel from "./SocialMediaCarousel";

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "R"
  );
}

function formatPostDate(value: string) {
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true, locale: fr });
  } catch {
    return "";
  }
}

function ReactionSummary({ counts }: { counts: SocialReactionCounts }) {
  const summary = summarizeSocialReactions(counts);
  if (!summary.length) return null;

  return (
    <span className="flex -space-x-1">
      {summary.slice(0, 3).map((item) => (
        <span
          key={item.type}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-background bg-muted text-[11px]"
          title={`${getSocialReaction(item.type).label} (${item.count})`}
        >
          {getSocialReaction(item.type).emoji}
        </span>
      ))}
    </span>
  );
}

function ReactionPicker({
  currentReaction,
  counts,
  total,
  disabled,
  compact = false,
  onSelect,
}: {
  currentReaction: SocialReactionType | null;
  counts: SocialReactionCounts;
  total: number;
  disabled?: boolean;
  compact?: boolean;
  onSelect: (reaction: SocialReactionType | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeReaction = getSocialReaction(currentReaction);

  return (
    <div
      className="relative inline-flex"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setOpen(false);
        }
      }}
    >
      <Button
        type="button"
        variant={currentReaction ? "secondary" : "outline"}
        size="sm"
        className={cn("gap-1.5", compact && "h-8 px-2 text-xs")}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="text-base leading-none">{currentReaction ? activeReaction.emoji : SOCIAL_REACTIONS[0].emoji}</span>
        <span>{total}</span>
        <ReactionSummary counts={counts} />
      </Button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 flex items-center gap-1 rounded-full border bg-popover p-1.5 text-popover-foreground shadow-lg"
        >
          {SOCIAL_REACTIONS.map((reaction) => (
            <button
              key={reaction.type}
              type="button"
              role="menuitem"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full text-xl transition hover:-translate-y-1 hover:bg-muted",
                currentReaction === reaction.type && "bg-muted ring-2 ring-primary/35",
              )}
              title={reaction.label}
              onClick={() => {
                onSelect(currentReaction === reaction.type ? null : reaction.type);
                setOpen(false);
              }}
            >
              {reaction.emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CommentForm({
  postId,
  parentCommentId,
  placeholder,
  onDone,
}: {
  postId: string;
  parentCommentId?: string | null;
  placeholder: string;
  onDone?: () => void;
}) {
  const [body, setBody] = useState("");
  const addComment = useAddSocialComment(postId, parentCommentId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await addComment.mutateAsync(body);
    setBody("");
    onDone?.();
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        className="min-h-10 resize-none"
        maxLength={1000}
      />
      <Button type="submit" size="icon" disabled={!body.trim() || addComment.isPending} aria-label="Envoyer le commentaire">
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}

function SocialCommentItem({ node, depth = 0 }: { node: SocialCommentThread; depth?: number }) {
  const [replying, setReplying] = useState(false);
  const { user, roles } = useAuth();
  const setReaction = useSetSocialCommentReaction();
  const deleteComment = useDeleteSocialComment();
  const comment = node.comment;
  const canDelete = comment.userId === user?.id || roles.includes("admin");

  const confirmDelete = () => {
    if (!window.confirm("Supprimer ce commentaire ?")) return;
    deleteComment.mutate(comment);
  };

  return (
    <div className={cn(depth > 0 && "ml-5 border-l pl-3")}>
      <div className="rounded-lg bg-muted/55 p-3">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">{comment.authorName || "Client"}</span>
          <span className="text-xs text-muted-foreground">{formatPostDate(comment.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ReactionPicker
            compact
            currentReaction={comment.myReaction}
            counts={comment.reactionCounts}
            total={comment.reactionsCount}
            disabled={setReaction.isPending}
            onSelect={(reaction) => setReaction.mutate({ comment, reaction })}
          />
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setReplying((open) => !open)}>
            Repondre
          </Button>
          {canDelete ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-8 px-2 text-xs text-destructive"
              onClick={confirmDelete}
              disabled={deleteComment.isPending}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Supprimer
            </Button>
          ) : null}
        </div>
      </div>

      {replying ? (
        <div className="mt-2">
          <CommentForm
            postId={comment.postId}
            parentCommentId={comment.id}
            placeholder={`Repondre a ${comment.authorName || "ce commentaire"}`}
            onDone={() => setReplying(false)}
          />
        </div>
      ) : null}

      {node.replies.length > 0 ? (
        <div className="mt-3 space-y-3">
          {node.replies.map((reply) => (
            <SocialCommentItem key={reply.comment.id} node={reply} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SocialComments({ post }: { post: SocialFeedPost }) {
  const comments = useSocialComments(post.id);
  const commentTree = buildSocialCommentThread(comments.data || []);

  return (
    <div className="mt-4 border-t pt-4">
      <CommentForm postId={post.id} placeholder="Ajouter un commentaire" />

      <div className="mt-4 space-y-3">
        {comments.isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : commentTree.length > 0 ? (
          commentTree.map((node) => <SocialCommentItem key={node.comment.id} node={node} />)
        ) : (
          <p className="text-sm text-muted-foreground">Aucun commentaire.</p>
        )}
      </div>
    </div>
  );
}

function getPostTypeLabel(post: SocialFeedPost) {
  const labels: Record<string, string> = {
    plat: "Plat",
    promo: "Promo",
    evenement: "Evenement",
    coulisses: "Coulisses",
    annonce: "Annonce",
  };
  return labels[post.postType || "annonce"] || "Annonce";
}

function getCampaignGoalLabel(post: SocialFeedPost) {
  return SOCIAL_MARKETING_GOALS.find((goal) => goal.value === post.campaignGoal)?.label || null;
}

function getAudienceLabel(post: SocialFeedPost) {
  return SOCIAL_AUDIENCE_SEGMENTS.find((segment) => segment.value === post.audienceSegment)?.label || null;
}

function getCta(post: SocialFeedPost) {
  const restaurantPath = `/restaurant/${post.restaurantId}`;

  switch (post.ctaType) {
    case "reserve":
      return { label: "Reserver", icon: CalendarCheck, to: `${restaurantPath}?reserve=1` };
    case "order":
      return { label: "Commander", icon: ShoppingBag, to: `${restaurantPath}?order=1` };
    case "menu":
      return { label: "Voir menu", icon: Store, to: `${restaurantPath}#menu` };
    case "offer":
      return { label: "Voir l'offre", icon: Sparkles, to: `${restaurantPath}?offer=${encodeURIComponent(post.ctaTargetId || post.id)}` };
    default:
      return null;
  }
}

export default function SocialPostCard({
  post,
  compact = false,
  highlighted = false,
}: {
  post: SocialFeedPost;
  compact?: boolean;
  highlighted?: boolean;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const { user, roles } = useAuth();
  const setPostReaction = useSetSocialPostReaction();
  const toggleSave = useToggleSocialSave();
  const toggleFollow = useToggleRestaurantFollow();
  const toggleRepost = useToggleSocialRepost();
  const recordShare = useRecordExternalShare();
  const recordEvent = useRecordSocialFeedEvent();
  const feedback = useSocialFeedFeedback();
  const reportItem = useReportSocialItem();
  const deletePost = useDeleteSocialPost();
  const canDeletePost = post.authorId === user?.id || roles.includes("admin");
  const cta = getCta(post);
  const CtaIcon = cta?.icon;

  const sharePost = async () => {
    const url = getSocialPostShareUrl(post.id);
    const title = `${post.restaurant.name} sur Tok`;

    try {
      if (navigator.share) {
        await navigator.share({ title, text: post.body, url });
        await recordShare.mutateAsync({ postId: post.id, channel: "native" });
        return;
      }

      await navigator.clipboard.writeText(url);
      await recordShare.mutateAsync({ postId: post.id, channel: "link" });
      toast.success("Lien copie.");
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error("Partage impossible.");
      }
    }
  };

  const confirmDeletePost = () => {
    if (!window.confirm("Supprimer ce post ?")) return;
    deletePost.mutate(post);
  };

  return (
    <Card className={cn("overflow-hidden rounded-lg border shadow-sm", highlighted && "border-primary/60 ring-2 ring-primary/20")}>
      <CardContent className={cn("p-4", compact && "p-3")}>
        {post.repost ? (
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Repeat2 className="h-3.5 w-3.5" />
            <span>{post.repost.authorName || "Un client"} a repartage</span>
          </div>
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <Link to={`/restaurant/${post.restaurantId}`} className="flex min-w-0 items-center gap-3">
            <Avatar className="h-11 w-11 rounded-lg">
              <AvatarImage src={post.restaurant.imageUrl || undefined} alt={post.restaurant.name} />
              <AvatarFallback className="rounded-lg">{getInitials(post.restaurant.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="truncate font-semibold leading-tight">{post.restaurant.name}</h3>
                <Badge variant={post.postType === "promo" ? "default" : "secondary"} className="rounded-full text-[11px]">
                  {getPostTypeLabel(post)}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {[post.restaurant.cuisineType, post.restaurant.city, formatPostDate(post.createdAt)].filter(Boolean).join(" - ")}
              </p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant={post.followedByMe ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => toggleFollow.mutate(post)}
              disabled={toggleFollow.isPending}
            >
              {post.followedByMe ? <UserRoundCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {post.followedByMe ? "Suivi" : "Suivre"}
            </Button>
            {canDeletePost ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-destructive"
                onClick={confirmDeletePost}
                disabled={deletePost.isPending}
                aria-label="Supprimer le post"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>

        {post.recommendationReasons?.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.recommendationReasons.slice(0, 3).map((reason) => (
              <Badge key={reason} variant="outline" className="rounded-full text-[11px] text-muted-foreground">
                {reason}
              </Badge>
            ))}
          </div>
        ) : null}

        {compact && (getCampaignGoalLabel(post) || getAudienceLabel(post) || post.offerCode) ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {getCampaignGoalLabel(post) ? (
              <Badge variant="secondary" className="gap-1 rounded-full text-[11px]">
                <Target className="h-3 w-3" />
                {getCampaignGoalLabel(post)}
              </Badge>
            ) : null}
            {getAudienceLabel(post) ? (
              <Badge variant="outline" className="rounded-full text-[11px] text-muted-foreground">
                {getAudienceLabel(post)}
              </Badge>
            ) : null}
            {post.offerCode ? (
              <Badge variant="outline" className="rounded-full text-[11px] text-muted-foreground">
                Code {post.offerCode}
              </Badge>
            ) : null}
          </div>
        ) : null}

        <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{post.body}</p>
        <SocialMediaCarousel media={post.media} />

        {cta ? (
          <Button
            asChild
            variant="secondary"
            className="mt-4 w-full justify-center gap-2 sm:w-auto"
            onClick={() => recordEvent.mutate({ postId: post.id, eventType: "cta_click", metadata: { ctaType: post.ctaType } })}
          >
            <Link to={cta.to}>
              {CtaIcon ? <CtaIcon className="h-4 w-4" /> : null}
              {cta.label}
            </Link>
          </Button>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ReactionPicker
            currentReaction={post.myReaction}
            counts={post.reactionCounts}
            total={post.likesCount}
            disabled={setPostReaction.isPending}
            onSelect={(reaction) => setPostReaction.mutate({ post, reaction })}
          />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCommentsOpen((open) => !open)}>
            <MessageCircle className="h-4 w-4" />
            {post.commentsCount}
          </Button>
          <Button
            variant={post.repostedByMe ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => toggleRepost.mutate(post)}
            disabled={toggleRepost.isPending}
          >
            <Repeat2 className="h-4 w-4" />
            {post.repostsCount}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={sharePost} disabled={recordShare.isPending}>
            <Share2 className="h-4 w-4" />
            {post.sharesCount}
          </Button>
          <Button
            variant={post.savedByMe ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => toggleSave.mutate(post)}
            disabled={toggleSave.isPending}
          >
            <Bookmark className={cn("h-4 w-4", post.savedByMe && "fill-current")} />
            {post.savedByMe ? "Sauve" : "Sauver"}
          </Button>
          {!compact ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => feedback.mutate({ post, feedbackType: "show_more" })}
                disabled={feedback.isPending}
              >
                <Sparkles className="h-4 w-4" />
                Plus comme ca
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => feedback.mutate({ post, feedbackType: "not_interested", reason: "Client feedback" })}
                disabled={feedback.isPending}
              >
                <EyeOff className="h-4 w-4" />
                Masquer
              </Button>
            </>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-9 w-9 text-muted-foreground"
            onClick={() => reportItem.mutate({ targetType: "post", targetId: post.id, reason: "Contenu inapproprie" })}
            aria-label="Signaler"
          >
            <Flag className="h-4 w-4" />
          </Button>
        </div>

        {compact ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1 rounded-full">
              <Store className="h-3 w-3" />
              {post.status}
            </Badge>
          </div>
        ) : null}

        <Drawer open={commentsOpen} onOpenChange={setCommentsOpen}>
          <DrawerContent className="max-h-[88vh]">
            <DrawerHeader>
              <DrawerTitle>Commentaires</DrawerTitle>
              <DrawerDescription>{post.restaurant.name}</DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">
              <SocialComments post={post} />
            </div>
          </DrawerContent>
        </Drawer>
      </CardContent>
    </Card>
  );
}
