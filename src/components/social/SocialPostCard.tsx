import { FormEvent, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Flag,
  Heart,
  MessageCircle,
  Repeat2,
  Send,
  Share2,
  Store,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddSocialComment,
  useRecordExternalShare,
  useReportSocialItem,
  useSocialComments,
  useToggleRestaurantFollow,
  useToggleSocialLike,
  useToggleSocialRepost,
} from "@/hooks/useSocialFeed";
import { cn } from "@/lib/utils";
import { getSocialPostShareUrl, type SocialFeedPost } from "@/lib/socialFeed";
import SocialMediaCarousel from "./SocialMediaCarousel";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "R";
}

function formatPostDate(value: string) {
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true, locale: fr });
  } catch {
    return "";
  }
}

function SocialComments({ post }: { post: SocialFeedPost }) {
  const [body, setBody] = useState("");
  const comments = useSocialComments(post.id);
  const addComment = useAddSocialComment(post.id);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await addComment.mutateAsync(body);
    setBody("");
  };

  return (
    <div className="mt-4 border-t pt-4">
      <form onSubmit={submit} className="flex gap-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Ajouter un commentaire"
          className="min-h-10 resize-none"
          maxLength={1000}
        />
        <Button type="submit" size="icon" disabled={!body.trim() || addComment.isPending} aria-label="Envoyer le commentaire">
          <Send className="h-4 w-4" />
        </Button>
      </form>

      <div className="mt-4 space-y-3">
        {comments.isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : comments.data && comments.data.length > 0 ? (
          comments.data.map((comment) => (
            <div key={comment.id} className="rounded-lg bg-muted/55 p-3">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{comment.authorName || "Client"}</span>
                <span className="text-xs text-muted-foreground">{formatPostDate(comment.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Aucun commentaire.</p>
        )}
      </div>
    </div>
  );
}

export default function SocialPostCard({ post, compact = false }: { post: SocialFeedPost; compact?: boolean }) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const toggleLike = useToggleSocialLike();
  const toggleFollow = useToggleRestaurantFollow();
  const toggleRepost = useToggleSocialRepost();
  const recordShare = useRecordExternalShare();
  const reportItem = useReportSocialItem();

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

  return (
    <Card className="overflow-hidden rounded-lg border shadow-sm">
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
              <h3 className="truncate font-semibold leading-tight">{post.restaurant.name}</h3>
              <p className="truncate text-xs text-muted-foreground">
                {[post.restaurant.cuisineType, post.restaurant.city, formatPostDate(post.createdAt)].filter(Boolean).join(" - ")}
              </p>
            </div>
          </Link>
          <Button
            variant={post.followedByMe ? "secondary" : "outline"}
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => toggleFollow.mutate(post)}
            disabled={toggleFollow.isPending}
          >
            {post.followedByMe ? <UserRoundCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {post.followedByMe ? "Suivi" : "Suivre"}
          </Button>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{post.body}</p>
        <SocialMediaCarousel media={post.media} />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant={post.likedByMe ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => toggleLike.mutate(post)}
            disabled={toggleLike.isPending}
          >
            <Heart className={cn("h-4 w-4", post.likedByMe && "fill-current")} />
            {post.likesCount}
          </Button>
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

        {commentsOpen ? <SocialComments post={post} /> : null}
      </CardContent>
    </Card>
  );
}
