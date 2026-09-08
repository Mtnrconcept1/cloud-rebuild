import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  MAX_PRINT_UPSCALE_FACTOR,
  calculateMarketingOutputPlan,
  type MarketingOutputTarget,
} from "@/lib/marketing/outputGeometry";
import {
  getMarketingOutputSessionSnapshot,
  setMarketingOutputSession,
  subscribeMarketingOutputSession,
} from "@/lib/marketing/outputSession";

type Props = {
  rootRef: RefObject<HTMLDivElement>;
  printEnabled: boolean;
  onOpenPrintComposer?: () => void;
};

type PortalTargets = {
  supportHost: HTMLElement | null;
  generationHost: HTMLElement | null;
};

const GENERIC_TOOL_INDEX: Record<string, number> = {
  flyer: 0,
  business_card: 1,
  restaurant_menu: 2,
  folded_leaflet: 3,
  brochure: 4,
  poster: 5,
  large_poster: 6,
  postcard: 7,
  sticker: 8,
  pos_display: 9,
  banner: 10,
};

function directButtons(element: Element) {
  return Array.from(element.children).filter((child): child is HTMLButtonElement => child instanceof HTMLButtonElement);
}

function findSupportGrid(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("div.grid"))
    .find((grid) => directButtons(grid).length >= 10) || null;
}

function ensurePortalHost(parent: HTMLElement, name: string) {
  const existing = parent.querySelector<HTMLElement>(`:scope > [data-tok-print-portal="${name}"]`);
  if (existing) return existing;
  const host = document.createElement("span");
  host.dataset.tokPrintPortal = name;
  host.style.display = "contents";
  parent.appendChild(host);
  return host;
}

function findGenerationActionContainer(root: HTMLElement) {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => {
    const label = candidate.textContent?.replace(/\s+/g, " ").trim() || "";
    return label.includes("Générer") && !label.includes("Nouvelle seed");
  });
  return button?.parentElement instanceof HTMLElement ? button.parentElement : null;
}

function setGenericPrintControlsVisibility(root: HTMLElement, hidden: boolean) {
  for (const id of ["marketing-format", "marketing-orientation"]) {
    const control = root.querySelector<HTMLElement>(`#${id}`);
    const field = control?.parentElement;
    if (!(field instanceof HTMLElement)) continue;
    if (hidden) {
      field.dataset.tokPrintHidden = "true";
      field.style.display = "none";
    } else if (field.dataset.tokPrintHidden === "true") {
      delete field.dataset.tokPrintHidden;
      field.style.removeProperty("display");
    }
  }
}

function printTargetDescription(target: MarketingOutputTarget) {
  if (!target.print) return `${target.widthPx}×${target.heightPx} px`;
  const closed = target.print.foldedWidthMm && target.print.foldedHeightMm
    ? ` · fermé ${target.print.foldedWidthMm}×${target.print.foldedHeightMm} mm`
    : "";
  return `${target.print.widthMm}×${target.print.heightMm} mm à plat${closed} · bleed ${target.print.bleedMm} mm · marge ${target.print.safeMarginMm} mm`;
}

