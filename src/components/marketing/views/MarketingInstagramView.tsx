import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Instagram, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { loadInstagramResearch, submitInstagramTelegramReview, listInstagramTelegramReviews } from "@/marketing/instagramResearchClient";
import type { InstagramReviewView } from "../../../../supabase/functions/_shared/marketing-instagram-review";
import {
  buildInstagramReply, INSTAGRAM_REPLY_TOPICS, instagramPostUrl, instagramUsername,
  parseInstagramResearchRequest, rankInstagramPosts,
  type InstagramComment, type InstagramPost, type InstagramReplyTopic, type InstagramResearchResult,
} from "../../../../supabase/functions/_shared/marketing-instagram-research";

type Discovery = Extract<InstagramResearchResult, { kind: "discovery" }>;
const number = (value: number | null) => value === null ? "Indisponible" : new Intl.NumberFormat("fr-CH").format(value);
const rate = (value: number | null) => value === null ? "Taux indisponible" : `${value.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const warning = (code: string) => code === "instagram_access_required" ? "Autorisations Meta insuffisantes pour cette source."
  : code === "instagram_rate_limited" ? "Quota Meta atteint. Réessayez plus tard."
  : code === "instagram_budget_exhausted" ? "Budget de lecture atteint. Relancez avec moins de sources."
  : "Source indisponible ou réponse inexploitable. Réessayez ou ouvrez Instagram.";
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const split = (value: string) => value.split(/[,;\s]+/).filter(Boolean);
const reviewLabels: Record<InstagramReviewView["status"], string> = {
  delivering: "Envoi en cours ou interrompu — vérifiez Telegram, ne renvoyez pas ce brouillon.",
  pending: "Envoyé sur Telegram — en attente de validation",
  delivery_unknown: "Réception non confirmée — vérifiez Telegram. Aucun renvoi automatique.",
  approved: "Validé sur Telegram — prêt à publier manuellement",
  rejected: "Refusé sur Telegram — ne pas publier",
  expired: "Validation expirée — ne pas publier",
};

export default function MarketingInstagramView({ canMutateBackend }: { canMutateBackend: boolean }) {
  const [hashtags, setHashtags] = useState("genevefood, restaurantgeneve, sortirageneve");
  const [usernames, setUsernames] = useState("");
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [ranking, setRanking] = useState<"rate" | "interactions">("rate");
  const [data, setData] = useState<Discovery | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [selectedPost, setSelectedPost] = useState<InstagramPost | null>(null);
  const [comments, setComments] = useState<InstagramComment[]>([]);
  const [after, setAfter] = useState<string | null>(null);
  const [manualUsername, setManualUsername] = useState("");
  const [manualText, setManualText] = useState("");
  const [manualLikes, setManualLikes] = useState("");
  const [selectedComment, setSelectedComment] = useState<InstagramComment | null>(null);
  const [topic, setTopic] = useState<InstagramReplyTopic>("discovery");
  const [reply, setReply] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [reviews, setReviews] = useState<InstagramReviewView[]>([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const reviewBusyRef = useRef(false);
  const manualId = useRef(0);
  useEffect(() => () => controller.current?.abort(), []);
  const posts = useMemo(() => rankInstagramPosts(data?.posts ?? [], ranking), [data, ranking]);

  function resetSelection(post: InstagramPost | null) {
    setSelectedPost(post); setComments([]); setAfter(null); setSelectedComment(null);
    setReply(""); setManualUsername(""); setManualText(""); setManualLikes(""); setCopyStatus("");
  }
  async function read(operation: (signal: AbortSignal) => Promise<void>) {
    if (!canMutateBackend || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    const abort = new AbortController(); controller.current = abort;
    try { await operation(abort.signal); }
    catch (failure) { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Lecture Instagram impossible."); }
    finally { if (!abort.signal.aborted) { busyRef.current = false; setBusy(false); } }
  }
  function discover() {
    void read(async (signal) => {
      let request;
      try { request = parseInstagramResearchRequest({ action: "instagram_discover", hashtags: split(hashtags), usernames: split(usernames), days }); }
      catch { throw new Error("Indiquez au maximum trois hashtags et trois pseudos valides."); }
      const result = await loadInstagramResearch(request, signal);
      if (signal.aborted) return;
      if (result.kind !== "discovery") throw new Error("Réponse de veille invalide.");
      setData(result); resetSelection(null);
    });
  }
  function readComments(post: InstagramPost, cursor?: string) {
    void read(async (signal) => {
      const result = await loadInstagramResearch({ action: "instagram_comments", mediaId: post.id, ...(cursor ? { after: cursor } : {}) }, signal);
      if (signal.aborted) return;
      if (result.kind !== "comments" || result.mediaId !== post.id) throw new Error("Réponse de commentaires invalide.");
      if (!cursor) resetSelection(post);
      setComments((current) => {
        const merged = new Map((cursor ? current : []).map((row) => [row.id, row]));
        for (const row of result.comments) merged.set(row.id, row);
        return [...merged.values()].sort((a, b) => (b.likes ?? -1) - (a.likes ?? -1)).slice(0, 500);
      });
      setAfter(result.nextCursor === cursor ? null : result.nextCursor);
    });
  }
  function prepare(comment: InstagramComment, post = selectedPost) {
    if (!comment.username || !post) return;
    setSelectedComment(comment); setTopic("discovery"); setCopyStatus("");
    setReply(buildInstagramReply(comment.username, "discovery", post.id));
  }
  function addManualComment() {
    const username = manualUsername.trim().replace(/^@/, "");
    const likes = manualLikes.trim() ? Number(manualLikes) : null;
    if (!instagramUsername(username) || !manualText.trim() || (likes !== null && (!Number.isSafeInteger(likes) || likes < 0))) {
      setError("Vérifiez le pseudo, le commentaire et le nombre de mentions J’aime observés."); return;
    }
    const comment: InstagramComment = { id: `manual-${++manualId.current}`, username, text: manualText.trim(), likes, timestamp: null };
    setComments((current) => [...current, comment].sort((a, b) => (b.likes ?? -1) - (a.likes ?? -1)).slice(0, 500));
    setError(""); prepare(comment);
  }
  async function copyReply() {
    try { await navigator.clipboard.writeText(reply); setCopyStatus("Réponse copiée. Ouvrez Instagram pour la publier."); }
    catch { setCopyStatus("Copie indisponible. Sélectionnez et copiez le texte de la réponse."); }
  }
  async function telegramReview(submit: boolean) {
    if (!canMutateBackend || reviewBusyRef.current) return;
    reviewBusyRef.current = true; setReviewBusy(true); setError("");
    try {
      if (submit) {
        if (!selectedComment?.username || !selectedPost) return;
        const postUrl = instagramPostUrl(selectedPost.url);
        if (!postUrl) throw new Error("Lien Instagram invalide.");
        const { review } = await submitInstagramTelegramReview({ action: "instagram_review_submit", postUrl,
          username: selectedComment.username, commentText: selectedComment.text, commentLikes: selectedComment.likes,
          replyText: reply, observation: selectedPost.owned ? "workspace" : "manual" });
        setReviews(current => [review, ...current.filter(item => item.id !== review.id)].slice(0, 20));
      } else {
        setReviews((await listInstagramTelegramReviews()).reviews);
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Validation Telegram indisponible."); }
    finally { reviewBusyRef.current = false; setReviewBusy(false); }
  }

  return <div className="min-w-0 space-y-5">
    <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Instagram className="h-6 w-6 text-orange-500" />Veille Instagram Genève</h1>
      <p className="mt-2 text-sm text-muted-foreground">Repérez les contenus sur la restauration, la cuisine et les sorties, puis préparez une réponse utile vers TOK.</p></div>
    <Card><CardHeader><CardTitle className="text-lg">Rechercher et comparer</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div><label htmlFor="ig-hashtags" className="text-sm font-semibold">Hashtags à explorer</label><Input id="ig-hashtags" value={hashtags} onChange={(event) => setHashtags(event.target.value)} maxLength={180} disabled={busy} /><p className="mt-1 text-xs text-muted-foreground">Trois maximum. Meta limite la recherche à 30 hashtags distincts sur sept jours par compte.</p></div>
        <div><label htmlFor="ig-usernames" className="text-sm font-semibold">Comptes professionnels à analyser</label><Input id="ig-usernames" value={usernames} onChange={(event) => setUsernames(event.target.value)} placeholder="@restaurant, @createur" maxLength={100} disabled={busy} /><p className="mt-1 text-xs text-muted-foreground">Trois maximum, séparés par des virgules. Comptes publics professionnels uniquement.</p></div>
      </div>
      <div className="flex flex-wrap items-end gap-3"><div><label htmlFor="ig-days" className="text-sm font-semibold">Période</label><select id="ig-days" className={selectClass} value={days} disabled={busy} onChange={(event) => setDays(Number(event.target.value) as 7 | 30 | 90)}><option value={7}>7 derniers jours</option><option value={30}>30 derniers jours</option><option value={90}>90 derniers jours</option></select></div>
        <Button type="button" disabled={!canMutateBackend || busy} onClick={discover}>{busy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Rechercher sur Instagram</Button></div>
      <p className="text-xs text-muted-foreground">Lecture d’un échantillon de 25 publications par source, selon les autorisations Meta. Les comptes mentionnés dans les légendes locales peuvent aussi être analysés. Les indices de lieu restent à vérifier.</p>
    </CardContent></Card>
    {busy ? <p role="status" className="text-sm">Lecture Instagram en cours…</p> : null}
    {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">{error}</p> : null}
    {data ? <>
      <p className="text-xs text-muted-foreground">Compte connecté : @{data.accountUsername} · Relevé du {new Date(data.observedAt).toLocaleString("fr-CH", { timeZone: "Europe/Zurich" })} · {data.days} jours. Classement limité aux contenus reçus.</p>
      {data.warnings.length ? <div role="status" className="space-y-1 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-sm"><p className="font-semibold">Résultats partiels</p>{data.warnings.map((entry) => <p key={entry.source}>{entry.source} : {warning(entry.code)}</p>)}</div> : null}
      {data.truncatedSources.length ? <p className="text-xs text-muted-foreground">D’autres contenus existent pour : {data.truncatedSources.join(", ")}. Cet échantillon ne constitue pas un classement exhaustif d’Instagram.</p> : null}
      <Card><CardHeader><CardTitle className="text-lg">Comptes et engagement public</CardTitle></CardHeader><CardContent>
        <p className="mb-3 text-xs text-muted-foreground">Taux par publication = (J’aime + commentaires) ÷ abonnés au moment du relevé × 100. La médiane compare les publications locales mesurables de l’échantillon. Portée, partages et enregistrements des tiers non disponibles.</p>
        {data.accounts.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Compte</th><th className="p-2">Abonnés</th><th className="p-2">Taux médian</th><th className="p-2">Publications mesurées</th></tr></thead><tbody>{data.accounts.map((account) => <tr key={account.username} className="border-t"><td className="p-2"><a className="font-semibold text-orange-600 underline" href={`https://www.instagram.com/${encodeURIComponent(account.username)}/`} target="_blank" rel="noopener noreferrer">@{account.username}</a></td><td className="p-2">{number(account.followers)}</td><td className="whitespace-nowrap p-2">{rate(account.medianEngagementRate)}</td><td className="p-2">{account.measuredPosts}/{account.sampledPosts}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">Aucun compte professionnel mesurable dans cet échantillon. Ouvrez les publications pour identifier leurs auteurs, puis ajoutez leurs pseudos ci-dessus.</p>}
      </CardContent></Card>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Publications repérées ({posts.length})</h2><div><label htmlFor="ig-sort" className="sr-only">Classer les publications</label><select id="ig-sort" className={selectClass} value={ranking} onChange={(event) => setRanking(event.target.value as "rate" | "interactions")}><option value="rate">Taux d’engagement public</option><option value="interactions">Nombre d’interactions</option></select></div></div>
      {!posts.length ? <p className="rounded-xl border p-4 text-sm">Aucun contenu exploitable dans cet échantillon. Vérifiez les avertissements et essayez d’autres sources.</p> : <div className="grid gap-4 xl:grid-cols-2">{posts.map((post) => <Card key={post.id} className="min-w-0"><CardContent className="space-y-3 pt-5">
        <p className="text-xs font-semibold text-orange-600">{post.source} · {post.localEvidence}</p><p className="whitespace-pre-wrap break-words text-sm">{post.caption || "Légende indisponible"}</p>
        <p className="text-sm font-semibold">{rate(post.engagementRate)}</p><p className="text-xs text-muted-foreground">{number(post.likes)} J’aime · {number(post.comments)} commentaires{post.timestamp ? ` · ${new Date(post.timestamp).toLocaleDateString("fr-CH")}` : ""}</p>
        <div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><a href={instagramPostUrl(post.url) ?? undefined} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Voir sur Instagram</a></Button>
          {post.owned ? <Button type="button" size="sm" disabled={busy || !canMutateBackend} onClick={() => readComments(post)}>Charger les commentaires TOK</Button> : <Button type="button" size="sm" variant="outline" disabled={busy || !canMutateBackend} onClick={() => resetSelection(post)}>Préparer une réponse externe</Button>}</div>
      </CardContent></Card>)}</div>}
    </> : <p className="text-sm text-muted-foreground">Lancez une recherche pour afficher des résultats réels. Aucun message n’est envoyé par la recherche.</p>}
    {selectedPost ? <Card><CardHeader><CardTitle className="text-lg">Commentaires et réponses</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm">Publication sélectionnée : <a href={instagramPostUrl(selectedPost.url) ?? undefined} target="_blank" rel="noopener noreferrer" className="text-orange-600 underline">{selectedPost.source}</a></p>
      <p className="text-xs text-muted-foreground">Les commentaires sont classés par J’aime observés. Leur taux d’engagement est inconnu : Instagram ne fournit pas leur nombre de vues. Les réponses sont à relire et à publier dans Instagram. Les liens en commentaire peuvent ne pas être cliquables.</p>
      {!selectedPost.owned ? <div className="space-y-3 rounded-xl border p-4"><p className="text-sm font-semibold">Saisie manuelle d’un commentaire observé sur Instagram</p><p className="text-xs text-muted-foreground">Meta ne donne pas accès aux commentaires de toutes les publications tierces. Ouvrez la publication et recopiez le commentaire et son auteur exacts.</p>
        <div><label htmlFor="ig-manual-author" className="text-sm">Pseudo observé sur Instagram</label><Input id="ig-manual-author" value={manualUsername} onChange={(event) => setManualUsername(event.target.value)} maxLength={31} /></div>
        <div><label htmlFor="ig-manual-comment" className="text-sm">Commentaire observé</label><Textarea id="ig-manual-comment" value={manualText} onChange={(event) => setManualText(event.target.value)} maxLength={2200} /></div>
        <div><label htmlFor="ig-manual-likes" className="text-sm">J’aime observés (facultatif)</label><Input id="ig-manual-likes" type="number" min={0} step={1} value={manualLikes} onChange={(event) => setManualLikes(event.target.value)} /></div>
        <Button type="button" onClick={addManualComment} disabled={!canMutateBackend || comments.length >= 500}>Préparer la réponse</Button></div> : null}
      <section aria-label="Commentaires observés" className="space-y-3">{comments.map((comment) => <div key={comment.id} className="rounded-xl border p-3"><p className="text-xs font-semibold">{comment.username ? `@${comment.username}` : "Auteur indisponible"} · {number(comment.likes)} J’aime</p><p className="my-2 whitespace-pre-wrap break-words text-sm">{comment.text}</p><Button type="button" variant="outline" size="sm" disabled={!comment.username || !canMutateBackend} onClick={() => prepare(comment)}>Répondre à {comment.username ? `@${comment.username}` : "cet auteur"}</Button></div>)}</section>
      {after && comments.length < 500 ? <Button type="button" variant="outline" disabled={busy} onClick={() => readComments(selectedPost, after)}>Charger plus de commentaires</Button> : null}
      {comments.length >= 500 ? <p className="text-xs text-muted-foreground">Limite de 500 commentaires observés atteinte.</p> : null}
      {selectedComment ? <div className="space-y-3 rounded-xl bg-orange-500/5 p-4"><p className="whitespace-pre-wrap break-words text-sm">En réponse à @{selectedComment.username} : « {selectedComment.text} »</p>
        <div><label htmlFor="ig-reply-topic" className="text-sm">Sujet à adapter au commentaire</label><select id="ig-reply-topic" className={selectClass} value={topic} onChange={(event) => { const next = event.target.value as InstagramReplyTopic; setTopic(next); setReply(buildInstagramReply(selectedComment.username!, next, selectedPost.id)); setCopyStatus(""); }}>{Object.entries(INSTAGRAM_REPLY_TOPICS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div><label htmlFor="ig-reply" className="text-sm font-semibold">Réponse à relire</label><Textarea id="ig-reply" className="min-h-32" value={reply} onChange={(event) => { setReply(event.target.value); setCopyStatus(""); }} maxLength={2200} /></div>
        <p className="text-xs text-muted-foreground">Proposition à personnaliser, sans génération IA payante. Répondez au besoin exprimé avant d’ajouter TOK. Aucune réponse en masse ni publication automatique.</p>
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={!reply.trim() || !canMutateBackend || reviewBusy} onClick={() => void telegramReview(true)}>{reviewBusy ? "Traitement Telegram…" : "Envoyer sur Telegram pour validation"}</Button><Button type="button" variant="outline" disabled={!reply.trim() || !canMutateBackend} onClick={() => void copyReply()}>Copier la réponse</Button><Button asChild variant="outline"><a href={instagramPostUrl(selectedPost.url) ?? undefined} target="_blank" rel="noopener noreferrer">Ouvrir la publication pour répondre</a></Button></div>{copyStatus ? <p role="status" className="text-sm">{copyStatus}</p> : null}
      </div> : null}
    </CardContent></Card> : null}
    <Card><CardHeader><CardTitle className="text-lg">Validations Telegram</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">Chaque envoi contient le commentaire, son auteur, le lien Instagram et la réponse exacte. Validez ou refusez dans Telegram, puis actualisez ici. Une modification du texte nécessite une nouvelle validation. Aucune publication Instagram automatique.</p>
      <Button type="button" variant="outline" disabled={!canMutateBackend || reviewBusy} onClick={() => void telegramReview(false)}>Actualiser les validations Telegram</Button>
      {reviews.map(review => <article key={review.id} className="space-y-2 rounded-xl border p-3">
        <p role="status" className="text-sm font-semibold">{reviewLabels[review.status]}</p>
        <p className="whitespace-pre-wrap break-words text-sm">@{review.payload.username} : {review.payload.commentText}</p>
        <p className="whitespace-pre-wrap break-words text-sm">Réponse soumise : {review.payload.replyText}</p>
        <a className="text-sm text-orange-600 underline" href={instagramPostUrl(review.payload.postUrl) ?? undefined} target="_blank" rel="noopener noreferrer">Voir le commentaire dans sa publication</a>
        {review.status === "approved" ? <Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(review.payload.replyText).then(() => setCopyStatus("Réponse validée copiée."), () => setCopyStatus("Sélectionnez et copiez la réponse validée ci-dessus.")); }}>Copier le texte validé de @{review.payload.username}</Button> : null}
      </article>)}
      <p className="text-xs text-muted-foreground">Les 20 dernières validations sont affichées. Les données restent accessibles aux administrateurs TOK.</p>
    </CardContent></Card>
  </div>;
}
