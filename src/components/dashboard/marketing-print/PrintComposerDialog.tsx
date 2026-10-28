import { buildNativePrintTemplate, nativePrintContractMatches } from "../../../../supabase/functions/_shared/print/artwork";
import { readGeneratedOutputFormat, matchesGeneratedPrintFormat, type GeneratedOutputFormat } from "../../../../supabase/functions/_shared/print/source-format";
import { PRINT_MARGIN_INSET_OPTIONS, type PrintMarginInsetPercent } from "../../../../supabase/functions/_shared/print/margin-correction";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { createMarketingPrintDocument, type MarketingPrintDocument, type PrintProductSpec } from "@/lib/print/document";
import { runPrintPreflight } from "@/lib/print/preflight";
import { buildPrintRenderingPlan } from "@/lib/print/rendering";
import { normalizePrintOrderQuantity } from "@/lib/print/quantity";
import {
  approvePrintExport,
  createPrintExport,
  createPrintQuote,
  getPrintCatalog,
  type PrintCatalogProduct,
  type PrintQuoteResult,
} from "@/lib/print/client";
import { createPrintCheckout } from "@/lib/print/checkout";
import { generateTokDishImage } from "@/lib/ai/tokAiClient";
import PrintProof from "./PrintProof";
import { CreditCard, Loader2, Printer, RefreshCw, WandSparkles } from "lucide-react";

const supabase = getSupabase();

type PrintableAsset = {
  outputFormat: GeneratedOutputFormat | null;
  id: string;
  name: string;
  url: string;
  widthPx: number;
  heightPx: number;
  mimeType: "image/jpeg" | "image/png";
  createdAt: string;
  sourceGenerationId: string | null;
  dedupeKey: string;
};

type GeneratedAssetPrintRow = {
  metadata?: { marketing_output_target?: unknown };
  id: string;
  asset_url: string | null;
  title: string | null;
  asset_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  created_at: string;
  gallery_storage_bucket: string | null;
  gallery_storage_path: string | null;
};

function readGeneratedAssetId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).generated_asset_id;
  return typeof value === "string" && value ? value : null;
}

type ShippingAddress = {
  firstname: string;
  lastname: string;
  company: string;
  street1: string;
  street2: string;
  zip: string;
  city: string;
  state: string;
  country: string;
  phone: string;
};

type PrintComposerDialogProps = {
  restaurantId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  initialSourceGenerationId?: string;
};

const EMPTY_ADDRESS: ShippingAddress = {
  firstname: "",
  lastname: "",
  company: "",
  street1: "",
  street2: "",
  zip: "",
  city: "",
  state: "",
  country: "CH",
  phone: "",
};

function inferMime(path: string | null | undefined, mediaUrl: string | null | undefined) {
  const value = `${path || ""} ${mediaUrl || ""}`.toLowerCase();
  if (/\.png(?:\?|$|\s)/.test(value)) return "image/png" as const;
  if (/\.(jpe?g)(?:\?|$|\s)/.test(value)) return "image/jpeg" as const;
  return null;
}

function imageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Impossible de lire les dimensions de l’image."));
    image.src = url;
  });
}

async function resolvePrintableStorageUrl(storageBucket: string, storagePath: string, fallbackUrl: string) {
  if (!storageBucket || !storagePath) return fallbackUrl;
  if (["images", "restaurant-images"].includes(storageBucket)) {
    return supabase.storage.from(storageBucket).getPublicUrl(storagePath).data.publicUrl || fallbackUrl;
  }
  const signed = await supabase.storage.from(storageBucket).createSignedUrl(storagePath, 60 * 60);
  return signed.data?.signedUrl || fallbackUrl;
}

