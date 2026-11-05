import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Download, Film, ImagePlus, Loader2, Pause, Play, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { loadTokVideoBrandMedia } from "@/lib/ai/tokVideoBrandMedia";
import { uploadTokVideoImage, VIDEO_IMAGE_ACCEPT, type TokVideoImageReference } from "@/lib/ai/tokVideoImageUpload";
import { applyReelDirection, DEFAULT_REEL_SETTINGS, readReelDraft, RESTAURANT_REEL_MAX_PHOTOS,
  type ReelDraft, type ReelSettings } from "@/lib/media/restaurantReelPlan";
import { drawReelFrame, loadReelAssets, renderRestaurantReel, type ReelAssets } from "@/lib/media/restaurantReelRenderer";

const TokVideoAiPanel = lazy(() => import("./TokVideoAiPanel"));
export type RestaurantReelCreatorProps = {
  restaurantId: string; mode?: "marketing" | "reel";
  onUseVideo?: (file: File) => void | Promise<void>;
};
const selectClass = "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";
const examples = ["Zoom léger, fondus doux, photos entières, logo en haut", "Images fixes, coupes franches, fond noir, logo en bas", "Zoom arrière, fond blanc, photos entières, sans texte"];
const aiExamples = ["Approche lente vers le plat photographié, lumière douce et transition fluide vers la salle. Préserver les détails et les couleurs.", "Plans fixes et coupes franches entre les références, cadrage sobre, aucun nouvel élément.", "Mouvement de caméra léger, lumière naturelle et ambiance accueillante dans le restaurant photographié."];

