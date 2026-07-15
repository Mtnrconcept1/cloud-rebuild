import { readFileSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

const html = readFileSync(join(process.cwd(), "public/tok-table-v2/index.html"), "utf8");
const script = readFileSync(join(process.cwd(), "public/tok-table-v2/app.js"), "utf8");
const openWindows: JSDOM[] = [];

function bootEditor({ connected = false } = {}) {
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: `http://localhost/tok-table-v2/index.html${connected ? "?connected=1" : ""}`,
    pretendToBeVisual: true,
  });
  openWindows.push(dom);
  const { window } = dom;

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: ResizeObserverMock });
  Object.defineProperty(window.HTMLElement.prototype, "inert", {
    configurable: true,
    get() { return this.hasAttribute("inert"); },
    set(value: boolean) { this.toggleAttribute("inert", value); },
  });
  Object.defineProperty(window.HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(window.HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement, returnValue = "") {
      if (!this.open) return;
      this.returnValue = returnValue;
      this.removeAttribute("open");
      this.dispatchEvent(new window.Event("close"));
    },
  });
  Object.defineProperty(window.HTMLFormElement.prototype, "reportValidity", {
    configurable: true,
    value(this: HTMLFormElement) {
      return this.checkValidity();
    },
  });

  window.eval(`${script}\n;window.__floorPlanV2Test = {
    state: () => clone(state),
    history: () => clone(history),
    pendingOperation: () => pendingOperation ? clone(pendingOperation) : null,
    revisionConflicts: () => clone(remoteRevisionConflicts),
    tryCommitEmpty: () => commitTables([], state.tables)
  };`);
  return window;
}

function editorDebug(window: Window) {
  return (window as Window & { __floorPlanV2Test: {
    state: () => any;
    history: () => any;
    pendingOperation: () => any;
    revisionConflicts: () => Record<string, string | null>;
    tryCommitEmpty: () => boolean;
  } }).__floorPlanV2Test;
}

