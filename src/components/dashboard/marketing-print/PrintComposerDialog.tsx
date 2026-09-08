import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { renderMarketingOutputBlob } from "@/lib/marketing/imageOutput";
import { createMarketingPrintDocument, type MarketingPrintDocument, type PrintProductSpec } from "@/lib/print/document";
import { runPrintPreflight } from "@/lib/print/preflight";
import { buildPrintRenderingPlan } from "@/lib/print/rendering";
import {
  approvePrintExport,
  createPrintExport,
  createPrintQuote,
  getPrintCatalog,
  type PrintCatalogProduct,
  type PrintQuoteResult,
} from "@/lib/print/client";
import { createPrintCheckout } from "@/lib/print/checkout";
import PrintProof from "./PrintProof";
import { AlertTriangle, CreditCard, Loader2, Printer, RefreshCw } from "lucide-react";

const supabase = getSupabase();
const PRINT_RENDER_BUCKET = "restaurant-images";

type PrintableAsset = {
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
  return [...restaurantMediaAssets, ...generatedAssets]
    .filter((asset) => {
      const key = asset.dedupeKey || asset.url.split("?")[0];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 30);
}

async function loadPrintableAssets(restaurantId: string): Promise<PrintableAsset[]> {
  const [restaurantMediaResult, generatedResult] = await Promise.all([
    supabase
      .from("restaurant_media")
      .select("id, media_url, alt_text, media_type, storage_bucket, storage_path, created_at, metadata")
      .eq("restaurant_id", restaurantId)
      .in("media_type", ["photo_ai_tok", "marketing_brand_visual", "photo"])
      .order("created_at", { ascending: false })
      .limit(30),
    (supabase.from as any)("ai_generated_assets")
      .select("id, asset_url, title, asset_type, storage_bucket, storage_path, created_at, gallery_storage_bucket:metadata->>gallery_storage_bucket, gallery_storage_path:metadata->>gallery_storage_path")
      .eq("restaurant_id", restaurantId)
      .eq("status", "stored")
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
      sourceGenerationId: row.id,
      name: row.title || (row.asset_type === "campaign_visual" ? "Création Marketing Studio" : "Création IA TOK"),
      mediaUrl: typeof row.asset_url === "string" ? row.asset_url : "",
      storageBucket,
      storagePath,
      createdAt: row.created_at,
      dedupeKey: `ai:${row.id}`,
    });
  }))).filter((asset): asset is PrintableAsset => Boolean(asset));

  return mergePrintableAssets(restaurantMediaAssets, generatedAssets);
}

function formatMoney(cents: number, currency = "CHF") {
  return new Intl.NumberFormat("fr-CH", { style: "currency", currency }).format(cents / 100);
}