export default function RestaurantReelCreator({ restaurantId, mode = "marketing", onUseVideo }: RestaurantReelCreatorProps) {
  const storageKey = "tok:restaurant-reel:v1:" + restaurantId;
  const [draft, setDraft] = useState<ReelDraft>(() => {
    let saved: ReelDraft | null = null;
    try { saved = readReelDraft(localStorage.getItem(storageKey)); } catch { /* Manual creation remains available. */ }
    return saved || { version: 1, photoIds: [], logoId: null, withoutLogo: false, prompt: "", appliedPrompt: "", settings: { ...DEFAULT_REEL_SETTINGS } };
  });
  const initialIds = useRef([...draft.photoIds, ...(draft.logoId ? [draft.logoId] : [])]);
  const studioModeKey = "tok:video-studio:creation-mode:" + restaurantId + ":" + mode;
  const [studioMode, setStudioMode] = useState<"faithful" | "ai">(() => {
    try { const saved = localStorage.getItem(studioModeKey); if (saved === "faithful" || saved === "ai") return saved; }
    catch { /* Keep a usable default when browser storage is blocked. */ }
    return mode === "marketing" ? "ai" : "faithful";
  });
  const [media, setMedia] = useState<TokVideoImageReference[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState(false);
  const [directionMessage, setDirectionMessage] = useState("");
  const [assets, setAssets] = useState<ReelAssets | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTime, setPreviewTime] = useState(0);
  const previewTimeRef = useRef(0);
  previewTimeRef.current = previewTime;
  const [playing, setPlaying] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ file: File; signature: string } | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const uploadLock = useRef(false);
  const renderLock = useRef(false);
  const attachLock = useRef(false);
  const exportAbort = useRef<AbortController | null>(null);
  const signature = JSON.stringify(draft);
  const currentResult = result?.signature === signature ? result : null;
  const photos = useMemo(() => draft.photoIds.map((id) => media.find((item) => item.id === id)).filter((item): item is TokVideoImageReference => Boolean(item)), [draft.photoIds, media]);
  const logo = media.find((item) => item.id === draft.logoId) || null;
  const logos = media.filter((item) => item.media_type === "marketing_logo");
  const gallery = media.filter((item) => item.media_type !== "marketing_logo");
  const photoSources = useMemo(() => photos.map((item) => ({ id: item.id, url: item.media_url })), [photos]);
  const logoSource = useMemo(() => logo ? { id: logo.id, url: logo.media_url } : null, [logo]);
  const missingPhoto = photos.length !== draft.photoIds.length;
  const missingLogo = Boolean(draft.logoId && !logo);
  const ready = !loading && !uploading && !missingPhoto && !missingLogo
    && (photos.length > 0 || Boolean(logo)) && (Boolean(logo) || draft.withoutLogo);
  const promptReady = !draft.prompt.trim() || draft.appliedPrompt === draft.prompt;
  const locked = uploading || rendering || attaching;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; exportAbort.current?.abort(); };
  }, []);
  const loadGallery = useCallback(async (nextPage: number) => {
    setLoading(true); setError(null);
    try {
      const response = await loadTokVideoBrandMedia(restaurantId, nextPage, initialIds.current);
      if (!alive.current) return;
      setMedia((current) => [...new Map([...current, ...response.media].map((item) => [item.id, item])).values()]);
      setPage(nextPage); setHasMore(response.hasMore);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "Galerie indisponible."); }
    finally { if (alive.current) setLoading(false); }
  }, [restaurantId]);
  useEffect(() => { void loadGallery(0); }, [loadGallery]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); setSaveWarning(false); }
    catch { setSaveWarning(true); }
  }, [draft, storageKey]);
  useEffect(() => {
    try { localStorage.setItem(studioModeKey, studioMode); } catch { /* The draft save warning covers unavailable storage. */ }
  }, [studioMode, studioModeKey]);
  useEffect(() => {
    setAssets(null); setPreviewError(null);
    if (studioMode !== "faithful" || (!photoSources.length && !logoSource) || missingPhoto || missingLogo) return;
    const controller = new AbortController();
    let loaded: ReelAssets | null = null;
    void loadReelAssets(photoSources, logoSource, controller.signal).then((value) => {
      if (controller.signal.aborted) { value.close(); return; }
      loaded = value; setAssets(value);
    }).catch((reason) => { if (!controller.signal.aborted) setPreviewError(reason instanceof Error ? reason.message : "Aperçu indisponible."); });
    return () => { controller.abort(); loaded?.close(); };
  }, [photoSources, logoSource, missingPhoto, missingLogo, studioMode]);
  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (context && assets) drawReelFrame(context, assets, draft.settings, previewTime);
  }, [assets, draft.settings, previewTime]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let lastUpdate = 0;
    const start = performance.now() - previewTimeRef.current * 1000;
    const tick = (now: number) => {
      if (now - lastUpdate >= 1000 / 30) { setPreviewTime(((now - start) / 1000) % 10); lastUpdate = now; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  useEffect(() => {
    if (!result) { setResultUrl(null); return; }
    const url = URL.createObjectURL(result.file);
    setResultUrl(url); setReviewed(false);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  const patch = (value: Partial<ReelDraft>) => { setDraft((current) => ({ ...current, ...value })); setError(null); setReviewed(false); };
  const setting = (value: Partial<ReelSettings>) => { setDraft((current) => ({ ...current, settings: { ...current.settings, ...value } })); setReviewed(false); };
  const togglePhoto = (id: string) => {
    if (locked) return;
    if (draft.photoIds.includes(id)) patch({ photoIds: draft.photoIds.filter((value) => value !== id) });
    else if (draft.photoIds.length < RESTAURANT_REEL_MAX_PHOTOS) patch({ photoIds: [...draft.photoIds, id] });
    else setError("Six photos maximum. Retirez une photo avant d'en ajouter une autre.");
  };
  const movePhoto = (index: number, direction: -1 | 1) => {
    const next = [...draft.photoIds]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; patch({ photoIds: next });
  };
  const upload = async (file: File | undefined, kind: "photo" | "logo") => {
    if (!file || uploadLock.current || rendering || attachLock.current) return;
    if (kind === "photo" && draft.photoIds.length >= RESTAURANT_REEL_MAX_PHOTOS) { setError("Retirez une photo avant d'en importer une autre pour ce reel."); return; }
    uploadLock.current = true; setUploading(true); setError(null); setDropActive(false);
    try {
      const uploaded = await uploadTokVideoImage(restaurantId, file, kind);
      if (!alive.current) return;
      const row = { ...uploaded, media_type: kind === "logo" ? "marketing_logo" : "marketing_brand_visual" };
      setMedia((current) => [row, ...current.filter((item) => item.id !== row.id)]);
      setDraft((current) => kind === "logo" ? { ...current, logoId: row.id, withoutLogo: false }
        : { ...current, photoIds: [...current.photoIds.filter((id) => id !== row.id), row.id].slice(0, 6) });
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "Import de l'image impossible."); }
    finally { uploadLock.current = false; if (alive.current) { setUploading(false); if (photoInput.current) photoInput.current.value = ""; if (logoInput.current) logoInput.current.value = ""; } }
  };
  const applyDirection = () => {
    const interpreted = applyReelDirection(draft.prompt, draft.settings);
    patch({ settings: interpreted.settings, appliedPrompt: draft.prompt });
    setDirectionMessage(interpreted.applied.length ? "Réglages appliqués : " + interpreted.applied.join(" · ") + ". Vérifiez les réglages ci-dessous."
      : "Aucun raccourci reconnu. Définissez les réglages ci-dessous ; aucune image ni aucun son ne seront inventés à partir de cette consigne.");
  };
  const render = async () => {
    if (!ready || !promptReady || renderLock.current || attachLock.current) return;
    renderLock.current = true; setRendering(true); setProgress(0); setError(null); setPlaying(false);
    const controller = new AbortController(); exportAbort.current = controller;
    let exportAssets: ReelAssets | null = null;
    try {
      exportAssets = await loadReelAssets(photoSources, logoSource, controller.signal);
      const file = await renderRestaurantReel({ assets: exportAssets, settings: draft.settings, signal: controller.signal,
        onProgress: (value) => { if (alive.current) setProgress(value); } });
      if (alive.current) setResult({ file, signature });
    } catch (reason) { if (alive.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Le rendu n'a pas abouti. Votre brouillon est conservé."); }
    finally { exportAssets?.close(); renderLock.current = false; if (alive.current) setRendering(false); }
  };
  const attach = async () => {
    if (!currentResult || !reviewed || !onUseVideo || attachLock.current || renderLock.current) return;
    attachLock.current = true; setAttaching(true); setError(null);
    try { await onUseVideo(currentResult.file); }
    catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "Impossible d'ajouter ce reel au brouillon."); }
    finally { attachLock.current = false; if (alive.current) setAttaching(false); }
  };

  return <section className="space-y-5" aria-label="Studio vidéo du restaurant">
    <div className="flex flex-wrap items-start justify-between gap-3"><div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-orange-600"><Film className="h-5 w-5" />{mode === "reel" ? "REELS DU RESTAURANT" : "STUDIO VIDÉO MARKETING"}</div>
      <h2 className="font-serif text-3xl font-bold tracking-tight">Vos images. Votre identité.</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">{mode === "reel" ? "Un reel vertical de 10 secondes avec les médias que vous choisissez. Prévisualisez-le avant de le partager." : "Créez votre publicité avec vos photos et votre logo. Choisissez le style, le son et le format, puis vérifiez votre vidéo avant de la partager."}</p>
    </div><span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800">{mode === "reel" || studioMode === "faithful" ? "10 secondes · 9:16 · HD" : "4 à 30 secondes · jusqu’à 1080p"}</span></div>
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/50 p-1.5" role="group" aria-label="Mode de création vidéo">
      <Button variant={studioMode === "faithful" ? "default" : "ghost"} aria-pressed={studioMode === "faithful"} onClick={() => setStudioMode("faithful")} disabled={locked} className="h-auto min-h-12 gap-2 whitespace-normal px-3 py-3"><ShieldCheck className="h-4 w-4 shrink-0" />Reel fidèle</Button>
      <Button variant={studioMode === "ai" ? "default" : "ghost"} aria-pressed={studioMode === "ai"} onClick={() => { setStudioMode("ai"); setPlaying(false); }} disabled={locked} className="h-auto min-h-12 gap-2 whitespace-normal px-3 py-3"><Sparkles className="h-4 w-4 shrink-0" />Animation IA</Button>
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.85fr)]">
      <div className="min-w-0 space-y-5">
        <Card><CardHeader className="pb-3"><CardTitle className="text-lg">1. Votre logo</CardTitle><CardDescription>Le fichier original reste intact dans le mode Reel fidèle.</CardDescription></CardHeader><CardContent className="space-y-3">
          <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[80px_minmax(0,1fr)_auto]">
            {logo ? <img src={logo.media_url} alt="Logo sélectionné" className="h-20 w-20 rounded-xl border bg-white p-2 object-contain" /> : <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed"><ImagePlus className="h-6 w-6 text-muted-foreground" /></div>}
            <div className="min-w-0 space-y-2"><Label htmlFor="reel-logo">Logo du restaurant</Label><select id="reel-logo" className={selectClass} disabled={locked} value={draft.logoId || ""} onChange={(event) => patch({ logoId: event.target.value || null, withoutLogo: false })}>
              <option value="">Choisir mon logo</option>{logos.map((item) => <option key={item.id} value={item.id}>{item.alt_text || "Logo du restaurant"}</option>)}
            </select></div>
            <input ref={logoInput} type="file" accept={VIDEO_IMAGE_ACCEPT} onChange={(event) => void upload(event.target.files?.[0], "logo")} disabled={locked} aria-label="Importer le logo JPEG, PNG ou WebP" className="sr-only" />
            <Button variant="outline" onClick={() => logoInput.current?.click()} disabled={locked} className="col-span-2 min-h-11 min-w-0 w-full sm:col-span-1 sm:w-auto"><Upload className="mr-2 h-4 w-4" />Importer mon logo</Button>
          </div>
          {!logo ? <label className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-orange-600" checked={draft.withoutLogo} disabled={locked} onChange={(event) => patch({ withoutLogo: event.target.checked, logoId: null })} />{studioMode === "faithful" ? "Créer ce reel sans logo" : "Créer cette vidéo sans logo"}</label> : null}
        </CardContent></Card>
        <Card><CardHeader className="pb-3"><CardTitle className="text-lg">2. Vos photos, dans l'ordre choisi</CardTitle><CardDescription>Choisissez jusqu'à six photos. Aucun visuel n'est ajouté automatiquement.</CardDescription></CardHeader><CardContent className="space-y-4">
          {draft.photoIds.length > 0 ? <ol className="space-y-2" aria-label="Ordre des photos du reel">{draft.photoIds.map((id, index) => {
            const photo = media.find((item) => item.id === id);
            return <li key={id} className="flex items-center gap-2 rounded-xl border bg-muted/20 p-2"><span className="w-5 text-center text-sm font-semibold">{index + 1}</span>
              {photo ? <img src={photo.media_url} alt="" className="h-12 w-12 rounded-lg object-contain" /> : <span className="text-xs text-red-700">Photo indisponible</span>}
              <span className="min-w-0 flex-1 truncate text-xs">{photo?.alt_text || "Photo sélectionnée"}</span>{studioMode === "faithful" ? <span className="hidden text-xs text-muted-foreground sm:block">{(10 / draft.photoIds.length).toFixed(1)} s</span> : null}
              <Button size="icon" variant="ghost" className="h-10 w-10" aria-label={`Avancer la photo ${index + 1}`} disabled={locked || index === 0} onClick={() => movePhoto(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-10 w-10" aria-label={`Reculer la photo ${index + 1}`} disabled={locked || index === draft.photoIds.length - 1} onClick={() => movePhoto(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-10 w-10" aria-label={`Retirer la photo ${index + 1}`} disabled={locked} onClick={() => togglePhoto(id)}><X className="h-4 w-4" /></Button>
            </li>;
          })}</ol> : null}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Galerie du restaurant">{gallery.map((item) => {
            const selected = draft.photoIds.indexOf(item.id);
            return <button type="button" key={item.id} disabled={locked} aria-pressed={selected >= 0} aria-label={`Sélectionner ${item.alt_text || "la photo"}`} onClick={() => togglePhoto(item.id)}
              className={"relative overflow-hidden rounded-xl border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 " + (selected >= 0 ? "border-orange-600" : "border-transparent")}>
              <img src={item.media_url} alt={item.alt_text || "Photo du restaurant"} loading="lazy" className="aspect-square w-full bg-muted object-cover" />
              {selected >= 0 ? <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">{selected + 1}</span> : null}
            </button>;
          })}</div>
          {loading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Chargement de la galerie…</p> : !gallery.length ? <p className="text-sm text-muted-foreground">Importez vos photos pour commencer. Le mode Reel fidèle permet aussi d’utiliser votre logo seul.</p> : null}
          {hasMore ? <Button variant="ghost" disabled={loading || locked} onClick={() => void loadGallery(page + 1)}>Voir plus de photos</Button> : null}
          <div role="group" aria-label="Importer une image de référence" onDragOver={(event) => { event.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)}
            onDrop={(event) => { event.preventDefault(); setDropActive(false); void upload(event.dataTransfer.files[0], "photo"); }} className={"rounded-xl border-2 border-dashed p-4 text-center " + (dropActive ? "border-orange-500 bg-orange-50" : "border-orange-200")}>
            <input ref={photoInput} type="file" accept={VIDEO_IMAGE_ACCEPT} disabled={locked} className="sr-only" aria-label="Choisir une image JPEG, PNG ou WebP" onChange={(event) => void upload(event.target.files?.[0], "photo")} />
            <Button variant="outline" className="min-h-11" disabled={locked} onClick={() => photoInput.current?.click()}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Choisir une image</Button>
            <p className="mt-2 text-xs text-muted-foreground">JPEG, PNG ou WebP · 10 Mo maximum · glisser-déposer possible.</p><p className="mt-1 text-xs text-muted-foreground">Les imports rejoignent la médiathèque publique de votre restaurant.</p>
          </div>
        </CardContent></Card>
        <Card><CardHeader className="pb-3"><CardTitle className="text-lg">3. Votre direction artistique</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="tok-video-prompt">Consignes artistiques</Label><Textarea id="tok-video-prompt" value={draft.prompt} disabled={locked} maxLength={1000} onChange={(event) => patch({ prompt: event.target.value })}
            placeholder={studioMode === "faithful" ? "Ex. : Zoom léger, fondus doux, photos entières, logo en haut. Conserver les couleurs originales." : "Ex. : Un plan lent sur notre plat, puis une transition vers la salle photographiée. Préserver les détails du restaurant."} className="min-h-28" /></div>
          <div className="flex flex-wrap gap-2">{(studioMode === "faithful" ? examples : aiExamples).map((example, index) => <Button key={example} variant="outline" size="sm" disabled={locked} onClick={() => patch({ prompt: example })}>{["Doux", "Minimal", "Lumineux"][index]}</Button>)}</div>
          {studioMode === "faithful" ? <>
            <p className="text-xs text-muted-foreground">Raccourcis compris : zoom avant/arrière, image fixe, panoramique gauche/droite, fondu/coupe, fond blanc/noir, logo en haut/bas. Les réglages ci-dessous définissent le rendu exact.</p>
            <Button variant="outline" className="h-auto min-h-11 min-w-0 w-full whitespace-normal py-3" disabled={locked || !draft.prompt.trim()} onClick={applyDirection}>Appliquer les consignes au montage</Button>
            {directionMessage ? <p role="status" className="text-sm text-muted-foreground">{directionMessage}</p> : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="reel-motion">Mouvement</Label><select id="reel-motion" className={selectClass} value={draft.settings.motion} disabled={locked} onChange={(event) => setting({ motion: event.target.value as ReelSettings["motion"] })}><option value="none">Image fixe</option><option value="zoom-in">Zoom avant léger</option><option value="zoom-out">Zoom arrière léger</option><option value="pan-left">Panoramique à gauche</option><option value="pan-right">Panoramique à droite</option></select></div>
              <div className="space-y-2"><Label htmlFor="reel-transition">Transitions</Label><select id="reel-transition" className={selectClass} value={draft.settings.transition} disabled={locked} onChange={(event) => setting({ transition: event.target.value as ReelSettings["transition"] })}><option value="fade">Fondus doux</option><option value="cut">Coupes franches</option></select></div>
              <div className="space-y-2"><Label htmlFor="reel-fit">Cadrage des photos</Label><select id="reel-fit" className={selectClass} value={draft.settings.photoFit} disabled={locked} onChange={(event) => setting({ photoFit: event.target.value as ReelSettings["photoFit"] })}><option value="contain">Photo entière · sans recadrage</option><option value="cover">Plein cadre · avec recadrage</option></select></div>
              <div className="space-y-2"><Label htmlFor="reel-logo-position">Position du logo</Label><select id="reel-logo-position" className={selectClass} value={draft.settings.logoPosition} disabled={locked} onChange={(event) => setting({ logoPosition: event.target.value as ReelSettings["logoPosition"] })}><option value="top">En haut</option><option value="bottom">En bas</option></select></div>
              <div className="space-y-2"><Label htmlFor="reel-background">Fond</Label><Input id="reel-background" type="color" className="h-11" value={draft.settings.background} disabled={locked} onChange={(event) => setting({ background: event.target.value })} /></div>
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-orange-600" checked={draft.settings.logoPlate} disabled={locked} onChange={(event) => setting({ logoPlate: event.target.checked })} />Fond blanc derrière le logo</label>
            </div>
            <div className="space-y-2"><Label htmlFor="reel-caption">Texte à afficher, uniquement si vous le souhaitez</Label><Input id="reel-caption" value={draft.settings.caption} maxLength={120} disabled={locked} placeholder="Aucun texte par défaut" onChange={(event) => setting({ caption: event.target.value })} /></div>
            {draft.settings.caption ? <div className="space-y-2"><Label htmlFor="reel-font">Typographie du texte</Label><select id="reel-font" className={selectClass} value={draft.settings.font} disabled={locked} onChange={(event) => setting({ font: event.target.value as ReelSettings["font"] })}><option value="sans">Sobre · sans empattements</option><option value="serif">Éditoriale · avec empattements</option></select></div> : null}
          </> : <p className="text-sm text-muted-foreground">Le brief est transmis avec vos photos dans leur ordre et, si sélectionné, votre logo comme référence d'identité. Décrivez les mouvements souhaités sans demander de nouvelles scènes.</p>}
        </CardContent></Card>
      </div>
      <div className="min-w-0 space-y-4 xl:sticky xl:top-5">
        {studioMode === "faithful" ? <Card><CardHeader className="pb-3"><CardTitle className="text-lg">Aperçu du montage fidèle</CardTitle><CardDescription>{photos.length} photo{photos.length > 1 ? "s" : ""}{logo ? " · logo original" : ""} · aucun son ajouté</CardDescription></CardHeader><CardContent className="space-y-3">
          <div className="mx-auto max-w-[300px] overflow-hidden rounded-2xl border bg-muted" style={{ aspectRatio: "9 / 16" }}>
            {assets ? <canvas ref={canvasRef} width={720} height={1280} className="h-full w-full" aria-label="Aperçu du reel avec les médias sélectionnés" />
              : <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center text-sm text-muted-foreground"><Film className="h-8 w-8" />{previewError || "Choisissez vos photos et votre logo pour voir l'aperçu."}</div>}
          </div>
          <div className="flex items-center gap-3"><Button size="icon" variant="outline" disabled={!assets || rendering} onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Mettre l'aperçu en pause" : "Lire l'aperçu"}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
            <input type="range" aria-label="Position dans le reel" min={0} max={9.99} step={0.01} value={previewTime} onChange={(event) => { setPlaying(false); setPreviewTime(Number(event.target.value)); }} disabled={!assets} className="min-w-0 flex-1 accent-orange-600" /><span className="text-xs tabular-nums">{previewTime.toFixed(1)} / 10 s</span></div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-orange-600" />Photos originales et logo conservés. Aucun plat, décor ou personnage généré.</p>
        </CardContent></Card> : <Card><CardHeader className="pb-3"><CardTitle className="text-lg">Vos références</CardTitle><CardDescription>Les images qui guideront votre animation.</CardDescription></CardHeader><CardContent className="space-y-4">
          {photos.length ? <div className="grid grid-cols-2 gap-2">{photos.map((photo, index) => <figure key={photo.id} className="min-w-0 overflow-hidden rounded-xl border bg-muted/20">
            <img src={photo.media_url} alt={photo.alt_text || "Référence " + (index + 1)} className="aspect-square w-full object-contain" loading="lazy" />
            <figcaption className="truncate px-2 py-1.5 text-xs">{index + 1}. {photo.alt_text || "Photo sélectionnée"}</figcaption>
          </figure>)}</div> : <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Choisissez vos photos dans la galerie. Aucun visuel ne sera ajouté automatiquement.</p>}
          {logo ? <div className="flex items-center gap-3 rounded-xl border p-3"><img src={logo.media_url} alt="Logo de référence" className="h-12 w-12 rounded-lg bg-white object-contain p-1" /><span className="text-sm">Identité du restaurant</span></div> : null}
          <p className="text-xs leading-relaxed text-muted-foreground">Ce sont vos images sources. L’animation finale apparaîtra dans votre historique après génération.</p>
        </CardContent></Card>}
        {studioMode === "faithful" ? <div className="space-y-3 rounded-2xl border border-orange-200 bg-orange-50/50 p-4 dark:bg-orange-950/10">
          <p className="font-semibold">Reel fidèle · sans crédits IA</p><p className="text-sm text-muted-foreground">Export MP4 de 10 secondes. Le brouillon est sauvegardé sur cet appareil ; si vous fermez la page pendant l'export, vous pourrez le relancer.</p>
          {!logo && !draft.withoutLogo ? <p className="text-sm">Choisissez votre logo ou cochez « Créer ce reel sans logo ».</p> : null}
          {(missingPhoto || missingLogo) && !loading ? <p className="text-sm text-red-700">Un média du brouillon n'est plus disponible. Retirez-le ou importez-le à nouveau.</p> : null}
          {!promptReady ? <p className="text-xs text-muted-foreground">Appliquez les consignes au montage avant l'export.</p> : null}
          <Button className="h-auto min-h-12 min-w-0 w-full whitespace-normal bg-orange-600 py-3 hover:bg-orange-700" disabled={!ready || !promptReady || locked || Boolean(previewError)} onClick={render}>{rendering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}{rendering ? `Export ${Math.round(progress * 100)} %` : "Créer mon reel de 10 secondes"}</Button>
          {rendering ? <><progress max={1} value={progress} className="w-full accent-orange-600" aria-label="Progression de l'export" /><Button variant="ghost" onClick={() => exportAbort.current?.abort()}>Annuler l'export</Button></> : null}
          {currentResult && resultUrl ? <div className="space-y-3 border-t border-orange-200 pt-4"><p className="flex items-center gap-2 font-semibold"><Check className="h-4 w-4 text-green-600" />Votre reel est prêt</p>
            <video src={resultUrl} controls playsInline preload="metadata" className="max-h-[400px] w-full rounded-xl bg-black object-contain" aria-label="Reel final de 10 secondes" />
            <Button asChild variant="outline" className="w-full"><a href={resultUrl} download="reel-restaurant-10s.mp4"><Download className="mr-2 h-4 w-4" />Télécharger le MP4</a></Button>
            {onUseVideo ? <><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-orange-600" checked={reviewed} disabled={attaching} onChange={(event) => setReviewed(event.target.checked)} />J'ai vérifié mon reel et je souhaite l'ajouter à mon brouillon.</label><Button className="h-auto min-h-11 min-w-0 w-full whitespace-normal py-3" disabled={!reviewed || attaching} onClick={attach}>{attaching ? "Ajout au brouillon…" : "Ajouter au brouillon d'actualité"}</Button></> : <p className="text-xs text-muted-foreground">Créez et joignez aussi votre reel depuis Actualité → Créer un reel de 10 s.</p>}
          </div> : null}
        </div> : null}
      </div>
    </div>
    {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}<Button variant="ghost" size="sm" onClick={() => void loadGallery(page)} disabled={loading || locked}>Recharger la galerie</Button></div> : null}
    {saveWarning ? <p role="status" className="text-sm text-amber-700">Le navigateur ne permet pas de sauvegarder ce brouillon. Gardez cette page ouverte jusqu'au téléchargement.</p> : null}
    {studioMode === "ai" ? <section className="space-y-4" aria-label="Création de votre animation"><div><h3 className="font-serif text-2xl font-semibold">Votre publicité, dans les détails</h3><p className="mt-1 text-sm text-muted-foreground">Réglez votre création, vérifiez son devis, puis lancez la génération.</p></div>
      <Suspense fallback={<p role="status">Chargement du moteur vidéo…</p>}><TokVideoAiPanel restaurantId={restaurantId} mode={mode} photoIds={draft.photoIds} logoId={draft.logoId} prompt={draft.prompt}
        selectedPhotos={photos.map((photo) => ({ id: photo.id, label: photo.alt_text || "Photo sélectionnée", url: photo.media_url }))}
        disabled={!ready || locked} disabledReason={!ready && !loading ? (missingPhoto || missingLogo ? "Un média du brouillon n'est plus disponible. Retirez-le ou importez-le à nouveau." : !logo && !draft.withoutLogo ? "Choisissez votre logo ou cochez « Créer cette vidéo sans logo »." : undefined) : undefined}
        onUseVideo={mode === "reel" ? onUseVideo : undefined} /></Suspense>
    </section> : null}
  </section>;
}
