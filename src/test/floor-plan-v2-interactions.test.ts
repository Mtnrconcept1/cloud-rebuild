import { readFileSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

const html = readFileSync(join(process.cwd(), "public/tok-table-v2/index.html"), "utf8")
  .replace(/<script src="app\.js" defer><\/script>/, "");
const source = readFileSync(join(process.cwd(), "public/tok-table-v2/app.js"), "utf8");

const openDoms: JSDOM[] = [];

function createPointerEvent(
  window: JSDOM["window"],
  type: string,
  options: { pointerId: number; pointerType: string; clientX: number; clientY: number },
) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: options.clientX,
    clientY: options.clientY,
  });
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId },
    pointerType: { value: options.pointerType },
  });
  return event;
}

function createHarness() {
  const dom = new JSDOM(html, {
    url: "https://tok.test/tok-table-v2/index.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  openDoms.push(dom);
  const { window } = dom;
  const capturedPointers = new WeakMap<object, Set<number>>();

  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: class {
      observe() {}
      disconnect() {}
    },
  });
  Object.defineProperty(window, "scrollBy", { configurable: true, value: () => undefined });
  Object.defineProperty(window.HTMLElement.prototype, "scrollTo", { configurable: true, value: () => undefined });
  Object.defineProperty(window.HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value(pointerId: number) {
      const values = capturedPointers.get(this) || new Set<number>();
      values.add(pointerId);
      capturedPointers.set(this, values);
    },
  });
  Object.defineProperty(window.HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value(pointerId: number) {
      return capturedPointers.get(this)?.has(pointerId) || false;
    },
  });
  Object.defineProperty(window.HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value(pointerId: number) {
      capturedPointers.get(this)?.delete(pointerId);
    },
  });
  Object.defineProperty(window.HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(window.HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
      this.dispatchEvent(new window.Event("close"));
    },
  });

  window.eval(source);
  const period = window.document.querySelector<HTMLSelectElement>("#service-period");
  if (period) {
    period.value = "soir";
    period.dispatchEvent(new window.Event("change", { bubbles: true }));
  }
  return dom;
}

afterEach(() => {
  openDoms.splice(0).forEach((dom) => dom.window.close());
});

describe("floor plan v2 service interactions", () => {
  it("drags a client with touch Pointer Events onto a compatible table", () => {
    const dom = createHarness();
    const { document } = dom.window;
    const handle = document.querySelector<HTMLElement>('[data-action="drag-reservation"][data-reservation-id="r1"]');
    const target = document.querySelector<HTMLElement>('[data-table-id="t2"]');
    expect(handle).not.toBeNull();
    expect(target).not.toBeNull();

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => target,
    });
    handle!.dispatchEvent(createPointerEvent(dom.window, "pointerdown", {
      pointerId: 7,
      pointerType: "touch",
      clientX: 20,
      clientY: 20,
    }));
    dom.window.dispatchEvent(createPointerEvent(dom.window, "pointermove", {
      pointerId: 7,
      pointerType: "touch",
      clientX: 140,
      clientY: 180,
    }));
    dom.window.dispatchEvent(createPointerEvent(dom.window, "pointerup", {
      pointerId: 7,
      pointerType: "touch",
      clientX: 140,
      clientY: 180,
    }));

    const card = document.querySelector('[data-reservation-id="r1"]');
    expect(card?.textContent).toContain("T2");
    expect(document.querySelector(".reservation-drag-ghost")).toBeNull();
    expect(target?.classList.contains("drag-over")).toBe(false);
  });

  it("opens a consultable table sheet and updates reservation status", () => {
    const dom = createHarness();
    const { document } = dom.window;
    const table = document.querySelector<HTMLElement>('[data-table-id="t1"]');
    expect(table).not.toBeNull();

    table!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, detail: 0 }));
    expect(document.querySelector("#service-table-modal")?.hasAttribute("open")).toBe(true);
    expect(document.querySelector("#service-table-content")?.textContent).toContain("Cette table est libre");

    const status = document.querySelector<HTMLSelectElement>('[data-action="reservation-status"][data-reservation-id="r1"]');
    expect(status).not.toBeNull();
    status!.value = "arrived";
    status!.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(document.querySelector('[data-reservation-id="r1"]')?.textContent).toContain("Arrivé");
  });
});