function click(window: Window, selector: string, root: ParentNode = window.document) {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Élément introuvable: ${selector}`);
  element.click();
  return element;
}

function sendDashboardMessage(window: Window, type: string, payload: Record<string, unknown>) {
  window.dispatchEvent(new window.MessageEvent("message", {
    origin: window.location.origin,
    source: window,
    data: { source: "tok-dashboard", type, payload },
  }));
}

function hydrateEditor(window: Window, overrides: Record<string, unknown> = {}) {
  const table = {
    id: "real-table-1",
    name: "Réelle 1",
    capacity: 4,
    zone: "Salle réelle",
    shape: "round",
    x: 20,
    y: 20,
    blocked: false,
    editable: true,
    kind: "table",
  };
  sendDashboardMessage(window, "tok-table-v2:hydrate", {
    protocolVersion: 2,
    branchId: "branch-1",
    selectedDate: "2026-07-15",
    selectedPeriod: "soir",
    templateTables: [table],
    serviceTables: [table],
    furniture: [],
    reservations: [],
    variants: [],
    templateRevision: "template-r1",
    serviceRevision: "service-r1",
    ...overrides,
  });
}

afterEach(() => {
  openWindows.splice(0).forEach((dom) => dom.window.close());
});

describe("floor plan v2 modal runtime", () => {
  it("always allows cancel, close, Escape and backdrop despite invalid required fields", () => {
    const window = bootEditor();
    click(window, "#mode-template-button");
    click(window, "#add-table-button");

    const dialog = window.document.querySelector<HTMLDialogElement>("#table-modal")!;
    const name = dialog.querySelector<HTMLInputElement>('input[name="name"]')!;
    name.value = "";
    click(window, '[data-dialog-close]', dialog);
    expect(dialog.open).toBe(false);

    click(window, "#add-table-button");
    name.value = "";
    click(window, "#apply-table-button", dialog);
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("#table-modal-error")?.classList.contains("hidden")).toBe(false);
    click(window, '[data-dialog-close]', dialog);
    expect(dialog.open).toBe(false);

    click(window, "#add-table-button");
    const cancelEvent = new window.Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);

    click(window, "#add-table-button");
    dialog.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(dialog.open).toBe(false);
  });

  it("does not add a staged furniture object when its modal is cancelled", () => {
    const window = bootEditor();
    click(window, "#mode-template-button");
    const before = window.document.querySelectorAll(".table-node.furniture").length;

    click(window, '[data-furniture-type="plant"]');
    const dialog = window.document.querySelector<HTMLDialogElement>("#furniture-modal")!;
    expect(dialog.open).toBe(true);
    expect(window.document.querySelectorAll(".table-node.furniture")).toHaveLength(before);

    click(window, '[data-dialog-close]', dialog);
    expect(dialog.open).toBe(false);
    expect(window.document.querySelectorAll(".table-node.furniture")).toHaveLength(before);
    expect(window.document.body.classList.contains("dirty")).toBe(false);
  });

  it("clears a cancelled confirmation so an old destructive action cannot run", () => {
    const window = bootEditor();
    click(window, "#mode-template-button");
    const before = window.document.querySelectorAll(".table-node").length;
    click(window, '.table-node[data-table-id="t1"]');
    click(window, "#delete-table-button");

    const confirm = window.document.querySelector<HTMLDialogElement>("#confirm-modal")!;
    expect(confirm.open).toBe(true);
    click(window, '[data-dialog-close]', confirm);
    expect(confirm.open).toBe(false);

    confirm.returnValue = "default";
    confirm.dispatchEvent(new window.Event("close"));
    click(window, "#confirm-action-button", confirm);
    expect(window.document.querySelectorAll(".table-node")).toHaveLength(before);
    expect(window.document.body.classList.contains("dirty")).toBe(false);
  });

  it("stays inert until the first hydrate uses the supported bridge protocol", () => {
    const window = bootEditor({ connected: true });
    const shell = window.document.querySelector<HTMLElement>(".app-shell")!;
    const templateButton = window.document.querySelector<HTMLButtonElement>("#mode-template-button")!;
    expect(shell.inert).toBe(true);
    expect(templateButton.disabled).toBe(true);

    templateButton.disabled = false;
    templateButton.click();
    expect(window.document.body.classList.contains("template-mode")).toBe(false);

    const hydrate = (protocolVersion: number) => window.dispatchEvent(new window.MessageEvent("message", {
      origin: window.location.origin,
      source: window,
      data: {
        source: "tok-dashboard",
        type: "tok-table-v2:hydrate",
        payload: {
          protocolVersion,
          branchId: "branch-1",
          selectedDate: "2026-07-15",
          selectedPeriod: "soir",
          templateTables: [{
            id: "real-table-1",
            name: "Réelle 1",
            capacity: 4,
            zone: "Salle réelle",
            shape: "round",
            x: 20,
            y: 20,
            blocked: false,
            editable: true,
            kind: "table",
          }],
          serviceTables: [{
            id: "real-table-1",
            name: "Réelle 1",
            capacity: 4,
            zone: "Salle réelle",
            shape: "round",
            x: 20,
            y: 20,
            blocked: false,
            editable: true,
            kind: "table",
          }],
          furniture: [],
          reservations: [],
          variants: [],
          templateRevision: "[]",
          serviceRevision: "{}",
        },
      },
    }));

    hydrate(1);
    expect(shell.inert).toBe(true);
    expect(window.document.querySelector('[data-table-id="real-table-1"]')).toBeNull();

    hydrate(2);
    expect(shell.inert).toBe(false);
    expect(window.document.querySelector('[data-table-id="real-table-1"]')).not.toBeNull();
    expect(window.document.querySelector('[data-table-id="t1"]')).toBeNull();
  });

  it("protects a dirty draft from a newer remote revision until a clean rehydrate", () => {
    const window = bootEditor({ connected: true });
    hydrateEditor(window);
    click(window, "#mode-template-button");
    click(window, '[data-table-id="real-table-1"]');
    const tableDialog = window.document.querySelector<HTMLDialogElement>("#table-modal")!;
    tableDialog.querySelector<HTMLInputElement>('input[name="name"]')!.value = "Brouillon local";
    click(window, "#apply-table-button", tableDialog);
    expect(window.document.body.classList.contains("dirty")).toBe(true);

    hydrateEditor(window, {
      templateRevision: "template-r2",
      templateTables: [{
        id: "real-table-1",
        name: "Version distante",
        capacity: 6,
        zone: "Salle réelle",
        shape: "square",
        x: 40,
        y: 40,
        blocked: false,
        editable: true,
        kind: "table",
      }],
    });

    expect(editorDebug(window).state().templateRevision).toBe("template-r1");
    expect(editorDebug(window).state().serverTemplateTables[0].name).toBe("Réelle 1");
    expect(editorDebug(window).state().tables[0].name).toBe("Brouillon local");
    expect(editorDebug(window).revisionConflicts().template).toBe("template-r2");

    click(window, "#save-plan-button");
    expect(editorDebug(window).pendingOperation()).toBeNull();
    expect(window.document.querySelector("#toast-region")?.textContent).toContain("modifié ailleurs");

    click(window, "#cancel-changes-button");
    expect(window.document.body.classList.contains("dirty")).toBe(false);
    hydrateEditor(window, {
      templateRevision: "template-r2",
      templateTables: [{
        id: "real-table-1",
        name: "Version distante",
        capacity: 6,
        zone: "Salle réelle",
        shape: "square",
        x: 40,
        y: 40,
        blocked: false,
        editable: true,
        kind: "table",
      }],
    });

    expect(editorDebug(window).state().templateRevision).toBe("template-r2");
    expect(editorDebug(window).revisionConflicts().template).toBeNull();
    expect(editorDebug(window).state().tables[0].name).toBe("Version distante");
  });

  it("keeps the exact submitted snapshot while a save and a remote hydrate race", () => {
    const window = bootEditor({ connected: true });
    hydrateEditor(window);
    click(window, "#mode-template-button");
    click(window, '[data-table-id="real-table-1"]');
    const tableDialog = window.document.querySelector<HTMLDialogElement>("#table-modal")!;
    tableDialog.querySelector<HTMLInputElement>('input[name="name"]')!.value = "Instantané envoyé";
    click(window, "#apply-table-button", tableDialog);
    click(window, "#save-plan-button");
    const requestId = String(editorDebug(window).pendingOperation().requestId);

    hydrateEditor(window, {
      templateRevision: "template-r2",
      templateTables: [{
        id: "real-table-1",
        name: "Hydratation concurrente",
        capacity: 8,
        zone: "Salle réelle",
        shape: "rectangle",
        x: 60,
        y: 60,
        blocked: false,
        editable: true,
        kind: "table",
      }],
    });

    expect(editorDebug(window).state().templateRevision).toBe("template-r1");
    expect(editorDebug(window).state().serverTemplateTables[0].name).toBe("Réelle 1");
    expect(editorDebug(window).state().tables[0].name).toBe("Instantané envoyé");
    expect(editorDebug(window).tryCommitEmpty()).toBe(false);
    expect(editorDebug(window).state().tables[0].name).toBe("Instantané envoyé");

    sendDashboardMessage(window, "tok-table-v2:operation-success", {
      requestId,
      kind: "template",
      templateRevision: "template-r2",
      idMap: {},
    });

    expect(editorDebug(window).pendingOperation()).toBeNull();
    expect(editorDebug(window).state().templateRevision).toBe("template-r2");
    expect(editorDebug(window).state().serverTemplateTables[0].name).toBe("Instantané envoyé");
    expect(editorDebug(window).history().baseline[0].name).toBe("Instantané envoyé");
    expect(window.document.body.classList.contains("dirty")).toBe(false);
  });

  it("reuses a variant request id only for the same name and plan snapshot", () => {
    const window = bootEditor({ connected: true });
    hydrateEditor(window);
    click(window, "#mode-template-button");
    click(window, "#save-variant-button");
    const variantDialog = window.document.querySelector<HTMLDialogElement>("#variant-modal")!;
    variantDialog.querySelector<HTMLInputElement>('input[name="name"]')!.value = "Plan du soir";
    click(window, "#apply-variant-button", variantDialog);
    const firstRequestId = String(editorDebug(window).pendingOperation().requestId);

    sendDashboardMessage(window, "tok-table-v2:operation-error", {
      requestId: firstRequestId,
      kind: "variant",
      message: "Délai dépassé",
    });
    click(window, "#apply-variant-button", variantDialog);
    const replayedRequestId = String(editorDebug(window).pendingOperation().requestId);
    expect(replayedRequestId).toBe(firstRequestId);

    sendDashboardMessage(window, "tok-table-v2:operation-error", {
      requestId: replayedRequestId,
      kind: "variant",
      message: "Toujours indisponible",
    });
    variantDialog.querySelector<HTMLInputElement>('input[name="name"]')!.value = "Plan du lendemain";
    click(window, "#apply-variant-button", variantDialog);
    expect(String(editorDebug(window).pendingOperation().requestId)).not.toBe(firstRequestId);
  });
});
