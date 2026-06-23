import {
  type CSSProperties,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Bookmark,
  CalendarCheck,
  ChevronDown,
  EyeOff,
  MessageCircle,
  MoreVertical,
  Repeat2,
  Send,
  Share2,
  SlidersHorizontal,
  ShoppingBag,
  Sparkles,
  Store,
  Target,
  ThumbsDown,
  TriangleAlert,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useAuth } from "@/lib/auth-context";
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
    return formatDistanceToNow(new Date(value), {
      addSuffix: true,
      locale: fr,
    });
  } catch {
    return "";
  }
}

function getCollapsedMobileBody(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= 78) return normalized;
  return `${normalized.slice(0, 78).trimEnd()}...`;
}

const SOCIAL_REPORT_REASONS = [
  { value: "spam", label: "Spam ou promotion trompeuse" },
  { value: "inappropriate", label: "Contenu inapproprié ou offensant" },
  { value: "harassment", label: "Harcèlement ou attaque ciblée" },
  { value: "false_information", label: "Information trompeuse" },
  { value: "rights", label: "Violation de droits ou contenu volé" },
  { value: "other", label: "Autres" },
] as const;

type SocialReportReason = (typeof SOCIAL_REPORT_REASONS)[number]["value"];

const COMMENT_SORT_OPTIONS = [
  { value: "newest", label: "Plus récents" },
  { value: "oldest", label: "Plus anciens" },
  { value: "likes", label: "Plus likés" },
] as const;

type CommentSortMode = (typeof COMMENT_SORT_OPTIONS)[number]["value"];
type CommentReplyTarget = Pick<SocialFeedComment, "id" | "authorName"> | null;

const COMMENTS_DRAWER_TOP_GAP = 8;

function getCommentsDrawerViewport() {
  if (typeof window === "undefined") {
    return { top: COMMENTS_DRAWER_TOP_GAP, bottom: 0 };
  }

  const visualViewport = window.visualViewport;
  const layoutHeight = window.innerHeight || visualViewport?.height || 0;
  const viewportHeight = visualViewport?.height || layoutHeight;
  const viewportOffsetTop = visualViewport?.offsetTop || 0;

  return {
    top: Math.max(
      COMMENTS_DRAWER_TOP_GAP,
      Math.round(viewportOffsetTop + COMMENTS_DRAWER_TOP_GAP),
    ),
    bottom: Math.max(
      0,
      Math.round(layoutHeight - viewportHeight - viewportOffsetTop),
    ),
  };
}

function useCommentsDrawerViewport(open: boolean): CSSProperties {
  const [viewport, setViewport] = useState(getCommentsDrawerViewport);

  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;

    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() =>
        setViewport(getCommentsDrawerViewport()),
      );
    };

    update();

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);

    return () => {
      window.cancelAnimationFrame(frame);
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", update);
    };
  }, [open]);

  return {
    top: `${viewport.top}px`,
    bottom: `${viewport.bottom}px`,
    height: "auto",
    maxHeight: "none",
  };
}

