import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  Armchair,
  ArrowRight,
  BarChart3,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Columns2,
  Eye,
  ImageUp,
  Layers3,
  LayoutGrid,
  LockKeyhole,
  Minus,
  Plus,
  RotateCw,
  Send,
  Sofa,
  Sparkles,
  Trash2,
  Users,
  Wand2,
} from "lucide-react";

import { AiLoadingState } from "@/components/ui/ai-loading-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  normalizeFloorPlanLayout,
  type FloorPlanTableLayout,
  type FloorPlanVisualVariant,
} from "@/lib/floorPlan";
import { reconcileFloorPlanProposal } from "@/lib/floorPlanStudio";
import { optimizeImageUpload } from "@/lib/optimizedImages";
import { formatAiImageGenerationError } from "@/lib/publicErrorMessages";
import { invokeSupabaseFunction } from "@/lib/session";
import { cn } from "@/lib/utils";

import FloorPlanMiniature from "./FloorPlanMiniature";
import type { StudioDraftTable } from "./studioShared";

const MAX_IMPORT_IMAGE_BYTES = 6 * 1024 * 1024;
const IMPORT_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type AIFloorPlanTable = {
  table_number: string;
  capacity: number;
  kind: string;
  shape: "round" | "rect";
  seatType?: string;
  seatPlacements?: {
    zone: string;
    type: string;
    count: number;
    benchLength?: number;
    benchDepth?: number;
  }[];
  visualVariant?: FloorPlanVisualVariant;
  finish?: "oak" | "natural" | "walnut";
  locked?: boolean;
  cornerBenchCorners?: FloorPlanTableLayout["cornerBenchCorners"];
  cornerBenchConfigs?: FloorPlanTableLayout["cornerBenchConfigs"];
  tableWidth?: number;
  tableHeight?: number;
  cornerBenchHorizontal?: number;
  cornerBenchVertical?: number;
  cornerBenchDepth?: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  seatLabels: number[];
};

export type AIFloorPlanResult = {
  tables: AIFloorPlanTable[];
  explanation: string;
  analysis?: Record<string, unknown>;
  source?:
    | "generate"
    | "optimize"
    | "suggest-furniture"
    | "custom"
    | "image-import";
  variantName?: string;
};

type ImportImagePayload = {
  dataUrl: string;
  mimeType: string;
  name: string;
  width: number;
  height: number;
};

type CurrentLayoutItem = {
  id?: string;
  sector?: string;
  is_active?: boolean;
  table_number: string;
  capacity: number;
  layout: Omit<
    Partial<FloorPlanTableLayout>,
    "x" | "y" | "w" | "h" | "shape" | "kind"
  > & {
    x: number;
    y: number;
    w: number;
    h: number;
    shape: string;
    kind: string;
  };
};

interface FloorPlanAIPanelProps {
  restaurantId: string;
  currentLayout: CurrentLayoutItem[];
  canvasWidth: number;
  canvasHeight: number;
  onApply: (result: AIFloorPlanResult) => void;
  disabled?: boolean;
  mode?: "compact" | "workspace";
  sectorLabel?: string;
  className?: string;
  resolvePreview?: (result: AIFloorPlanResult) => StudioDraftTable[];
}

const OBJECTIVES = [
  {
    id: "comfort",
    label: "Confort & circulation",
    description:
      "Privilégie une circulation fluide et des tables confortablement espacées.",
    icon: Users,
  },
  {
    id: "capacity",
    label: "Plus de couverts",
    description:
      "Recherche davantage de places en préservant les accès et la circulation du service.",
    icon: BarChart3,
  },
  {
    id: "event",
    label: "Événement",
    description:
      "Prépare une disposition conviviale pour un événement et les groupes.",
    icon: LayoutGrid,
  },
] as const;

const TABLE_TYPES = [
  { id: "round", label: "Rondes" },
  { id: "rect", label: "Carrées / rectangles" },
  { id: "bench", label: "Banquettes" },
] as const;

const PRESERVATION_OPTIONS = [
  { id: "structure", label: "Murs et ouvertures", icon: LayoutGrid },
  { id: "bench", label: "Banquettes", icon: Sofa },
  { id: "service", label: "Consoles de service", icon: Armchair },
] as const;

