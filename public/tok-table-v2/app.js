"use strict";

const STORAGE_KEY = "tok-table-v2";
const BRIDGE_SOURCE = "tok-table-v2";
const CANVAS_WIDTH = 1040;
const CANVAS_HEIGHT = 760;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.1;
const HISTORY_LIMIT = 40;
const DEFAULT_RESERVATION_DURATION_MINUTES = 120;
const SERVICE_AUTOSAVE_DELAY_MS = 900;
const SERVICE_AUTOSAVE_MAX_DELAY_MS = 12_000;
const SERVICE_AUTOSAVE_MAX_FAILURES = 3;
const OPERATION_TIMEOUT_MS = 60_000;
const BRIDGE_PROTOCOL_VERSION = 2;
const EXPECTS_DASHBOARD_HYDRATION = new URLSearchParams(window.location.search).get("connected") === "1";
const EDITABLE_RESERVATION_STATUSES = Object.freeze(["pending", "confirmed", "arrived", "seated", "no_show"]);
const ACTIVE_OCCUPANCY_STATUSES = new Set(["seated", "installed", "occupied", "order_taken", "served", "dessert", "bill_requested"]);

const FURNITURE_LIBRARY = Object.freeze({
  wall: { label: "Paroi", icon: "▰", width: 180, height: 24 },
  door: { label: "Porte d’entrée", icon: "↪", width: 84, height: 24 },
  window: { label: "Fenêtre", icon: "▭", width: 120, height: 24 },
  bar: { label: "Bar", icon: "▤", width: 220, height: 72 },
  plant: { label: "Plante", icon: "✿", width: 52, height: 52 },
  service_station: { label: "Station de service", icon: "▦", width: 100, height: 60 },
  host_stand: { label: "Accueil", icon: "⌂", width: 70, height: 55 },
  buffet: { label: "Buffet", icon: "▥", width: 140, height: 60 },
  sofa: { label: "Banquette", icon: "▰", width: 150, height: 70 },
  divider: { label: "Séparateur", icon: "━", width: 140, height: 24 }
});
const FURNITURE_TYPES = Object.freeze(Object.keys(FURNITURE_LIBRARY));

const todayIso = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

const sampleTables = () => [
  { id: "t1", name: "T1", capacity: 2, zone: "Salle principale", shape: "round", x: 8, y: 10, blocked: false, editable: true, kind: "table" },
  { id: "t2", name: "T2", capacity: 4, zone: "Salle principale", shape: "square", x: 28, y: 10, blocked: false, editable: true, kind: "table" },
  { id: "t3", name: "T3", capacity: 6, zone: "Salle principale", shape: "rectangle", x: 52, y: 10, blocked: false, editable: true, kind: "table" },
  { id: "t4", name: "T4", capacity: 4, zone: "Salle principale", shape: "round", x: 10, y: 38, blocked: false, editable: true, kind: "table" },
  { id: "t5", name: "T5", capacity: 8, zone: "Salle principale", shape: "rectangle", x: 38, y: 40, blocked: false, editable: true, kind: "table" },
  { id: "t6", name: "T6", capacity: 4, zone: "Terrasse", shape: "square", x: 10, y: 12, blocked: false, editable: true, kind: "table" },
  { id: "t7", name: "T7", capacity: 2, zone: "Terrasse", shape: "round", x: 36, y: 12, blocked: false, editable: true, kind: "table" }
];

const sampleReservations = () => [
  { id: "r1", name: "Famille Martin", size: 4, time: "19:30", date: todayIso(), period: "soir", preferredZone: "Salle principale", note: "Chaise bébé", durationMinutes: 120, tableId: null, status: "confirmed" },
  { id: "r2", name: "Sophie Bernard", size: 2, time: "19:45", date: todayIso(), period: "soir", preferredZone: "Terrasse", note: "", durationMinutes: 120, tableId: null, status: "confirmed" },
  { id: "r3", name: "Groupe Dubois", size: 7, time: "20:00", date: todayIso(), period: "soir", preferredZone: "", note: "Anniversaire", durationMinutes: 120, tableId: null, status: "confirmed" }
];

const initialState = () => {
  const tables = sampleTables();
  return {
    connected: false,
    branchId: null,
    mode: "service",
    selectedDate: todayIso(),
    selectedPeriod: new Date().getHours() < 16 ? "midi" : "soir",
    selectedZone: "Salle principale",
    tables: clone(tables),
    serverTemplateTables: clone(tables),
    serverServiceTables: clone(tables),
    reservations: sampleReservations(),
    recommendations: {},
    variants: [],
    activeVariantId: "current",
    templateRevision: "",
    serviceRevision: "",
    dirty: false
  };
};

let state = loadState();
let awaitingHydration = EXPECTS_DASHBOARD_HYDRATION;
let history = { past: [], future: [], baseline: clone(state.tables) };
let assignmentHistory = { past: [], future: [], context: "local" };
let selectedReservationId = null;
let dragState = null;
let dragFrame = 0;
let canvasZoom = 1;
let zoomWasChanged = false;
let pendingOperation = null;
let pendingAssignment = null;
let pendingStatusChange = null;
let pendingConfirmAction = null;
let pendingFurnitureDraft = null;
let reservationPointerDrag = null;
let reservationPointerFrame = 0;
let serviceAutosaveTimer = null;
let serviceAutosaveFailures = 0;
let operationTimeout = null;
let retryableSaveOperation = null;
let remoteRevisionConflicts = { template: null, "service-layout": null };
let selectedServiceTableId = null;
const viewportPointers = new Map();
let viewportGesture = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
  appShell: $(".app-shell"),
  date: $("#service-date"),
  period: $("#service-period"),
  floorSummary: $("#floor-summary"),
  floorModeLabel: $("#floor-mode-label"),
  clientSummary: $("#client-summary"),
  zones: $("#zone-tabs"),
  floor: $("#floor"),
  floorViewport: $("#floor-viewport"),
  floorStage: $("#floor-stage"),
  floorEmpty: $("#floor-empty"),
  reservationList: $("#reservation-list"),
  search: $("#reservation-search"),
  filter: $("#reservation-filter"),
  placementBanner: $("#placement-banner"),
  placementTitle: $("#placement-title"),
  placementCopy: $("#placement-copy"),
  tableModal: $("#table-modal"),
  tableForm: $("#table-form"),
  tableModalError: $("#table-modal-error"),
  furnitureLibrary: $("#furniture-library"),
  furniturePalette: $("#furniture-palette"),
  furnitureModal: $("#furniture-modal"),
  furnitureForm: $("#furniture-form"),
  furnitureModalError: $("#furniture-modal-error"),
  furnitureTypeInput: $("#furniture-type-input"),
  furnitureRotationRange: $("#furniture-rotation-range"),
  furnitureRotationInput: $("#furniture-rotation-input"),
  furnitureRotationOutput: $("#furniture-rotation-output"),
  capacityDecreaseButton: $("#capacity-decrease-button"),
  capacityIncreaseButton: $("#capacity-increase-button"),
  tableCapacityInput: $("#table-capacity-input"),
  assignmentAutosaveNote: $("#assignment-autosave-note"),
  serviceTableModal: $("#service-table-modal"),
  serviceTableContent: $("#service-table-content"),
  variantSelect: $("#variant-select"),
  saveVariantButton: $("#save-variant-button"),
  variantModal: $("#variant-modal"),
  variantForm: $("#variant-form"),
  variantModalError: $("#variant-modal-error"),
  variantModalProgress: $("#variant-modal-progress"),
  confirmModal: $("#confirm-modal"),
  toastRegion: $("#toast-region"),
  zoomValue: $("#zoom-value"),
  connectionLabel: $("#connection-label"),
  dragHint: $("#drag-hint"),
  saveButton: $("#save-plan-button"),
  cancelChangesButton: $("#cancel-changes-button"),
  undoButton: $("#undo-button"),
  redoButton: $("#redo-button"),
  autoPlaceButton: $("#auto-place-button"),
  modeServiceButton: $("#mode-service-button"),
  modeTemplateButton: $("#mode-template-button")
};

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || !Array.isArray(parsed.tables) || !Array.isArray(parsed.reservations)) return initialState();
    const fallback = initialState();
    const tables = sanitizeTables(parsed.tables);
    const reservations = sanitizeReservations(parsed.reservations, tables, parsed.selectedDate || fallback.selectedDate);
    return {
      ...fallback,
      mode: parsed.mode === "template" ? "template" : "service",
      selectedDate: /^\d{4}-\d{2}-\d{2}$/.test(parsed.selectedDate) ? parsed.selectedDate : fallback.selectedDate,
      selectedPeriod: parsed.selectedPeriod === "midi" ? "midi" : "soir",
      selectedZone: String(parsed.selectedZone || tables[0]?.zone || "Salle principale"),
      tables: clone(tables),
      serverTemplateTables: clone(tables),
      serverServiceTables: clone(tables),
      reservations,
      recommendations: {},
      variants: [],
      activeVariantId: "current",
      templateRevision: "",
      serviceRevision: "",
      dirty: false
    };
  } catch {
    return initialState();
  }
}

function saveState() {
  if (state.connected) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    mode: state.mode,
    selectedDate: state.selectedDate,
    selectedPeriod: state.selectedPeriod,
    selectedZone: state.selectedZone,
    tables: state.tables,
    reservations: state.reservations
  }));
}

function sanitizeTables(input) {
  if (!Array.isArray(input)) return [];
  const seenIds = new Set();
  return input.flatMap((raw, index) => {
    const id = String(raw?.id || "").trim();
    if (!id || seenIds.has(id)) return [];
    seenIds.add(id);

    const rawKind = String(raw?.kind || "table");
    const editable = raw?.editable !== false && rawKind === "table";
    const kind = editable || FURNITURE_TYPES.includes(rawKind) ? rawKind : "divider";
    const furnitureDefaults = FURNITURE_LIBRARY[kind] || FURNITURE_LIBRARY.divider;
    const width = editable ? undefined : Math.max(24, Math.min(520, Math.round(Number(raw?.width) || furnitureDefaults.width)));
    const height = editable ? undefined : Math.max(16, Math.min(360, Math.round(Number(raw?.height) || furnitureDefaults.height)));
    const rawX = Number(raw?.x);
    const rawY = Number(raw?.y);
    const maxX = editable ? 94 : Math.max(0, ((CANVAS_WIDTH - width) / CANVAS_WIDTH) * 100);
    const maxY = editable ? 86 : Math.max(0, ((CANVAS_HEIGHT - height) / CANVAS_HEIGHT) * 100);

    return [{
      id,
      name: String(raw?.name || (editable ? `T${index + 1}` : furnitureDefaults.label)).trim().slice(0, 40)
        || (editable ? `T${index + 1}` : furnitureDefaults.label),
      capacity: editable ? Math.max(1, Math.min(30, Math.round(Number(raw?.capacity) || 1))) : 0,
      zone: String(raw?.zone || "Salle principale").trim().slice(0, 60) || "Salle principale",
      shape: editable && ["round", "square", "rectangle"].includes(raw?.shape) ? raw.shape : "rectangle",
      x: Math.max(0, Math.min(maxX, Number.isFinite(rawX) ? rawX : 0)),
      y: Math.max(0, Math.min(maxY, Number.isFinite(rawY) ? rawY : 0)),
      blocked: editable ? Boolean(raw?.blocked) : false,
      editable,
      kind,
      width,
      height,
      rotation: editable ? 0 : ((Math.round(Number(raw?.rotation) || 0) % 360) + 360) % 360,
      locked: editable ? false : raw?.locked === true,
      zIndex: editable ? 0 : Math.max(-100, Math.min(100, Math.round(Number(raw?.zIndex) || 0)))
    }];
  });
}

function sanitizeReservations(input, tables, selectedDate) {
  if (!Array.isArray(input)) return [];
  const tableIds = new Set(tables.filter((table) => table.editable).map((table) => table.id));
  return input.flatMap((raw) => {
    const id = String(raw?.id || "").trim();
    if (!id) return [];
    return [{
      id,
      name: String(raw?.name || "Client sans nom").trim().slice(0, 80) || "Client sans nom",
      size: Math.max(1, Math.min(30, Math.round(Number(raw?.size) || 1))),
      time: /^\d{2}:\d{2}/.test(String(raw?.time || "")) ? String(raw.time).slice(0, 5) : "00:00",
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.date || "")) ? String(raw.date) : selectedDate,
      period: raw?.period === "midi" ? "midi" : "soir",
      preferredZone: String(raw?.preferredZone || "").slice(0, 60),
      note: String(raw?.note || "").slice(0, 240),
      durationMinutes: Math.max(30, Number(raw?.durationMinutes) || DEFAULT_RESERVATION_DURATION_MINUTES),
      tableId: tableIds.has(raw?.tableId) ? raw.tableId : null,
      status: String(raw?.status || "pending"),
      feature: String(raw?.feature || "standard").slice(0, 60),
      miamzPriority: Math.max(0, Math.round(Number(raw?.miamzPriority) || 0))
    }];
  });
}

function sanitizeRecommendations(input, tables, reservations) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const tableIds = new Set(tables.filter((table) => table.editable).map((table) => table.id));
  const reservationIds = new Set(reservations.map((reservation) => reservation.id));
  return Object.fromEntries(Object.entries(input).flatMap(([reservationId, raw]) => {
    if (!reservationIds.has(reservationId) || !raw || typeof raw !== "object") return [];
    const tableId = String(raw.tableId || "");
    if (!tableIds.has(tableId)) return [];
    return [[reservationId, {
      tableId,
      tableName: String(raw.tableName || "Table").slice(0, 40),
      score: Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0))),
      wastedSeats: Math.max(0, Math.round(Number(raw.wastedSeats) || 0)),
      reasons: Array.isArray(raw.reasons)
        ? raw.reasons.filter((reason) => typeof reason === "string").slice(0, 4)
        : []
    }]];
  }));
}