export default function MarketingStudioPrintCatalogBridge({
  rootRef,
  printEnabled,
  onOpenPrintComposer,
}: Props) {
  const outputSession = useSyncExternalStore(
    subscribeMarketingOutputSession,
    getMarketingOutputSessionSnapshot,
    getMarketingOutputSessionSnapshot,
  );
  const [portals, setPortals] = useState<PortalTargets>({ supportHost: null, generationHost: null });
  const printMode = outputSession.destination === "print";
  const printSupportTargets = outputSession.targets.filter((target) => target.destination === "print" && target.print);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const reconcile = () => {
      const supportGrid = findSupportGrid(root);
      let supportHost: HTMLElement | null = null;
      if (supportGrid) {
        supportHost = ensurePortalHost(supportGrid, "supports");
        for (const button of directButtons(supportGrid)) {
          if (printMode) {
            button.dataset.tokPrintHidden = "true";
            button.style.display = "none";
          } else if (button.dataset.tokPrintHidden === "true") {
            delete button.dataset.tokPrintHidden;
            button.style.removeProperty("display");
          }
        }
      }

      setGenericPrintControlsVisibility(root, printMode);
      const actionContainer = findGenerationActionContainer(root);
      const generationHost = actionContainer ? ensurePortalHost(actionContainer, "generation-action") : null;
      setPortals((current) => (
        current.supportHost === supportHost && current.generationHost === generationHost
          ? current
          : { supportHost, generationHost }
      ));
    };

    reconcile();
    const observer = new MutationObserver(reconcile);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      setGenericPrintControlsVisibility(root, false);
      const supportGrid = findSupportGrid(root);
      if (supportGrid) {
        for (const button of directButtons(supportGrid)) {
          if (button.dataset.tokPrintHidden === "true") {
            delete button.dataset.tokPrintHidden;
            button.style.removeProperty("display");
          }
        }
      }
    };
  }, [printMode, rootRef]);

  const selectPrintTarget = (target: MarketingOutputTarget) => {
    if (!target.print) return;
    const root = rootRef.current;
    const supportGrid = root ? findSupportGrid(root) : null;
    const toolId = target.print.marketingToolId || (target.print.category.includes("calendar") ? "poster" : "flyer");
    const genericIndex = GENERIC_TOOL_INDEX[toolId] ?? GENERIC_TOOL_INDEX.flyer;
    const genericButton = supportGrid ? directButtons(supportGrid)[genericIndex] : null;
    genericButton?.click();
    window.requestAnimationFrame(() => {
      setMarketingOutputSession({
        destination: "print",
        targets: outputSession.targets,
        target,
      });
    });
  };

  const printActionCard = printEnabled && onOpenPrintComposer ? (
    <button
      type="button"
      onClick={onOpenPrintComposer}
      className="min-w-0 rounded-2xl border border-orange-300 bg-gradient-to-br from-orange-50 to-white p-4 text-center shadow-sm transition hover:border-orange-500 hover:shadow-md dark:from-orange-950/20 dark:to-background"
    >
      <div className="flex min-h-28 flex-col items-center justify-center gap-3">
        <span className="rounded-3xl bg-orange-600 p-4 text-white">
          <Printer className="h-7 w-7" />
        </span>
        <span>
          <span className="block text-base font-bold text-foreground">Imprimer une création</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">BAT, prix livré, paiement et suivi Cloudprinter.</span>
        </span>
      </div>
    </button>
  ) : null;

  const supportPortal = portals.supportHost ? createPortal(
    <>
      {printMode ? printSupportTargets.map((target) => {
        const selected = outputSession.target?.id === target.id;
        const plan = calculateMarketingOutputPlan(target.nativeWidthPx, target.nativeHeightPx, target);
        const blocked = plan.upscaleFactor > MAX_PRINT_UPSCALE_FACTOR;
        return (
          <button
            key={target.id}
            type="button"
            disabled={blocked}
            onClick={() => selectPrintTarget(target)}
            className={`min-w-0 rounded-2xl border p-4 text-center transition ${
              selected
                ? "border-orange-400 bg-orange-50 shadow-sm dark:bg-orange-950/20"
                : "border-border bg-background hover:border-orange-200"
            } ${blocked ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <div className="flex min-h-28 flex-col items-center justify-center gap-3">
              <span className={`rounded-3xl p-4 ${selected ? "bg-orange-600 text-white" : "bg-orange-50 text-orange-700"}`}>
                <Printer className="h-7 w-7" />
              </span>
              <span>
                <span className="block text-base font-bold text-foreground">{target.label}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{printTargetDescription(target)}</span>
                {blocked ? <span className="mt-1 block text-[11px] font-semibold text-red-600">Résolution source insuffisante</span> : null}
              </span>
            </div>
          </button>
        );
      }) : null}
      {printActionCard}
    </>,
    portals.supportHost,
  ) : null;

  const generationPortal = portals.generationHost && printEnabled && onOpenPrintComposer ? createPortal(
    <Button type="button" variant="outline" size="lg" className="min-h-12 gap-2 rounded-2xl" onClick={onOpenPrintComposer}>
      <Printer className="h-4 w-4" />
      Imprimer une création
    </Button>,
    portals.generationHost,
  ) : null;

  return (
    <>
      {supportPortal}
      {generationPortal}
    </>
  );
}