type PreservationKey = (typeof PRESERVATION_OPTIONS)[number]["id"];
type Proposal = {
  id: number;
  title: string;
  result: AIFloorPlanResult;
  protectedCount: number;
  scope: string;
};

function matchesPreservation(item: CurrentLayoutItem, option: PreservationKey) {
  const { kind, visualVariant, seatType, seatPlacements } = item.layout;
  if (option === "structure")
    return (
      kind === "divider" ||
      ["wall", "wall-corner", "door", "window"].includes(visualVariant || "")
    );
  if (option === "service") return kind === "service-station";
  return (
    ["banquette", "corner-bench", "booth", "sofa"].includes(kind) ||
    seatType === "bench" ||
    seatType === "corner-bench" ||
    Boolean(seatPlacements?.some((placement) => placement.type === "bench"))
  );
}

function identity(table: { kind: string; table_number: string }) {
  const kind = table.kind.startsWith("table-") ? "table" : table.kind;
  return `${kind}:${table.table_number.trim().toLocaleLowerCase("fr")}`;
}

function preserveExistingItems(
  result: AIFloorPlanResult,
  protectedItems: CurrentLayoutItem[],
): AIFloorPlanResult {
  const protectedKeys = new Set(
    protectedItems.map((item) =>
      identity({ kind: item.layout.kind, table_number: item.table_number }),
    ),
  );
  const protectedTables: AIFloorPlanTable[] = protectedItems.map((item) => ({
    ...item.layout,
    table_number: item.table_number,
    capacity: item.capacity,
    shape: item.layout.shape === "round" ? "round" : "rect",
    rotation: item.layout.rotation || 0,
    seatLabels: item.layout.seatLabels || [],
  }));
  return {
    ...result,
    tables: [
      ...result.tables.filter((table) => !protectedKeys.has(identity(table))),
      ...protectedTables,
    ],
  };
}

function countLayout(tables: StudioDraftTable[]) {
  const reservable = tables.filter((table) => table.layout.kind === "table");
  return {
    tables: reservable.length,
    covers: reservable.reduce((sum, table) => sum + table.capacity, 0),
  };
}

function readImageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        width: Math.max(1, Math.round(image.naturalWidth || image.width || 1)),
        height: Math.max(
          1,
          Math.round(image.naturalHeight || image.height || 1),
        ),
      });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });
}