function sanitizeVariants(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  return input.flatMap((raw) => {
    const id = String(raw?.id || "").trim();
    const name = String(raw?.name || "").trim();
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: name.slice(0, 80) }];
  });
}

function postToDashboard(type, payload = {}) {
  if (window.parent === window) return;
  window.parent.postMessage({ source: BRIDGE_SOURCE, type, payload }, window.location.origin);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function notifyEditorLock() {
  if (!state.connected) return;
  postToDashboard("tok-table-v2:editor-lock", {
    locked: $$("dialog").some((dialog) => dialog.open)
  });
}

function clearModalError(dialog) {
  const error = dialog?.querySelector(".modal-error");
  if (!error) return;
  error.textContent = "";
  error.classList.add("hidden");
}

function showModalError(dialog, message, field = null) {
  const error = dialog?.querySelector(".modal-error");
  if (error) {
    error.textContent = message;
    error.classList.remove("hidden");
  }
  field?.focus?.({ preventScroll: true });
}

function setDialogBusy(dialog, busy) {
  if (!dialog) return;
  dialog.setAttribute("aria-busy", String(Boolean(busy)));
  $$('button, input, select, textarea', dialog).forEach((control) => {
    control.disabled = Boolean(busy);
  });
}

function safeShowModal(dialog) {
  if (!dialog) return false;
  clearModalError(dialog);
  dialog.returnValue = "cancel";
  if (!dialog.open) dialog.showModal();
  window.setTimeout(notifyEditorLock, 0);
  return true;
}

function closeDialog(dialog, returnValue = "cancel") {
  if (!dialog?.open || dialog.getAttribute("aria-busy") === "true") return false;
  dialog.close(returnValue);
  return true;
}

function closeAllDialogs() {
  $$("dialog").forEach((dialog) => {
    if (!dialog.open) return;
    dialog.removeAttribute("aria-busy");
    dialog.close("cancel");
  });
}

function bindDialog(dialog) {
  if (!dialog) return;
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog(dialog, "cancel");
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog(dialog, "cancel");
  });
  $$('[data-dialog-close]', dialog).forEach((button) => {
    button.addEventListener("click", () => closeDialog(dialog, "cancel"));
  });
  dialog.addEventListener("close", () => {
    clearModalError(dialog);
    if (dialog === elements.furnitureModal) pendingFurnitureDraft = null;
    window.setTimeout(notifyEditorLock, 0);
  });
}

function bindEnterAction(form, action) {
  form?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    if (event.target.closest?.("button, select, textarea")) return;
    event.preventDefault();
    action();
  });
}

function editableTables(tables = state.tables) {
  return tables.filter((table) => table.editable);
}

function tableSignature(tables) {
  return JSON.stringify(tables
    .map((table) => ({
      id: table.id,
      name: table.name,
      capacity: table.capacity,
      zone: table.zone,
      shape: table.shape,
      x: Math.round(table.x * 1000) / 1000,
      y: Math.round(table.y * 1000) / 1000,
      blocked: table.blocked,
      editable: table.editable,
      kind: table.kind,
      width: table.editable ? null : table.width,
      height: table.editable ? null : table.height,
      rotation: table.editable ? null : table.rotation,
      locked: table.editable ? null : table.locked,
      zIndex: table.editable ? null : table.zIndex
    }))
    .sort((left, right) => left.id.localeCompare(right.id)));
}

function setDirty(nextDirty) {
  const dirty = Boolean(nextDirty);
  if (state.dirty === dirty) return;
  state.dirty = dirty;
  document.body.classList.toggle("dirty", dirty);
  if (state.connected) postToDashboard("tok-table-v2:dirty-change", { dirty });
}

function updateDirty() {
  setDirty(tableSignature(state.tables) !== tableSignature(history.baseline));
}

function currentPersistenceKind() {
  return state.mode === "template" ? "template" : "service-layout";
}

function hasCurrentRevisionConflict() {
  return Boolean(remoteRevisionConflicts[currentPersistenceKind()]);
}

function clearRevisionConflict(kind) {
  if (!Object.hasOwn(remoteRevisionConflicts, kind)) return;
  remoteRevisionConflicts[kind] = null;
}

function showRevisionConflict() {
  clearServiceAutosave();
  document.body.classList.add("sync-error");
  renderControls();
  showToast(
    "Ce plan a été modifié ailleurs. Annulez votre brouillon puis actualisez pour repartir de la dernière version.",
    "warning"
  );
}

function blockDraftMutationWhileSaving(dialog = null) {
  if (!pendingOperation) return false;
  const message = "Attendez la fin de l’enregistrement avant de modifier le plan.";
  if (dialog) showModalError(dialog, message);
  showToast(message, "warning");
  return true;
}

function clearServiceAutosave() {
  if (!serviceAutosaveTimer) return;
  window.clearTimeout(serviceAutosaveTimer);
  serviceAutosaveTimer = null;
}

function scheduleServiceAutosave() {
  clearServiceAutosave();
  if (
    state.mode !== "service"
    || !state.dirty
    || hasCurrentRevisionConflict()
    || serviceAutosaveFailures >= SERVICE_AUTOSAVE_MAX_FAILURES
  ) return;
  const retryDelay = Math.min(
    SERVICE_AUTOSAVE_MAX_DELAY_MS,
    SERVICE_AUTOSAVE_DELAY_MS * (2 ** serviceAutosaveFailures)
  );
  serviceAutosaveTimer = window.setTimeout(() => {
    serviceAutosaveTimer = null;
    if (pendingOperation || dragState || reservationPointerDrag) {
      scheduleServiceAutosave();
      return;
    }
    savePlan({ automatic: true });
  }, retryDelay);
}

function resetHistory(tables) {
  history = { past: [], future: [], baseline: clone(tables) };
  setDirty(false);
}

function commitTables(nextTables, beforeTables = state.tables) {
  if (awaitingHydration || pendingOperation) return false;
  if (tableSignature(nextTables) === tableSignature(beforeTables)) return false;
  retryableSaveOperation = null;
  history.past.push(clone(beforeTables));
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future = [];
  state.tables = clone(nextTables);
  serviceAutosaveFailures = 0;
  updateDirty();
  render();
  scheduleServiceAutosave();
  return true;
}

function undo() {
  if (pendingOperation) return;
  if (history.past.length) {
    history.future.unshift(clone(state.tables));
    state.tables = history.past.pop();
    updateDirty();
    render();
    scheduleServiceAutosave();
    return;
  }
  if (state.mode === "service" && assignmentHistory.past.length) {
    const action = assignmentHistory.past.pop();
    assignmentHistory.future.unshift(action);
    assignReservation(action.reservationId, action.fromTableId, { historyMode: "undo", historyAction: action });
  }
}

function redo() {
  if (pendingOperation) return;
  if (history.future.length) {
    history.past.push(clone(state.tables));
    state.tables = history.future.shift();
    updateDirty();
    render();
    scheduleServiceAutosave();
    return;
  }
  if (state.mode === "service" && assignmentHistory.future.length) {
    const action = assignmentHistory.future.shift();
    assignmentHistory.past.push(action);
    assignReservation(action.reservationId, action.toTableId, { historyMode: "redo", historyAction: action });
  }
}

function cancelChanges() {
  if (!state.dirty || pendingOperation) return;
  const needsCleanHydration = hasCurrentRevisionConflict();
  state.tables = clone(history.baseline);
  history.past = [];
  history.future = [];
  clearServiceAutosave();
  serviceAutosaveFailures = 0;
  retryableSaveOperation = null;
  setDirty(false);
  render();
  showToast(needsCleanHydration ? "Brouillon annulé · récupération de la version distante…" : "Modifications annulées.");
  if (needsCleanHydration && state.connected) postToDashboard("tok-table-v2:ready");
}

function zones() {
  const values = [...new Set(state.tables.map((table) => table.zone.trim()).filter(Boolean))];
  return values.length ? values.sort((a, b) => a.localeCompare(b, "fr")) : ["Salle principale"];
}

function serviceReservations() {
  return state.reservations
    .filter((reservation) => reservation.date === state.selectedDate && reservation.period === state.selectedPeriod)
    .sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name, "fr"));
}