function getCommentTimestamp(comment: SocialFeedComment) {
  const value = new Date(comment.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function getCommentEngagement(comment: SocialFeedComment) {
  return Math.max(
    0,
    Number(comment.reactionsCount || comment.reactionCounts?.like || 0),
  );
}

function sortCommentThread(
  nodes: SocialCommentThread[],
  sortMode: CommentSortMode,
): SocialCommentThread[] {
  return [...nodes]
    .sort((first, second) => {
      if (sortMode === "likes") {
        const engagementDelta =
          getCommentEngagement(second.comment) -
          getCommentEngagement(first.comment);
        if (engagementDelta !== 0) return engagementDelta;
        return (
          getCommentTimestamp(second.comment) -
          getCommentTimestamp(first.comment)
        );
      }

      const dateDelta =
        getCommentTimestamp(second.comment) -
        getCommentTimestamp(first.comment);
      return sortMode === "oldest" ? -dateDelta : dateDelta;
    })
    .map((node) => ({
      ...node,
      replies: sortCommentThread(node.replies, sortMode),
    }));
}

function CommentSortButton({
  value,
  onChange,
  onSelect,
  compact = false,
}: {
  value: CommentSortMode;
  onChange: (value: CommentSortMode) => void;
  onSelect?: () => void;
  compact?: boolean;
}) {
  const activeOption =
    COMMENT_SORT_OPTIONS.find((option) => option.value === value) ||
    COMMENT_SORT_OPTIONS[0];

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Trier les commentaires"
          className={cn(
            "h-9 gap-1.5 rounded-full px-2.5 text-sm font-semibold text-slate-950 hover:bg-orange-50 hover:text-orange-700",
            compact && "h-8 px-1.5 text-sm",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Trier
          <span className="hidden text-muted-foreground sm:inline">
            : {activeOption.label}
          </span>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-xl">
        {COMMENT_SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className={cn(
              "cursor-pointer rounded-lg",
              option.value === value && "font-semibold text-orange-700",
            )}
            onClick={() => {
              onChange(option.value);
              onSelect?.();
            }}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
      className={cn(
        "relative inline-flex max-sm:w-full",
        compact && "max-sm:w-auto",
      )}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (
          !(nextTarget instanceof Node) ||
          !event.currentTarget.contains(nextTarget)
        ) {
          setOpen(false);
        }
      }}
    >
      <Button
        type="button"
        variant={currentReaction ? "secondary" : "outline"}
        size="sm"
        className={cn(
          "gap-1.5 rounded-xl border-slate-200 bg-white shadow-sm hover:bg-orange-50 max-sm:h-11 max-sm:w-full max-sm:min-w-0 max-sm:justify-center max-sm:rounded-xl max-sm:px-1.5 max-sm:text-sm",
          currentReaction && "bg-orange-50 text-primary",
          compact &&
            "h-8 px-2 text-xs max-sm:h-8 max-sm:w-auto max-sm:px-2 max-sm:text-xs",
        )}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="text-base leading-none">
          {currentReaction ? activeReaction.emoji : SOCIAL_REACTIONS[0].emoji}
        </span>
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
                currentReaction === reaction.type &&
                  "bg-muted ring-2 ring-primary/35",
              )}
              title={reaction.label}
              onClick={() => {
                onSelect(
                  currentReaction === reaction.type ? null : reaction.type,
                );
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
  initialBody = "",
  variant = "default",
  authorInitial = "T",
  onDone,
}: {
  postId: string;
  parentCommentId?: string | null;
  placeholder: string;
  initialBody?: string;
  variant?: "default" | "mobilePreview";
  authorInitial?: string;
  onDone?: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const addComment = useAddSocialComment(postId, parentCommentId);
  const isMobilePreview = variant === "mobilePreview";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await addComment.mutateAsync(body);
    setBody("");
    onDone?.();
  };

  return (
    <form
      onSubmit={submit}
      className={cn(
        "flex items-end gap-2",
        isMobilePreview && "items-center gap-2",
      )}
    >
      {isMobilePreview ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-500 text-sm font-bold text-white">
          {authorInitial}
        </span>
      ) : null}
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        rows={isMobilePreview ? 1 : undefined}
        className={cn(
          "min-h-10 min-w-0 flex-1 resize-none text-base sm:text-sm",
          isMobilePreview &&
            "h-10 min-h-10 rounded-full border-slate-200 bg-white px-4 py-2 text-sm shadow-inner shadow-slate-100/60",
        )}
        maxLength={1000}
      />
      <Button
        type="submit"
        size="icon"
        className={cn(
          "h-10 w-10 shrink-0",
          isMobilePreview &&
            "rounded-full bg-slate-100 text-slate-400 shadow-none hover:bg-orange-100 hover:text-primary",
        )}
        disabled={!body.trim() || addComment.isPending}
        aria-label="Envoyer le commentaire"
      >
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}

function MobileCommentsPanel({
  post,
  sortMode,
  onSortModeChange,
  onOpenComments,
}: {
  post: SocialFeedPost;
  sortMode: CommentSortMode;
  onSortModeChange: (value: CommentSortMode) => void;
  onOpenComments: () => void;
}) {
  const comments = useSocialComments(post.id);
  const firstComment = useMemo(() => {
    const tree = sortCommentThread(
      buildSocialCommentThread(comments.data || []),
      sortMode,
    );
    return tree[0]?.comment || null;
  }, [comments.data, sortMode]);

  return (
    <div className="mt-4 hidden rounded-[1.1rem] border bg-white px-3 py-3 shadow-md shadow-slate-200/60 max-sm:block">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-black tracking-tight text-slate-950">
          Commentaires ({post.commentsCount})
        </h3>
        <CommentSortButton
          compact
          value={sortMode}
          onChange={onSortModeChange}
          onSelect={onOpenComments}
        />
      </div>
      {firstComment ? (
        <button
          type="button"
          className="mt-3 block w-full rounded-2xl bg-slate-50 px-3 py-2 text-left transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30"
          onClick={onOpenComments}
          aria-label="Ouvrir le post et tous les commentaires"
        >
          <div className="flex items-start gap-2">
            <Avatar className="mt-0.5 h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-white shadow-sm">
              <AvatarImage
                src={firstComment.authorAvatarUrl || undefined}
                alt={firstComment.authorName || "Client"}
              />
              <AvatarFallback className="rounded-full bg-slate-100 text-xs font-black text-slate-700">
                {getInitials(firstComment.authorName || "Client").slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold text-slate-950">
                  {firstComment.authorName || "Client"}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatPostDate(firstComment.createdAt)}
                </span>
              </span>
              <span className="mt-0.5 line-clamp-2 block text-sm leading-5 text-slate-700">
                {firstComment.body}
              </span>
            </span>
          </div>
        </button>
      ) : comments.isLoading ? (
        <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
          Chargement des commentaires...
        </p>
      ) : null}
      {post.commentsCount > 1 || firstComment ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-8 w-full rounded-full text-sm font-semibold text-orange-700 hover:bg-orange-50 hover:text-orange-800"
          onClick={onOpenComments}
        >
          Voir plus
        </Button>
      ) : null}
      <div className="mt-3">
        <CommentForm
          postId={post.id}
          placeholder="Écrire un commentaire..."
          variant="mobilePreview"
          authorInitial="T"
        />
      </div>
    </div>
  );
}

function SocialPostModalSummary({ post }: { post: SocialFeedPost }) {
  const cta = getCta(post);
  const CtaIcon = cta?.icon;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border bg-white p-3 shadow-sm">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 rounded-xl border border-orange-100">
            <AvatarImage
              src={post.restaurant.imageUrl || undefined}
              alt={post.restaurant.name}
            />
            <AvatarFallback className="rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-xs font-bold text-white">
              {getInitials(post.restaurant.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">
                  {post.restaurant.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[
                    post.restaurant.cuisineType,
                    post.restaurant.city,
                    formatPostDate(post.createdAt),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {cta ? (
                <Button
                  asChild
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 rounded-full bg-orange-600 px-3 text-xs hover:bg-orange-700"
                >
                  <Link to={cta.to}>
                    {CtaIcon ? <CtaIcon className="h-3.5 w-3.5" /> : null}
                    {cta.label}
                  </Link>
                </Button>
              ) : null}
            </div>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-5 text-slate-800">
              {post.body}
            </p>
          </div>
        </div>
      </div>

      {post.media.length > 0 ? (
        <SocialMediaCarousel
          media={post.media}
          variant="side"
          mobileBleed="container"
          lightboxEngagement={{
            likesCount: post.likesCount,
            commentsCount: post.commentsCount,
          }}
        />
      ) : null}
    </div>
  );
}

function LightboxPostActions({
  post,
  onReact,
  reacting,
  onComments,
  onRepost,
  reposting,
  onShare,
  sharing,
  onReport,
}: {
  post: SocialFeedPost;
  onReact: (reaction: SocialReactionType | null) => void;
  reacting: boolean;
  onComments: () => void;
  onRepost: () => void;
  reposting: boolean;
  onShare: () => void;
  sharing: boolean;
  onReport: () => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2 rounded-2xl bg-white/5 p-2 text-white backdrop-blur">
      <ReactionPicker
        currentReaction={post.myReaction}
        counts={post.reactionCounts}
        total={post.likesCount}
        disabled={reacting}
        onSelect={onReact}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-11 gap-1.5 rounded-xl text-white hover:bg-white/10 hover:text-white"
        onClick={onComments}
        aria-label="Commenter ce post"
      >
        <MessageCircle className="h-4 w-4" />
        {post.commentsCount}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-11 gap-1.5 rounded-xl text-white hover:bg-white/10 hover:text-white",
          post.repostedByMe && "bg-white/10 text-orange-200",
        )}
        onClick={onRepost}
        disabled={reposting}
        aria-label="Repartager ce post"
      >
        <Repeat2 className="h-4 w-4" />
        {post.repostsCount}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-11 gap-1.5 rounded-xl text-white hover:bg-white/10 hover:text-white"
        onClick={onShare}
        disabled={sharing}
        aria-label="Partager ce post"
      >
        <Share2 className="h-4 w-4" />
        {post.sharesCount}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-11 rounded-xl text-white hover:bg-white/10 hover:text-white"
        onClick={onReport}
        aria-label="Signaler ce post"
      >
        <TriangleAlert className="h-4 w-4" />
      </Button>
    </div>
  );
}

function MobileMediaActionRail({ onOptions }: { onOptions: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 hidden max-sm:block">
      <button
        type="button"
        aria-label="Options du média"
        onClick={onOptions}
        className="pointer-events-auto absolute right-3 top-4 flex h-10 w-10 items-center justify-center rounded-full text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)] transition hover:bg-white/15"
      >
        <MoreVertical className="h-7 w-7 stroke-[2.5]" />
      </button>
    </div>
  );
}

const MAX_COMMENT_VISUAL_DEPTH = 4;

function getCommentMention(authorName?: string | null) {
  const compactName = String(authorName || "client")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "");
  return `@${compactName || "client"} `;
}

function SocialCommentItem({
  node,
  depth = 0,
  onReplyRequest,
}: {
  node: SocialCommentThread;
  depth?: number;
  onReplyRequest: (comment: SocialFeedComment) => void;
}) {
  const { user, isSuperAdmin } = useAuth();
  const setReaction = useSetSocialCommentReaction();
  const deleteComment = useDeleteSocialComment();
  const comment = node.comment;
  const canDelete = comment.userId === user?.id || isSuperAdmin;
  const shouldIndent = depth > 0 && depth <= MAX_COMMENT_VISUAL_DEPTH;

  const confirmDelete = () => {
    if (!window.confirm("Supprimer ce commentaire ?")) return;
    deleteComment.mutate(comment);
  };

  return (
    <div
      className={cn(
        "min-w-0 max-w-full overflow-visible",
        shouldIndent && "ml-3 border-l pl-2 sm:ml-5 sm:pl-3",
      )}
    >
      <div className="min-w-0 max-w-full overflow-visible rounded-lg bg-muted/55 p-3">
        <div className="mb-1 flex items-start gap-2.5">
          <Avatar className="h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-white shadow-sm">
            <AvatarImage
              src={comment.authorAvatarUrl || undefined}
              alt={comment.authorName || "Client"}
            />
            <AvatarFallback className="rounded-full bg-slate-100 text-xs font-black text-slate-700">
              {getInitials(comment.authorName || "Client").slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-semibold">
                {comment.authorName || "Client"}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatPostDate(comment.createdAt)}
              </span>
            </div>
            <p className="min-w-0 max-w-full whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
              {comment.body}
            </p>
          </div>
        </div>
        <div className="mt-2 flex min-w-0 max-w-full flex-wrap items-center gap-2 overflow-visible">
          <ReactionPicker
            compact
            currentReaction={comment.myReaction}
            counts={comment.reactionCounts}
            total={comment.reactionsCount}
            disabled={setReaction.isPending}
            onSelect={(reaction) => setReaction.mutate({ comment, reaction })}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => onReplyRequest(comment)}
          >
            Répondre
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

      {node.replies.length > 0 ? (
        <div className="mt-3 min-w-0 max-w-full space-y-3 overflow-hidden">
          {node.replies.map((reply) => (
            <SocialCommentItem
              key={reply.comment.id}
              node={reply}
              depth={depth + 1}
              onReplyRequest={onReplyRequest}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SocialComments({
  post,
  sortMode,
  onSortModeChange,
  onReplyRequest,
}: {
  post: SocialFeedPost;
  sortMode: CommentSortMode;
  onSortModeChange: (value: CommentSortMode) => void;
  onReplyRequest: (comment: SocialFeedComment) => void;
}) {
  const comments = useSocialComments(post.id);
  const commentTree = useMemo(
    () =>
      sortCommentThread(
        buildSocialCommentThread(comments.data || []),
        sortMode,
      ),
    [comments.data, sortMode],
  );

  return (
    <div className="mt-4 min-w-0 max-w-full overflow-hidden border-t pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-950">
          Commentaires ({post.commentsCount})
        </h3>
        <CommentSortButton value={sortMode} onChange={onSortModeChange} />
      </div>
      <div className="mt-4 min-w-0 max-w-full space-y-3 overflow-hidden">
        {comments.isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : commentTree.length > 0 ? (
          commentTree.map((node) => (
            <SocialCommentItem
              key={node.comment.id}
              node={node}
              onReplyRequest={onReplyRequest}
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Aucun commentaire.</p>
        )}
      </div>
    </div>
  );
}

function CommentComposerDock({
  postId,
  replyTarget,
  onCancelReply,
  onDone,
}: {
  postId: string;
  replyTarget: CommentReplyTarget;
  onCancelReply: () => void;
  onDone: () => void;
}) {
  return (
    <div className="shrink-0 border-t bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 shadow-[0_-14px_36px_rgba(15,23,42,0.10)] backdrop-blur">
      {replyTarget ? (
        <div className="mb-2 flex min-w-0 items-center justify-between gap-2 rounded-2xl bg-orange-50 px-3 py-2 text-xs text-orange-900">
          <span className="min-w-0 truncate font-semibold">
            Réponse à {replyTarget.authorName || "ce commentaire"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 rounded-full px-2 text-xs text-orange-700 hover:bg-orange-100"
            onClick={onCancelReply}
          >
            Annuler
          </Button>
        </div>
      ) : null}
      <CommentForm
        key={replyTarget?.id || "root-comment"}
        postId={postId}
        parentCommentId={replyTarget?.id || null}
        initialBody={
          replyTarget ? getCommentMention(replyTarget.authorName) : ""
        }
        placeholder={
          replyTarget
            ? `Répondre à ${replyTarget.authorName || "ce commentaire"}`
            : "Ajouter un commentaire"
        }
        onDone={onDone}
      />
    </div>
  );
}

function getPostTypeLabel(post: SocialFeedPost) {
  const labels: Record<string, string> = {
    plat: "Plat",
    promo: "Promo",
    evenement: "Événement",
    coulisses: "Coulisses",
    annonce: "Annonce",
  };
  return labels[post.postType || "annonce"] || "Annonce";
}

function getCampaignGoalLabel(post: SocialFeedPost) {
  return (
    SOCIAL_MARKETING_GOALS.find((goal) => goal.value === post.campaignGoal)
      ?.label || null
  );
}

function getAudienceLabel(post: SocialFeedPost) {
  return (
    SOCIAL_AUDIENCE_SEGMENTS.find(
      (segment) => segment.value === post.audienceSegment,
    )?.label || null
  );
}

function getCta(post: SocialFeedPost) {
  const restaurantPath = `/restaurant/${post.restaurantId}`;

  switch (post.ctaType) {
    case "reserve":
      return {
        label: "Réserver",
        icon: CalendarCheck,
        to: `${restaurantPath}?reserve=1`,
      };
    case "order":
      return {
        label: "Commander",
        icon: ShoppingBag,
        to: `${restaurantPath}?order=1`,
      };
    case "menu":
      return {
        label: "Voir le menu",
        icon: Store,
        to: `${restaurantPath}#menu`,
      };
    case "offer":
      return {
        label: "Voir l'offre",
        icon: Sparkles,
        to: `${restaurantPath}?offer=${encodeURIComponent(post.ctaTargetId || post.id)}`,
      };
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
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportReason, setReportReason] = useState<SocialReportReason>("spam");
  const [reportDetails, setReportDetails] = useState("");
  const [commentSortMode, setCommentSortMode] =
    useState<CommentSortMode>("newest");
  const [replyTarget, setReplyTarget] = useState<CommentReplyTarget>(null);
  const commentsDrawerViewportStyle = useCommentsDrawerViewport(commentsOpen);
  const { user, isSuperAdmin } = useAuth();
  const setPostReaction = useSetSocialPostReaction();
  const toggleSave = useToggleSocialSave();
  const toggleFollow = useToggleRestaurantFollow();
  const toggleRepost = useToggleSocialRepost();
  const recordShare = useRecordExternalShare();
  const recordEvent = useRecordSocialFeedEvent();
  const feedback = useSocialFeedFeedback();
  const reportItem = useReportSocialItem();
  const deletePost = useDeleteSocialPost();
  const canDeletePost = post.authorId === user?.id || isSuperAdmin;
  const cta = getCta(post);
  const CtaIcon = cta?.icon;
  const hasMedia = post.media.length > 0;
  const campaignGoalLabel = getCampaignGoalLabel(post);
  const audienceLabel = getAudienceLabel(post);
  const canExpandBody =
    post.body.trim().length > 115 || post.body.includes("\n");
  const collapsedMobileBody = getCollapsedMobileBody(post.body);
  const isPremiumBanner = Boolean(post.premiumBannerId);
  const mobilePrimaryActionClass =
    "max-sm:h-11 max-sm:w-full max-sm:min-w-0 max-sm:justify-center max-sm:gap-1 max-sm:rounded-xl max-sm:px-1.5 max-sm:text-sm";

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
      toast.success("Lien copié.");
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

  const openReportDialog = () => {
    setReportReason("spam");
    setReportDetails("");
    setReportDialogOpen(true);
  };

  const handleCommentsOpenChange = (open: boolean) => {
    setCommentsOpen(open);
    if (!open) setReplyTarget(null);
  };

  const submitReport = () => {
    const selectedReason = SOCIAL_REPORT_REASONS.find(
      (reason) => reason.value === reportReason,
    );
    const details = reportDetails.trim();

    if (reportReason === "other" && !details) {
      toast.error("Veuillez préciser la raison du signalement.");
      return;
    }

    reportItem.mutate({
      targetType: "post",
      targetId: post.id,
      reason:
        details && selectedReason
          ? `${selectedReason.label} - ${details}`
          : selectedReason?.label || details,
    });
    setReportDialogOpen(false);
  };

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-[1.65rem] border bg-white shadow-lg shadow-slate-200/60 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-orange-100/70 max-sm:-mx-2 max-sm:overflow-visible max-sm:rounded-none max-sm:border-0 max-sm:shadow-none max-sm:hover:translate-y-0",
        highlighted && "border-primary/60 ring-2 ring-primary/20",
        isPremiumBanner &&
          "border-orange-300 bg-gradient-to-b from-orange-50/70 via-white to-white ring-2 ring-orange-100/80",
      )}
    >
      <CardContent className={cn("p-5 max-sm:px-0", compact && "p-4")}>
        {isPremiumBanner ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-500 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-white shadow-lg shadow-orange-500/20 max-sm:mx-3 max-sm:rounded-xl">
            <span className="inline-flex min-w-0 items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="truncate">A ne pas manquer</span>
            </span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">
              Mis en avant
            </span>
          </div>
        ) : null}

        {post.repost ? (
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Repeat2 className="h-3.5 w-3.5" />
            <span>{post.repost.authorName || "Un client"} a repartagé</span>
          </div>
        ) : null}

        <div className="flex items-start justify-between gap-3 max-sm:relative max-sm:block max-sm:pt-9">
          <Link
            to={`/restaurant/${post.restaurantId}`}
            className="flex w-full min-w-0 flex-1 items-center gap-3 max-sm:gap-2.5"
          >
            <Avatar className="h-14 w-14 rounded-2xl border-2 border-orange-100 shadow-sm max-sm:h-11 max-sm:w-11 max-sm:rounded-xl">
              <AvatarImage
                src={post.restaurant.imageUrl || undefined}
                alt={post.restaurant.name}
              />
              <AvatarFallback className="rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 font-bold text-white max-sm:rounded-xl max-sm:text-xs">
                {getInitials(post.restaurant.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-bold leading-tight text-slate-950 max-sm:text-base">
                  {post.restaurant.name}
                </h3>
                {post.isSponsored ? (
                  <Badge
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                      isPremiumBanner
                        ? "bg-orange-50 text-orange-700 hover:bg-orange-50"
                        : "bg-violet-50 text-violet-700 hover:bg-violet-50",
                    )}
                  >
                    {isPremiumBanner ? "Banniere" : "Sponsorise"}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground max-sm:text-[11px]">
                {[
                  post.restaurant.cuisineType,
                  post.restaurant.city,
                  formatPostDate(post.createdAt),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {post.followedByMe ? (
                  <span className="ml-1 inline-flex items-center gap-1 text-emerald-600 max-sm:hidden">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    En ligne
                  </span>
                ) : null}
              </p>
              {post.followedByMe ? (
                <p className="mt-0.5 hidden items-center gap-1.5 text-xs font-semibold text-emerald-600 max-sm:flex">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  En ligne
                </p>
              ) : null}
            </div>
          </Link>
          <div className="flex shrink-0 items-center justify-end gap-2 max-sm:absolute max-sm:right-0 max-sm:top-0">
            <Button
              variant={post.followedByMe ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5 rounded-xl border-slate-200 bg-white shadow-sm max-sm:h-9 max-sm:rounded-lg max-sm:px-2.5 max-sm:text-xs"
              onClick={() => toggleFollow.mutate(post)}
              disabled={toggleFollow.isPending}
            >
              {post.followedByMe ? (
                <UserRoundCheck className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {post.followedByMe ? "Suivi" : "Suivre"}
            </Button>
            {canDeletePost ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl text-destructive max-sm:h-9 max-sm:w-9 max-sm:rounded-lg"
                onClick={confirmDeletePost}
                disabled={deletePost.isPending}
                aria-label="Supprimer le post"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
            {!canDeletePost ? (
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-9 w-9 rounded-lg text-slate-950 max-sm:inline-flex"
                onClick={openReportDialog}
                aria-label="Options du post"
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "mt-4 grid gap-4 max-sm:mt-2 max-sm:gap-2",
            hasMedia &&
              "lg:grid-cols-[minmax(0,0.78fr)_minmax(22rem,1.35fr)] lg:items-center lg:gap-5",
          )}
        >
          <div className={cn("min-w-0", hasMedia && "order-1 lg:order-1")}>
            <div className="flex flex-wrap gap-2 max-sm:max-h-6 max-sm:gap-1.5 max-sm:overflow-hidden">
              {post.postType ? (
                <Badge
                  variant="secondary"
                  className="rounded-full bg-orange-50 text-orange-700 hover:bg-orange-50 max-sm:px-2 max-sm:py-0.5 max-sm:text-[11px]"
                >
                  {getPostTypeLabel(post)}
                </Badge>
              ) : null}
              {post.recommendationReasons?.slice(0, 3).map((reason) => (
                <Badge
                  key={reason}
                  variant="outline"
                  className="rounded-full border-emerald-100 bg-emerald-50 text-emerald-700 max-sm:px-2 max-sm:py-0.5 max-sm:text-[11px]"
                >
                  {reason}
                </Badge>
              ))}
              {campaignGoalLabel ? (
                <Badge
                  variant="outline"
                  className="gap-1 rounded-full border-amber-100 bg-amber-50 text-amber-700 max-sm:px-2 max-sm:py-0.5 max-sm:text-[11px]"
                >
                  <Target className="h-3 w-3" />
                  {campaignGoalLabel}
                </Badge>
              ) : null}
              {audienceLabel ? (
                <Badge
                  variant="outline"
                  className="rounded-full border-blue-100 bg-blue-50 text-blue-700 max-sm:px-2 max-sm:py-0.5 max-sm:text-[11px]"
                >
                  {audienceLabel}
                </Badge>
              ) : null}
              {post.offerCode ? (
                <Badge
                  variant="outline"
                  className="rounded-full border-pink-100 bg-pink-50 text-pink-700 max-sm:px-2 max-sm:py-0.5 max-sm:text-[11px]"
                >
                  Code {post.offerCode}
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 max-sm:mt-2">
              <p className="whitespace-pre-wrap text-[15px] font-medium leading-7 text-slate-950 max-sm:hidden">
                {post.body}
              </p>
              <p className="hidden whitespace-pre-wrap text-sm font-medium leading-5 text-slate-950 max-sm:block">
                {canExpandBody && !bodyExpanded
                  ? collapsedMobileBody
                  : post.body}
                {canExpandBody ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="inline font-semibold text-slate-500 transition hover:text-primary"
                      onClick={() => setBodyExpanded((expanded) => !expanded)}
                    >
                      {bodyExpanded ? "Afficher moins" : "Afficher plus"}
                    </button>
                  </>
                ) : null}
              </p>
            </div>

            {cta ? (
              <Button
                asChild
                className="mt-4 gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 shadow-lg shadow-orange-500/25 hover:from-orange-600 hover:to-orange-700 max-sm:-mx-6 max-sm:mt-2.5 max-sm:h-10 max-sm:w-screen max-sm:justify-center max-sm:rounded-none max-sm:px-4 max-sm:text-sm max-sm:font-extrabold max-sm:shadow-md max-sm:shadow-orange-500/20"
                onClick={() =>
                  recordEvent.mutate({
                    postId: post.id,
                    eventType: "cta_click",
                    metadata: {
                      ctaType: post.ctaType,
                      premiumBannerId: post.premiumBannerId || undefined,
                      premiumBanner: Boolean(post.premiumBannerId),
                    },
                  })
                }
              >
                <Link to={cta.to}>
                  {CtaIcon ? (
                    <CtaIcon className="h-4 w-4 max-sm:h-3.5 max-sm:w-3.5" />
                  ) : null}
                  {cta.label}
                </Link>
              </Button>
            ) : null}
          </div>

          {hasMedia ? (
            <SocialMediaCarousel
              media={post.media}
              variant="side"
              className="order-2 max-sm:mt-2 lg:order-2"
              lightboxEngagement={{
                likesCount: post.likesCount,
                commentsCount: post.commentsCount,
              }}
              lightboxActions={({ close }) => (
                <LightboxPostActions
                  post={post}
                  onReact={(reaction) =>
                    setPostReaction.mutate({ post, reaction })
                  }
                  reacting={setPostReaction.isPending}
                  onComments={() => {
                    close();
                    setCommentsOpen(true);
                  }}
                  onRepost={() => toggleRepost.mutate(post)}
                  reposting={toggleRepost.isPending}
                  onShare={sharePost}
                  sharing={recordShare.isPending}
                  onReport={() => {
                    close();
                    openReportDialog();
                  }}
                />
              )}
              mobileOverlay={
                <MobileMediaActionRail onOptions={openReportDialog} />
              }
            />
          ) : null}
        </div>

        <div
          className={cn(
            "mt-5 grid grid-cols-[repeat(6,minmax(0,1fr))] gap-1.5 rounded-none border-0 bg-transparent p-0 shadow-none sm:flex sm:flex-wrap sm:items-center sm:rounded-2xl sm:border sm:bg-white/85 sm:p-2 sm:shadow-sm",
            hasMedia && "max-sm:mt-2 max-sm:px-0",
          )}
        >
          <ReactionPicker
            currentReaction={post.myReaction}
            counts={post.reactionCounts}
            total={post.likesCount}
            disabled={setPostReaction.isPending}
            onSelect={(reaction) => setPostReaction.mutate({ post, reaction })}
          />
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "gap-1.5 rounded-xl border-slate-200 bg-white shadow-sm",
              mobilePrimaryActionClass,
            )}
            onClick={() => setCommentsOpen((open) => !open)}
            aria-label={
              commentsOpen
                ? "Masquer les commentaires"
                : "Afficher les commentaires"
            }
          >
            <MessageCircle className="h-4 w-4 max-sm:h-3.5 max-sm:w-3.5" />
            {post.commentsCount}
          </Button>
          <Button
            variant={post.repostedByMe ? "secondary" : "outline"}
            size="sm"
            className={cn(
              "gap-1.5 rounded-xl border-slate-200 bg-white shadow-sm",
              mobilePrimaryActionClass,
            )}
            onClick={() => toggleRepost.mutate(post)}
            disabled={toggleRepost.isPending}
          >
            <Repeat2 className="h-4 w-4 max-sm:h-3.5 max-sm:w-3.5" />
            {post.repostsCount}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "gap-1.5 rounded-xl border-slate-200 bg-white shadow-sm",
              mobilePrimaryActionClass,
            )}
            onClick={sharePost}
            disabled={recordShare.isPending}
          >
            <Share2 className="h-4 w-4 max-sm:h-3.5 max-sm:w-3.5" />
            {post.sharesCount}
          </Button>
          <Button
            variant={post.savedByMe ? "secondary" : "outline"}
            size="sm"
            className={cn(
              "gap-1.5 rounded-xl border-slate-200 bg-white shadow-sm",
              mobilePrimaryActionClass,
            )}
            onClick={() => toggleSave.mutate(post)}
            disabled={toggleSave.isPending}
          >
            <Bookmark
              className={cn(
                "h-4 w-4 max-sm:h-3.5 max-sm:w-3.5",
                post.savedByMe && "fill-current",
              )}
            />
            {post.savedByMe ? "Sauvé" : "Sauver"}
          </Button>
          {!compact ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 rounded-xl text-muted-foreground max-sm:hidden"
                onClick={() =>
                  feedback.mutate({
                    post,
                    feedbackType: "show_more",
                    reason: "Preference client",
                  })
                }
                disabled={feedback.isPending}
              >
                <Sparkles className="h-4 w-4" />
                Plus comme ça
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 rounded-xl text-muted-foreground max-sm:hidden"
                onClick={() =>
                  feedback.mutate({
                    post,
                    feedbackType: "not_interested",
                    reason: "Moins comme ca",
                  })
                }
                disabled={feedback.isPending}
              >
                <ThumbsDown className="h-4 w-4" />
                Moins comme ça
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 rounded-xl text-muted-foreground max-sm:hidden"
                onClick={() =>
                  feedback.mutate({
                    post,
                    feedbackType: "hide_post",
                    reason: "Post masque par le client",
                  })
                }
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
            className="ml-auto h-9 w-9 rounded-xl text-muted-foreground max-sm:ml-0 max-sm:h-11 max-sm:w-full max-sm:min-w-0 max-sm:rounded-xl max-sm:border max-sm:border-slate-200 max-sm:bg-white max-sm:shadow-sm"
            onClick={openReportDialog}
            aria-label="Signaler le post"
          >
            <TriangleAlert className="h-4 w-4 max-sm:h-3.5 max-sm:w-3.5" />
          </Button>
        </div>

        {hasMedia && !compact ? (
          <MobileCommentsPanel
            post={post}
            sortMode={commentSortMode}
            onSortModeChange={setCommentSortMode}
            onOpenComments={() => setCommentsOpen(true)}
          />
        ) : null}

        {compact ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1 rounded-full">
              <Store className="h-3 w-3" />
              {post.status}
            </Badge>
          </div>
        ) : null}

        <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
          <DialogContent className="max-w-md rounded-2xl p-5 sm:p-6">
            <DialogHeader>
              <DialogTitle>Signaler ce post</DialogTitle>
              <DialogDescription>
                Choisissez la raison du signalement. Notre équipe l'examinera
                avant toute action.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <label className="block space-y-2 text-sm font-semibold text-slate-900">
                <span>Raison du signalement</span>
                <select
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  value={reportReason}
                  onChange={(event) =>
                    setReportReason(event.target.value as SocialReportReason)
                  }
                  aria-label="Raison du signalement"
                >
                  {SOCIAL_REPORT_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </label>

              {reportReason === "other" ? (
                <label className="block space-y-2 text-sm font-semibold text-slate-900">
                  <span>Précisez la raison</span>
                  <Textarea
                    value={reportDetails}
                    onChange={(event) => setReportDetails(event.target.value)}
                    placeholder="Décrivez brièvement le problème."
                    className="min-h-24 rounded-xl"
                    aria-label="Préciser la raison du signalement"
                  />
                </label>
              ) : null}

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                Le signalement doit être légitime. Toute campagne de signalement
                abusif, de harcèlement d'un concurrent ou du restaurateur
                concerné pourra entraîner la suppression du compte.
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReportDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                className="bg-orange-600 hover:bg-orange-700"
                onClick={submitReport}
                disabled={
                  reportItem.isPending ||
                  (reportReason === "other" && !reportDetails.trim())
                }
              >
                Envoyer le signalement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Drawer
          open={commentsOpen}
          onOpenChange={handleCommentsOpenChange}
          shouldScaleBackground={false}
          repositionInputs={false}
          preventScrollRestoration
        >
          <DrawerContent
            style={commentsDrawerViewportStyle}
            className="z-[90] min-h-0 overflow-hidden rounded-t-[1.5rem]"
          >
            <DrawerHeader className="shrink-0">
              <DrawerTitle>Commentaires</DrawerTitle>
              <DrawerDescription>{post.restaurant.name}</DrawerDescription>
            </DrawerHeader>
            <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-4">
              <SocialPostModalSummary post={post} />
              <SocialComments
                post={post}
                sortMode={commentSortMode}
                onSortModeChange={setCommentSortMode}
                onReplyRequest={setReplyTarget}
              />
            </div>
            <CommentComposerDock
              postId={post.id}
              replyTarget={replyTarget}
              onCancelReply={() => setReplyTarget(null)}
              onDone={() => setReplyTarget(null)}
            />
          </DrawerContent>
        </Drawer>
      </CardContent>
    </Card>
  );
}
