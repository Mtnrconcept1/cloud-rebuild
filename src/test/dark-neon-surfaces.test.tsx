import { readFileSync } from "node:fs";
import { render, cleanup } from "@testing-library/react";
import postcss, { type AtRule, type Rule } from "postcss";
import { afterEach, describe, expect, it } from "vitest";
import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const stylesheet = postcss.parse(readFileSync("src/styles/dark-neon.css", "utf8"));
const surfaces = stylesheet.nodes.find((node): node is Rule => node.type === "rule")!;

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
});

describe("dark neon surfaces", () => {
  it("covers shared cards and the menu's custom blocks only in dark mode", () => {
    render(<>
      <Card data-testid="shared-card">Carte partagée</Card>
      <section className="tok-neon-surface" data-tok-neon="violet">Plat du jour IA</section>
      <div className="tok-neon-surface" data-tok-neon="emerald">Plat manuel</div>
      <div className="tok-editorial-stat">Statistique</div>
      <section className="tok-menu-categories">Catégories</section>
      <section className="rounded-2xl border bg-card">Bloc existant</section>
      <article className="premium-card">Restaurant public</article>
      <div className="tok-customer-reservation-card">Réservation client</div>
    </>);
    expect(document.querySelectorAll(surfaces.selector)).toHaveLength(0);
    document.documentElement.classList.add("dark");
    expect(document.querySelectorAll(surfaces.selector)).toHaveLength(8);
  });

  it("does not turn controls, avatars, dialogs or opted-out surfaces into neon cards", () => {
    document.documentElement.classList.add("dark");
    render(<>
      <input className="rounded-xl border bg-card" aria-label="Rechercher" />
      <button className="rounded-xl border bg-card">Filtrer</button>
      <div className="rounded-full border bg-card">Avatar</div>
      <div role="dialog" className="rounded-xl border bg-card">Dialogue</div>
      <div role="listbox" className="rounded-xl border bg-card">Options</div>
      <Card data-tok-neon="off">Surface exclue</Card>
    </>);
    expect(document.querySelectorAll(surfaces.selector)).toHaveLength(0);
  });

  it("keeps every visual rule scoped to dark mode", () => {
    const topLevelRules = stylesheet.nodes.filter((node) => node.type === "rule") as Rule[];
    expect(topLevelRules).toHaveLength(1);
    expect(topLevelRules[0].selector.startsWith(":root.dark ")).toBe(true);
  });

  it("animates only compositor-friendly decoration properties", () => {
    const keyframes = stylesheet.nodes.find((node): node is AtRule => node.type === "atrule" && node.name === "keyframes")!;
    const properties = new Set<string>();
    keyframes.walkDecls((declaration) => { properties.add(declaration.prop); });
    expect([...properties].sort()).toEqual(["opacity", "transform"]);
    const costlyProperties: string[] = [];
    stylesheet.walkDecls(/^(?:will-change|filter|backdrop-filter)$/, (declaration) => { costlyProperties.push(declaration.prop); });
    expect(costlyProperties).toEqual([]);
  });

  it("enables scroll motion only with feature support and no reduced-motion preference", () => {
    let motionRules = 0;
    stylesheet.walkDecls("animation", (declaration) => {
      if (!declaration.value.startsWith("tok-neon-reflection")) return;
      motionRules += 1;
      const ancestors: string[] = [];
      for (let node = declaration.parent; node; node = node.parent) {
        if (node.type === "atrule") ancestors.push(`${node.name} ${node.params}`);
      }
      expect(ancestors).toContain("media (prefers-reduced-motion: no-preference)");
      expect(ancestors).toContain("supports ((animation-timeline: view()) and (animation-range: 0% 100%))");
      const rule = declaration.parent as Rule;
      expect(rule.selector).toBe("&::after");
      const properties = rule.nodes.filter((node) => node.type === "decl").map((node) => node.prop);
      expect(properties.indexOf("animation-timeline")).toBeGreaterThan(properties.indexOf("animation"));
    });
    expect(motionRules).toBe(1);
  });

  it("does not change surface geometry or existing positioned layouts", () => {
    const geometryChanges: string[] = [];
    stylesheet.walkDecls(/^(?:width|height|min-height|max-height|padding|margin|contain|display)$/, (declaration) => {
      geometryChanges.push(declaration.prop);
    });
    expect(geometryChanges).toEqual([]);
    stylesheet.walkDecls("position", (declaration) => {
      if (declaration.value === "relative") expect((declaration.parent as Rule).selector).toBe(":where(&)");
      else expect((declaration.parent as Rule).selector).toBe("&::after");
    });
  });

  it("unblocks nested timelines only on decorative clipping wrappers, including static and off parents", () => {
    document.documentElement.classList.add("dark");
    render(<>
      <Card className="overflow-hidden" data-testid="clipped-card"><Card>Carte imbriquée</Card></Card>
      <Card className="overflow-hidden" data-tok-neon="static" />
      <Card className="overflow-hidden" data-tok-neon="off" />
      <section className="tok-order-board-column"><article className="tok-order-card" /></section>
      <Card className="overflow-hidden overflow-y-auto" />
      <Card className="overflow-hidden md:overflow-auto" />
      <Card className="overflow-hidden" data-radix-scroll-area-viewport />
      <Card className="overflow-hidden" data-tok-neon-scroll="preserve" />
      {["tok-page-orders", "tok-page-reservations"].map((page) => (
        <div className={page} key={page}>
          <Accordion type="single" defaultValue="day">
            <AccordionItem value="day" className="overflow-hidden rounded-xl border bg-card">
              <AccordionTrigger>Service du jour</AccordionTrigger>
              <AccordionContent><Card>Carte dans un accordéon ouvert</Card></AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      ))}
      <div role="region" data-state="open" className="overflow-hidden">Région extérieure préservée</div>
    </>);
    const clipping: Rule[] = [];
    stylesheet.walkDecls("overflow", (declaration) => {
      expect(declaration.value).toBe("clip");
      expect(declaration.important).toBeFalsy();
      expect((declaration.parent?.parent as AtRule).params).toBe("(overflow: clip)");
      clipping.push(declaration.parent as Rule);
    });
    expect(clipping).toHaveLength(1);
    expect(document.querySelectorAll(clipping[0].selector)).toHaveLength(8);
    // Children must keep their own timeline: sharing an ancestor's timeline
    // would ignore a real nested scroll area and break when that ancestor is off.
    stylesheet.walkDecls("view-timeline-name", (declaration) => {
      expect(declaration.value).not.toBe("none");
    });
  });

  it("keeps selection and keyboard focus as separate indicators", () => {
    // The selector is nested in the shared surface rule, so it cannot style controls.
    const selected = surfaces.nodes.find((node): node is Rule => node.type === "rule" && node.selector === '&[data-tok-neon-selected="true"]');
    expect(selected?.toString()).toContain("inset 0 0 0 2px");
    const shadow = surfaces.nodes.find((node) => node.type === "decl" && node.prop === "box-shadow");
    expect(shadow?.toString()).toContain("--tok-neon-selection-shadow");
    expect(shadow?.toString()).toContain("--tw-ring-shadow");
  });

  it("keeps focus rings and a noninteractive decoration", () => {
    const shadow = surfaces.nodes.find((node) => node.type === "decl" && node.prop === "box-shadow");
    expect(shadow?.toString()).toContain("--tw-ring-offset-shadow");
    expect(shadow?.toString()).toContain("--tw-ring-shadow");
    const decorativeRules: Rule[] = [];
    surfaces.walkRules("&::after", (rule) => {
      if (rule.nodes.some((node) => node.type === "decl" && node.prop === "content" && node.value === '""')) decorativeRules.push(rule);
    });
    expect(decorativeRules).toHaveLength(1);
    expect(decorativeRules[0].nodes.some((node) => node.type === "decl" && node.prop === "pointer-events" && node.value === "none")).toBe(true);
  });

  it("retains a static accessible fallback for reduced motion, printing and forced colors", () => {
    const media: AtRule[] = [];
    stylesheet.walkAtRules("media", (rule) => { media.push(rule); });
    const reduced = media.find((rule) => rule.params === "(prefers-reduced-motion: reduce)")!;
    const accessibleOutput = media.filter((rule) => rule.params === "print, (forced-colors: active)");
    expect(reduced.toString()).toContain("animation: none !important");
    expect(accessibleOutput.some((rule) => rule.toString().includes("content: none"))).toBe(true);
    expect(accessibleOutput.some((rule) => rule.toString().includes("box-shadow: none !important"))).toBe(true);
  });

  it("removes mobile feed glows without hiding focus and highlighted post rings", () => {
    const mobile = surfaces.nodes.find((node): node is AtRule => node.type === "atrule" && node.params === "(width < 640px)")!;
    const feed = mobile.nodes.find((node): node is Rule => node.type === "rule" && node.selector === '&[class~="max-sm:shadow-none"]')!;
    const shadow = feed.nodes.find((node) => node.type === "decl" && node.prop === "box-shadow");
    expect(shadow?.toString()).toContain("--tw-ring-offset-shadow");
    expect(shadow?.toString()).toContain("--tw-ring-shadow");
    expect(shadow?.toString()).toContain("--tok-neon-selection-shadow");
    expect(shadow?.toString()).not.toContain("--tok-neon-color");
  });
});