function currentAssignmentMap() {
  const assignments = new Map();
  serviceReservations().filter((reservation) => reservation.tableId).forEach((reservation) => {
    const current = assignments.get(reservation.tableId) || [];
    current.push(reservation);
    assignments.set(reservation.tableId, current);
  });
  assignments.forEach((reservations) => reservations.sort((a, b) => a.time.localeCompare(b.time)));
  return assignments;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function reservationsConflict(left, right) {
  if (!left || !right || left.id === right.id || left.date !== right.date) return false;
  const leftStart = timeToMinutes(left.time);
  const rightStart = timeToMinutes(right.time);
  const leftDuration = Math.max(30, Number(left.durationMinutes) || DEFAULT_RESERVATION_DURATION_MINUTES);
  const rightDuration = Math.max(30, Number(right.durationMinutes) || DEFAULT_RESERVATION_DURATION_MINUTES);
  return leftStart < rightStart + rightDuration && rightStart < leftStart + leftDuration;
}

function getTablePlacementError(table, reservation, assignments = currentAssignmentMap()) {
  if (!table?.editable || table.blocked) return `${table?.name || "Cette table"} est indisponible.`;
  if (table.capacity < reservation.size) return `${table.name} n’a que ${table.capacity} place${table.capacity > 1 ? "s" : ""}.`;
  const conflict = (assignments.get(table.id) || []).find((candidate) => reservationsConflict(candidate, reservation));
  return conflict ? `${table.name} est déjà occupée autour de ${conflict.time}.` : "";
}

function tableCanHostReservation(table, reservation, assignments = currentAssignmentMap()) {
  return !getTablePlacementError(table, reservation, assignments);
}

function getReservationStatusLabel(status) {
  return ({
    pending: "En attente",
    confirmed: "Confirmé",
    arrived: "Arrivé",
    seated: "Installé",
    no_show: "No-show"
  })[String(status || "").toLowerCase()] || String(status || "Inconnu");
}

function getReservationStatusOptions(status) {
  return EDITABLE_RESERVATION_STATUSES.map((value) => (
    `<option value="${value}" ${value === status ? "selected" : ""}>${escapeHtml(getReservationStatusLabel(value))}</option>`
  )).join("");
}

function isToday(value, now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return value === local;
}

function addMinutesToTime(value, minutes) {
  const total = timeToMinutes(value) + Math.max(0, Number(minutes) || 0);
  const normalized = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function getTableServiceState(table, reservations, now = new Date()) {
  if (table.blocked) return { key: "blocked", label: "Indisponible", detail: null };
  if (!reservations.length) return { key: "free", label: "Libre", detail: null };

  const primary = reservations[0];
  const primaryStatus = String(primary.status || "pending").toLowerCase();
  if (primaryStatus === "no_show") return { key: "no-show", label: "No-show", detail: primary.time };

  const active = reservations.filter((reservation) => !["cancelled", "canceled", "no_show", "completed", "archived"].includes(String(reservation.status || "").toLowerCase()));
  if (!active.length) return { key: "free", label: "Libre", detail: null };
  const conflict = active.some((reservation, index) => active.slice(index + 1).some((candidate) => reservationsConflict(reservation, candidate)));
  if (conflict) return { key: "conflict", label: "Conflit horaire", detail: `${active.length} réservations` };

  const current = active[0];
  const status = String(current.status || "pending").toLowerCase();
  if (status === "arrived") return { key: "arrived", label: "Arrivé", detail: current.time };
  if (ACTIVE_OCCUPANCY_STATUSES.has(status)) {
    const releaseTime = addMinutesToTime(current.time, current.durationMinutes);
    const minutesUntilRelease = isToday(current.date, now)
      ? timeToMinutes(releaseTime) - (now.getHours() * 60 + now.getMinutes())
      : null;
    return minutesUntilRelease !== null && minutesUntilRelease >= 0 && minutesUntilRelease <= 15
      ? { key: "soon-free", label: "Bientôt libre", detail: `vers ${releaseTime}` }
      : { key: "occupied", label: "Occupée", detail: `libre vers ${releaseTime}` };
  }
  if (String(current.feature || "").toLowerCase().replace(/[_\s]+/g, "-") === "zero-attente") {
    return { key: "zero-attente", label: "Zéro Attente", detail: current.time };
  }
  const delay = isToday(current.date, now)
    ? now.getHours() * 60 + now.getMinutes() - timeToMinutes(current.time)
    : 0;
  if (delay >= 15 && ["confirmed", "pending"].includes(status)) {
    return { key: "late", label: "Retard", detail: `${delay} min` };
  }
  return { key: "upcoming", label: "Réservée", detail: current.time };
}

function getReservationRecommendation(reservationId) {
  const recommendation = state.recommendations?.[reservationId];
  if (!recommendation) return null;
  const table = state.tables.find((candidate) => candidate.id === recommendation.tableId && candidate.editable);
  return table ? { ...recommendation, tableName: table.name } : null;
}

function showToast(message, kind = "") {
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.textContent = message;
  elements.toastRegion.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

function render() {
  const availableZones = zones();
  if (!availableZones.includes(state.selectedZone)) state.selectedZone = availableZones[0];
  document.body.classList.toggle("connected-mode", Boolean(state.connected));
  document.body.classList.toggle("service-mode", state.mode === "service");
  document.body.classList.toggle("template-mode", state.mode === "template");
  document.body.classList.toggle("dirty", state.dirty);
  document.body.classList.toggle("saving", Boolean(pendingOperation));
  document.body.classList.toggle("awaiting-hydration", awaitingHydration);
  elements.date.value = state.selectedDate;
  elements.period.value = state.selectedPeriod;
  elements.modeServiceButton.classList.toggle("active", state.mode === "service");
  elements.modeServiceButton.setAttribute("aria-pressed", String(state.mode === "service"));
  elements.modeTemplateButton.classList.toggle("active", state.mode === "template");
  elements.modeTemplateButton.setAttribute("aria-pressed", String(state.mode === "template"));
  renderSummary();
  renderZones();
  renderVariants();
  renderFloor();
  renderReservations();
  renderPlacementBanner();
  renderControls();
  refreshZoneFields();
  if (selectedServiceTableId && elements.serviceTableModal?.open) renderServiceTableModal();
  saveState();
  window.requestAnimationFrame(() => syncCanvasZoom(true));
}

function renderSummary() {
  const reservations = serviceReservations();
  const assigned = reservations.filter((item) => item.tableId).length;
  const seats = editableTables().filter((table) => !table.blocked).reduce((sum, table) => sum + table.capacity, 0);
  elements.floorModeLabel.textContent = state.mode === "template" ? "MODÈLE DE SALLE" : "SERVICE";
  const furnitureCount = state.tables.filter((table) => !table.editable).length;
  elements.floorSummary.textContent = state.mode === "template"
    ? `${editableTables().length} table${editableTables().length > 1 ? "s" : ""} · ${seats} assise${seats > 1 ? "s" : ""} · ${furnitureCount} élément${furnitureCount > 1 ? "s" : ""}`
    : `${assigned}/${reservations.length} réservation${reservations.length > 1 ? "s" : ""} placée${assigned > 1 ? "s" : ""}`;
  elements.clientSummary.textContent = `${assigned}/${reservations.length} placée${assigned > 1 ? "s" : ""}`;
  elements.dragHint.textContent = state.mode === "template"
    ? "Déplacez tables et mobilier. Touchez un élément pour modifier ses assises, dimensions, rotation ou verrouillage."
    : "Glissez un client sur une table, ou sélectionnez-le puis touchez sa destination. Les placements sont enregistrés immédiatement.";
}

function renderControls() {
  if (elements.appShell) {
    elements.appShell.inert = awaitingHydration;
    elements.appShell.setAttribute("aria-busy", String(awaitingHydration));
  }
  const canUndoAssignment = state.mode === "service" && assignmentHistory.past.length > 0;
  const canRedoAssignment = state.mode === "service" && assignmentHistory.future.length > 0;
  elements.undoButton.disabled = awaitingHydration || (history.past.length === 0 && !canUndoAssignment) || Boolean(pendingOperation);
  elements.redoButton.disabled = awaitingHydration || (history.future.length === 0 && !canRedoAssignment) || Boolean(pendingOperation);
  elements.saveButton.disabled = awaitingHydration || !state.dirty || Boolean(pendingOperation);
  elements.cancelChangesButton.disabled = awaitingHydration || !state.dirty || Boolean(pendingOperation);
  elements.autoPlaceButton.disabled = awaitingHydration || Boolean(pendingOperation);
  elements.date.disabled = awaitingHydration || Boolean(pendingOperation);
  elements.period.disabled = awaitingHydration || Boolean(pendingOperation);
  elements.modeServiceButton.disabled = awaitingHydration || Boolean(pendingOperation);
  elements.modeTemplateButton.disabled = awaitingHydration || Boolean(pendingOperation);
  $("#add-table-button").disabled = awaitingHydration || Boolean(pendingOperation);
  $$('[data-furniture-type]', elements.furniturePalette).forEach((button) => {
    button.disabled = awaitingHydration || Boolean(pendingOperation);
  });
  if (elements.variantSelect) elements.variantSelect.disabled = awaitingHydration || Boolean(pendingOperation);
  if (elements.saveVariantButton) elements.saveVariantButton.disabled = awaitingHydration || Boolean(pendingOperation) || !state.connected;
  elements.saveButton.textContent = state.mode === "template" ? "Enregistrer le modèle" : "Enregistrer ce service";
  const variantSaving = pendingOperation?.kind === "variant";
  const serviceTableBusy = ["assignment", "reservation-status"].includes(pendingOperation?.kind);
  setDialogBusy(elements.variantModal, variantSaving);
  setDialogBusy(elements.serviceTableModal, serviceTableBusy);
  elements.variantModalProgress?.classList.toggle("hidden", !variantSaving);
  [
    "#apply-table-button",
    "#duplicate-table-button",
    "#delete-table-button",
    "#apply-furniture-button",
    "#duplicate-furniture-button",
    "#delete-furniture-button",
    "#apply-variant-button",
    "#confirm-action-button"
  ].forEach((selector) => {
    const control = $(selector);
    if (control) control.disabled = awaitingHydration || Boolean(pendingOperation);
  });

  if (awaitingHydration) {
    elements.connectionLabel.textContent = "Chargement sécurisé…";
  } else if (pendingOperation) {
    elements.connectionLabel.textContent = "Enregistrement…";
  } else if (hasCurrentRevisionConflict()) {
    elements.connectionLabel.textContent = "Conflit distant · actualisation requise";
  } else if (state.dirty) {
    elements.connectionLabel.textContent = state.mode === "service" ? "Enregistrement automatique…" : "Modifications à enregistrer";
  } else if (state.connected) {
    elements.connectionLabel.textContent = "Synchronisé";
  } else {
    elements.connectionLabel.textContent = "Sauvegarde locale";
  }
}

function renderVariants() {
  if (!elements.variantSelect) return;
  const activeExists = state.activeVariantId === "current"
    || state.variants.some((variant) => variant.id === state.activeVariantId);
  if (!activeExists) state.activeVariantId = "current";
  elements.variantSelect.innerHTML = [
    '<option value="current">Modèle actif</option>',
    ...state.variants.map((variant) => `<option value="${escapeHtml(variant.id)}">${escapeHtml(variant.name)}</option>`)
  ].join("");
  elements.variantSelect.value = state.activeVariantId;
}

function renderZones() {
  elements.zones.innerHTML = zones().map((zone) => {
    const count = state.tables.filter((table) => table.zone === zone && table.editable).length;
    return `<button class="zone-tab ${zone === state.selectedZone ? "active" : ""}" data-zone="${escapeHtml(zone)}" role="tab" aria-selected="${zone === state.selectedZone}">${escapeHtml(zone)} · ${count}</button>`;
  }).join("");
}

function getNodeDimensions(table) {
  if (!table.editable) return {
    width: Math.max(24, Math.min(520, Number(table.width) || 112)),
    height: Math.max(16, Math.min(360, Number(table.height) || 68))
  };
  return { width: table.shape === "rectangle" ? 132 : 92, height: 92 };
}

function getFurnitureIcon(kind) {
  return FURNITURE_LIBRARY[kind]?.icon || FURNITURE_LIBRARY.divider.icon;
}

function getChairMarkup(table) {
  if (!table.editable) return "";
  const distance = table.shape === "rectangle" ? -72 : -55;
  return Array.from({ length: table.capacity }, (_, index) => {
    const angle = (360 / table.capacity) * index;
    return `<i class="chair" aria-hidden="true" style="--chair-angle:${angle}deg;--chair-counter-angle:${-angle}deg;--chair-distance:${distance}px"></i>`;
  }).join("");
}

function renderFloor() {
  $$(".table-node", elements.floor).forEach((node) => node.remove());
  const assignments = currentAssignmentMap();
  const visibleTables = state.tables.filter((table) => table.zone === state.selectedZone);
  const selectedReservation = state.reservations.find((item) => item.id === selectedReservationId) || null;
  elements.floorEmpty.classList.toggle("hidden", visibleTables.length > 0);

  visibleTables.forEach((table) => {
    const reservations = table.editable ? assignments.get(table.id) || [] : [];
    const reservation = reservations[0] || null;
    const serviceState = table.editable ? getTableServiceState(table, reservations) : null;
    const guestLabel = reservations.length > 1
      ? `${reservation.name} +${reservations.length - 1}`
      : reservation?.name || "";
    const dimensions = getNodeDimensions(table);
    const maxX = CANVAS_WIDTH - dimensions.width - 2;
    const maxY = CANVAS_HEIGHT - dimensions.height - 2;
    const left = Math.max(2, Math.min(maxX, (table.x / 100) * CANVAS_WIDTH));
    const top = Math.max(2, Math.min(maxY, (table.y / 100) * CANVAS_HEIGHT));
    const placementError = selectedReservation && table.editable
      ? getTablePlacementError(table, selectedReservation, assignments)
      : "";
    const targetClass = selectedReservation && table.editable
      ? placementError ? "invalid-target" : "valid-target"
      : "";
    const currentClass = selectedReservation?.tableId === table.id ? "current-target" : "";
    const node = document.createElement("button");
    node.type = "button";
    node.className = `table-node ${table.shape} ${table.editable ? `service-${serviceState.key}` : "furniture"} ${table.locked ? "locked" : ""} ${table.blocked ? "blocked" : ""} ${targetClass} ${currentClass}`.trim();
    node.dataset.tableId = table.id;
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;

    if (table.editable) {
      node.setAttribute("aria-label", `${table.name}, ${table.capacity} places, ${serviceState.label}${reservation ? `, ${reservations.map((item) => item.name).join(", ")}` : ""}${placementError ? `, ${placementError}` : ""}`);
      node.innerHTML = `
        ${getChairMarkup(table)}
        <span class="table-state-chip">${escapeHtml(serviceState.label)}${serviceState.detail ? ` · ${escapeHtml(serviceState.detail)}` : ""}</span>
        <span class="table-name">${escapeHtml(table.name)}</span>
        <span class="table-capacity">${table.capacity} assise${table.capacity > 1 ? "s" : ""}</span>
        ${reservation ? `<span class="table-guest">${escapeHtml(guestLabel)}</span>` : ""}`;
    } else {
      node.dataset.objectType = table.kind;
      node.dataset.locked = String(Boolean(table.locked));
      node.style.width = `${dimensions.width}px`;
      node.style.height = `${dimensions.height}px`;
      node.style.setProperty("--object-rotation", `${Number(table.rotation) || 0}deg`);
      node.style.zIndex = String(Math.max(1, 4 + (Number(table.zIndex) || 0)));
      node.tabIndex = state.mode === "template" ? 0 : -1;
      node.setAttribute("aria-label", `${table.name}, ${FURNITURE_LIBRARY[table.kind]?.label || "mobilier"}${table.locked ? ", position verrouillée" : ""}`);
      node.innerHTML = `
        <span class="furniture-icon" aria-hidden="true">${escapeHtml(getFurnitureIcon(table.kind))}</span>
        <span class="furniture-label">${escapeHtml(table.name)}</span>`;
    }
    elements.floor.appendChild(node);
  });
}

function renderReservations() {
  const term = elements.search.value.trim().toLocaleLowerCase("fr");
  const mode = elements.filter.value;
  const reservations = serviceReservations().filter((reservation) => {
    const matchesSearch = !term || `${reservation.name} ${reservation.note}`.toLocaleLowerCase("fr").includes(term);
    const matchesMode = mode === "all" || (mode === "assigned" ? reservation.tableId : !reservation.tableId);
    return matchesSearch && matchesMode;
  });

  if (!reservations.length) {
    elements.reservationList.innerHTML = `<div class="empty-list">Aucune réservation ne correspond à ce filtre.</div>`;
    return;
  }

  elements.reservationList.innerHTML = reservations.map((reservation) => {
    const table = state.tables.find((item) => item.id === reservation.tableId);
    const recommendation = table ? null : getReservationRecommendation(reservation.id);
    const initials = reservation.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    const selected = reservation.id === selectedReservationId;
    return `
      <article class="reservation-card ${selected ? "selected" : ""}" draggable="true" data-reservation-id="${reservation.id}" aria-selected="${selected}">
        <span class="guest-avatar">${escapeHtml(initials)}</span>
        <div class="reservation-main">
          <div class="reservation-name">
            <strong>${escapeHtml(reservation.name)}</strong>
            <span class="status-tag reservation-status status-${escapeHtml(reservation.status)}">${escapeHtml(getReservationStatusLabel(reservation.status))}</span>
            <span class="status-tag ${table ? "assigned" : "unassigned"}">${table ? escapeHtml(table.name) : "À placer"}</span>
          </div>
          <div class="reservation-meta"><span>${escapeHtml(reservation.time)}</span><span>•</span><span>${reservation.size} convive${reservation.size > 1 ? "s" : ""}</span>${reservation.preferredZone ? `<span>•</span><span>${escapeHtml(reservation.preferredZone)}</span>` : ""}</div>
          ${reservation.note ? `<div class="reservation-note">${escapeHtml(reservation.note)}</div>` : ""}
          ${recommendation ? `<button class="recommendation-button" type="button" data-action="assign-recommended" data-reservation-id="${reservation.id}" data-table-id="${recommendation.tableId}" title="${escapeHtml(recommendation.reasons.join(" · "))}"><span aria-hidden="true">✦</span> Conseil ${escapeHtml(recommendation.tableName)} · ${recommendation.score}/100</button>` : ""}
        </div>
        <div class="reservation-actions">
          <select class="reservation-status-select" data-action="reservation-status" data-reservation-id="${reservation.id}" aria-label="Statut de ${escapeHtml(reservation.name)}">${getReservationStatusOptions(reservation.status)}</select>
          <div class="reservation-action-row">
            ${table ? `<button class="remove-assignment-button" type="button" data-action="unassign-reservation" data-reservation-id="${reservation.id}" aria-label="Retirer ${escapeHtml(reservation.name)} de ${escapeHtml(table.name)}">×</button>` : ""}
            <button class="assignment-button ${table ? "assigned" : ""}" type="button" data-action="select-reservation" data-reservation-id="${reservation.id}" aria-pressed="${selected}">${table ? "Déplacer" : "Placer"}</button>
            <button class="reservation-drag-handle" type="button" data-action="drag-reservation" data-reservation-id="${reservation.id}" aria-label="Glisser ${escapeHtml(reservation.name)} vers une table" title="Glisser vers une table"><span aria-hidden="true">⠿</span></button>
          </div>
        </div>
      </article>`;
  }).join("");
}

function renderPlacementBanner() {
  const reservation = state.reservations.find((item) => item.id === selectedReservationId);
  elements.placementBanner.classList.toggle("hidden", !reservation || state.mode !== "service");
  if (!reservation) return;
  const recommendation = getReservationRecommendation(reservation.id);
  elements.placementTitle.textContent = `Placer ${reservation.name}`;
  elements.placementCopy.textContent = recommendation
    ? `Conseil : ${recommendation.tableName} (${recommendation.score}/100). Touchez une table compatible ou glissez la carte.`
    : `Touchez une table compatible pour ${reservation.size} convive${reservation.size > 1 ? "s" : ""}.`;
  $("#unassign-button").classList.toggle("hidden", !reservation.tableId);
}

function refreshZoneFields() {
  $("#zone-list").innerHTML = zones().map((zone) => `<option value="${escapeHtml(zone)}"></option>`).join("");
}

function selectReservation(reservationId) {
  if (state.mode !== "service" || pendingOperation) return;
  selectedReservationId = selectedReservationId === reservationId ? null : reservationId;
  renderFloor();
  renderReservations();
  renderPlacementBanner();
}

function createRequestId(kind) {
  return `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function beginOperation(kind, requestId, options = {}) {
  clearServiceAutosave();
  if (operationTimeout) window.clearTimeout(operationTimeout);
  pendingOperation = {
    kind,
    requestId,
    automatic: options.automatic === true,
    baseRevision: String(options.baseRevision || ""),
    signature: String(options.signature || tableSignature(state.tables)),
    snapshot: Array.isArray(options.snapshot) ? clone(options.snapshot) : null
  };
  operationTimeout = window.setTimeout(() => {
    if (pendingOperation?.requestId !== requestId) return;
    handleOperationError({
      requestId,
      kind,
      message: "Le serveur met trop de temps à répondre. Vos modifications restent dans le brouillon ; réessayez manuellement."
    });
  }, OPERATION_TIMEOUT_MS);
  document.body.classList.remove("sync-error");
  renderControls();
  document.body.classList.add("saving");
}

function finishOperation({ reschedule = true } = {}) {
  if (operationTimeout) window.clearTimeout(operationTimeout);
  operationTimeout = null;
  pendingOperation = null;
  document.body.classList.remove("saving");
  renderControls();
  if (reschedule && state.dirty) scheduleServiceAutosave();
}

function assignReservation(reservationId, tableId, options = {}) {
  if (awaitingHydration || pendingOperation) return;
  const reservation = state.reservations.find((item) => item.id === reservationId);
  if (!reservation) return;
  const table = tableId ? state.tables.find((item) => item.id === tableId) : null;
  if (table) {
    const error = getTablePlacementError(table, reservation);
    if (error) {
      showToast(error, "warning");
      return;
    }
  }

  const previousTableId = reservation.tableId;
  if (previousTableId === tableId) {
    selectedReservationId = null;
    render();
    return;
  }
  const historyAction = options.historyAction || {
    reservationId,
    fromTableId: previousTableId,
    toTableId: tableId
  };
  if (!options.historyMode) {
    assignmentHistory.past.push(historyAction);
    if (assignmentHistory.past.length > HISTORY_LIMIT) assignmentHistory.past.shift();
    assignmentHistory.future = [];
  }
  reservation.tableId = tableId;
  selectedReservationId = null;
  render();

  if (!state.connected) {
    saveState();
    showToast(tableId ? `Client placé sur ${table.name}.` : "Placement retiré.", "success");
    return;
  }

  const requestId = createRequestId("assignment");
  pendingAssignment = {
    reservationId,
    previousTableId,
    historyMode: options.historyMode || "record",
    historyAction
  };
  beginOperation("assignment", requestId);
  postToDashboard("tok-table-v2:assign", { requestId, reservationId, tableId });
}

function unassignSelectedReservation() {
  if (!selectedReservationId) return;
  assignReservation(selectedReservationId, null);
}

function updateReservationStatus(reservationId, status) {
  if (pendingOperation || !EDITABLE_RESERVATION_STATUSES.includes(status)) return;
  const reservation = state.reservations.find((item) => item.id === reservationId);
  if (!reservation || reservation.status === status) return;
  const previousStatus = reservation.status;
  reservation.status = status;
  render();
  if (selectedServiceTableId && elements.serviceTableModal?.open) renderServiceTableModal();

  if (!state.connected) {
    saveState();
    showToast(`Statut « ${getReservationStatusLabel(status)} » enregistré.`, "success");
    return;
  }

  const requestId = createRequestId("reservation_status");
  pendingStatusChange = { reservationId, previousStatus };
  beginOperation("reservation-status", requestId);
  postToDashboard("tok-table-v2:update-reservation-status", { requestId, reservationId, status });
}

function renderServiceTableModal() {
  if (!elements.serviceTableContent || !selectedServiceTableId) return;
  const table = state.tables.find((item) => item.id === selectedServiceTableId && item.editable);
  if (!table) {
    closeDialog(elements.serviceTableModal, "cancel");
    selectedServiceTableId = null;
    return;
  }
  const reservations = currentAssignmentMap().get(table.id) || [];
  const serviceState = getTableServiceState(table, reservations);
  elements.serviceTableContent.innerHTML = `
    <div class="service-table-heading">
      <div>
        <p class="eyebrow">TABLE · ${escapeHtml(table.zone)}</p>
        <h2>${escapeHtml(table.name)}</h2>
        <p>${table.capacity} assise${table.capacity > 1 ? "s" : ""}</p>
      </div>
      <span class="service-state-badge service-${serviceState.key}">${escapeHtml(serviceState.label)}${serviceState.detail ? ` · ${escapeHtml(serviceState.detail)}` : ""}</span>
    </div>
    <div class="service-table-reservations">
      ${reservations.length ? reservations.map((reservation) => `
        <article class="service-table-reservation" data-reservation-id="${reservation.id}">
          <div>
            <strong>${escapeHtml(reservation.name)}</strong>
            <span>${escapeHtml(reservation.time)} · ${reservation.size} convive${reservation.size > 1 ? "s" : ""}</span>
            ${reservation.note ? `<small>${escapeHtml(reservation.note)}</small>` : ""}
          </div>
          <select data-action="modal-reservation-status" data-reservation-id="${reservation.id}" aria-label="Statut de ${escapeHtml(reservation.name)}">${getReservationStatusOptions(reservation.status)}</select>
          <button class="btn btn-ghost" type="button" data-action="move-modal-reservation" data-reservation-id="${reservation.id}">Déplacer</button>
          <button class="btn btn-danger" type="button" data-action="unassign-reservation" data-reservation-id="${reservation.id}">Libérer</button>
        </article>`).join("") : `<div class="empty-service-table">Cette table est libre pour ce service.</div>`}
    </div>`;
}

function openServiceTableModal(table) {
  if (state.mode !== "service" || !table?.editable || pendingOperation || !elements.serviceTableModal) return;
  selectedServiceTableId = table.id;
  renderServiceTableModal();
  safeShowModal(elements.serviceTableModal);
}

function getReservationPointerTarget(clientX, clientY, reservationId) {
  const node = document.elementFromPoint(clientX, clientY)?.closest?.(".table-node");
  const table = node && state.tables.find((item) => item.id === node.dataset.tableId && item.editable);
  const reservation = state.reservations.find((item) => item.id === reservationId);
  if (!node || !table || !reservation) return { node: null, table: null, error: "" };
  return { node, table, error: getTablePlacementError(table, reservation) };
}

function paintReservationPointerDrag() {
  if (!reservationPointerDrag) return;
  const drag = reservationPointerDrag;
  drag.ghost.style.transform = `translate3d(${drag.clientX + 14}px, ${drag.clientY + 14}px, 0)`;

  const edge = 68;
  if (drag.clientY < edge) window.scrollBy({ top: -14, behavior: "auto" });
  if (drag.clientY > window.innerHeight - edge) window.scrollBy({ top: 14, behavior: "auto" });

  const target = getReservationPointerTarget(drag.clientX, drag.clientY, drag.reservationId);
  if (drag.targetNode !== target.node) drag.targetNode?.classList.remove("drag-over");
  drag.targetNode = target.node;
  drag.targetTableId = target.table?.id || null;
  drag.targetError = target.error;
  target.node?.classList.add("drag-over");
  drag.ghost.classList.toggle("invalid", Boolean(target.table && target.error));
  drag.ghost.classList.toggle("valid", Boolean(target.table && !target.error));
}

function startReservationPointerDrag(event, reservationId) {
  if (state.mode !== "service" || pendingOperation || (event.pointerType === "mouse" && event.button !== 0)) return;
  const reservation = state.reservations.find((item) => item.id === reservationId);
  const handle = event.target.closest?.('[data-action="drag-reservation"]');
  if (!reservation || !handle) return;
  clearReservationPointerDrag(false);
  selectedReservationId = reservationId;
  const ghost = document.createElement("div");
  ghost.className = "reservation-drag-ghost";
  ghost.innerHTML = `<strong>${escapeHtml(reservation.name)}</strong><span>${reservation.size} convive${reservation.size > 1 ? "s" : ""}</span>`;
  document.body.appendChild(ghost);
  reservationPointerDrag = {
    reservationId,
    pointerId: event.pointerId,
    handle,
    ghost,
    startX: event.clientX,
    startY: event.clientY,
    clientX: event.clientX,
    clientY: event.clientY,
    moved: false,
    targetNode: null,
    targetTableId: null,
    targetError: ""
  };
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add("reservation-pointer-dragging");
  renderFloor();
  renderPlacementBanner();
  paintReservationPointerDrag();
  event.preventDefault();
  event.stopPropagation();
}

function moveReservationPointerDrag(event) {
  if (!reservationPointerDrag || event.pointerId !== reservationPointerDrag.pointerId) return;
  reservationPointerDrag.clientX = event.clientX;
  reservationPointerDrag.clientY = event.clientY;
  if (Math.hypot(event.clientX - reservationPointerDrag.startX, event.clientY - reservationPointerDrag.startY) > 7) {
    reservationPointerDrag.moved = true;
  }
  if (!reservationPointerFrame) {
    reservationPointerFrame = window.requestAnimationFrame(() => {
      reservationPointerFrame = 0;
      paintReservationPointerDrag();
    });
  }
  event.preventDefault();
}

function clearReservationPointerDrag(renderAfter = true) {
  if (!reservationPointerDrag) return;
  const drag = reservationPointerDrag;
  reservationPointerDrag = null;
  if (reservationPointerFrame) {
    window.cancelAnimationFrame(reservationPointerFrame);
    reservationPointerFrame = 0;
  }
  drag.targetNode?.classList.remove("drag-over");
  drag.ghost.remove();
  if (drag.handle.hasPointerCapture?.(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
  document.body.classList.remove("reservation-pointer-dragging");
  if (renderAfter) render();
}

function finishReservationPointerDrag(event, cancelled = false) {
  if (!reservationPointerDrag || event.pointerId !== reservationPointerDrag.pointerId) return;
  if (reservationPointerFrame) {
    window.cancelAnimationFrame(reservationPointerFrame);
    reservationPointerFrame = 0;
    paintReservationPointerDrag();
  }
  const drag = { ...reservationPointerDrag };
  clearReservationPointerDrag(false);

  if (!cancelled && drag.moved && drag.targetTableId && !drag.targetError) {
    assignReservation(drag.reservationId, drag.targetTableId);
    return;
  }
  if (!cancelled && drag.moved && drag.targetError) showToast(drag.targetError, "warning");
  render();
}

function openTableModal(table = null) {
  if (state.mode !== "template" || (table && !table.editable) || pendingOperation) return;
  elements.tableForm.reset();
  const fields = elements.tableForm.elements;
  fields.id.value = table?.id ?? "";
  fields.name.value = table?.name ?? nextTableName();
  fields.capacity.value = table?.capacity ?? 4;
  fields.zone.value = table?.zone ?? state.selectedZone;
  fields.shape.value = table?.shape ?? "round";
  fields.active.checked = table ? !table.blocked : true;
  $("#table-modal-title").textContent = table ? `Modifier ${table.name}` : "Ajouter une table";
  $("#delete-table-button").classList.toggle("hidden", !table);
  $("#duplicate-table-button").classList.toggle("hidden", !table);
  safeShowModal(elements.tableModal);
  window.setTimeout(() => {
    if (elements.tableModal.open) fields.name.select();
  }, 30);
}

function nextTableName() {
  const names = new Set(state.tables.map((table) => table.name.toLocaleLowerCase("fr")));
  let number = editableTables().length + 1;
  while (names.has(`t${number}`.toLocaleLowerCase("fr"))) number += 1;
  return `T${number}`;
}

function saveTableFromForm() {
  if (blockDraftMutationWhileSaving(elements.tableModal)) return false;
  const form = new FormData(elements.tableForm);
  const id = String(form.get("id") || "");
  const name = String(form.get("name") || "").trim();
  const capacity = Math.round(Number(form.get("capacity")));
  const zone = String(form.get("zone") || "").trim();
  const shape = String(form.get("shape") || "round");
  const blocked = form.get("active") !== "on";
  if (!name || name.length > 40 || !zone || zone.length > 60 || capacity < 1 || capacity > 30) {
    showModalError(elements.tableModal, "Renseignez un nom, une zone et un nombre d’assises valides.");
    return false;
  }

  const duplicate = state.tables.find((item) => (
    item.id !== id && item.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr")
  ));
  if (duplicate) {
    showModalError(elements.tableModal, "Une table ou un élément de mobilier porte déjà ce nom.", elements.tableForm.elements.name);
    showToast("Une table porte déjà ce nom.", "warning");
    return false;
  }

  const incompatible = state.reservations.find((reservation) => (
    reservation.tableId === id && (blocked || reservation.size > capacity)
  ));
  if (incompatible) {
    showModalError(elements.tableModal, `Retirez d’abord le placement de ${incompatible.name}.`);
    showToast(`Retirez d’abord le placement de ${incompatible.name}.`, "warning");
    return false;
  }

  const before = clone(state.tables);
  const next = clone(state.tables);
  const existing = next.find((item) => item.id === id);
  if (existing) {
    Object.assign(existing, { name, capacity, zone, shape, blocked });
  } else {
    next.push({
      id: uid("tmp_table"),
      name,
      capacity,
      zone,
      shape,
      blocked,
      editable: true,
      kind: "table",
      x: 8 + (editableTables().length * 13) % 72,
      y: 10 + (editableTables().length * 16) % 68
    });
  }
  state.selectedZone = zone;
  commitTables(next, before);
  showToast(existing ? "Table modifiée dans le brouillon." : "Table ajoutée au brouillon.", "success");
  return true;
}

function duplicateCurrentTable() {
  if (blockDraftMutationWhileSaving(elements.tableModal)) return;
  const id = elements.tableForm.elements.id.value;
  const source = state.tables.find((item) => item.id === id && item.editable);
  if (!source) return;
  const names = new Set(editableTables().map((table) => table.name.toLocaleLowerCase("fr")));
  let name = `${source.name} copie`;
  let suffix = 2;
  while (names.has(name.toLocaleLowerCase("fr"))) name = `${source.name} copie ${suffix++}`;
  const next = clone(state.tables);
  next.push({
    ...clone(source),
    id: uid("tmp_table"),
    name,
    x: Math.min(86, source.x + 5),
    y: Math.min(80, source.y + 5)
  });
  closeDialog(elements.tableModal, "default");
  commitTables(next);
  showToast(`${name} ajoutée au brouillon.`, "success");
}

function openConfirmDialog(title, copy, action) {
  if (blockDraftMutationWhileSaving()) return false;
  pendingConfirmAction = action;
  $("#confirm-title").textContent = title;
  $("#confirm-copy").textContent = copy;
  safeShowModal(elements.confirmModal);
  return true;
}

function requestDeleteCurrentTable() {
  if (blockDraftMutationWhileSaving(elements.tableModal)) return;
  const id = elements.tableForm.elements.id.value;
  const table = state.tables.find((item) => item.id === id && item.editable);
  if (!table) return;
  const assigned = state.reservations.find((reservation) => reservation.tableId === id);
  if (assigned) {
    showToast(`Retirez d’abord le placement de ${assigned.name}.`, "warning");
    return;
  }
  closeDialog(elements.tableModal, "default");
  openConfirmDialog(
    `Supprimer ${table.name} ?`,
    "La suppression sera définitive après l’enregistrement du modèle.",
    () => {
    const next = state.tables.filter((item) => item.id !== id);
    commitTables(next);
    showToast(`${table.name} retirée du brouillon.`);
    }
  );
}

function nextFurnitureName(kind) {
  const base = FURNITURE_LIBRARY[kind]?.label || "Mobilier";
  const names = new Set(state.tables.map((item) => item.name.toLocaleLowerCase("fr")));
  if (!names.has(base.toLocaleLowerCase("fr"))) return base;
  let suffix = 2;
  while (names.has(`${base} ${suffix}`.toLocaleLowerCase("fr"))) suffix += 1;
  return `${base} ${suffix}`.slice(0, 40);
}

function addFurniture(kind) {
  if (awaitingHydration || state.mode !== "template" || pendingOperation || !FURNITURE_TYPES.includes(kind)) return;
  const defaults = FURNITURE_LIBRARY[kind];
  const furnitureCount = state.tables.filter((item) => !item.editable).length;
  const maxX = Math.max(0, ((CANVAS_WIDTH - defaults.width) / CANVAS_WIDTH) * 100);
  const maxY = Math.max(0, ((CANVAS_HEIGHT - defaults.height) / CANVAS_HEIGHT) * 100);
  const object = {
    id: uid("tmp_object"),
    name: nextFurnitureName(kind),
    capacity: 0,
    zone: state.selectedZone,
    shape: "rectangle",
    x: Math.min(maxX, 6 + (furnitureCount * 9) % 72),
    y: Math.min(maxY, 8 + (furnitureCount * 11) % 64),
    blocked: false,
    editable: false,
    kind,
    width: defaults.width,
    height: defaults.height,
    rotation: 0,
    locked: false,
    zIndex: Math.min(100, furnitureCount)
  };
  pendingFurnitureDraft = clone(object);
  openFurnitureModal(object, { isNew: true });
}

function toSignedRotation(value) {
  return ((((Math.round(Number(value) || 0) + 180) % 360) + 360) % 360) - 180;
}

function syncFurnitureRotation(value) {
  const rotation = Math.max(-180, Math.min(180, Math.round(Number(value) || 0)));
  elements.furnitureRotationRange.value = String(rotation);
  elements.furnitureRotationInput.value = String(rotation);
  elements.furnitureRotationOutput.textContent = `${rotation}°`;
}

function openFurnitureModal(object, { isNew = false } = {}) {
  if (state.mode !== "template" || !object || object.editable || pendingOperation) return;
  pendingFurnitureDraft = isNew ? clone(object) : null;
  elements.furnitureForm.reset();
  const fields = elements.furnitureForm.elements;
  fields.id.value = object.id;
  fields.type.value = FURNITURE_TYPES.includes(object.kind) ? object.kind : "divider";
  fields.name.value = object.name;
  fields.zone.value = object.zone;
  fields.width.value = object.width;
  fields.height.value = object.height;
  fields.locked.checked = Boolean(object.locked);
  syncFurnitureRotation(toSignedRotation(object.rotation));
  $("#furniture-modal-title").textContent = `Modifier ${object.name}`;
  $("#delete-furniture-button").classList.toggle("hidden", isNew);
  $("#duplicate-furniture-button").classList.toggle("hidden", isNew);
  safeShowModal(elements.furnitureModal);
  window.setTimeout(() => {
    if (elements.furnitureModal.open) fields.name.select();
  }, 30);
}

function saveFurnitureFromForm() {
  if (blockDraftMutationWhileSaving(elements.furnitureModal)) return false;
  const form = new FormData(elements.furnitureForm);
  const id = String(form.get("id") || "");
  const kind = String(form.get("type") || "");
  const name = String(form.get("name") || "").trim();
  const zone = String(form.get("zone") || "").trim();
  const width = Math.round(Number(form.get("width")));
  const height = Math.round(Number(form.get("height")));
  const rotation = Math.round(Number(form.get("rotation")));
  const locked = form.get("locked") === "on";
  const persisted = state.tables.find((item) => item.id === id && !item.editable);
  const existing = persisted || (pendingFurnitureDraft?.id === id ? pendingFurnitureDraft : null);

  if (!existing || !FURNITURE_TYPES.includes(kind)) return false;
  if (!name || name.length > 40 || !zone || zone.length > 60) {
    showModalError(elements.furnitureModal, "Renseignez un nom et une zone valides.");
    showToast("Renseignez un nom et une zone valides.", "warning");
    return false;
  }
  if (width < 24 || width > 520 || height < 16 || height > 360 || rotation < -180 || rotation > 180) {
    showModalError(elements.furnitureModal, "Les dimensions ou la rotation sont invalides.");
    showToast("Les dimensions ou la rotation sont invalides.", "warning");
    return false;
  }
  const duplicate = state.tables.find((item) => (
    item.id !== id && item.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr")
  ));
  if (duplicate) {
    showModalError(elements.furnitureModal, "Un élément du plan porte déjà ce nom.", elements.furnitureForm.elements.name);
    showToast("Un élément du plan porte déjà ce nom.", "warning");
    return false;
  }

  const next = clone(state.tables);
  let object = next.find((item) => item.id === id && !item.editable);
  if (!object && pendingFurnitureDraft?.id === id) {
    object = clone(pendingFurnitureDraft);
    next.push(object);
  }
  if (!object) return false;
  const maxX = Math.max(0, ((CANVAS_WIDTH - width) / CANVAS_WIDTH) * 100);
  const maxY = Math.max(0, ((CANVAS_HEIGHT - height) / CANVAS_HEIGHT) * 100);
  Object.assign(object, {
    name,
    zone,
    kind,
    width,
    height,
    rotation: ((rotation % 360) + 360) % 360,
    locked,
    x: Math.min(maxX, object.x),
    y: Math.min(maxY, object.y)
  });
  state.selectedZone = zone;
  commitTables(next);
  pendingFurnitureDraft = null;
  showToast(persisted ? `${name} modifié dans le brouillon.` : `${name} ajouté au brouillon.`, "success");
  return true;
}

function duplicateCurrentFurniture() {
  if (blockDraftMutationWhileSaving(elements.furnitureModal)) return;
  const id = elements.furnitureForm.elements.id.value;
  const source = state.tables.find((item) => item.id === id && !item.editable);
  if (!source) return;
  const next = clone(state.tables);
  const duplicate = {
    ...clone(source),
    id: uid("tmp_object"),
    name: nextFurnitureName(source.kind),
    x: Math.min(Math.max(0, ((CANVAS_WIDTH - source.width) / CANVAS_WIDTH) * 100), source.x + 4),
    y: Math.min(Math.max(0, ((CANVAS_HEIGHT - source.height) / CANVAS_HEIGHT) * 100), source.y + 4),
    locked: false,
    zIndex: Math.min(100, (Number(source.zIndex) || 0) + 1)
  };
  next.push(duplicate);
  closeDialog(elements.furnitureModal, "default");
  commitTables(next);
  showToast(`${duplicate.name} ajouté au brouillon.`, "success");
}

function requestDeleteCurrentFurniture() {
  if (blockDraftMutationWhileSaving(elements.furnitureModal)) return;
  const id = elements.furnitureForm.elements.id.value;
  const object = state.tables.find((item) => item.id === id && !item.editable);
  if (!object) return;
  closeDialog(elements.furnitureModal, "default");
  openConfirmDialog(
    `Supprimer ${object.name} ?`,
    "La suppression sera définitive après l’enregistrement du modèle.",
    () => {
      commitTables(state.tables.filter((item) => item.id !== id));
      showToast(`${object.name} retiré du brouillon.`);
    }
  );
}

function savePlan(options = {}) {
  if (awaitingHydration || !state.dirty || pendingOperation) return;
  const automatic = options?.automatic === true;
  if (!automatic) serviceAutosaveFailures = 0;
  clearServiceAutosave();
  if (!state.connected) {
    history.baseline = clone(state.tables);
    setDirty(false);
    saveState();
    render();
    showToast(state.mode === "template" ? "Modèle enregistré localement." : "Service enregistré localement.", "success");
    return;
  }
  const operationKind = state.mode === "template" ? "template" : "service-layout";
  if (hasCurrentRevisionConflict()) {
    showRevisionConflict();
    return;
  }
  const operationSnapshot = clone(state.tables);
  const tables = editableTables().map((table) => ({
    id: table.id,
    name: table.name,
    capacity: table.capacity,
    zone: table.zone,
    shape: table.shape,
    x: table.x,
    y: table.y,
    blocked: table.blocked
  }));
  const objects = state.tables.filter((item) => !item.editable).map((object) => ({
    id: object.id,
    name: object.name,
    zone: object.zone,
    kind: object.kind,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: object.rotation,
    locked: object.locked,
    zIndex: object.zIndex
  }));
  const baselineTableIds = history.baseline.filter((item) => item.editable).map((item) => item.id);
  const baselineObjectIds = history.baseline.filter((item) => !item.editable).map((item) => item.id);
  const baseRevision = state.mode === "template" ? state.templateRevision : state.serviceRevision;
  const signature = tableSignature(state.tables);
  const canReplayRequest = retryableSaveOperation
    && retryableSaveOperation.kind === operationKind
    && retryableSaveOperation.signature === signature
    && retryableSaveOperation.baseRevision === baseRevision;
  const requestId = canReplayRequest
    ? retryableSaveOperation.requestId
    : createRequestId(state.mode === "template" ? "template" : "service_layout");
  beginOperation(
    operationKind,
    requestId,
    { automatic, baseRevision, signature, snapshot: operationSnapshot }
  );
  postToDashboard(
    state.mode === "template" ? "tok-table-v2:save-template" : "tok-table-v2:save-service-layout",
    state.mode === "template"
      ? {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId,
        baseRevision,
        baselineTableIds,
        baselineObjectIds,
        tables,
        objects
      }
      : {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        requestId,
        baseRevision,
        tables
      }
  );
}

function switchMode(nextMode) {
  if (awaitingHydration || pendingOperation || nextMode === state.mode) return;
  if (state.dirty) {
    showToast("Enregistrez ou annulez les modifications avant de changer de mode.", "warning");
    return;
  }
  state.mode = nextMode;
  clearServiceAutosave();
  clearReservationPointerDrag(false);
  selectedReservationId = null;
  state.tables = clone(nextMode === "template" ? state.serverTemplateTables : state.serverServiceTables);
  resetHistory(state.tables);
  render();
}

function loadVariant(variantId) {
  if (state.mode !== "template" || pendingOperation) return;
  if (state.dirty) {
    elements.variantSelect.value = state.activeVariantId;
    showToast("Enregistrez ou annulez le brouillon avant de charger une autre variante.", "warning");
    return;
  }
  if (variantId === "current") {
    state.activeVariantId = "current";
    state.tables = clone(state.serverTemplateTables);
    resetHistory(state.tables);
    render();
    return;
  }
  if (!state.connected || !state.variants.some((variant) => variant.id === variantId)) {
    elements.variantSelect.value = state.activeVariantId;
    showToast("Cette variante n’est pas disponible.", "warning");
    return;
  }
  const requestId = createRequestId("variant_load");
  beginOperation("variant-load", requestId);
  postToDashboard("tok-table-v2:load-variant", { requestId, variantId });
}

function openVariantModal() {
  if (state.mode !== "template" || pendingOperation || !state.connected || !elements.variantModal) return;
  elements.variantForm.reset();
  const now = new Date().toLocaleString("fr-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  elements.variantForm.elements.name.value = `Plan enregistré · ${now}`;
  safeShowModal(elements.variantModal);
  window.setTimeout(() => {
    if (elements.variantModal.open) elements.variantForm.elements.name.select();
  }, 30);
}

function saveVariantFromForm() {
  if (blockDraftMutationWhileSaving(elements.variantModal)) return false;
  const name = String(new FormData(elements.variantForm).get("name") || "").trim();
  if (!name || name.length > 80) {
    showModalError(elements.variantModal, "Donnez un nom valide à cette variante.", elements.variantForm.elements.name);
    showToast("Donnez un nom valide à cette variante.", "warning");
    return false;
  }
  const operationSnapshot = clone(state.tables);
  const signature = JSON.stringify({ name, tables: JSON.parse(tableSignature(operationSnapshot)) });
  const canReplayRequest = retryableSaveOperation
    && retryableSaveOperation.kind === "variant"
    && retryableSaveOperation.signature === signature;
  const requestId = canReplayRequest
    ? retryableSaveOperation.requestId
    : createRequestId("variant");
  const tables = editableTables().map((table) => ({
    id: table.id,
    name: table.name,
    capacity: table.capacity,
    zone: table.zone,
    shape: table.shape,
    x: table.x,
    y: table.y,
    blocked: table.blocked
  }));
  const objects = state.tables.filter((item) => !item.editable).map((object) => ({
    id: object.id,
    name: object.name,
    zone: object.zone,
    kind: object.kind,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: object.rotation,
    locked: object.locked,
    zIndex: object.zIndex
  }));
  beginOperation("variant", requestId, { signature, snapshot: operationSnapshot });
  postToDashboard("tok-table-v2:save-variant", {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    requestId,
    name,
    tables,
    objects
  });
  return true;
}

function autoPlace() {
  if (state.mode !== "service" || pendingOperation) return;
  const reservations = serviceReservations().filter((reservation) => !reservation.tableId);
  if (!reservations.length) {
    showToast("Toutes les réservations sont déjà placées.");
    return;
  }
  if (state.connected) {
    const requestId = createRequestId("auto_place");
    beginOperation("assignment", requestId);
    postToDashboard("tok-table-v2:auto-place-request", { requestId, date: state.selectedDate, period: state.selectedPeriod });
    return;
  }

  const assignments = currentAssignmentMap();
  let placed = 0;
  reservations
    .slice()
    .sort((left, right) => right.size - left.size || left.time.localeCompare(right.time))
    .forEach((reservation) => {
      const table = editableTables()
        .filter((candidate) => tableCanHostReservation(candidate, reservation, assignments))
        .sort((left, right) => (
          (left.capacity - reservation.size) - (right.capacity - reservation.size)
          || Number(right.zone === reservation.preferredZone) - Number(left.zone === reservation.preferredZone)
        ))[0];
      if (!table) return;
      reservation.tableId = table.id;
      const list = assignments.get(table.id) || [];
      list.push(reservation);
      assignments.set(table.id, list);
      placed += 1;
    });
  render();
  showToast(`${placed}/${reservations.length} réservation${reservations.length > 1 ? "s" : ""} placée${placed > 1 ? "s" : ""}.`, placed ? "success" : "warning");
}

function startDragging(event, node, table) {
  const furnitureCanMove = !table.editable && state.mode === "template" && !table.locked;
  const placementOnly = table.editable && state.mode === "service" && Boolean(selectedReservationId);
  if ((!table.editable && !furnitureCanMove) || pendingOperation || event.button !== 0) return;
  const rect = elements.floor.getBoundingClientRect();
  const scaleX = rect.width / CANVAS_WIDTH || canvasZoom;
  const scaleY = rect.height / CANVAS_HEIGHT || canvasZoom;
  const nodeLeft = (table.x / 100) * CANVAS_WIDTH;
  const nodeTop = (table.y / 100) * CANVAS_HEIGHT;
  dragState = {
    pointerId: event.pointerId,
    tableId: table.id,
    node,
    beforeTables: clone(state.tables),
    startX: event.clientX,
    startY: event.clientY,
    offsetX: (event.clientX - rect.left) / scaleX - nodeLeft,
    offsetY: (event.clientY - rect.top) / scaleY - nodeTop,
    nextLeft: nodeLeft,
    nextTop: nodeTop,
    moved: false,
    placementOnly
  };
  node.setPointerCapture(event.pointerId);
  node.classList.add("dragging");
  event.preventDefault();
  event.stopPropagation();
}

function paintDragging(clientX, clientY) {
  if (!dragState) return;
  if (dragState.placementOnly) return;
  const table = state.tables.find((item) => item.id === dragState.tableId);
  if (!table) return;
  const rect = elements.floor.getBoundingClientRect();
  const scaleX = rect.width / CANVAS_WIDTH || canvasZoom;
  const scaleY = rect.height / CANVAS_HEIGHT || canvasZoom;
  const dimensions = getNodeDimensions(table);
  const left = Math.max(2, Math.min(
    CANVAS_WIDTH - dimensions.width - 2,
    (clientX - rect.left) / scaleX - dragState.offsetX
  ));
  const top = Math.max(2, Math.min(
    CANVAS_HEIGHT - dimensions.height - 2,
    (clientY - rect.top) / scaleY - dragState.offsetY
  ));
  dragState.nextLeft = left;
  dragState.nextTop = top;
  dragState.node.style.left = `${left}px`;
  dragState.node.style.top = `${top}px`;
}

function moveDragging(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const movementThreshold = event.pointerType === "touch" ? 13 : 5;
  if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > movementThreshold) dragState.moved = true;
  dragState.latestX = event.clientX;
  dragState.latestY = event.clientY;
  if (!dragFrame) {
    dragFrame = window.requestAnimationFrame(() => {
      dragFrame = 0;
      if (dragState) paintDragging(dragState.latestX, dragState.latestY);
    });
  }
  event.preventDefault();
  event.stopPropagation();
}

function finishDragging(event, cancelled = false) {
  if (!dragState || (event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) return;
  if (dragFrame) {
    window.cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    if (!cancelled) paintDragging(dragState.latestX ?? event.clientX, dragState.latestY ?? event.clientY);
  }
  const current = dragState;
  const table = state.tables.find((item) => item.id === current.tableId);
  dragState = null;
  current.node.classList.remove("dragging");
  if (current.node.hasPointerCapture?.(current.pointerId)) current.node.releasePointerCapture(current.pointerId);

  if (cancelled || !table) {
    renderFloor();
    return;
  }
  if (current.placementOnly && table.editable) {
    assignReservation(selectedReservationId, table.id);
    return;
  }
  if (current.moved) {
    const next = clone(state.tables);
    const movedTable = next.find((item) => item.id === current.tableId);
    const dimensions = getNodeDimensions(movedTable);
    const maxX = Math.max(0, ((CANVAS_WIDTH - dimensions.width) / CANVAS_WIDTH) * 100);
    const maxY = Math.max(0, ((CANVAS_HEIGHT - dimensions.height) / CANVAS_HEIGHT) * 100);
    movedTable.x = Math.max(0, Math.min(maxX, (current.nextLeft / CANVAS_WIDTH) * 100));
    movedTable.y = Math.max(0, Math.min(maxY, (current.nextTop / CANVAS_HEIGHT) * 100));
    commitTables(next, current.beforeTables);
    return;
  }

  if (state.mode === "template") {
    if (table.editable) openTableModal(table);
    else openFurnitureModal(table);
  } else if (selectedReservationId && table.editable) {
    assignReservation(selectedReservationId, table.id);
  } else if (table.editable) {
    openServiceTableModal(table);
  }
}

function clampZoom(value) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value * 100) / 100));
}

function getViewportCenter() {
  const viewport = elements.floorViewport;
  const rect = viewport.getBoundingClientRect();
  return { clientX: rect.left + viewport.clientWidth / 2, clientY: rect.top + viewport.clientHeight / 2 };
}

function syncCanvasZoom(preserveCenter = true) {
  const viewport = elements.floorViewport;
  if (!viewport) return;
  const previousZoom = Number(elements.floor.dataset.zoom) || canvasZoom || 1;
  const logicalCenterX = (viewport.scrollLeft + viewport.clientWidth / 2) / previousZoom;
  const logicalCenterY = (viewport.scrollTop + viewport.clientHeight / 2) / previousZoom;

  if (!zoomWasChanged) {
    canvasZoom = clampZoom(Math.min(1, viewport.clientWidth / CANVAS_WIDTH, viewport.clientHeight / CANVAS_HEIGHT));
  }
  elements.floor.style.width = `${CANVAS_WIDTH}px`;
  elements.floor.style.height = `${CANVAS_HEIGHT}px`;
  elements.floor.style.transform = `scale(${canvasZoom})`;
  elements.floor.dataset.zoom = String(canvasZoom);
  elements.floorStage.style.width = `${Math.max(viewport.clientWidth, Math.ceil(CANVAS_WIDTH * canvasZoom))}px`;
  elements.floorStage.style.height = `${Math.max(viewport.clientHeight, Math.ceil(CANVAS_HEIGHT * canvasZoom))}px`;
  elements.zoomValue.textContent = `${Math.round(canvasZoom * 100)} %`;

  if (preserveCenter) {
    viewport.scrollLeft = Math.max(0, logicalCenterX * canvasZoom - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, logicalCenterY * canvasZoom - viewport.clientHeight / 2);
  }
}

function updateCanvasZoom(nextZoom, focus = getViewportCenter()) {
  const viewport = elements.floorViewport;
  const bounds = viewport.getBoundingClientRect();
  const previousZoom = canvasZoom;
  const focusX = Math.max(0, Math.min(viewport.clientWidth, focus.clientX - bounds.left));
  const focusY = Math.max(0, Math.min(viewport.clientHeight, focus.clientY - bounds.top));
  const logicalX = (viewport.scrollLeft + focusX) / previousZoom;
  const logicalY = (viewport.scrollTop + focusY) / previousZoom;
  zoomWasChanged = true;
  canvasZoom = clampZoom(nextZoom);
  syncCanvasZoom(false);
  viewport.scrollLeft = Math.max(0, logicalX * canvasZoom - focusX);
  viewport.scrollTop = Math.max(0, logicalY * canvasZoom - focusY);
}

function fitCanvasToViewport() {
  const viewport = elements.floorViewport;
  zoomWasChanged = true;
  canvasZoom = clampZoom(Math.min(1, viewport.clientWidth / CANVAS_WIDTH, viewport.clientHeight / CANVAS_HEIGHT));
  syncCanvasZoom(false);
  viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
}

function resetCanvasZoom() {
  zoomWasChanged = true;
  canvasZoom = 1;
  syncCanvasZoom(false);
  elements.floorViewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
}

function pointerDistance(pointers) {
  return Math.hypot(pointers[0].clientX - pointers[1].clientX, pointers[0].clientY - pointers[1].clientY);
}

function pointerMidpoint(pointers) {
  return { clientX: (pointers[0].clientX + pointers[1].clientX) / 2, clientY: (pointers[0].clientY + pointers[1].clientY) / 2 };
}

function beginViewportGesture(event) {
  if (event.target.closest("button, input, select, .table-node")) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  viewportPointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
  elements.floorViewport.setPointerCapture?.(event.pointerId);
  const pointers = [...viewportPointers.values()];
  viewportGesture = pointers.length >= 2
    ? { type: "pinch", startDistance: pointerDistance(pointers.slice(0, 2)), startZoom: canvasZoom }
    : { type: "pan", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, scrollLeft: elements.floorViewport.scrollLeft, scrollTop: elements.floorViewport.scrollTop };
  elements.floorViewport.classList.add("panning");
  event.preventDefault();
}

function moveViewportGesture(event) {
  if (!viewportPointers.has(event.pointerId)) return;
  viewportPointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
  const pointers = [...viewportPointers.values()];
  if (pointers.length >= 2) {
    if (viewportGesture?.type !== "pinch") {
      viewportGesture = { type: "pinch", startDistance: pointerDistance(pointers.slice(0, 2)), startZoom: canvasZoom };
    }
    const ratio = pointerDistance(pointers.slice(0, 2)) / (viewportGesture.startDistance || 1);
    updateCanvasZoom(viewportGesture.startZoom * ratio, pointerMidpoint(pointers.slice(0, 2)));
  } else if (viewportGesture?.type === "pan" && viewportGesture.pointerId === event.pointerId) {
    elements.floorViewport.scrollLeft = viewportGesture.scrollLeft - (event.clientX - viewportGesture.startX);
    elements.floorViewport.scrollTop = viewportGesture.scrollTop - (event.clientY - viewportGesture.startY);
  }
  event.preventDefault();
}

function endViewportGesture(event) {
  viewportPointers.delete(event.pointerId);
  if (elements.floorViewport.hasPointerCapture?.(event.pointerId)) elements.floorViewport.releasePointerCapture(event.pointerId);
  const remaining = [...viewportPointers.entries()];
  if (remaining.length === 1) {
    const [pointerId, pointer] = remaining[0];
    viewportGesture = { type: "pan", pointerId, startX: pointer.clientX, startY: pointer.clientY, scrollLeft: elements.floorViewport.scrollLeft, scrollTop: elements.floorViewport.scrollTop };
  } else if (!remaining.length) {
    viewportGesture = null;
    elements.floorViewport.classList.remove("panning");
  }
}

function replaceTableIds(tables, idMap) {
  if (!idMap || typeof idMap !== "object") return clone(tables);
  return tables.map((table) => ({
    ...clone(table),
    id: typeof idMap[table.id] === "string" ? idMap[table.id] : table.id
  }));
}

function applyIdMap(idMap) {
  if (!idMap || typeof idMap !== "object") return;
  state.tables = replaceTableIds(state.tables, idMap);
  state.serverTemplateTables = replaceTableIds(state.serverTemplateTables, idMap);
  state.serverServiceTables = replaceTableIds(state.serverServiceTables, idMap);
}

function hydrateConnectedState(payload) {
  if (!payload || !Array.isArray(payload.reservations)) return;
  if (Number(payload.protocolVersion) !== BRIDGE_PROTOCOL_VERSION) return;
  const firstHydration = awaitingHydration || !state.connected;
  const furniture = sanitizeTables(payload.furniture || []).filter((item) => !item.editable);
  const mergeFurniture = (input) => {
    const tables = sanitizeTables(input || []).filter((item) => item.editable);
    const ids = new Set(tables.map((item) => item.id));
    return [...tables, ...furniture.filter((item) => !ids.has(item.id))];
  };
  const templateTables = mergeFurniture(payload.templateTables || payload.tables || []);
  const serviceTables = mergeFurniture(payload.serviceTables || payload.tables || []);
  const incomingBranchId = String(payload.branchId || "");
  const reservations = sanitizeReservations(payload.reservations, serviceTables, payload.selectedDate || todayIso());
  const recommendations = sanitizeRecommendations(payload.recommendations, serviceTables, reservations);
  const branchChanged = state.branchId && state.branchId !== incomingBranchId;
  const incomingDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.selectedDate || "")) ? payload.selectedDate : todayIso();
  const incomingPeriod = payload.selectedPeriod === "midi" ? "midi" : "soir";
  const incomingTemplateRevision = String(payload.templateRevision || "");
  const incomingServiceRevision = String(payload.serviceRevision || "");
  if (branchChanged) {
    closeAllDialogs();
    clearReservationPointerDrag(false);
    if (pendingOperation) finishOperation({ reschedule: false });
    pendingAssignment = null;
    pendingStatusChange = null;
    pendingFurnitureDraft = null;
    retryableSaveOperation = null;
    selectedReservationId = null;
    selectedServiceTableId = null;
  }
  const protectServerState = !firstHydration
    && !branchChanged
    && (state.dirty || Boolean(pendingOperation));
  let discoveredCurrentConflict = false;
  if (protectServerState) {
    if (incomingTemplateRevision !== state.templateRevision) {
      discoveredCurrentConflict = state.mode === "template" && !remoteRevisionConflicts.template;
      remoteRevisionConflicts.template = incomingTemplateRevision || "revision-distante";
    }
    if (incomingServiceRevision !== state.serviceRevision) {
      discoveredCurrentConflict = discoveredCurrentConflict
        || (state.mode === "service" && !remoteRevisionConflicts["service-layout"]);
      remoteRevisionConflicts["service-layout"] = incomingServiceRevision || "revision-distante";
    }
  } else {
    state.templateRevision = incomingTemplateRevision;
    state.serviceRevision = incomingServiceRevision;
    state.serverTemplateTables = clone(templateTables);
    state.serverServiceTables = clone(serviceTables);
    remoteRevisionConflicts = { template: null, "service-layout": null };
    document.body.classList.remove("sync-error");
  }
  const assignmentContext = `${incomingBranchId}:${incomingDate}:${incomingPeriod}`;
  const serviceChanged = assignmentHistory.context !== assignmentContext;
  if (serviceChanged) {
    assignmentHistory = { past: [], future: [], context: assignmentContext };
  }

  state.connected = true;
  awaitingHydration = false;
  state.branchId = incomingBranchId;
  state.selectedDate = incomingDate;
  state.selectedPeriod = incomingPeriod;
  state.reservations = reservations;
  state.recommendations = recommendations;
  state.variants = sanitizeVariants(payload.variants);
  if (state.activeVariantId !== "current" && !state.variants.some((variant) => variant.id === state.activeVariantId)) {
    state.activeVariantId = "current";
  }

  if (firstHydration || !state.dirty || branchChanged) {
    const incomingTables = state.mode === "template" ? templateTables : serviceTables;
    if (branchChanged || serviceChanged || tableSignature(incomingTables) !== tableSignature(state.tables)) {
      state.tables = clone(incomingTables);
      resetHistory(state.tables);
    }
  }
  if (!state.tables.some((table) => table.zone === state.selectedZone)) {
    state.selectedZone = state.tables[0]?.zone || "Salle principale";
  }
  if (selectedReservationId && !reservations.some((reservation) => reservation.id === selectedReservationId)) {
    selectedReservationId = null;
  }
  if (selectedServiceTableId && !serviceTables.some((table) => table.id === selectedServiceTableId && table.editable)) {
    closeDialog(elements.serviceTableModal, "cancel");
    selectedServiceTableId = null;
  }
  render();
  if (discoveredCurrentConflict && !pendingOperation) showRevisionConflict();
}

function handleOperationSuccess(payload) {
  if (!pendingOperation || !payload?.requestId || payload.requestId !== pendingOperation.requestId) return;
  if (payload?.kind && payload.kind !== pendingOperation.kind) return;
  const completedOperation = pendingOperation;
  const kind = payload?.kind || completedOperation.kind;
  if (kind === "variant-load") {
    const loadedTables = sanitizeTables(payload?.tables || []).filter((item) => item.editable);
    const loadedFurniture = sanitizeTables(payload?.furniture || []).filter((item) => !item.editable);
    if (loadedTables.length) {
      const previous = clone(state.serverTemplateTables);
      state.mode = "template";
      state.activeVariantId = String(payload?.variantId || "current");
      state.tables = [...loadedTables, ...loadedFurniture];
      history = { past: [previous], future: [], baseline: previous };
      updateDirty();
      selectedReservationId = null;
      state.selectedZone = state.tables[0]?.zone || "Salle principale";
    }
  }
  if (kind === "variant") retryableSaveOperation = null;
  if (kind === "variant" && payload?.variantId) {
    state.activeVariantId = String(payload.variantId);
    elements.variantModal.removeAttribute("aria-busy");
    closeDialog(elements.variantModal, "default");
  }
  if (kind === "template") {
    retryableSaveOperation = null;
    clearRevisionConflict("template");
    const savedSnapshot = replaceTableIds(completedOperation.snapshot || state.tables, payload?.idMap);
    applyIdMap(payload?.idMap);
    state.tables = clone(savedSnapshot);
    if (typeof payload?.templateRevision === "string") state.templateRevision = payload.templateRevision;
    state.serverTemplateTables = clone(savedSnapshot);
    const savedTables = savedSnapshot.filter((item) => item.editable);
    const savedFurniture = savedSnapshot.filter((item) => !item.editable);
    const servicePositions = new Map(
      state.serverServiceTables
        .filter((item) => item.editable)
        .map((item) => [item.id, { x: item.x, y: item.y }])
    );
    state.serverServiceTables = [
      ...savedTables.map((item) => ({
        ...clone(item),
        ...(servicePositions.get(item.id) || {})
      })),
      ...clone(savedFurniture)
    ];
    history.baseline = clone(savedSnapshot);
    history.past = [];
    history.future = [];
    setDirty(false);
  }
  if (kind === "service-layout") {
    retryableSaveOperation = null;
    clearRevisionConflict("service-layout");
    serviceAutosaveFailures = 0;
    const savedSnapshot = clone(completedOperation.snapshot || state.tables);
    state.tables = clone(savedSnapshot);
    if (typeof payload?.serviceRevision === "string") state.serviceRevision = payload.serviceRevision;
    state.serverServiceTables = clone(savedSnapshot);
    history.baseline = clone(savedSnapshot);
    setDirty(false);
  }
  pendingAssignment = null;
  pendingStatusChange = null;
  finishOperation();
  render();
  if (payload?.message) showToast(payload.message, "success");
}

function handleOperationError(payload) {
  if (!pendingOperation || !payload?.requestId || payload.requestId !== pendingOperation.requestId) return;
  if (payload?.kind && payload.kind !== pendingOperation.kind) return;
  const failedOperation = pendingOperation;
  if (pendingAssignment) {
    const reservation = state.reservations.find((item) => item.id === pendingAssignment.reservationId);
    if (reservation) reservation.tableId = pendingAssignment.previousTableId;
    if (pendingAssignment.historyMode === "record") {
      const last = assignmentHistory.past[assignmentHistory.past.length - 1];
      if (last === pendingAssignment.historyAction) assignmentHistory.past.pop();
    } else if (pendingAssignment.historyMode === "undo") {
      const first = assignmentHistory.future[0];
      if (first === pendingAssignment.historyAction) assignmentHistory.future.shift();
      assignmentHistory.past.push(pendingAssignment.historyAction);
    } else if (pendingAssignment.historyMode === "redo") {
      const last = assignmentHistory.past[assignmentHistory.past.length - 1];
      if (last === pendingAssignment.historyAction) assignmentHistory.past.pop();
      assignmentHistory.future.unshift(pendingAssignment.historyAction);
    }
  }
  if (pendingStatusChange) {
    const reservation = state.reservations.find((item) => item.id === pendingStatusChange.reservationId);
    if (reservation) reservation.status = pendingStatusChange.previousStatus;
  }
  pendingAssignment = null;
  pendingStatusChange = null;
  if (failedOperation.kind === "variant" && elements.variantModal?.open) {
    showModalError(elements.variantModal, payload?.message || "La variante n’a pas pu être enregistrée.");
  }
  const shouldRetryAutosave = failedOperation.kind === "service-layout" && failedOperation.automatic;
  if (["template", "service-layout", "variant"].includes(failedOperation.kind)) {
    retryableSaveOperation = {
      requestId: failedOperation.requestId,
      kind: failedOperation.kind,
      signature: failedOperation.signature,
      baseRevision: failedOperation.baseRevision
    };
  }
  if (shouldRetryAutosave) serviceAutosaveFailures += 1;
  finishOperation({ reschedule: false });
  document.body.classList.add("sync-error");
  render();
  showToast(
    hasCurrentRevisionConflict()
      ? "La version distante a changé pendant l’enregistrement. Annulez le brouillon puis actualisez avant de réessayer."
      : (payload?.message || "L’opération n’a pas pu être enregistrée."),
    "warning"
  );
  if (shouldRetryAutosave && serviceAutosaveFailures < SERVICE_AUTOSAVE_MAX_FAILURES) {
    scheduleServiceAutosave();
  } else if (shouldRetryAutosave) {
    showToast("Sauvegarde automatique suspendue après plusieurs échecs. Utilisez Enregistrer pour réessayer.", "warning");
  }
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin || event.source !== window.parent) return;
  const message = event.data;
  if (!message || message.source !== "tok-dashboard") return;
  if (message.type === "tok-table-v2:hydrate") hydrateConnectedState(message.payload);
  if (message.type === "tok-table-v2:operation-start") {
    if (!pendingOperation) beginOperation(message.payload?.kind || "save", message.payload?.requestId || createRequestId("save"));
  }
  if (message.type === "tok-table-v2:operation-success") handleOperationSuccess(message.payload);
  if (message.type === "tok-table-v2:operation-error") handleOperationError(message.payload);
});

elements.date.addEventListener("change", () => {
  if (state.dirty || pendingOperation) {
    elements.date.value = state.selectedDate;
    showToast("Enregistrez ou annulez les modifications avant de changer de date.", "warning");
    return;
  }
  state.selectedDate = elements.date.value;
  assignmentHistory = { past: [], future: [], context: `${state.branchId || "local"}:${state.selectedDate}:${state.selectedPeriod}` };
  resetHistory(state.tables);
  selectedReservationId = null;
  if (state.connected) postToDashboard("tok-table-v2:service-change", { date: state.selectedDate, period: state.selectedPeriod });
  render();
});
elements.period.addEventListener("change", () => {
  if (state.dirty || pendingOperation) {
    elements.period.value = state.selectedPeriod;
    showToast("Enregistrez ou annulez les modifications avant de changer de service.", "warning");
    return;
  }
  state.selectedPeriod = elements.period.value;
  assignmentHistory = { past: [], future: [], context: `${state.branchId || "local"}:${state.selectedDate}:${state.selectedPeriod}` };
  resetHistory(state.tables);
  selectedReservationId = null;
  if (state.connected) postToDashboard("tok-table-v2:service-change", { date: state.selectedDate, period: state.selectedPeriod });
  render();
});
elements.modeServiceButton.addEventListener("click", () => switchMode("service"));
elements.modeTemplateButton.addEventListener("click", () => switchMode("template"));
elements.variantSelect?.addEventListener("change", () => loadVariant(elements.variantSelect.value));
elements.saveVariantButton?.addEventListener("click", openVariantModal);
elements.search.addEventListener("input", renderReservations);
elements.filter.addEventListener("change", renderReservations);
elements.autoPlaceButton.addEventListener("click", autoPlace);
$("#add-table-button").addEventListener("click", () => openTableModal());
elements.furniturePalette.addEventListener("click", (event) => {
  const tool = event.target.closest("[data-furniture-type]");
  if (tool) addFurniture(tool.dataset.furnitureType);
});
elements.saveButton.addEventListener("click", savePlan);
elements.cancelChangesButton.addEventListener("click", cancelChanges);
elements.undoButton.addEventListener("click", undo);
elements.redoButton.addEventListener("click", redo);
$("#delete-table-button").addEventListener("click", requestDeleteCurrentTable);
$("#duplicate-table-button").addEventListener("click", duplicateCurrentTable);
$("#delete-furniture-button").addEventListener("click", requestDeleteCurrentFurniture);
$("#duplicate-furniture-button").addEventListener("click", duplicateCurrentFurniture);

function stepTableCapacity(delta) {
  const current = Math.round(Number(elements.tableCapacityInput.value) || 1);
  elements.tableCapacityInput.value = String(Math.max(1, Math.min(30, current + delta)));
  elements.tableCapacityInput.dispatchEvent(new Event("input", { bubbles: true }));
}
elements.capacityDecreaseButton.addEventListener("click", () => stepTableCapacity(-1));
elements.capacityIncreaseButton.addEventListener("click", () => stepTableCapacity(1));

elements.furnitureRotationRange.addEventListener("input", () => {
  syncFurnitureRotation(elements.furnitureRotationRange.value);
});
elements.furnitureRotationInput.addEventListener("input", () => {
  syncFurnitureRotation(elements.furnitureRotationInput.value);
});
$("#cancel-placement-button").addEventListener("click", () => {
  selectedReservationId = null;
  renderFloor();
  renderReservations();
  renderPlacementBanner();
});
$("#unassign-button").addEventListener("click", unassignSelectedReservation);

function applyTableModal() {
  if (blockDraftMutationWhileSaving(elements.tableModal)) return;
  clearModalError(elements.tableModal);
  if (!elements.tableForm.reportValidity()) {
    showModalError(elements.tableModal, "Corrigez les champs indiqués avant d’appliquer.");
    return;
  }
  if (saveTableFromForm()) closeDialog(elements.tableModal, "default");
}

function applyFurnitureModal() {
  if (blockDraftMutationWhileSaving(elements.furnitureModal)) return;
  clearModalError(elements.furnitureModal);
  if (!elements.furnitureForm.reportValidity()) {
    showModalError(elements.furnitureModal, "Corrigez les champs indiqués avant d’appliquer.");
    return;
  }
  if (saveFurnitureFromForm()) closeDialog(elements.furnitureModal, "default");
}

function applyVariantModal() {
  if (blockDraftMutationWhileSaving(elements.variantModal)) return;
  clearModalError(elements.variantModal);
  if (!elements.variantForm.reportValidity()) {
    showModalError(elements.variantModal, "Donnez un nom à cette variante.");
    return;
  }
  saveVariantFromForm();
}

elements.tableForm.addEventListener("submit", (event) => event.preventDefault());
elements.furnitureForm.addEventListener("submit", (event) => event.preventDefault());
elements.variantForm?.addEventListener("submit", (event) => event.preventDefault());
$("#apply-table-button").addEventListener("click", applyTableModal);
$("#apply-furniture-button").addEventListener("click", applyFurnitureModal);
$("#apply-variant-button").addEventListener("click", applyVariantModal);
bindEnterAction(elements.tableForm, applyTableModal);
bindEnterAction(elements.furnitureForm, applyFurnitureModal);
bindEnterAction(elements.variantForm, applyVariantModal);

[
  elements.tableModal,
  elements.furnitureModal,
  elements.serviceTableModal,
  elements.variantModal,
  elements.confirmModal
].forEach(bindDialog);

elements.confirmModal.addEventListener("close", () => {
  pendingConfirmAction = null;
});
$("#confirm-action-button").addEventListener("click", () => {
  if (blockDraftMutationWhileSaving(elements.confirmModal)) return;
  const action = pendingConfirmAction;
  pendingConfirmAction = null;
  if (!action) return;
  closeDialog(elements.confirmModal, "default");
  action();
});

elements.zones.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-zone]");
  if (!tab) return;
  state.selectedZone = tab.dataset.zone;
  render();
});

elements.reservationList.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (!action) return;
  if (action.dataset.action === "select-reservation") selectReservation(action.dataset.reservationId);
  if (action.dataset.action === "assign-recommended") assignReservation(action.dataset.reservationId, action.dataset.tableId);
  if (action.dataset.action === "unassign-reservation") assignReservation(action.dataset.reservationId, null);
});
elements.reservationList.addEventListener("change", (event) => {
  const select = event.target.closest('[data-action="reservation-status"]');
  if (select) updateReservationStatus(select.dataset.reservationId, select.value);
});
elements.reservationList.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest('[data-action="drag-reservation"]');
  if (handle) startReservationPointerDrag(event, handle.dataset.reservationId);
});
elements.reservationList.addEventListener("dragstart", (event) => {
  if (event.target.closest("button, select")) {
    event.preventDefault();
    return;
  }
  const card = event.target.closest("[data-reservation-id]");
  if (!card || state.mode !== "service" || pendingOperation) return;
  selectedReservationId = card.dataset.reservationId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", selectedReservationId);
  card.classList.add("dragging-card", "selected");
  renderFloor();
  renderPlacementBanner();
});
elements.reservationList.addEventListener("dragend", (event) => {
  event.target.closest("[data-reservation-id]")?.classList.remove("dragging-card");
});

elements.floor.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="add-table"]')) {
    openTableModal();
    return;
  }
  const node = event.target.closest(".table-node.furniture");
  const object = node && state.tables.find((item) => item.id === node.dataset.tableId && !item.editable);
  if (object && state.mode === "template" && (object.locked || event.detail === 0)) {
    openFurnitureModal(object);
    return;
  }
  const tableNode = event.target.closest(".table-node:not(.furniture)");
  const table = tableNode && state.tables.find((item) => item.id === tableNode.dataset.tableId && item.editable);
  if (table && event.detail === 0) {
    if (selectedReservationId) assignReservation(selectedReservationId, table.id);
    else if (state.mode === "template") openTableModal(table);
    else openServiceTableModal(table);
  }
});
elements.floor.addEventListener("pointerdown", (event) => {
  const node = event.target.closest(".table-node");
  if (!node) return;
  const table = state.tables.find((item) => item.id === node.dataset.tableId);
  if (table) startDragging(event, node, table);
});
elements.floor.addEventListener("pointermove", moveDragging);
elements.floor.addEventListener("pointerup", (event) => finishDragging(event, false));
elements.floor.addEventListener("pointercancel", (event) => finishDragging(event, true));
elements.floor.addEventListener("lostpointercapture", (event) => {
  if (dragState && event.pointerId === dragState.pointerId) finishDragging(event, true);
});
elements.floor.addEventListener("dragover", (event) => {
  const node = event.target.closest(".table-node");
  const table = node && state.tables.find((item) => item.id === node.dataset.tableId);
  const reservation = state.reservations.find((item) => item.id === selectedReservationId);
  if (table && reservation && tableCanHostReservation(table, reservation)) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }
});
elements.floor.addEventListener("drop", (event) => {
  event.preventDefault();
  const node = event.target.closest(".table-node");
  const reservationId = event.dataTransfer.getData("text/plain") || selectedReservationId;
  if (node && reservationId) assignReservation(reservationId, node.dataset.tableId);
});

$("#zoom-out-button").addEventListener("click", () => updateCanvasZoom(canvasZoom - ZOOM_STEP));
$("#zoom-reset-button").addEventListener("click", resetCanvasZoom);
$("#zoom-fit-button").addEventListener("click", fitCanvasToViewport);
$("#zoom-in-button").addEventListener("click", () => updateCanvasZoom(canvasZoom + ZOOM_STEP));
elements.floorViewport.addEventListener("wheel", (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  updateCanvasZoom(canvasZoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), event);
}, { passive: false });
elements.floorViewport.addEventListener("pointerdown", beginViewportGesture);
elements.floorViewport.addEventListener("pointermove", moveViewportGesture);
elements.floorViewport.addEventListener("pointerup", endViewportGesture);
elements.floorViewport.addEventListener("pointercancel", endViewportGesture);

window.addEventListener("pointermove", moveReservationPointerDrag, { passive: false });
window.addEventListener("pointerup", (event) => finishReservationPointerDrag(event, false));
window.addEventListener("pointercancel", (event) => finishReservationPointerDrag(event, true));

elements.serviceTableContent?.addEventListener("change", (event) => {
  const select = event.target.closest('[data-action="modal-reservation-status"]');
  if (select) updateReservationStatus(select.dataset.reservationId, select.value);
});
elements.serviceTableContent?.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (!action) return;
  if (action.dataset.action === "unassign-reservation") {
    closeDialog(elements.serviceTableModal, "default");
    assignReservation(action.dataset.reservationId, null);
  }
  if (action.dataset.action === "move-modal-reservation") {
    closeDialog(elements.serviceTableModal, "default");
    selectedReservationId = action.dataset.reservationId;
    selectedServiceTableId = null;
    render();
  }
});
elements.serviceTableModal?.addEventListener("close", () => {
  selectedServiceTableId = null;
});

window.addEventListener("keydown", (event) => {
  if (event.target.closest?.("input, select, textarea")) return;
  if (awaitingHydration) return;
  const focusedNode = document.activeElement?.closest?.(".table-node");
  const focusedItem = focusedNode
    ? state.tables.find((item) => item.id === focusedNode.dataset.tableId)
    : null;
  if (focusedItem && state.mode === "template" && !pendingOperation) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      if (focusedItem.locked) {
        showToast(`${focusedItem.name} est verrouillé.`, "warning");
        return;
      }
      const dimensions = getNodeDimensions(focusedItem);
      const step = event.shiftKey ? 16 : 4;
      const maxX = Math.max(0, ((CANVAS_WIDTH - dimensions.width) / CANVAS_WIDTH) * 100);
      const maxY = Math.max(0, ((CANVAS_HEIGHT - dimensions.height) / CANVAS_HEIGHT) * 100);
      const next = clone(state.tables);
      const item = next.find((candidate) => candidate.id === focusedItem.id);
      if (!item) return;
      if (event.key === "ArrowLeft") item.x = Math.max(0, item.x - (step / CANVAS_WIDTH) * 100);
      if (event.key === "ArrowRight") item.x = Math.min(maxX, item.x + (step / CANVAS_WIDTH) * 100);
      if (event.key === "ArrowUp") item.y = Math.max(0, item.y - (step / CANVAS_HEIGHT) * 100);
      if (event.key === "ArrowDown") item.y = Math.min(maxY, item.y + (step / CANVAS_HEIGHT) * 100);
      commitTables(next);
      window.requestAnimationFrame(() => {
        $$(".table-node", elements.floor)
          .find((node) => node.dataset.tableId === focusedItem.id)
          ?.focus();
      });
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (focusedItem.editable) {
        openTableModal(focusedItem);
        requestDeleteCurrentTable();
      } else {
        openFurnitureModal(focusedItem);
        requestDeleteCurrentFurniture();
      }
      return;
    }
  }
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo(); else undo();
  }
  if (modifier && event.key.toLowerCase() === "s") {
    event.preventDefault();
    savePlan();
  }
  if (event.key === "Escape" && selectedReservationId) {
    selectedReservationId = null;
    renderFloor();
    renderReservations();
    renderPlacementBanner();
  }
});
window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => syncCanvasZoom(true)).observe(elements.floorViewport);
}

window.setInterval(() => {
  if (state.mode !== "service" || pendingOperation || reservationPointerDrag) return;
  renderFloor();
  if (selectedServiceTableId && elements.serviceTableModal?.open) renderServiceTableModal();
}, 60_000);

if (window.parent !== window) postToDashboard("tok-table-v2:ready");
resetHistory(state.tables);
render();
