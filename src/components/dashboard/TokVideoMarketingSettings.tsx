import { useId } from "react";
import { Clapperboard, ImageIcon, SlidersHorizontal, Volume2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TokVideoMarketingSettings, TokVideoStudioDraft } from "@/lib/ai/tokVideoClient";
import {
  TOK_VIDEO_ASPECT_RATIOS,
  TOK_VIDEO_BITRATE_MODES,
  TOK_VIDEO_CREATIVE_FORMATS,
  TOK_VIDEO_DURATIONS,
  TOK_VIDEO_OUTPUT_FORMATS,
  TOK_VIDEO_RESOLUTIONS,
} from "../../../supabase/functions/_shared/higgsfield-marketing-settings";

export type TokVideoSelectedPhoto = { id: string; label: string; url?: string };

type Props = {
  value: TokVideoStudioDraft;
  onChange: (value: Partial<TokVideoStudioDraft>) => void;
  selectedPhotos: TokVideoSelectedPhoto[];
  mode: "marketing" | "reel";
  disabled?: boolean;
};

const selectClass = "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
const aspectNames: Record<string, string> = {
  "9:16": "9:16 · Vertical / Reels",
  "16:9": "16:9 · Paysage",
  "1:1": "1:1 · Carré",
  "4:3": "4:3 · Paysage classique",
  "3:4": "3:4 · Portrait",
  "21:9": "21:9 · Cinéma",
};
const audioModes = [
  { id: "silent", label: "Sans son", description: "Vidéo silencieuse." },
  { id: "ambient", label: "Ambiance sonore", description: "Son du lieu, sans voix." },
  { id: "voiceover", label: "Voix off", description: "Votre script, dans la langue choisie." },
] as const;