async function materializePrintableAsset(input: {
  outputFormat?: unknown;
  id: string;
  sourceGenerationId: string | null;
  name: string;
  mediaUrl: string;
  storageBucket: string;
  storagePath: string;
  createdAt: string;
  dedupeKey: string;
}) {
  const url = await resolvePrintableStorageUrl(input.storageBucket, input.storagePath, input.mediaUrl);
  const mimeType = inferMime(input.storagePath, url);
  if (!mimeType || !url.startsWith("https://")) return null;
  try {
    const size = await imageDimensions(url);
    return {
      id: input.id,
      outputFormat: readGeneratedOutputFormat(input.outputFormat),
      sourceGenerationId: input.sourceGenerationId,
      name: input.name,
      url,
      widthPx: size.width,
      heightPx: size.height,
      mimeType,
      createdAt: input.createdAt,
      dedupeKey: input.dedupeKey,
    } satisfies PrintableAsset;
  } catch {
    return null;
  }
}

function mergePrintableAssets(restaurantMediaAssets: PrintableAsset[], generatedAssets: PrintableAsset[]) {
  const seen = new Set<string>();
  return [...generatedAssets, ...restaurantMediaAssets]
    .filter((asset) => {
      const key = asset.dedupeKey || asset.url.split("?")[0];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 30);
}

async function loadPrintableAssets(restaurantId: string, sourceGenerationId?: string): Promise<PrintableAsset[]> {
  let generatedQuery = (supabase.from as any)("ai_generated_assets")
    .select("id, asset_url, title, asset_type, storage_bucket, storage_path, created_at, metadata, gallery_storage_bucket:metadata->>gallery_storage_bucket, gallery_storage_path:metadata->>gallery_storage_path")
    .eq("restaurant_id", restaurantId)
    .eq("status", "stored");
  // Filter before pagination so a selected older creation remains printable.
  if (sourceGenerationId) generatedQuery = generatedQuery.eq("id", sourceGenerationId);
  const [restaurantMediaResult, generatedResult] = await Promise.all([
    supabase
      .from("restaurant_media")
      .select("id, media_url, alt_text, media_type, storage_bucket, storage_path, created_at, metadata")
      .eq("restaurant_id", restaurantId)
      .in("media_type", ["photo_ai_tok", "marketing_brand_visual", "photo"])
      .order("created_at", { ascending: false })
      .limit(30),
    generatedQuery
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (restaurantMediaResult.error && generatedResult.error) throw restaurantMediaResult.error;
  if (restaurantMediaResult.error) console.warn("[print] restaurant_media_unavailable", restaurantMediaResult.error.message);
  if (generatedResult.error) console.warn("[print] ai_generated_assets_unavailable", generatedResult.error.message);

  const restaurantMediaAssets = (await Promise.all((restaurantMediaResult.data || []).map(async (row) => {
    const generatedAssetId = readGeneratedAssetId(row.metadata);
    return materializePrintableAsset({
      id: `media:${row.id}`,
      sourceGenerationId: generatedAssetId,
      name: row.alt_text || (row.media_type === "photo_ai_tok" ? "Création IA" : "Visuel restaurant"),
      mediaUrl: typeof row.media_url === "string" ? row.media_url : "",
      storageBucket: typeof row.storage_bucket === "string" ? row.storage_bucket : "",
      storagePath: typeof row.storage_path === "string" ? row.storage_path : "",
      createdAt: row.created_at,
      dedupeKey: generatedAssetId ? `ai:${generatedAssetId}` : `media:${row.storage_bucket || ""}:${row.storage_path || row.id}`,
    });
  }))).filter((asset): asset is PrintableAsset => Boolean(asset));

  const generatedRows = (generatedResult.data || []) as GeneratedAssetPrintRow[];
  const generatedAssets = (await Promise.all(generatedRows.map(async (row) => {
    const galleryBucket = typeof row.gallery_storage_bucket === "string" ? row.gallery_storage_bucket : "";
    const galleryPath = typeof row.gallery_storage_path === "string" ? row.gallery_storage_path : "";
    const storageBucket = galleryBucket || (typeof row.storage_bucket === "string" ? row.storage_bucket : "");
    const storagePath = galleryPath || (typeof row.storage_path === "string" ? row.storage_path : "");
    return materializePrintableAsset({
      id: `ai:${row.id}`,
      outputFormat: row.metadata?.marketing_output_target,
      sourceGenerationId: row.id,
      name: row.title || (row.asset_type === "campaign_visual" ? "Création Marketing Studio" : "Création IA TOK"),
      mediaUrl: typeof row.asset_url === "string" ? row.asset_url : "",
      storageBucket,
      storagePath,
      createdAt: row.created_at,
      dedupeKey: `ai:${row.id}`,
    });
  }))).filter((asset): asset is PrintableAsset => Boolean(asset));

  return sourceGenerationId ? generatedAssets : mergePrintableAssets(restaurantMediaAssets, generatedAssets);
}

function formatMoney(cents: number, currency = "CHF") {
  return new Intl.NumberFormat("fr-CH", { style: "currency", currency }).format(cents / 100);
}

export default function PrintComposerDialog({
  restaurantId,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
  initialSourceGenerationId,
}: PrintComposerDialogProps) {
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const handleOpenChange = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<PrintableAsset[]>([]);
  const [catalog, setCatalog] = useState<PrintCatalogProduct[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const proofRevision = useRef(0);
  const [proofAcknowledged, setProofAcknowledged] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [marginInsetPercent, setMarginInsetPercent] = useState<PrintMarginInsetPercent>(5);
  const [retouchedFrom, setRetouchedFrom] = useState<PrintableAsset | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(250);
  const [address, setAddress] = useState<ShippingAddress>(EMPTY_ADDRESS);
  const [exportId, setExportId] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [quote, setQuote] = useState<PrintQuoteResult | null>(null);
  const [preparedDocument, setPreparedDocument] = useState<MarketingPrintDocument | null>(null);
  const [working, setWorking] = useState<"correct" | "export" | "approve" | "quote" | "checkout" | null>(null);

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) || assets[0] || null;
  const variants = catalog.flatMap((product) => product.variants)
    .filter((variant) => matchesGeneratedPrintFormat(selectedAsset?.outputFormat, variant));
  const selectedVariant = variants.find((variant) => variant.providerProductId === selectedVariantId) || variants[0] || null;
  const selectedProduct = selectedVariant
    ? catalog.find((product) => product.variants.some((variant) => variant.providerProductId === selectedVariant.providerProductId)) || null
    : null;

  useEffect(() => {
    proofRevision.current += 1;
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setAssets([]);
    setExportId(null);
    setApproved(false);
    setQuote(null);
    setPreparedDocument(null);
    setProofAcknowledged(false);
    setPreviewUrl(null);
    setRetouchedFrom(null);
    setExportError(null);
    Promise.all([
      loadPrintableAssets(restaurantId, initialSourceGenerationId),
      getPrintCatalog(restaurantId),
      supabase.from("restaurants").select("name, address, city, phone").eq("id", restaurantId).maybeSingle(),
    ]).then(([nextAssets, nextCatalog, restaurantResult]) => {
      if (cancelled) return;
      const printableAssets = nextAssets.filter((asset) => (nextCatalog.products || [])
        .some((product) => product.variants.some((variant) => matchesGeneratedPrintFormat(asset.outputFormat, variant))))
        .filter((asset) => !initialSourceGenerationId || asset.sourceGenerationId === initialSourceGenerationId);
      setAssets(printableAssets);
      setCatalog(nextCatalog.products || []);
      setSelectedAssetId(printableAssets[0]?.id || "");
      const firstVariant = (nextCatalog.products || []).flatMap((product) => product.variants)
        .find((variant) => matchesGeneratedPrintFormat(printableAssets[0]?.outputFormat, variant));
      setSelectedVariantId(firstVariant?.providerProductId || "");
      if (firstVariant) {
        setQuantity(normalizePrintOrderQuantity(250, firstVariant.minimumQuantity, firstVariant.quantityStep));
      }
      const restaurant = restaurantResult.data;
      if (restaurant) {
        setAddress((current) => ({
          ...current,
          company: restaurant.name || "",
          street1: restaurant.address || "",
          city: restaurant.city || "",
          phone: restaurant.phone || "",
        }));
      }
    }).catch((error) => {
      toast({ title: "TheTok Print indisponible", description: error instanceof Error ? error.message : "Impossible de charger l’impression.", variant: "destructive" });
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; proofRevision.current += 1; };
  }, [open, restaurantId, initialSourceGenerationId, toast]);

  useEffect(() => {
    if (!selectedVariant) return;
    setQuantity((current) => normalizePrintOrderQuantity(
      current,
      selectedVariant.minimumQuantity,
      selectedVariant.quantityStep,
    ));
    setExportId(null);
    setApproved(false);
    setQuote(null);
    setPreparedDocument(null);
    setProofAcknowledged(false);
    setPreviewUrl(null);
  }, [selectedVariantId, selectedVariant]);

  useEffect(() => {
    proofRevision.current += 1;
    setExportId(null);
    setApproved(false);
    setQuote(null);
    setPreparedDocument(null);
    setProofAcknowledged(false);
    setPreviewUrl(null);
    setExportError(null);
  }, [selectedAssetId]);

  const document = useMemo<MarketingPrintDocument | null>(() => {
    if (!selectedAsset || !selectedVariant) return null;
    return createMarketingPrintDocument({
      title: selectedAsset.name,
      sourceGenerationId: selectedAsset.sourceGenerationId,
      background: { url: selectedAsset.url, mimeType: selectedAsset.mimeType, widthPx: selectedAsset.widthPx, heightPx: selectedAsset.heightPx },
      orientation: selectedVariant.widthMm === selectedVariant.heightMm ? "square" : selectedVariant.widthMm > selectedVariant.heightMm ? "landscape" : "portrait",
    });
  }, [selectedAsset, selectedVariant]);

  const renderingPlan = useMemo(() => {
    if (!selectedAsset || !selectedVariant || !selectedProduct) return null;
    try {
      return buildPrintRenderingPlan({ asset: selectedAsset, product: selectedProduct, variant: selectedVariant });
    } catch {
      return null;
    }
  }, [selectedAsset, selectedProduct, selectedVariant]);

  // The proof uses native source pixels. No substitute raster, crop or upscaled dimensions.
  const plannedDocument = document;
  const nativeContractValid = useMemo(() => {
    if (!selectedAsset || !selectedVariant) return false;
    try { return nativePrintContractMatches(selectedAsset.outputFormat, buildNativePrintTemplate(selectedVariant)); }
    catch { return false; }
  }, [selectedAsset, selectedVariant]);

  const preflight = plannedDocument && selectedVariant ? runPrintPreflight(plannedDocument, selectedVariant) : null;

  async function correctMargins() {
    if (!selectedAsset?.sourceGenerationId || !selectedVariant || !nativeContractValid || working !== null) return;
    if (!selectedAsset.outputFormat?.sourceSha256) return;
    const revision = proofRevision.current;
    const original = selectedAsset;
    setWorking("correct");
    setExportError(null);
    try {
      // The server resolves this original by restaurant ownership. Client URLs,
      // crop coordinates, references and free-form prompts are not trusted.
      const result = await generateTokDishImage({
        restaurantId,
        assetType: "campaign_visual",
        marketingAssetMode: true,
        marketingOutputFormat: selectedAsset.outputFormat,
        printMarginCorrection: { sourceGenerationId: original.sourceGenerationId, insetPercent: marginInsetPercent },
        prompt: "Correction native des marges pour impression",
        outputResolution: "print",
        variantCount: 1,
      });
      const candidates = result.assetId ? await loadPrintableAssets(restaurantId, result.assetId) : [];
      const corrected = candidates.find((asset) => asset.sourceGenerationId === result.assetId
        && matchesGeneratedPrintFormat(asset.outputFormat, selectedVariant));
      if (revision !== proofRevision.current) return;
      if (!corrected || !corrected.outputFormat || !nativePrintContractMatches(corrected.outputFormat, buildNativePrintTemplate(selectedVariant))) {
        throw new Error("La nouvelle image a été enregistrée, mais son format natif n’est pas prêt. Réouvrez l’impression depuis la galerie.");
      }
      setRetouchedFrom(original);
      setAssets((current) => [corrected, ...current.filter((asset) => asset.id !== corrected.id)].slice(0, 30));
      setSelectedAssetId(corrected.id);
      toast({ title: "Nouvelle version générée", description: "Comparez les deux visuels, vérifiez chaque mot et logo, puis demandez le contrôle du BAT." });
    } catch (error) {
      if (revision === proofRevision.current) {
        toast({ title: "Correction générative impossible", description: error instanceof Error ? error.message : "Impossible de modifier les marges.", variant: "destructive" });
      }
    } finally {
      setWorking(null);
    }
  }

  async function createExport() {
    if (!document || !selectedVariant || !selectedAsset || !nativeContractValid || !preflight?.ready) return;
    const revision = proofRevision.current;
    setWorking("export");
    setExportError(null);
    try {
      const result = await createPrintExport({ restaurantId, providerProductId: selectedVariant.providerProductId, document });
      if (revision !== proofRevision.current) return;
      setPreparedDocument(document);
      setExportId(result.exportId);
      setApproved(false);
      setPreviewUrl(result.previewUrl);
      setProofAcknowledged(false);
      toast({ title: "BAT natif contrôlé", description: "Consultez le PDF réel, vérifiez les marges, les textes et la netteté avant approbation." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur de préparation.";
      if (revision === proofRevision.current) setExportError(message);
      toast({ title: "BAT impossible", description: message, variant: "destructive" });
    } finally {
      setWorking(null);
    }
  }

  async function approve() {
    if (!exportId || !proofAcknowledged || !previewUrl) return;
    const revision = proofRevision.current;
    setWorking("approve");
    try {
      await approvePrintExport({ restaurantId, exportId, proofAcknowledged: true });
      if (revision !== proofRevision.current) return;
      setApproved(true);
      toast({ title: "BAT approuvé", description: "Cette version est maintenant verrouillée pour l’impression." });
    } catch (error) {
      toast({ title: "Approbation impossible", description: error instanceof Error ? error.message : "Erreur BAT.", variant: "destructive" });
    } finally {
      setWorking(null);
    }
  }

  async function quoteOrder() {
    if (!exportId || !approved || !selectedVariant) return;
    const normalizedQuantity = normalizePrintOrderQuantity(
      quantity,
      selectedVariant.minimumQuantity,
      selectedVariant.quantityStep,
    );
    setQuantity(normalizedQuantity);
    setWorking("quote");
    try {
      const result = await createPrintQuote({ restaurantId, exportId, quantity: normalizedQuantity, country: "CH" });
      setQuote(result);
    } catch (error) {
      toast({ title: "Prix indisponible", description: error instanceof Error ? error.message : "Impossible d’obtenir le devis.", variant: "destructive" });
    } finally {
      setWorking(null);
    }
  }

  async function checkout() {
    if (!quote) return;
    if (!address.firstname || !address.lastname || !address.street1 || !address.zip || !address.city) {
      toast({ title: "Adresse incomplète", description: "Prénom, nom, rue, NPA et ville sont requis.", variant: "destructive" });
      return;
    }
    setWorking("checkout");
    try {
      const result = await createPrintCheckout({
        restaurantId,
        quoteId: quote.quoteId,
        paymentAttemptId: crypto.randomUUID(),
        shippingAddress: address,
        returnUrl: window.location.href,
      });
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      toast({ title: "Paiement indisponible", description: error instanceof Error ? error.message : "Impossible d’ouvrir Stripe.", variant: "destructive" });
      setWorking(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button type="button" className="gap-2"><Printer className="h-4 w-4" /> Imprimer une création</Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>TheTok Print</DialogTitle>
          <DialogDescription>Vérifiez votre création native puis approuvez le PDF avant de payer. Aucun texte ni élément graphique ne sera ajouté après génération.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex min-h-56 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Chargement du catalogue et de vos créations…</div>
        ) : assets.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aucune création avec un format d’impression compatible. Générez un visuel avec un support Cloudprinter actif ; les visuels numériques et les anciennes créations sans format enregistré ne sont pas imprimables.</div>
        ) : variants.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Le catalogue d’impression est prêt côté TheTok, mais aucun produit Cloudprinter actif avec une géométrie fiable n’est disponible. L’administrateur doit corriger ou hydrater le mapping fournisseur.</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-5">
              <div className="grid gap-3">
                <Label>Création à imprimer</Label>
                <Select value={selectedAsset?.id || ""} onValueChange={(id) => { setRetouchedFrom(null); setSelectedAssetId(id); }} disabled={working !== null}>
                  <SelectTrigger><SelectValue placeholder="Choisir une création" /></SelectTrigger>
                  <SelectContent>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.name} · {new Date(asset.createdAt).toLocaleDateString("fr-CH")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-3">
                <Label>Support</Label>
                <p className="rounded-md border px-3 py-2 text-sm">
                  {selectedProduct?.displayName} · {selectedVariant?.widthMm} × {selectedVariant?.heightMm} mm
                </p>
                <p className="text-xs text-muted-foreground">Format et orientation verrouillés sur la création générée.</p>
              </div>

              {renderingPlan ? (
                <div className="rounded-xl border bg-muted/30 p-3 text-xs">
                  <p className="font-semibold">Image native conservée : {selectedAsset?.widthPx}×{selectedAsset?.heightPx} px · {renderingPlan.rendering.targetDpi} DPI effectifs.</p>
                  <p>300 DPI recommandés. Aucun agrandissement artificiel, recadrage ou ajout graphique. Un contrôle visuel IA borné est effectué à la préparation du BAT ; il ne remplace pas votre vérification du PDF.</p>
                  {renderingPlan.blocked ? <p role="alert" className="mt-1 font-semibold text-destructive">Le ratio ou la résolution native est incompatible avec ce support. Régénérez le visuel.</p> : null}
                </div>
              ) : null}
              <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                Le titre, le prix, les textes, le logo et l’appel à l’action doivent être intégrés lors de la génération IA.
                Pour les modifier, régénérez le visuel avec le même support. Aucun QR code ni calque ne peut être ajouté ici.
              </div>
              {!nativeContractValid ? <p role="alert" className="text-sm text-destructive">Cette création utilise un ancien gabarit. Régénérez-la avec le support d’impression sélectionné avant de préparer le BAT.</p> : null}
              <section className="space-y-3 rounded-2xl border border-primary/20 bg-primary/[0.035] p-4" aria-label="Correction générative des marges" data-testid="print-margin-correction">
                <div className="flex items-center gap-2">
                  <WandSparkles className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h3 className="text-sm font-semibold">Ajuster les marges avec l’IA</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Un élément peut être hors de la <strong>marge de sécurité verte</strong> sans toucher le fond perdu.
                  L’IA recule légèrement la composition et prolonge naturellement la photo et les décors sur les bords.
                  L’original est conservé.
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Recul génératif">
                  {PRINT_MARGIN_INSET_OPTIONS.map((percent) => (
                    <Button key={percent} type="button" size="sm" variant={marginInsetPercent === percent ? "default" : "outline"}
                      aria-pressed={marginInsetPercent === percent}
                      disabled={working !== null || approved}
                      onClick={() => setMarginInsetPercent(percent)}>
                      {percent} %
                    </Button>
                  ))}
                </div>
                <Button type="button" variant="outline" className="w-full gap-2" onClick={() => void correctMargins()}
                  disabled={working !== null || approved || !nativeContractValid || !selectedAsset?.sourceGenerationId || !selectedAsset.outputFormat?.sourceSha256}>
                  {working === "correct" ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                  {working === "correct" ? "Génération des marges en cours…" : "Générer une version avec fond perdu étendu"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Nouvelle génération IA pouvant consommer des crédits TOK. Aucun recadrage logiciel ni ajout de texte après génération.
                  Vérifiez soigneusement les prix, les mots, le téléphone et les logos : l’IA peut les altérer.
                  Le serveur et votre approbation du PDF restent obligatoires.
                </p>
                {retouchedFrom && selectedAsset && retouchedFrom.id !== selectedAsset.id ? (
                  <div className="grid grid-cols-2 gap-3 border-t pt-3" data-testid="print-margin-comparison">
                    <figure className="space-y-1"><img src={retouchedFrom.url} alt="Création originale avant correction" className="max-h-48 w-full rounded-md border object-contain" /><figcaption className="text-xs">Avant · original</figcaption></figure>
                    <figure className="space-y-1"><img src={selectedAsset.url} alt="Création corrigée par génération IA" className="max-h-48 w-full rounded-md border object-contain" /><figcaption className="text-xs">Après · nouvelle génération</figcaption></figure>
                  </div>
                ) : null}
              </section>
              <div>
                <Label>Quantité</Label>
                <Input
                  type="number"
                  min={selectedVariant?.minimumQuantity || 1}
                  step={selectedVariant?.quantityStep || 1}
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                  onBlur={() => selectedVariant && setQuantity(normalizePrintOrderQuantity(
                    quantity,
                    selectedVariant.minimumQuantity,
                    selectedVariant.quantityStep,
                  ))}
                />
                {selectedVariant ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Minimum {selectedVariant.minimumQuantity} · quantités suivantes par lots de {selectedVariant.quantityStep}.
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl border p-4">
                <p className="mb-3 text-sm font-semibold">Adresse de livraison</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input placeholder="Prénom" value={address.firstname} onChange={(event) => setAddress({ ...address, firstname: event.target.value })} />
                  <Input placeholder="Nom" value={address.lastname} onChange={(event) => setAddress({ ...address, lastname: event.target.value })} />
                  <Input className="sm:col-span-2" placeholder="Restaurant / société" value={address.company} onChange={(event) => setAddress({ ...address, company: event.target.value })} />
                  <Input className="sm:col-span-2" placeholder="Rue et numéro" value={address.street1} onChange={(event) => setAddress({ ...address, street1: event.target.value })} />
                  <Input className="sm:col-span-2" placeholder="Complément" value={address.street2} onChange={(event) => setAddress({ ...address, street2: event.target.value })} />
                  <Input placeholder="NPA" value={address.zip} onChange={(event) => setAddress({ ...address, zip: event.target.value })} />
                  <Input placeholder="Ville" value={address.city} onChange={(event) => setAddress({ ...address, city: event.target.value })} />
                  <Input placeholder="Canton" value={address.state} onChange={(event) => setAddress({ ...address, state: event.target.value })} />
                  <Input placeholder="Téléphone" value={address.phone} onChange={(event) => setAddress({ ...address, phone: event.target.value })} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {(preparedDocument || plannedDocument) && selectedVariant ? <PrintProof document={(preparedDocument || plannedDocument)!} product={selectedVariant} approved={approved} /> : null}
              {exportError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Contrôle serveur refusé : {exportError} La zone verte représente la marge de sécurité des textes et logos,
                au-delà du seul fond perdu. Vous pouvez générer une nouvelle version avec davantage de recul ci-contre.
              </p> : null}
              {previewUrl ? <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="block text-sm font-semibold underline">Consulter le PDF contrôlé (lien temporaire)</a> : null}
              {exportId && !approved ? <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                <input type="checkbox" checked={proofAcknowledged} onChange={event => setProofAcknowledged(event.target.checked)} className="mt-1" />
                J’ai vérifié le PDF réel, tous les textes et logos à l’intérieur des marges et la netteté à la taille imprimée, y compris tout avertissement de résolution. J’approuve ce fichier sans ajout ni modification.
              </label> : null}
              <div className="flex flex-wrap gap-2">
                {!exportId ? <Button disabled={!preflight?.ready || !nativeContractValid || Boolean(renderingPlan?.blocked) || working !== null} onClick={() => void createExport()}>{working === "export" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Contrôler le visuel & générer le BAT</Button> : null}
                {exportId && !approved ? <Button disabled={working !== null || !proofAcknowledged || !previewUrl} onClick={() => void approve()}>{working === "approve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}J’approuve ce BAT</Button> : null}
                {approved && !quote ? <Button disabled={working !== null} onClick={() => void quoteOrder()}>{working === "quote" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Calculer le prix livré</Button> : null}
                {quote ? <Button disabled={working !== null} onClick={() => void checkout()}>{working === "checkout" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}Payer {formatMoney(quote.customerAmountCents, quote.customerCurrency)}</Button> : null}
              </div>
              {quote ? <p className="text-xs text-muted-foreground">Devis valable jusqu’au {new Date(quote.expiresAt).toLocaleString("fr-CH")}. Le montant affiché est le prix final TheTok ; les coûts fournisseur restent internes.</p> : null}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
