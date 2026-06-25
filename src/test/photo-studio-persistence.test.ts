import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TOK photo studio persistence", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/dashboard/TokAiPhotoStudioV2.tsx"), "utf8");
  const marketingStudio = readFileSync(resolve(process.cwd(), "src/components/dashboard/TokAiMarketingStudio.tsx"), "utf8");
  const legacyStudio = readFileSync(resolve(process.cwd(), "src/components/dashboard/TokAiPhotoStudio.tsx"), "utf8");
  const dashboardPhotos = readFileSync(resolve(process.cwd(), "src/pages/dashboard/DashboardPhotos.tsx"), "utf8");
  const restaurantDetail = readFileSync(resolve(process.cwd(), "src/pages/RestaurantDetail.tsx"), "utf8");
  const watermarkDownloader = readFileSync(resolve(process.cwd(), "src/lib/media/downloadImageWithWatermark.ts"), "utf8");
  const imageUpload = readFileSync(resolve(process.cwd(), "src/components/ImageUpload.tsx"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const aiCreationJobs = readFileSync(resolve(process.cwd(), "src/lib/ai/aiCreationJobs.ts"), "utf8");
  const aiCreationNotifications = readFileSync(resolve(process.cwd(), "src/components/AiCreationNotifications.tsx"), "utf8");
  const aiCreationsGallery = readFileSync(resolve(process.cwd(), "src/components/dashboard/AiCreationsGallery.tsx"), "utf8");

  it("persists the generated result across component remounts and tab focus changes", () => {
    expect(source).toContain("useSessionStorageState");
    expect(source).toContain("tok-ai-photo-studio-v2:");
    expect(source).toContain("result: TokImageGenerationResult | null");
    expect(source).toContain("updateDraft({ result: data })");
    expect(source).toContain("startTokImageCreationJob");
    expect(app).toContain("<AiCreationNotifications />");
    expect(app).toContain("refetchOnWindowFocus: false");
    expect(app).toContain("refetchOnReconnect: false");
    expect(app).toContain("focusManager.setEventListener");
  });

  it("keeps the legacy studio entry point aligned with the V2 implementation", () => {
    expect(legacyStudio.trim()).toBe('export { default } from "./TokAiPhotoStudioV2";');
    expect(dashboardPhotos).toContain('from "@/components/dashboard/TokAiPhotoStudio"');
    expect(dashboardPhotos).not.toContain('from "@/components/dashboard/TokAiPhotoStudioV2"');
  });

  it("keeps technical source URLs hidden in the simplified studio", () => {
    expect(source).toContain("showUrlInput={false}");
    expect(source).not.toContain("reference_folder");
    expect(source).not.toContain("assetId");
  });

  it("keeps the restaurateur-facing photo studio copy readable in French", () => {
    for (const file of [source, dashboardPhotos, imageUpload]) {
      expect(file).not.toMatch(/\u00c3|\u00c2|\u00e2\u20ac\u2122|\u00e2\u20ac\u0153|\u00e2\u20ac|\ufffd/);
    }

    expect(source).toContain("améliore cette photo pour un rendu professionnel, photographie culinaire");
    expect(source).toContain("ajoute un fond esthétique");
    expect(source).toContain("améliore la forme de l'aliment");
    expect(source).toContain("Un emballage ne doit jamais devenir une assiette servie.");
    expect(source).toContain("Visuel TOK prêt");
    expect(source).toContain("Après TOK");
    expect(dashboardPhotos).toContain("PHOTO_WORKSPACE_TOOLS");
    expect(dashboardPhotos).toContain("Marketing Studio");
    expect(dashboardPhotos).toContain("Photopro");
    expect(dashboardPhotos).toContain("Ajouter une photo à la galerie");
    expect(dashboardPhotos).toContain("Galerie");
    expect(dashboardPhotos).toContain("Mes créations");
    expect(imageUpload).toContain("Vous devez sélectionner une image.");
  });

  it("adds generated images to the gallery through a stable public gallery URL", () => {
    expect(source).toContain("result.gallery_image_url");
    expect(source).toContain("media_url: result.gallery_image_url");
    expect(source).toContain("storage_bucket: result.gallery_storage_bucket");
    expect(source).toContain("storage_path: result.gallery_storage_path");
    expect(source).not.toContain("media_url: result.generated_image_url");
  });

  it("lets generated TOK photos open in a large preview and download without losing the draft", () => {
    expect(source).toContain("DialogContent");
    expect(source).toContain("previewOpen");
    expect(source).toContain("generatedImageUrl");
    expect(source).toContain('aria-label="Agrandir le visuel TOK généré"');
    expect(source).toContain("downloadGeneratedPhoto");
    expect(source).toContain("downloadImageWithWatermark");
    expect(source).toContain("watermarkUrl: logoSrc");
    expect((source.match(/Ajouter à la galerie/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(watermarkDownloader).toContain("canvas.toBlob");
    expect(watermarkDownloader).toContain("context.drawImage(watermark.image");
    expect(source).toContain("Télécharger");
    expect(source).toContain("object-contain");
  });

  it("lets gallery photos open in a large preview and download", () => {
    expect(dashboardPhotos).toContain("previewItem");
    expect(dashboardPhotos).toContain('aria-label="Agrandir la photo de galerie"');
    expect(dashboardPhotos).toContain("downloadPhoto");
    expect(dashboardPhotos).toContain("buildGalleryPhotoDownloadFileName");
    expect(dashboardPhotos).toContain("useTokLogoSrc");
    expect(dashboardPhotos).toContain("downloadImageWithWatermark");
    expect(dashboardPhotos).toContain("watermarkUrl: logoSrc");
    expect(dashboardPhotos).not.toContain('item.media_type === "photo_ai_tok" ? <TokGalleryWatermark');
    expect(dashboardPhotos).toContain("Prévisualisation grand format de l'image ajoutée à la galerie.");
  });

  it("keeps gallery watermarks inside the rendered image frame and never downloads raw gallery images", () => {
    expect(dashboardPhotos).toContain("TokGalleryImageFrame");
    expect(dashboardPhotos).toContain('data-testid="tok-gallery-image-frame"');
    expect(dashboardPhotos).toContain("inline-flex max-h-full max-w-full");
    expect(dashboardPhotos).not.toContain('className="relative h-full w-full"');
    expect(dashboardPhotos).toContain('.order("created_at", { ascending: false })');
    expect(dashboardPhotos).toContain('.order("position", { ascending: true })');

    expect(restaurantDetail).toContain("RestaurantGalleryImageFrame");
    expect(restaurantDetail).toContain('data-testid="restaurant-gallery-image-frame"');
    expect(restaurantDetail).toContain("inline-flex max-h-full max-w-full");
    expect(restaurantDetail).not.toContain('className="relative max-w-4xl max-h-[80vh] px-12"');

    expect(watermarkDownloader).toContain("if (!options.watermarkUrl)");
    expect(watermarkDownloader).not.toContain("} catch {\n    const blob = await fetchBlob(options.imageUrl);");
    expect(dashboardPhotos).not.toContain("link.href = item.media_url");
    expect(source).not.toContain("link.href = generatedImageUrl");
  });

  it("keeps dashboard photo uploads focused on files instead of manual image URLs", () => {
    expect(dashboardPhotos).toContain("showUrlInput={false}");
  });

  it("adds a guarded marketing studio for branded restaurant visuals", () => {
    expect(dashboardPhotos).toContain('from "@/components/dashboard/TokAiMarketingStudio"');
    expect(dashboardPhotos).toContain("<TokAiMarketingStudio restaurantId={selectedId} />");
    expect(dashboardPhotos).toContain('activeTool === "marketing"');
    expect(dashboardPhotos).toContain('activeTool === "photopro"');
    expect(dashboardPhotos).toContain('activeTool === "add_photo"');
    expect(dashboardPhotos).toContain('activeTool === "gallery"');
    expect(dashboardPhotos).toContain('activeTool === "creations"');
    expect(dashboardPhotos).toContain("<AiCreationsGallery");

    expect(marketingStudio).toContain("MARKETING_UPLOAD_ACCEPT");
    expect(marketingStudio).toContain("image/png,image/jpeg,image/webp");
    expect(marketingStudio).toContain("MAX_MARKETING_ASSET_BYTES = 15 * 1024 * 1024");
    expect(marketingStudio).toContain("PROMPT_INJECTION_PATTERNS");
    expect(marketingStudio).toContain("SQL_INJECTION_PATTERNS");
    expect(marketingStudio).toContain("sanitizeMarketingPrompt");
    expect(marketingStudio).not.toContain("runRestaurantAgent");
    expect(marketingStudio).toContain("startTokImageCreationJob");
    expect(marketingStudio).not.toContain('action: "marketing_campaign"');
    expect(marketingStudio).toContain('assetType: "campaign_visual"');
    expect(marketingStudio).toContain("referenceImageUrls");
    expect(marketingStudio).toContain("marketingAssetMode: true");
    expect(marketingStudio).toContain('from("restaurant_media")');
    expect(marketingStudio).toContain("MARKETING_ASSET_MEDIA_TYPES");
    expect(marketingStudio).toContain("uploadMarketingResource");
    expect(marketingStudio).toContain("buildMarketingImagePrompt");
    expect(marketingStudio).toContain("Créer directement un visuel marketing final pour le restaurateur");
    expect(marketingStudio).toContain("Ressources actives à utiliser comme seules références visuelles");
    expect(marketingStudio).toContain("Empreinte des ressources actives");
    expect(marketingStudio).not.toContain("mascotte chef TOK");
    expect(marketingStudio).not.toContain("thetok.ch");
    expect(marketingStudio).toContain("Image marketing générée");
    expect(marketingStudio).toContain("Flyer / affiche");
    expect(marketingStudio).toContain("Carte de visite");
    expect(marketingStudio).toContain("Carte du restaurant");
    expect(marketingStudio).toContain("Choix du support");
    expect(marketingStudio).toContain("Téléchargement de visuels pour ressources de marque");
    expect(marketingStudio).toContain("Brief & génération");
    expect(marketingStudio).toContain("Votre visuel est généré à partir du brief");
    expect(marketingStudio).toContain("marketing-output-resolution");
    expect(marketingStudio).toContain("TOK_IMAGE_OUTPUT_OPTIONS");
    expect(marketingStudio).toContain("outputResolution");
    expect(source).toContain("Resolution de sortie");
    expect(source).toContain("TOK_IMAGE_OUTPUT_OPTIONS");
    expect(marketingStudio).not.toContain("Securite & confidentialite");
    expect(marketingStudio).not.toContain("Sécurité & confidentialité");
    expect(marketingStudio).not.toContain("Le module est pret pour une generation serveur");
    expect(marketingStudio).not.toContain("Brief sécurisé prêt");
    expect(marketingStudio).toContain("restaurant_media");
  });

  it("keeps long image generations alive outside the active photo tab and stores completed creations", () => {
    expect(aiCreationJobs).toContain("AI_CREATION_COMPLETED_EVENT");
    expect(aiCreationJobs).toContain("AI_CREATIONS_STORAGE_KEY");
    expect(aiCreationJobs).toContain("startTokImageCreationJob");
    expect(aiCreationJobs).toContain("generateTokDishImage(input.request)");
    expect(aiCreationJobs).toContain("window.localStorage");
    expect(aiCreationJobs).toContain("dispatchAiCreationEvent(AI_CREATION_COMPLETED_EVENT");
    expect(aiCreationJobs).toContain("setActiveAiCreationContext");
    expect(aiCreationJobs).toContain("requestAiCreationNotificationPermission");

    expect(aiCreationNotifications).toContain("shouldNotifyOutOfContext");
    expect(aiCreationNotifications).toContain("record.originPathname");
    expect(aiCreationNotifications).toContain("getActiveAiCreationContext()");
    expect(aiCreationNotifications).toContain("new Notification");
    expect(aiCreationNotifications).toContain("Photos > Mes créations");

    expect(source).toContain('tool: "photopro"');
    expect(marketingStudio).toContain('tool: "marketing_studio"');
    expect(aiCreationsGallery).toContain("subscribeAiCreationRecords");
    expect(aiCreationsGallery).toContain("markAiCreationAddedToGallery");
    expect(aiCreationJobs).toContain("deleteAiCreationRecord");
    expect(aiCreationJobs).toContain("records.filter((record) => record.id !== id)");
    expect(aiCreationsGallery).toContain("deleteAiCreationRecord");
    expect(aiCreationsGallery).toContain("Supprimer");
    expect(aiCreationsGallery).toContain("La photo deja ajoutee reste dans la galerie");
    expect(aiCreationsGallery).toContain('from("restaurant_media").insert');
    expect(aiCreationsGallery).toContain("media_url: imageUrl");
    expect(aiCreationsGallery).toContain('media_type: "photo_ai_tok"');
  });

  it("offers print supports with support-specific Flyerline-inspired formats", () => {
    expect(marketingStudio).toContain("type MarketingFormatOption");
    expect(marketingStudio).toContain("formats: MarketingFormatOption[]");
    expect(marketingStudio).toContain("activeToolConfig.formats");
    expect(marketingStudio).toContain("getFormatByLabel(activeToolConfig.formats, format)");
    expect(marketingStudio).toContain("setFormat(nextFormat.label)");

    for (const support of [
      "Flyer / affiche",
      "Carte de visite",
      "Carte du restaurant",
      "Depliant multi-page",
      "Brochure",
      "Poster / affiche",
      "Affiche grand format",
      "Carte postale",
      "Autocollant / sticker",
      "PLV / presentoir",
      "Bache / banniere",
    ]) {
      expect(marketingStudio).toContain(support);
    }

    for (const format of [
      "A3 297 x 420 mm",
      "A5 148 x 210 mm",
      "A6 105 x 148 mm",
      "DIN A6/5 105 x 210 mm",
      "Carte de visite 85 x 55 mm",
      "Carte de visite 55 x 85 mm",
      "Depliant 1 pli 4 pages",
      "Depliant accordeon 6 pages",
      "Depliant roule 6 pages",
      "Depliant double pli parallele 8 pages",
      "Brochure DIN A4 8 a 72 pages",
      "Affiche F4",
      "Affiche F200",
      "Affiche F12",
      "Affiche F24",
      "Autocollant rond 74 mm",
      "Autocollant carre 105 x 105 mm",
      "Roll-up",
    ]) {
      expect(marketingStudio).toContain(format);
    }
  });

  it("does not expose square or landscape orientation for round sticker formats", () => {
    expect(marketingStudio).toContain('| "Rond"');
    expect(marketingStudio).toContain('marketingFormat("Autocollant rond 30 mm", "Rond", "Rond 30 mm")');
    expect(marketingStudio).toContain('marketingFormat("Autocollant rond 74 mm", "Rond", "Rond 74 mm")');
    expect(marketingStudio).not.toContain('marketingFormat("Autocollant rond 30 mm", "Carre", "Rond 30 mm")');
    expect(marketingStudio).not.toContain('marketingFormat("Autocollant rond 30 mm", "Paysage", "Rond 30 mm")');
    expect(marketingStudio).toContain("getFormatOrientationSummary(selectedFormat)");
    expect(marketingStudio).toContain("Orientation / forme");
    expect(marketingStudio).toContain('if (normalized.includes("rond")) return "square";');
  });

  it("keeps marketing studio controls responsive on narrow dashboard screens", () => {
    expect(marketingStudio).toContain("grid min-w-0 gap-4 p-3 sm:gap-6 sm:p-5 lg:p-6");
    expect(marketingStudio).toContain("min-w-0 rounded-2xl border border-orange-100 bg-white p-3 shadow-sm");
    expect(marketingStudio).toContain("basis-full self-center text-xs font-semibold uppercase");
    expect(marketingStudio).toContain("h-auto min-h-[44px] w-full min-w-0 whitespace-normal");
    expect(marketingStudio).toContain("h-auto min-h-12 w-full min-w-0 whitespace-normal");
    expect((marketingStudio.match(/\[overflow-wrap:anywhere\]/g) || []).length).toBeGreaterThanOrEqual(6);
  });

  it("lets restaurateurs remove uploaded marketing resources safely", () => {
    expect(marketingStudio).toContain("deleteMarketingResource");
    expect(marketingStudio).toContain("MARKETING_STORAGE_BUCKET");
    expect(marketingStudio).toContain(".from(\"restaurant_media\")");
    expect(marketingStudio).toContain(".delete()");
    expect(marketingStudio).toContain(".eq(\"restaurant_id\", restaurantId)");
    expect(marketingStudio).toContain(".eq(\"media_type\", MARKETING_ASSET_MEDIA_TYPES[resource.kind])");
    expect(marketingStudio).toContain(".select(\"id\")");
    expect(marketingStudio).toContain("if (!deletedMedia)");
    expect(marketingStudio).toContain(".from(resource.storageBucket)");
    expect(marketingStudio).toContain(".remove([resource.storagePath])");
    expect(marketingStudio).toContain("aria-label={`Supprimer ${resource.fileName}`}");
    expect(marketingStudio).toContain("Suppression impossible");
  });

  it("replaces marketing brand resources by category so stale visuals are never reused", () => {
    expect(marketingStudio).toContain("deletePersistedMarketingResources");
    expect(marketingStudio).toContain("resourcesToReplace");
    expect(marketingStudio).toContain("const resourcesOutsideReplacedKind = current.filter((resource) => resource.kind !== kind)");
    expect(marketingStudio).toContain("const uploadResults = await Promise.allSettled");
    expect(marketingStudio).toContain("PromiseFulfilledResult<MarketingResource>");
    expect(marketingStudio).toContain("PromiseRejectedResult");
    expect(marketingStudio).toContain(".in(\"id\", mediaIds)");
    expect(marketingStudio).toContain("if (deletedIds.size !== mediaIds.length)");
    expect(marketingStudio).toContain("Certaines anciennes ressources n'ont pas ete supprimees");
    expect(marketingStudio).toContain("const otherResources = current.filter((resource) => resource.kind !== kind && resource.persisted)");
    expect(marketingStudio).toContain("Seuls les nouveaux fichiers de cette catégorie serviront de références visuelles.");
    expect(marketingStudio).toContain("Choisir de nouveaux fichiers remplace les anciens de la même catégorie.");
  });

  it("refreshes marketing references before image generation to avoid stale uploaded assets", () => {
    expect(marketingStudio).toContain("function fetchMarketingResources");
    expect(marketingStudio).toContain("const latestResources = await fetchMarketingResources(restaurantId)");
    expect(marketingStudio).toContain("const generationResources = selectMarketingGenerationResources(latestResources)");
    expect(marketingStudio).toContain("if (!generationResources.length)");
    expect(marketingStudio).toContain("Reference requise");
    expect(marketingStudio).toContain("resources: generationResources");
    expect(marketingStudio).toContain("referenceImageUrls: generationResources.map((resource) => resource.mediaUrl)");
    expect(marketingStudio).toContain("const generationResourceIds = generationResources");
    expect(marketingStudio).toContain("referenceMediaIds: generationResourceIds");
    expect(marketingStudio).toContain("Reference instable");
    expect(marketingStudio).toContain("generationRequestRef");
    expect(marketingStudio).toContain("invalidateMarketingGeneration");
    expect(marketingStudio).toContain("generationRequestRef.current !== requestId");
    expect(marketingStudio).toContain("mountedRef.current");
  });

  it("keeps marketing image generation scoped to current uploaded brand resources", () => {
    const aiFunction = readFileSync(resolve(process.cwd(), "supabase/functions/ai-image-enhance/index.ts"), "utf8");

    expect(aiFunction).toContain("Utiliser exclusivement les visuels de référence fournis dans cette requête comme source d'identité visuelle");
    expect(aiFunction).toContain("Ignorer toute identité, tout asset, tout prompt ou toute préférence provenant d'une génération précédente");
    expect(aiFunction).toContain("reference_identity_scope");
    expect(aiFunction).toContain("current_uploaded_restaurant_resources");
    expect(aiFunction).toContain("reference_folder: marketingAssetMode ? null");
    expect(aiFunction).toContain("resolveCurrentMarketingReferences(actor, restaurantId, requestedReferenceMediaIds)");
    expect(aiFunction).toContain("MARKETING_REFERENCE_STORAGE_SEGMENT");
    expect(aiFunction).toContain("marketing_reference_required");
    expect(aiFunction).toContain("marketing_reference_ids_required");
    expect(aiFunction).toContain("marketing_reference_mismatch");
    expect(aiFunction).toContain("normalizeReferenceMediaIds");
    expect(aiFunction).toContain('.in("id", requestedMediaIds)');
    expect(aiFunction).toContain('reference_source: marketingAssetMode ? "server_current_restaurant_media" : "request_payload"');
    expect(aiFunction).toContain("requested_reference_media_ids");
    expect(aiFunction).toContain("reference_media_ids");
    expect(aiFunction).toContain("requestedReferenceImageUrls");
    expect(aiFunction).toContain("requestedReferenceMediaIds");
    expect(aiFunction).toContain("Le nom du compte restaurant n'est pas une reference visuelle");
    expect(aiFunction).toContain("Ne pas deduire une marque depuis le nom du compte restaurant");
    expect(aiFunction).not.toContain("Restaurant associé: ${input.restaurantName}");
    expect(marketingStudio).toContain("MARKETING_REFERENCE_LIMIT = 4");
    expect(marketingStudio).toContain("MARKETING_REFERENCE_KIND_PRIORITY");
    expect(marketingStudio).toContain("selectMarketingGenerationResources(latestResources)");
    expect(marketingStudio).toContain("Le nom du compte restaurant n'est pas une reference visuelle");
    expect(aiFunction).not.toContain("palette orange TOK");
    expect(aiFunction).not.toContain("mascotte chef TOK");
    expect(aiFunction).not.toContain("publicité TOK terminée");
    expect(aiFunction).not.toContain("URL thetok.ch");
  });

  it("does not fall back to prompt-only generation when marketing references are active", () => {
    const aiFunction = readFileSync(resolve(process.cwd(), "supabase/functions/ai-image-enhance/index.ts"), "utf8");
    const marketingStudio = readFileSync(resolve(process.cwd(), "src/components/dashboard/TokAiMarketingStudio.tsx"), "utf8");

    expect(aiFunction).toContain("allowGenerationFallback: boolean");
    expect(aiFunction).toContain('throw new HttpError(502, "image_reference_edit_required")');
    expect(aiFunction).toContain("allowGenerationFallback: false");
    expect(aiFunction).toContain("const generationFallbackAllowed = !sourceImageUrl && !(marketingAssetMode && referenceImageUrls.length)");
    expect(aiFunction).toContain("return buildConfiguredImageRequestOptions(formatSize, quality);");
    expect(marketingStudio).toContain("image_reference_edit_required");
  });

  it("makes restaurant gallery photos public from the cover and includes raw and TOK studio photos", () => {
    expect(restaurantDetail).toContain("useTokLogoSrc");
    expect(restaurantDetail).toContain("RestaurantGalleryWatermark");
    expect(restaurantDetail).toContain("media_type");
    expect(restaurantDetail).toContain('.in("media_type", ["photo", "photo_ai_tok"])');
    expect(restaurantDetail).toContain("openGalleryAtIndex");
    expect(restaurantDetail).toContain('aria-label="Ouvrir la galerie photo du restaurant"');
    expect(restaurantDetail).toContain("<RestaurantGalleryWatermark");
    expect(restaurantDetail).toContain('data-testid="restaurant-gallery-watermark-layer"');
  });

  it("shows the shared animated modal while a TOK photo is being generated", () => {
    const progressDialog = readFileSync(resolve(process.cwd(), "src/components/ui/ai-generation-progress-dialog.tsx"), "utf8");

    expect(progressDialog).toContain('data-testid="ai-generation-progress-dialog"');
    expect(progressDialog).toContain("tokAiModalOrbit");
    expect(progressDialog).toContain("tokAiModalScan");
    expect(progressDialog).toContain("tokAiModalProgress");
    expect(progressDialog).toContain("prefers-reduced-motion");
    expect(source).not.toContain("TokLogoGenerationLoader");
    expect(source).toContain("AiGenerationProgressDialog");
    expect(source).toContain("Retouche PhotoPro en cours");
    expect(source).toContain("open={loading}");
  });

  it("requests image-only generation and does not render generated marketing copy", () => {
    expect(source).toContain("imageOnly: true");
    expect(source).toContain("améliore cette photo pour un rendu professionnel, photographie culinaire");
    expect(source).toContain("ajoute un fond esthétique");
    expect(source).toContain("améliore la forme de l'aliment");
    expect(source).toContain("sans remplacer le plat");
    expect(source).toContain("les ingrédients");
    expect(source).toContain("le nombre d'aliments");
    expect(source).toContain("composition source");
    expect(source).toContain('assetType: "menu_visual"');
    expect(source).not.toContain("photographie culinaire de studio professionnel");
    expect(source).not.toContain("éclairage softbox premium");
    expect(source).toContain("calque transparent séparé");
    expect(source).toContain("TokLogoWatermark");
    expect(source).toContain("useTokLogoSrc");
    expect(source).toContain('data-testid="tok-logo-watermark-layer"');
    expect(source).toContain('className="left-4 top-4" sizeClassName="h-16 w-16"');
    expect(source).toContain('className="relative inline-flex max-h-full max-w-full items-center justify-center"');
    expect(source).not.toContain("result.edit_instructions");
    expect(source).not.toContain("result.publication_caption");
    expect(source).not.toContain("result.marketing_angles");
    expect(source).not.toContain("Texte propos");
  });

  it("maps backend image generation failures to restaurateur-facing messages", () => {
    expect(source).toContain("formatPhotoGenerationError(error)");
    expect(source).toContain("Trop de générations lancées");
    expect(source).toContain("Session expirée");
    expect(source).toContain("photo JPG, PNG ou WebP bien éclairée");
    expect(source).toContain("Format non pris en charge par le studio IA");
    expect(source).toContain("Photo trop lourde pour la retouche IA");
    expect(source).toContain("ai_service_unavailable");
    expect(source).toContain("cle OpenAI de la fonction Supabase");
  });
});