export default function PrintComposerDialog({ restaurantId }: { restaurantId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<PrintableAsset[]>([]);
  const [catalog, setCatalog] = useState<PrintCatalogProduct[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [title, setTitle] = useState("Votre offre du moment");
  const [subtitle, setSubtitle] = useState("");
  const [price, setPrice] = useState("");
  const [cta, setCta] = useState("Réservez maintenant");
  const [qrUrl, setQrUrl] = useState("");
  const [quantity, setQuantity] = useState(250);
  const [address, setAddress] = useState<ShippingAddress>(EMPTY_ADDRESS);
  const [exportId, setExportId] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [quote, setQuote] = useState<PrintQuoteResult | null>(null);
  const [preparedDocument, setPreparedDocument] = useState<MarketingPrintDocument | null>(null);
  const [working, setWorking] = useState<"export" | "approve" | "quote" | "checkout" | null>(null);

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) || assets[0] || null;
  const variants = catalog.flatMap((product) => product.variants);
  const selectedVariant = variants.find((variant) => variant.providerProductId === selectedVariantId) || variants[0] || null;
  const selectedProduct = selectedVariant
    ? catalog.find((product) => product.variants.some((variant) => variant.providerProductId === selectedVariant.providerProductId)) || null
    : null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      loadPrintableAssets(restaurantId),
      getPrintCatalog(restaurantId),
      supabase.from("restaurants").select("name, address, city, phone").eq("id", restaurantId).maybeSingle(),
    ]).then(([nextAssets, nextCatalog, restaurantResult]) => {
      if (cancelled) return;
      setAssets(nextAssets);
      setCatalog(nextCatalog.products || []);
      if (nextAssets[0]) setSelectedAssetId(nextAssets[0].id);
      const firstVariant = (nextCatalog.products || []).flatMap((product) => product.variants)[0];
      if (firstVariant) {
        setSelectedVariantId(firstVariant.providerProductId);
        setQuantity(firstVariant.minimumQuantity || 1);
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
    return () => { cancelled = true; };
  }, [open, restaurantId, toast]);

  useEffect(() => {
    if (!selectedVariant) return;
    setQuantity((current) => {
      if (current < selectedVariant.minimumQuantity) return selectedVariant.minimumQuantity;
      const offset = current - selectedVariant.minimumQuantity;
      const remainder = offset % selectedVariant.quantityStep;
      return remainder === 0 ? current : current + (selectedVariant.quantityStep - remainder);
    });
    setExportId(null);
    setApproved(false);
    setQuote(null);
    setPreparedDocument(null);
  }, [selectedVariantId]);

  useEffect(() => {
    setExportId(null);
    setApproved(false);
    setQuote(null);
    setPreparedDocument(null);
  }, [selectedAssetId, title, subtitle, price, cta, qrUrl]);

  const document = useMemo<MarketingPrintDocument | null>(() => {
    if (!selectedAsset || !selectedVariant) return null;
    const texts = [
      { id: "title", kind: "title" as const, text: title, x: 0.09, y: 0.10, width: 0.82, height: 0.16, align: "center" as const, fontSizeMm: 8, weight: "bold" as const, color: "#ffffff" },
      ...(subtitle.trim() ? [{ id: "subtitle", kind: "subtitle" as const, text: subtitle.trim(), x: 0.12, y: 0.29, width: 0.76, height: 0.10, align: "center" as const, fontSizeMm: 4.5, weight: "bold" as const, color: "#ffffff" }] : []),
      ...(price.trim() ? [{ id: "price", kind: "price" as const, text: price.trim(), x: 0.17, y: 0.55, width: 0.40, height: 0.12, align: "left" as const, fontSizeMm: 8, weight: "bold" as const, color: "#ffffff" }] : []),
      ...(cta.trim() ? [{ id: "cta", kind: "cta" as const, text: cta.trim(), x: 0.12, y: 0.76, width: qrUrl.trim() ? 0.50 : 0.76, height: 0.10, align: "left" as const, fontSizeMm: 4.5, weight: "bold" as const, color: "#ffffff" }] : []),
    ];
    return createMarketingPrintDocument({
      title: title || selectedAsset.name,
      background: {
        url: selectedAsset.url,
        mimeType: selectedAsset.mimeType,
        widthPx: selectedAsset.widthPx,
        heightPx: selectedAsset.heightPx,
      },
      sourceGenerationId: selectedAsset.sourceGenerationId || selectedAsset.id,
      texts,
      qr: qrUrl.trim() ? { value: qrUrl.trim(), x: 0.70, y: 0.70, size: 0.18 } : null,
      orientation: selectedVariant.widthMm > selectedVariant.heightMm ? "landscape" : "portrait",
    });
  }, [selectedAsset, selectedVariant, title, subtitle, price, cta, qrUrl]);

  const renderingPlan = useMemo(() => {
    if (!selectedAsset || !selectedVariant || !selectedProduct) return null;
    try {
      return buildPrintRenderingPlan({ asset: selectedAsset, product: selectedProduct, variant: selectedVariant });
    } catch {
      return null;
    }
  }, [selectedAsset, selectedProduct, selectedVariant]);

  const plannedDocument = useMemo<MarketingPrintDocument | null>(() => {
    if (!document || !renderingPlan) return document;
    return {
      ...document,
      background: {
        ...document.background,
        widthPx: renderingPlan.target.widthPx,
        heightPx: renderingPlan.target.heightPx,
      },
      rendering: renderingPlan.rendering,
    };
  }, [document, renderingPlan]);

  const preflight = plannedDocument && selectedVariant ? runPrintPreflight(plannedDocument, selectedVariant) : null;

  async function createExport() {
    if (!document || !selectedVariant || !selectedProduct || !renderingPlan || renderingPlan.blocked || !preflight?.ready) return;
    setWorking("export");
    let uploadedPath: string | null = null;
    try {
      const rendered = await renderMarketingOutputBlob({
        sourceUrl: document.background.url,
        target: renderingPlan.target,
        mimeType: "image/png",
      });
      if (rendered.quality === "upscale_blocked") throw new Error("Ce visuel dépasse le plafond d’agrandissement 2,5× pour l’impression.");

      uploadedPath = `${restaurantId}/print-renders/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await supabase.storage.from(PRINT_RENDER_BUCKET).upload(uploadedPath, rendered.blob, {
        contentType: "image/png",
        upsert: false,
        cacheControl: "3600",
      });
      if (uploadError) throw uploadError;
      const publicUrl = supabase.storage.from(PRINT_RENDER_BUCKET).getPublicUrl(uploadedPath).data.publicUrl;
      if (!publicUrl?.startsWith("https://")) throw new Error("URL du raster d’impression indisponible.");

      const exactDocument: MarketingPrintDocument = {
        ...document,
        background: {
          url: publicUrl,
          mimeType: "image/png",
          widthPx: rendered.widthPx,
          heightPx: rendered.heightPx,
        },
        rendering: {
          ...renderingPlan.rendering,
          sourceWidthPx: rendered.sourceWidthPx,
          sourceHeightPx: rendered.sourceHeightPx,
          upscaleFactor: rendered.upscaleFactor,
        },
      };
      const exactPreflight = runPrintPreflight(exactDocument, selectedVariant);
      if (!exactPreflight.ready) {
        throw new Error(exactPreflight.blocking.map((item) => item.message).join(" ") || "Le raster final ne passe pas le préflight.");
      }

      const result = await createPrintExport({ restaurantId, providerProductId: selectedVariant.providerProductId, document: exactDocument });
      setPreparedDocument(exactDocument);
      setExportId(result.exportId);
      setApproved(false);
      setQuote(null);
      uploadedPath = null;
      toast({
        title: "BAT généré",
        description: `Raster ${rendered.widthPx}×${rendered.heightPx} px préparé à ${renderingPlan.target.targetDpi} DPI puis validé par le préflight serveur.`,
      });
    } catch (error) {
      if (uploadedPath) {
        await supabase.storage.from(PRINT_RENDER_BUCKET).remove([uploadedPath]).catch(() => undefined);
      }
      toast({ title: "BAT impossible", description: error instanceof Error ? error.message : "Erreur de préparation.", variant: "destructive" });
    } finally {
      setWorking(null);
    }
  }

  async function approve() {
    if (!exportId) return;
    setWorking("approve");
    try {
      await approvePrintExport({ restaurantId, exportId });
      setApproved(true);
      toast({ title: "BAT approuvé", description: "Cette version est maintenant verrouillée pour l’impression." });
    } catch (error) {
      toast({ title: "Approbation impossible", description: error instanceof Error ? error.message : "Erreur BAT.", variant: "destructive" });
    } finally {
      setWorking(null);
    }
  }

  async function quoteOrder() {
    if (!exportId || !approved) return;
    setWorking("quote");
    try {
      const result = await createPrintQuote({ restaurantId, exportId, quantity, country: "CH" });
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="gap-2"><Printer className="h-4 w-4" /> Imprimer une création</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>TheTok Print</DialogTitle>
          <DialogDescription>Transformez une création du Marketing Studio en raster exact puis en PDF conforme à l’imprimeur, approuvez le BAT et commandez sans quitter TheTok.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex min-h-56 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Chargement du catalogue et de vos créations…</div>
        ) : assets.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Générez d’abord une création dans Marketing Studio ou ajoutez un visuel PNG/JPG à votre galerie.</div>
        ) : variants.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Le catalogue d’impression est prêt côté TheTok, mais aucun produit Cloudprinter actif avec une géométrie fiable n’est disponible. L’administrateur doit corriger ou hydrater le mapping fournisseur.</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-5">
              <div className="grid gap-3">
                <Label>Création à imprimer</Label>
                <Select value={selectedAsset?.id || ""} onValueChange={setSelectedAssetId}>
                  <SelectTrigger><SelectValue placeholder="Choisir une création" /></SelectTrigger>
                  <SelectContent>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.name} · {new Date(asset.createdAt).toLocaleDateString("fr-CH")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-3">
                <Label>Support</Label>
                <Select value={selectedVariant?.providerProductId || ""} onValueChange={setSelectedVariantId}>
                  <SelectTrigger><SelectValue placeholder="Choisir un support" /></SelectTrigger>
                  <SelectContent>{catalog.flatMap((product) => product.variants.map((variant) => <SelectItem key={variant.providerProductId} value={variant.providerProductId}>{product.displayName} · {variant.widthMm} × {variant.heightMm} mm</SelectItem>))}</SelectContent>
                </Select>
              </div>

              {renderingPlan && selectedVariant ? (
                <div className={renderingPlan.blocked
                  ? "rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-100"
                  : renderingPlan.quality === "upscale_allowed"
                    ? "rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"
                    : "rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100"}
                >
                  <p className="font-bold">Géométrie de production</p>
                  <p className="mt-1">
                    {selectedVariant.widthMm}×{selectedVariant.heightMm} mm à plat · bleed {selectedVariant.bleedMm} mm · {renderingPlan.target.targetDpi} DPI · {renderingPlan.target.widthPx}×{renderingPlan.target.heightPx} px.
                  </p>
                  {renderingPlan.target.print?.foldedWidthMm && renderingPlan.target.print.foldedHeightMm ? (
                    <p className="mt-1">Format fermé : {renderingPlan.target.print.foldedWidthMm}×{renderingPlan.target.print.foldedHeightMm} mm.</p>
                  ) : null}
                  <p className="mt-1 text-xs opacity-80">Source {selectedAsset?.widthPx}×{selectedAsset?.heightPx} · rééchantillonnage théorique {renderingPlan.rendering.upscaleFactor.toFixed(2)}×.</p>
                  {renderingPlan.blocked ? <p className="mt-2 flex items-center gap-1.5 font-bold"><AlertTriangle className="h-4 w-4" />Dépassement du plafond 2,5× : choisissez une autre création ou un autre support.</p> : null}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Titre</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} /></div>
                <div><Label>Prix / accroche courte</Label><Input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="CHF 39.–" maxLength={40} /></div>
              </div>
              <div><Label>Sous-titre</Label><Input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} maxLength={120} /></div>
              <div><Label>Appel à l’action</Label><Input value={cta} onChange={(event) => setCta(event.target.value)} maxLength={80} /></div>
              <div><Label>QR code (optionnel)</Label><Input value={qrUrl} onChange={(event) => setQrUrl(event.target.value)} placeholder="https://www.thetok.ch/..." /></div>
              <div><Label>Quantité</Label><Input type="number" min={selectedVariant?.minimumQuantity || 1} step={selectedVariant?.quantityStep || 1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></div>

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
              <div className="flex flex-wrap gap-2">
                {!exportId ? <Button disabled={!preflight?.ready || Boolean(renderingPlan?.blocked) || working !== null} onClick={() => void createExport()}>{working === "export" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Préparer le raster & générer le BAT</Button> : null}
                {exportId && !approved ? <Button disabled={working !== null} onClick={() => void approve()}>{working === "approve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}J’approuve ce BAT</Button> : null}
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