export default function FloorPlanAIPanel({
  restaurantId,
  currentLayout,
  canvasWidth,
  canvasHeight,
  onApply,
  disabled = false,
  mode = "compact",
  sectorLabel = "Salle principale",
  className,
  resolvePreview,
}: FloorPlanAIPanelProps) {
  const inputId = useId();
  const workspace = mode === "workspace";
  const scope = `${restaurantId}:${sectorLabel}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const imageWorkRef = useRef(0);
  const requestRef = useRef(0);
  const proposalSequence = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<number | null>(
    null,
  );
  const [comparing, setComparing] = useState(false);
  const [objective, setObjective] =
    useState<(typeof OBJECTIVES)[number]["id"]>("comfort");
  const [desiredSeats, setDesiredSeats] = useState(() => {
    const count = currentLayout
      .filter((item) => item.layout.kind === "table")
      .reduce((sum, item) => sum + item.capacity, 0);
    return count > 0 ? String(count) : "";
  });
  const [tableTypes, setTableTypes] = useState<string[]>([
    "round",
    "rect",
    "bench",
  ]);
  const [preservation, setPreservation] = useState<
    Record<PreservationKey, boolean>
  >({ structure: true, bench: true, service: true });
  const [aisleWidth, setAisleWidth] = useState("120");
  const [customPrompt, setCustomPrompt] = useState("");
  const [importImage, setImportImage] = useState<ImportImagePayload | null>(
    null,
  );
  const [preparingImage, setPreparingImage] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      imageWorkRef.current += 1;
    };
  }, []);

  const currentDraft = useMemo<StudioDraftTable[]>(
    () =>
      currentLayout.map((item, index) => ({
        id: item.id || `existing-${index}`,
        table_number: item.table_number,
        capacity: item.capacity,
        is_active: item.is_active ?? true,
        sector: sectorLabel,
        layout: normalizeFloorPlanLayout(item.layout, index, item.capacity),
      })),
    [currentLayout, sectorLabel],
  );

  const currentCounts = countLayout(currentDraft);
  const availableProposals = proposals.filter(
    (proposal) => proposal.scope === scope,
  );
  const selectedProposal =
    availableProposals.find((proposal) => proposal.id === selectedProposalId) ||
    null;
  const protectedItems = currentLayout.filter(
    (item) =>
      item.layout.locked ||
      PRESERVATION_OPTIONS.some(
        (option) =>
          preservation[option.id] && matchesPreservation(item, option.id),
      ),
  );
  const busy = loading || preparingImage || disabled;

  const previewFor = (result: AIFloorPlanResult) => {
    if (resolvePreview) return resolvePreview(result);
    const proposed = result.tables.map((item, index): StudioDraftTable => {
      const layout = normalizeFloorPlanLayout(item, index, item.capacity);
      return {
        id: `proposal-${index}`,
        table_number: item.table_number,
        capacity: layout.kind === "table" ? Math.max(1, item.capacity || 2) : 0,
        is_active: true,
        sector: sectorLabel,
        layout,
      };
    });
    return reconcileFloorPlanProposal(currentDraft, proposed, sectorLabel);
  };

  const displayedTables = selectedProposal
    ? previewFor(selectedProposal.result)
    : currentDraft;
  const displayedCounts = countLayout(displayedTables);
  const selectedObjective =
    OBJECTIVES.find((option) => option.id === objective) || OBJECTIVES[0];

  const buildPreferencePrompt = (request?: string) => {
    const target = Number(desiredSeats);
    const aisle = Number(aisleWidth);
    return [
      `Propose un aménagement pour l'espace « ${sectorLabel} ». ${selectedObjective.description}`,
      "Conserve tous les éléments existants et leurs numéros exacts. Ajuste uniquement leur position et rotation, sans changer leur capacité, taille ou assises. Ajoute seulement les éléments utiles. Ne duplique pas les tables existantes.",
      Number.isFinite(target) && target > 0
        ? `Objectif souhaité : ${Math.round(target)} places au total.`
        : "Adapte le nombre de places à la salle et à la circulation.",
      `Types de tables privilégiés : ${TABLE_TYPES.filter((type) =>
        tableTypes.includes(type.id),
      )
        .map((type) => type.label)
        .join(", ")}.`,
      Number.isFinite(aisle) && aisle > 0
        ? `Largeur souhaitée des passages : ${Math.round(aisle)} unités du canevas.`
        : "Prévois des passages dégagés.",
      protectedItems.length
        ? `Conserve strictement la position, la rotation et les dimensions des éléments suivants : ${protectedItems
            .map((item) => `${item.table_number} (${item.layout.kind})`)
            .join(", ")
            .slice(0, 650)}.`
        : "",
      request ? `Demande complémentaire : ${request.slice(0, 500)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const callAI = async (
    action: AIFloorPlanResult["source"],
    prompt?: string,
    image?: ImportImagePayload | null,
  ) => {
    if (disabled || inFlightRef.current || preparingImage) return;
    inFlightRef.current = true;
    const requestId = ++requestRef.current;
    const requestScope = scope;
    const protectedAtRequest = protectedItems;
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await invokeSupabaseFunction<AIFloorPlanResult>(
        "floorplan-ai",
        {
          body: {
            action,
            restaurantId,
            currentLayout,
            canvasWidth,
            canvasHeight,
            prompt,
            image: image || undefined,
          },
        },
      );
      if (error) throw error;
      if (!data?.tables || !Array.isArray(data.tables))
        throw new Error("Réponse IA invalide");
      if (
        !mountedRef.current ||
        requestId !== requestRef.current ||
        requestScope !== scopeRef.current
      )
        return;

      const id = ++proposalSequence.current;
      const title =
        action === "image-import"
          ? "Depuis votre plan"
          : action === "suggest-furniture"
            ? "Mobilier complémentaire"
            : selectedObjective.label;
      const result = preserveExistingItems(
        {
          ...data,
          source: action,
          variantName:
            action === "image-import"
              ? `Plan IA - ${new Date().toLocaleDateString("fr-CH")}`
              : `Proposition ${id} · ${title}`,
        },
        protectedAtRequest,
      );
      setProposals((previous) =>
        [
          ...previous.filter((proposal) => proposal.scope === requestScope),
          {
            id,
            title,
            result,
            protectedCount: protectedAtRequest.length,
            scope: requestScope,
          },
        ].slice(-3),
      );
      setSelectedProposalId(id);
      setComparing(false);
    } catch (error) {
      if (
        mountedRef.current &&
        requestId === requestRef.current &&
        requestScope === scopeRef.current
      )
        setError(formatAiImageGenerationError(error));
    } finally {
      if (requestId === requestRef.current) {
        inFlightRef.current = false;
        if (mountedRef.current) setLoading(false);
      }
    }
  };

  const handleCustomSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (customPrompt.trim() && tableTypes.length)
      void callAI("custom", buildPreferencePrompt(customPrompt.trim()));
  };

  const handleImportImageChange = async (file: File | null) => {
    if (!file || inFlightRef.current || disabled) return;
    const workId = ++imageWorkRef.current;
    setError(null);
    setImportImage(null);
    setPreparingImage(true);
    try {
      // Compress phone photos before the upload limit is checked.
      let prepared = file;
      if (IMPORT_IMAGE_MIME_TYPES.has(file.type))
        prepared = await optimizeImageUpload(file).catch(() => file);
      if (workId !== imageWorkRef.current || !mountedRef.current) return;
      if (!IMPORT_IMAGE_MIME_TYPES.has(prepared.type)) {
        setError(
          "Format non pris en charge. Utilisez une photo JPG, PNG ou WebP.",
        );
        return;
      }
      if (prepared.size > MAX_IMPORT_IMAGE_BYTES) {
        setError(
          "Image encore trop lourde après compression. Reprenez la photo à une résolution plus basse.",
        );
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () =>
          reject(new Error("Lecture de l'image impossible"));
        reader.readAsDataURL(prepared);
      });
      const dimensions = await readImageDimensions(dataUrl);
      if (workId !== imageWorkRef.current || !mountedRef.current) return;
      setImportImage({
        dataUrl,
        mimeType: prepared.type,
        name: prepared.name,
        width: dimensions.width,
        height: dimensions.height,
      });
    } catch {
      if (workId === imageWorkRef.current && mountedRef.current)
        setError(
          "Impossible de préparer cette image. Réessayez avec une autre photo.",
        );
    } finally {
      if (workId === imageWorkRef.current && mountedRef.current)
        setPreparingImage(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (busy) return;
    void handleImportImageChange(event.dataTransfer.files?.[0] || null);
  };

  const toggleTableType = (type: string, checked: boolean) =>
    setTableTypes((previous) =>
      checked
        ? [...new Set([...previous, type])]
        : previous.filter((item) => item !== type),
    );
  const updateSeats = (delta: number) =>
    setDesiredSeats(
      String(
        Math.max(
          1,
          Math.min(
            1000,
            (Number(desiredSeats) || currentCounts.covers || 0) + delta,
          ),
        ),
      ),
    );

  return (
    <div
      className={cn(
        "min-w-0 text-[#352e28]",
        workspace
          ? "grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[330px_minmax(0,1fr)]"
          : "space-y-4",
        className,
      )}
      data-floor-plan-assistant={mode}
    >
      <aside
        className={cn(
          "space-y-5",
          workspace && "rounded-xl border border-[#e7dfd5] bg-white p-5",
        )}
      >
        <div>
          <h2 className="font-display text-[25px] leading-tight">
            {workspace ? "Vos préférences" : "Assistant d’aménagement"}
          </h2>
          {!workspace ? (
            <p className="mt-1.5 text-xs leading-relaxed text-[#8b7f73]">
              Imaginez une nouvelle disposition pour votre salle.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-[#726559]">
            Votre espace
          </Label>
          <div className="flex h-11 items-center justify-between rounded-lg border border-[#e7dfd5] bg-[#fcfbf8] px-3 text-sm">
            <span className="truncate">{sectorLabel}</span>
            <span className="ml-2 whitespace-nowrap text-[11px] text-[#96897c]">
              {currentCounts.covers} places
            </span>
          </div>
        </div>

        <fieldset className="space-y-2" disabled={busy}>
          <legend className="mb-2 text-xs font-medium text-[#726559]">
            Objectif
          </legend>
          {OBJECTIVES.map((option) => (
            <label
              key={option.id}
              className={cn(
                "relative flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] transition-colors focus-within:ring-2 focus-within:ring-primary/40",
                objective === option.id
                  ? "border-primary bg-[#fff4eb] text-primary"
                  : "border-[#e7dfd5] bg-white hover:bg-[#fbf8f3]",
                busy && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={`${inputId}-objective`}
                value={option.id}
                checked={objective === option.id}
                onChange={() => setObjective(option.id)}
                className="sr-only"
              />
              <option.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 font-medium">{option.label}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "grid h-4 w-4 place-items-center rounded-full border",
                  objective === option.id
                    ? "border-primary bg-primary"
                    : "border-[#c9bfb4]",
                )}
              >
                {objective === option.id ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex items-center justify-between gap-3">
          <Label
            htmlFor={`${inputId}-seats`}
            className="text-xs font-medium text-[#726559]"
          >
            Places souhaitées
          </Label>
          <div className="flex h-10 items-stretch overflow-hidden rounded-lg border border-[#e3dbd1] bg-white">
            <button
              type="button"
              aria-label="Réduire les places souhaitées"
              onClick={() => updateSeats(-1)}
              disabled={busy || Number(desiredSeats) === 1}
              className="grid w-9 place-items-center hover:bg-[#f8f4ee] disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <Input
              id={`${inputId}-seats`}
              type="number"
              min={1}
              max={1000}
              value={desiredSeats}
              onChange={(event) => setDesiredSeats(event.target.value)}
              disabled={busy}
              placeholder="—"
              className="h-full w-16 rounded-none border-x border-y-0 border-[#e7dfd5] px-1 text-center text-sm shadow-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              aria-label="Augmenter les places souhaitées"
              onClick={() => updateSeats(1)}
              disabled={busy}
              className="grid w-9 place-items-center hover:bg-[#f8f4ee] disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <fieldset disabled={busy}>
          <legend className="mb-2 text-xs font-medium text-[#726559]">
            Types de tables
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {TABLE_TYPES.map((type) => (
              <label
                key={type.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#e7dfd5] bg-white px-2.5 py-2 text-xs"
              >
                <Checkbox
                  checked={tableTypes.includes(type.id)}
                  onCheckedChange={(checked) =>
                    toggleTableType(type.id, checked === true)
                  }
                  disabled={busy}
                  className="h-4 w-4 rounded-[4px]"
                />
                {type.label}
              </label>
            ))}
          </div>
          {!tableTypes.length ? (
            <p className="mt-2 text-xs text-primary">
              Choisissez au moins un type de table.
            </p>
          ) : null}
        </fieldset>

        <fieldset disabled={busy}>
          <legend className="mb-2 text-xs font-medium text-[#726559]">
            Éléments à conserver
          </legend>
          <div className="divide-y divide-[#eee7df] overflow-hidden rounded-lg border border-[#e7dfd5]">
            {PRESERVATION_OPTIONS.map((option) => {
              const count = currentLayout.filter((item) =>
                matchesPreservation(item, option.id),
              ).length;
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex items-center gap-2.5 bg-white px-3 py-2.5 text-xs",
                    count ? "cursor-pointer" : "text-[#a79b8f]",
                  )}
                >
                  <Checkbox
                    checked={preservation[option.id]}
                    onCheckedChange={(checked) =>
                      setPreservation((previous) => ({
                        ...previous,
                        [option.id]: checked === true,
                      }))
                    }
                    disabled={busy || count === 0}
                    className="h-4 w-4 rounded-[4px]"
                  />
                  <option.icon
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="flex-1">{option.label}</span>
                  <span className="text-[10px] text-[#a39587]">{count}</span>
                </label>
              );
            })}
          </div>
          {currentLayout.some((item) => item.layout.locked) ? (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#8b7f73]">
              <LockKeyhole className="h-3 w-3" />
              Les éléments verrouillés restent en place.
            </p>
          ) : null}
        </fieldset>

        <div className="flex items-center justify-between gap-3">
          <Label
            htmlFor={`${inputId}-aisle`}
            className="text-xs font-medium text-[#726559]"
          >
            Largeur des allées
          </Label>
          <div className="relative w-28">
            <Input
              id={`${inputId}-aisle`}
              type="number"
              min={1}
              max={Math.max(canvasWidth, canvasHeight)}
              value={aisleWidth}
              onChange={(event) => setAisleWidth(event.target.value)}
              disabled={busy}
              className="h-10 rounded-lg border-[#e3dbd1] bg-white pr-9 text-sm shadow-none"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#a39587]">
              u.
            </span>
          </div>
        </div>

        <Button
          type="button"
          className="h-12 w-full gap-2 rounded-lg text-sm"
          disabled={busy || !tableTypes.length}
          onClick={() => void callAI("generate", buildPreferencePrompt())}
        >
          <Sparkles className="h-4 w-4" />
          {loading ? "Création en cours…" : "Générer une proposition"}
        </Button>

        <details className="group border-t border-[#eee7df] pt-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-[#726559]">
            <ImageUp className="h-4 w-4" />
            Photo ou demande personnalisée
            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-4 space-y-4">
            <div
              className={cn(
                "space-y-3 rounded-lg border border-dashed p-3 transition-colors",
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-[#dacfc2] bg-[#faf7f2]",
              )}
              onDragOver={(event) => {
                event.preventDefault();
                if (!busy) setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <div>
                <h3 className="text-xs font-semibold">
                  Plan de salle automatique
                </h3>
                <p className="mt-1 text-[11px] leading-relaxed text-[#8b7f73]">
                  Importez ou photographiez votre plan pour obtenir une
                  disposition à vérifier.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  void handleImportImageChange(event.target.files?.[0] || null);
                  event.target.value = "";
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  void handleImportImageChange(event.target.files?.[0] || null);
                  event.target.value = "";
                }}
              />
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 bg-white px-1.5 text-[11px]"
                  disabled={busy}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="h-3.5 w-3.5" />
                  Prendre en photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 bg-white px-1.5 text-[11px]"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageUp className="h-3.5 w-3.5" />
                  Importer
                </Button>
              </div>
              <p className="text-center text-[10px] text-[#9b8d7f]">
                ou glissez une image · JPG, PNG, WebP
              </p>
              {preparingImage ? (
                <p role="status" className="text-xs text-[#8b7f73]">
                  Préparation de l’image…
                </p>
              ) : null}
              {importImage ? (
                <div className="space-y-2">
                  <div className="overflow-hidden rounded-md border border-[#e7dfd5] bg-white">
                    <img
                      src={importImage.dataUrl}
                      alt="Aperçu du plan importé"
                      className="h-28 w-full object-contain"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[10px] text-[#8b7f73]">
                      {importImage.name} · {importImage.width}×
                      {importImage.height}
                    </span>
                    <button
                      type="button"
                      aria-label="Retirer l’image importée"
                      onClick={() => setImportImage(null)}
                      disabled={busy}
                      className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="h-auto min-h-9 w-full gap-1.5 whitespace-normal py-2 text-xs"
                disabled={busy || !importImage}
                onClick={() =>
                  void callAI("image-import", undefined, importImage)
                }
              >
                <Wand2 className="h-3.5 w-3.5 shrink-0" />
                Placer automatiquement le mobilier
              </Button>
            </div>
            <form onSubmit={handleCustomSubmit} className="space-y-2">
              <Label htmlFor={`${inputId}-request`} className="text-xs">
                Votre demande
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`${inputId}-request`}
                  value={customPrompt}
                  onChange={(event) => setCustomPrompt(event.target.value)}
                  maxLength={500}
                  placeholder="Décrivez votre idée…"
                  disabled={busy}
                  className="h-10 min-w-0 rounded-lg border-[#e3dbd1] bg-white text-xs shadow-none"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-lg"
                  aria-label="Envoyer la demande"
                  disabled={busy || !customPrompt.trim() || !tableTypes.length}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
            <div className="grid gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-start gap-2 rounded-lg border-[#e3dbd1] bg-white text-xs"
                disabled={busy}
                onClick={() =>
                  void callAI(
                    "optimize",
                    buildPreferencePrompt(
                      "Optimise uniquement le placement des éléments existants.",
                    ),
                  )
                }
              >
                <Wand2 className="h-3.5 w-3.5" />
                Optimiser le placement
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-start gap-2 rounded-lg border-[#e3dbd1] bg-white text-xs"
                disabled={busy}
                onClick={() =>
                  void callAI(
                    "suggest-furniture",
                    buildPreferencePrompt(
                      "Suggère du mobilier complémentaire sans déplacer ni modifier les tables existantes.",
                    ),
                  )
                }
              >
                <Sofa className="h-3.5 w-3.5" />
                Suggérer du mobilier
              </Button>
            </div>
          </div>
        </details>
      </aside>

      <section
        aria-label="Aperçu des propositions"
        className="min-w-0 space-y-4"
        aria-live="polite"
      >
        {loading ? (
          <AiLoadingState
            compact
            title="Votre proposition prend forme"
            description="L’assistant étudie votre salle, vos préférences et les passages."
            steps={["Salle", "Disposition", "Circulation"]}
          />
        ) : null}
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 p-4"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs leading-relaxed text-destructive">{error}</p>
          </div>
        ) : null}

        {availableProposals.length ? (
          <div
            className={cn(
              "grid gap-2.5 rounded-xl border border-[#e7dfd5] bg-[#fcfaf7] p-2.5",
              workspace && "sm:grid-cols-3",
            )}
            aria-label="Propositions générées"
          >
            {availableProposals.map((proposal) => {
              const preview = previewFor(proposal.result);
              const counts = countLayout(preview);
              return (
                <button
                  key={proposal.id}
                  type="button"
                  onClick={() => {
                    setSelectedProposalId(proposal.id);
                    setComparing(false);
                  }}
                  aria-pressed={selectedProposal?.id === proposal.id}
                  className={cn(
                    "flex min-w-0 items-center gap-2.5 rounded-lg border bg-white p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    selectedProposal?.id === proposal.id
                      ? "border-primary bg-[#fff7f0]"
                      : "border-[#e7dfd5] hover:border-[#cfc0af]",
                  )}
                >
                  <FloorPlanMiniature
                    tables={preview}
                    label={`Aperçu de la proposition ${proposal.id}`}
                    className="w-[45%] shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[15px]">
                      Proposition {proposal.id}
                    </span>
                    <span className="mt-1 block text-[11px] text-[#8b7f73]">
                      {counts.covers} places
                    </span>
                    <span className="mt-1 block truncate text-[10px] text-[#a39587]">
                      {proposal.title}
                    </span>
                  </span>
                  {selectedProposal?.id === proposal.id ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-[#e7dfd5] bg-[#fbf8f3] px-4 py-3.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#e7dfd5] bg-white text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium">
                Imaginez votre prochaine disposition
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-[#8b7f73]">
                Réglez vos préférences et générez une proposition pour la
                comparer à votre plan.
              </p>
            </div>
          </div>
        )}

        <section className="overflow-hidden rounded-xl border border-[#e7dfd5] bg-white">
          <header className="flex flex-wrap items-center gap-2.5 px-4 py-4 sm:px-5">
            <h2
              className={cn(
                "font-display",
                workspace ? "text-[25px]" : "text-xl",
              )}
            >
              {selectedProposal
                ? `Proposition ${selectedProposal.id}`
                : "Votre plan actuel"}
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[#fff1e8] px-2 py-1 text-[10px] font-medium text-primary">
              <Eye className="h-3.5 w-3.5" />
              Aperçu
            </span>
            {selectedProposal ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="ml-auto h-8 w-8 rounded-lg border-[#e7dfd5]"
                aria-label="Créer une autre proposition"
                disabled={busy || !tableTypes.length}
                onClick={() => void callAI("generate", buildPreferencePrompt())}
              >
                <RotateCw className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </header>

          {comparing && availableProposals.length > 1 ? (
            <div className="grid gap-4 px-4 pb-5 md:grid-cols-2">
              {availableProposals.map((proposal) => (
                <button
                  key={proposal.id}
                  type="button"
                  onClick={() => {
                    setSelectedProposalId(proposal.id);
                    setComparing(false);
                  }}
                  className="rounded-lg border border-[#e7dfd5] bg-[#fbf8f3] p-3 text-left hover:border-primary"
                >
                  <FloorPlanMiniature
                    tables={previewFor(proposal.result)}
                    label={`Comparer la proposition ${proposal.id}`}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-display text-lg">
                      Proposition {proposal.id}
                    </span>
                    <ArrowRight className="ml-auto h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-1 text-xs text-[#8b7f73]">
                    {proposal.title}
                  </p>
                </button>
              ))}
            </div>
          ) : displayedTables.length ? (
            <div className="px-3 pb-4 sm:px-5">
              <FloorPlanMiniature
                tables={displayedTables}
                label={
                  selectedProposal
                    ? `Disposition proposée pour ${sectorLabel}`
                    : `Plan actuel de ${sectorLabel}`
                }
                className="mx-auto w-full [&>svg]:max-h-[440px]"
              />
            </div>
          ) : (
            <div className="mx-5 mb-5 flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-[#ded4c7] bg-[#fbf8f3] p-8 text-center">
              <LayoutGrid className="mb-4 h-9 w-9 text-[#c2b2a0]" />
              <h3 className="font-display text-xl">
                Votre salle reste à imaginer
              </h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-[#958678]">
                Créez une première proposition à partir de vos préférences ou
                importez un plan existant.
              </p>
            </div>
          )}

          {selectedProposal?.result.explanation ? (
            <p className="mx-5 mb-4 max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-[#8b7f73]">
              {selectedProposal.result.explanation}
            </p>
          ) : null}

          <footer className="flex flex-wrap items-center gap-2.5 border-t border-[#eee7df] bg-[#fefdfb] p-4 sm:px-5">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-lg border border-[#e7dfd5] bg-white px-2.5 py-2 text-xs">
                <Armchair className="h-4 w-4 text-[#8b7f73]" />
                {displayedCounts.tables} tables
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-[#e7dfd5] bg-white px-2.5 py-2 text-xs">
                <Users className="h-4 w-4 text-[#8b7f73]" />
                {displayedCounts.covers} places
              </span>
              {selectedProposal && selectedProposal.protectedCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7dfd5] bg-white px-2.5 py-2 text-[11px]">
                  <Layers3 className="h-4 w-4 text-[#8b7f73]" />
                  {selectedProposal.protectedCount} conservés
                </span>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2">
              {availableProposals.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-2 rounded-lg border-[#e3dbd1] bg-white"
                  aria-pressed={comparing}
                  onClick={() => setComparing((value) => !value)}
                >
                  <Columns2 className="h-4 w-4" />
                  {comparing ? "Voir l’aperçu" : "Comparer"}
                </Button>
              ) : null}
              <Button
                type="button"
                className="h-10 gap-2 rounded-lg"
                disabled={busy || !selectedProposal}
                onClick={() => {
                  if (selectedProposal && !busy)
                    onApply(selectedProposal.result);
                }}
              >
                <Check className="h-4 w-4" />
                Appliquer au plan
              </Button>
            </div>
          </footer>
        </section>
        {selectedProposal ? (
          <p className="px-1 text-[11px] leading-relaxed text-[#9b8d7f]">
            La proposition sera appliquée à {sectorLabel}. Vous pourrez encore
            l’ajuster et annuler les modifications.
          </p>
        ) : null}
      </section>
    </div>
  );
}