export default function TokVideoMarketingSettingsForm({ value, onChange, selectedPhotos, mode, disabled = false }: Props) {
  const id = useId();
  const marketing = value.marketing;
  const patchMarketing = (patch: Partial<TokVideoMarketingSettings>) => onChange({ marketing: { ...marketing, ...patch } });
  const creativeFormat = TOK_VIDEO_CREATIVE_FORMATS.find((format) => format.id === marketing.creativeFormat);
  const isReel = mode === "reel";

  const mediaSelect = (key: "productMediaId" | "avatarMediaId" | "startImageMediaId" | "endImageMediaId", label: string, empty: string) => {
    const current = marketing[key];
    const missing = Boolean(current && !selectedPhotos.some((photo) => photo.id === current));
    return <div className="min-w-0 space-y-2">
      <Label htmlFor={id + key}>{label}</Label>
      <select id={id + key} className={selectClass} value={current || ""} disabled={disabled || (!selectedPhotos.length && !current)}
        aria-invalid={missing || undefined} aria-describedby={missing ? id + key + "-error" : undefined}
        onChange={(event) => patchMarketing({ [key]: event.target.value || null })}>
        <option value="">{empty}</option>
        {missing ? <option value={current!}>Photo retirée de la sélection</option> : null}
        {selectedPhotos.map((photo, index) => <option key={photo.id} value={photo.id}>{index + 1}. {photo.label}</option>)}
      </select>
      {missing ? <p id={id + key + "-error"} className="text-xs text-destructive">Choisissez une photo encore sélectionnée ou retirez ce rôle.</p> : null}
    </div>;
  };

  return <div className="grid items-start gap-4 lg:grid-cols-2" aria-label="Paramètres du studio marketing vidéo">
    <Card className="min-w-0">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg"><Clapperboard className="h-5 w-5 text-primary" />Format créatif</CardTitle>
        <CardDescription>Donnez une intention claire à votre publicité.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={id + "-creative-format"}>Style de publicité</Label>
          <select id={id + "-creative-format"} className={selectClass} disabled={disabled} value={marketing.creativeFormat}
            aria-describedby={id + "-format-description"} onChange={(event) => patchMarketing({ creativeFormat: event.target.value as TokVideoMarketingSettings["creativeFormat"] })}>
            {TOK_VIDEO_CREATIVE_FORMATS.map((format) => <option key={format.id} value={format.id}>{format.label}</option>)}
          </select>
          <p id={id + "-format-description"} className="text-sm text-muted-foreground">{creativeFormat?.description}</p>
        </div>
        <p className="rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">Ces formats inspirés de Higgsfield deviennent des consignes de création TOK avec vos propres photos. Le rendu est une interprétation, pas une copie des modèles prêts à l’emploi de Higgsfield.</p>
        <div className="space-y-2">
          <Label htmlFor={id + "-product-description"}>Produit, plat ou expérience à présenter</Label>
          <Textarea id={id + "-product-description"} value={marketing.productDescription} disabled={disabled} maxLength={5000}
            onChange={(event) => patchMarketing({ productDescription: event.target.value })}
            placeholder="Décrivez ce que montrent les photos : le plat, ses détails, votre salle ou votre équipe…" className="min-h-24" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id + "-hook"}>Accroche visuelle</Label>
          <Textarea id={id + "-hook"} value={marketing.hook} disabled={disabled} maxLength={500}
            onChange={(event) => patchMarketing({ hook: event.target.value })}
            placeholder="Ex. : commencer sur un détail du plat puis dévoiler l'assiette." className="min-h-20" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id + "-setting"}>Décor et ambiance</Label>
          <Textarea id={id + "-setting"} value={marketing.setting} disabled={disabled} maxLength={500}
            onChange={(event) => patchMarketing({ setting: event.target.value })}
            placeholder="Ex. : lumière chaleureuse dans la salle photographiée, couleurs naturelles." className="min-h-20" />
          <p className="text-xs text-muted-foreground">Le lieu reste celui de vos photos. L’accroche et l’ambiance guident le cadrage, la lumière et le rythme.</p>
        </div>
      </CardContent>
    </Card>

    <Card className="min-w-0">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg"><ImageIcon className="h-5 w-5 text-primary" />Rôle de vos images</CardTitle>
        <CardDescription>Précisez ce que chaque photo doit apporter à la vidéo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!selectedPhotos.length ? <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">Sélectionnez vos photos dans la galerie pour leur attribuer un rôle.</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {mediaSelect("productMediaId", "Photo du produit principal", "Toutes les photos sélectionnées")}
          {mediaSelect("avatarMediaId", "Photo du présentateur", "Aucun présentateur ajouté")}
          {mediaSelect("startImageMediaId", "Référence d'ouverture", "Suivre l'ordre des photos")}
          {mediaSelect("endImageMediaId", "Référence de fin", "Laisser le montage conclure")}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">Le présentateur doit déjà être visible dans la photo choisie. Les références d’ouverture et de fin guident les plans ; elles peuvent être interprétées par l’IA.</p>
        <div className="space-y-2">
          <Label htmlFor={id + "-cta"}>Appel à l’action à afficher (facultatif)</Label>
          <Input id={id + "-cta"} value={marketing.callToAction} disabled={disabled} maxLength={160}
            onChange={(event) => patchMarketing({ callToAction: event.target.value })} placeholder="Ex. : Réservez votre table" />
          <p className="text-xs text-muted-foreground">Seul ce texte est demandé à l’écran. Vérifiez son orthographe dans le résultat.</p>
        </div>
      </CardContent>
    </Card>

    <Card className="min-w-0">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg"><Volume2 className="h-5 w-5 text-primary" />Son et voix</CardTitle>
        <CardDescription>Choisissez explicitement ce qui sera entendu.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset disabled={disabled} className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Mode sonore</legend>
          {audioModes.map((audio) => <label key={audio.id} className={"flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring " + (marketing.audioMode === audio.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30")}>
            <input type="radio" name={id + "-audio"} value={audio.id} checked={marketing.audioMode === audio.id}
              onChange={() => patchMarketing({ audioMode: audio.id })} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
            <span><span className="block text-sm font-medium">{audio.label}</span><span className="block text-xs text-muted-foreground">{audio.description}</span></span>
          </label>)}
        </fieldset>
        {marketing.audioMode === "voiceover" ? <>
          <div className="space-y-2">
            <Label htmlFor={id + "-language"}>Langue de la voix off</Label>
            <select id={id + "-language"} className={selectClass} value={marketing.language} disabled={disabled}
              onChange={(event) => patchMarketing({ language: event.target.value as TokVideoMarketingSettings["language"] })}>
              <option value="fr">Français</option><option value="en">English</option><option value="de">Deutsch</option><option value="it">Italiano</option>
            </select>
            <p className="text-xs text-muted-foreground">Rédigez le script dans la langue sélectionnée ; aucune traduction automatique.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id + "-voiceover"}>Texte exact de la voix off</Label>
            <Textarea id={id + "-voiceover"} value={marketing.voiceoverText} disabled={disabled} maxLength={1000}
              onChange={(event) => patchMarketing({ voiceoverText: event.target.value })} placeholder="Écrivez uniquement les mots à prononcer." className="min-h-24" aria-required="true" />
            <p className="text-xs text-muted-foreground">Adaptez la longueur à votre vidéo. La prononciation et le respect du script sont à vérifier après génération.</p>
          </div>
        </> : marketing.voiceoverText ? <p className="text-xs text-muted-foreground">Votre script est conservé dans le brouillon, mais il ne sera pas utilisé avec ce mode sonore.</p> : null}
      </CardContent>
    </Card>

    <Card className="min-w-0">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg"><SlidersHorizontal className="h-5 w-5 text-primary" />Format de sortie</CardTitle>
        <CardDescription>Durée, proportions et qualité du fichier final.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isReel ? <p id={id + "-reel-limit"} className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">Pour l’ajout à Actualité : 10 secondes, vertical 9:16, 720p et MP4. Les autres formats sont disponibles dans le Studio marketing.</p> : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={id + "-duration"}>Durée</Label>
            <select id={id + "-duration"} className={selectClass} disabled={disabled || isReel} value={isReel ? 10 : value.duration}
              aria-describedby={isReel ? id + "-reel-limit" : undefined} onChange={(event) => onChange({ duration: Number(event.target.value) })}>
              {TOK_VIDEO_DURATIONS.map((seconds) => <option key={seconds} value={seconds}>{seconds} secondes</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id + "-resolution"}>Résolution</Label>
            <select id={id + "-resolution"} className={selectClass} disabled={disabled || isReel} value={isReel ? "720p" : value.resolution}
              onChange={(event) => onChange({ resolution: event.target.value as TokVideoStudioDraft["resolution"] })}>
              {TOK_VIDEO_RESOLUTIONS.map((resolution) => <option key={resolution} value={resolution}>{resolution}{resolution === "1080p" ? " · Full HD" : resolution === "720p" ? " · HD" : " · Léger"}</option>)}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={id + "-ratio"}>Format d’image</Label>
            <select id={id + "-ratio"} className={selectClass} disabled={disabled || isReel} value={isReel ? "9:16" : value.aspectRatio}
              onChange={(event) => onChange({ aspectRatio: event.target.value as TokVideoStudioDraft["aspectRatio"] })}>
              {TOK_VIDEO_ASPECT_RATIOS.map((ratio) => <option key={ratio} value={ratio}>{aspectNames[ratio]}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id + "-output"}>Type de fichier</Label>
            <select id={id + "-output"} className={selectClass} disabled={disabled || isReel} value={isReel ? "mp4" : value.outputFormat}
              onChange={(event) => onChange({ outputFormat: event.target.value as TokVideoStudioDraft["outputFormat"] })}>
              {TOK_VIDEO_OUTPUT_FORMATS.map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id + "-bitrate"}>Débit vidéo</Label>
            <select id={id + "-bitrate"} className={selectClass} disabled={disabled} value={value.bitrateMode}
              onChange={(event) => onChange({ bitrateMode: event.target.value as TokVideoStudioDraft["bitrateMode"] })}>
              {TOK_VIDEO_BITRATE_MODES.map((bitrate) => <option key={bitrate} value={bitrate}>{bitrate === "high" ? "Renforcé · fichier plus lourd" : "Standard"}</option>)}
            </select>
          </div>
        </div>
        {!isReel && value.outputFormat === "mov" ? <p className="text-xs text-muted-foreground">Le MOV convient au montage et peut nécessiter un téléchargement pour être lu. Choisissez MP4 pour le partage sur les réseaux.</p> : null}
        <p className="text-xs text-muted-foreground">Le devis est calculé avec vos réglages. Chaque modification demande une nouvelle confirmation du montant.</p>
      </CardContent>
    </Card>
  </div>;
}
