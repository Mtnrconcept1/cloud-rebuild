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
    dirty: false
  };
};

let state = loadState();
let history = { past: [], future: [], baseline: clone(state.tables) };
let selectedReservationId = null;
let dragState = null;
let dragFrame = 0;
let canvasZoom = 1;
let zoomWasChanged = false;
let pendingOperation = null;
let pendingAssignment = null;
let pendingConfirmAction = null;
const viewportPointers = new Map();
let viewportGesture = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
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
    const rawX = Number(raw?.x);
    const rawY = Number(raw?.y);
    const editable = raw?.editable !== false && String(raw?.kind || "table") === "table";
    return [{
      id,
      name: String(raw?.name || `T${index + 1}`).trim().slice(0, 40) || `T${index + 1}`,
      capacity: editable ? Math.max(1, Math.min(30, Math.round(Number(raw?.capacity) || 1))) : 0,
      zone: String(raw?.zone || "Salle principale").trim().slice(0, 60) || "Salle principale",
      shape: ["round", "square", "rectangle"].includes(raw?.shape) ? raw.shape : "rectangle",
      x: Math.max(0, Math.min(94, Number.isFinite(rawX) ? rawX : 0)),
      y: Math.max(0, Math.min(86, Number.isFinite(rawY) ? rawY : 0)),
      blocked: Boolean(raw?.blocked),
      editable,
      kind: editable ? "table" : String(raw?.kind || "furniture")
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
      status: String(raw?.status || "pending")
    }];
  });
}

function postToDashboard(type, payload = {}) {
  if (window.parent === window) return;
  window.parent.postMessage({ source: BRIDGE_SOURCE, type, payload }, window.location.origin);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function editableTables(tables = state.tables) {
  return tables.filter((table) => table.editable);
}

function tableSignature(tables) {
  return JSON.stringify(editableTables(tables)
    .map((table) => ({
      id: table.id,
      name: table.name,
      capacity: table.capacity,
      zone: table.zone,
      shape: table.shape,
      x: Math.round(table.x * 1000) / 1000,
      y: Math.round(table.y * 1000) / 1000,
      blocked: table.blocked
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

function resetHistory(tables) {
  history = { past: [], future: [], baseline: clone(tables) };
  setDirty(false);
}

function commitTables(nextTables, beforeTables = state.tables) {
  if (tableSignature(nextTables) === tableSignature(beforeTables)) return false;
  history.past.push(clone(beforeTables));
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future = [];
  state.tables = clone(nextTables);
  updateDirty();
  render();
  return true;
}

function undo() {
  if (!history.past.length || pendingOperation) return;
  history.future.unshift(clone(state.tables));
  state.tables = history.past.pop();
  updateDirty();
  render();
}

function redo() {
  if (!history.future.length || pendingOperation) return;
  history.past.push(clone(state.tables));
  state.tables = history.future.shift();
  updateDirty();
  render();
}

function cancelChanges() {
  if (!state.dirty || pendingOperation) return;
  state.tables = clone(history.baseline);
  history.past = [];
  history.future = [];
  setDirty(false);
  render();
  showToast("Modifications annulées.");
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
  elements.date.value = state.selectedDate;
  elements.period.value = state.selectedPeriod;
  elements.modeServiceButton.classList.toggle("active", state.mode === "service");
  elements.modeServiceButton.setAttribute("aria-pressed", String(state.mode === "service"));
  elements.modeTemplateButton.classList.toggle("active", state.mode === "template");
  elements.modeTemplateButton.setAttribute("aria-pressed", String(state.mode === "template"));
  renderSummary();
  renderZones();
  renderFloor();
  renderReservations();
  renderPlacementBanner();
  renderControls();
  refreshZoneFields();
  saveState();
  window.requestAnimationFrame(() => syncCanvasZoom(true));
}

function renderSummary() {
  const reservations = serviceReservations();
  const assigned = reservations.filter((item) => item.tableId).length;
  const seats = editableTables().filter((table) => !table.blocked).reduce((sum, table) => sum + table.capacity, 0);
  elements.floorModeLabel.textContent = state.mode === "template" ? "MODÈLE DE SALLE" : "SERVICE";
  elements.floorSummary.textContent = state.mode === "template"
    ? `${editableTables().length} table${editableTables().length > 1 ? "s" : ""} · ${seats} assise${seats > 1 ? "s" : ""}`
    : `${assigned}/${reservations.length} réservation${reservations.length > 1 ? "s" : ""} placée${assigned > 1 ? "s" : ""}`;
  elements.clientSummary.textContent = `${assigned}/${reservations.length} placée${assigned > 1 ? "s" : ""}`;
  elements.dragHint.textContent = state.mode === "template"
    ? "Faites glisser une table pour la déplacer. Cliquez dessus pour modifier ses assises, sa forme ou sa zone."
    : "Sélectionnez un client puis cliquez sur une table. Faites glisser une table pour modifier uniquement ce service.";
}

function renderControls() {
  elements.undoButton.disabled = history.past.length === 0 || Boolean(pendingOperation);
  elements.redoButton.disabled = history.future.length === 0 || Boolean(pendingOperation);
  elements.saveButton.disabled = !state.dirty || Boolean(pendingOperation);
  elements.cancelChangesButton.disabled = !state.dirty || Boolean(pendingOperation);
  elements.autoPlaceButton.disabled = Boolean(pendingOperation);
  elements.saveButton.textContent = state.mode === "template" ? "Enregistrer le modèle" : "Enregistrer ce service";

  if (pendingOperation) {
    elements.connectionLabel.textContent = "Enregistrement…";
  } else if (state.dirty) {
    elements.connectionLabel.textContent = "Modifications à enregistrer";
  } else if (state.connected) {
    elements.connectionLabel.textContent = "Synchronisé";
  } else {
    elements.connectionLabel.textContent = "Sauvegarde locale";
  }
}

function renderZones() {
  elements.zones.innerHTML = zones().map((zone) => {
    const count = state.tables.filter((table) => table.zone === zone && table.editable).length;
    return `<button class="zone-tab ${zone === state.selectedZone ? "active" : ""}" data-zone="${escapeHtml(zone)}" role="tab" aria-selected="${zone === state.selectedZone}">${escapeHtml(zone)} · ${count}</button>`;
  }).join("");
}

function getNodeDimensions(table) {
  if (!table.editable) return { width: 112, height: 68 };
  return { width: table.shape === "rectangle" ? 132 : 92, height: 92 };
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
    const reservations = assignments.get(table.id) || [];
    const reservation = reservations[0] || null;
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
    const targetClass = selectedReservation
      ? placementError ? "invalid-target" : "valid-target"
      : "";
    const currentClass = selectedReservation?.tableId === table.id ? "current-target" : "";
    const node = document.createElement("button");
    node.type = "button";
    node.className = `table-node ${table.shape} ${table.editable ? "" : "furniture"} ${table.blocked ? "blocked" : reservation ? "occupied" : ""} ${targetClass} ${currentClass}`.trim();
    node.dataset.tableId = table.id;
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.setAttribute("aria-label", table.editable
      ? `${table.name}, ${table.capacity} places${reservation ? `, ${reservations.map((item) => item.name).join(", ")}` : table.blocked ? ", indisponible" : ", libre"}${placementError ? `, ${placementError}` : ""}`
      : `${table.name}, mobilier`);
    if (!table.editable) node.tabIndex = -1;
    node.innerHTML = `
      ${getChairMarkup(table)}
      <span class="table-name">${escapeHtml(table.name)}</span>
      ${table.editable ? `<span class="table-capacity">${table.capacity} assise${table.capacity > 1 ? "s" : ""}</span>` : `<span class="table-capacity">Mobilier</span>`}
      ${reservation ? `<span class="table-guest">${escapeHtml(guestLabel)}</span>` : ""}`;
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
    const initials = reservation.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    const selected = reservation.id === selectedReservationId;
    return `
      <article class="reservation-card ${selected ? "selected" : ""}" draggable="true" data-reservation-id="${reservation.id}" aria-selected="${selected}">
        <span class="guest-avatar">${escapeHtml(initials)}</span>
        <div class="reservation-main">
          <div class="reservation-name">
            <strong>${escapeHtml(reservation.name)}</strong>
            <span class="status-tag ${table ? "assigned" : "unassigned"}">${table ? "Placée" : "À placer"}</span>
          </div>
          <div class="reservation-meta"><span>${escapeHtml(reservation.time)}</span><span>•</span><span>${reservation.size} convive${reservation.size > 1 ? "s" : ""}</span>${reservation.preferredZone ? `<span>•</span><span>${escapeHtml(reservation.preferredZone)}</span>` : ""}</div>
          ${reservation.note ? `<div class="reservation-note">${escapeHtml(reservation.note)}</div>` : ""}
        </div>
        <button class="assignment-button ${table ? "assigned" : ""}" type="button" data-action="select-reservation" data-reservation-id="${reservation.id}" aria-pressed="${selected}">${table ? escapeHtml(table.name) : "Placer"}</button>
      </article>`;
  }).join("");
}

function renderPlacementBanner() {
  const reservation = state.reservations.find((item) => item.id === selectedReservationId);
  elements.placementBanner.classList.toggle("hidden", !reservation || state.mode !== "service");
  if (!reservation) return;
  elements.placementTitle.textContent = `Placer ${reservation.name}`;
  elements.placementCopy.textContent = `Cliquez sur une table compatible pour ${reservation.size} convive${reservation.size > 1 ? "s" : ""}.`;
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

function beginOperation(kind, requestId) {
  pendingOperation = { kind, requestId };
  document.body.classList.remove("sync-error");
  renderControls();
  document.body.classList.add("saving");
}

function finishOperation() {
  pendingOperation = null;
  document.body.classList.remove("saving");
  renderControls();
}

function assignReservation(reservationId, tableId) {
  if (pendingOperation) return;
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
  reservation.tableId = tableId;
  selectedReservationId = null;
  render();

  if (!state.connected) {
    saveState();
    showToast(tableId ? `Client placé sur ${table.name}.` : "Placement retiré.", "success");
    return;
  }

  const requestId = createRequestId("assignment");
  pendingAssignment = { reservationId, previousTableId };
  beginOperation("assignment", requestId);
  postToDashboard("tok-table-v2:assign", { requestId, reservationId, tableId });
}

function unassignSelectedReservation() {
  if (!selectedReservationId) return;
  assignReservation(selectedReservationId, null);
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
  elements.tableModal.showModal();
  window.setTimeout(() => fields.name.select(), 30);
}

function nextTableName() {
  const names = new Set(state.tables.map((table) => table.name.toLocaleLowerCase("fr")));
  let number = editableTables().length + 1;
  while (names.has(`t${number}`.toLocaleLowerCase("fr"))) number += 1;
  return `T${number}`;
}

function saveTableFromForm() {
  const form = new FormData(elements.tableForm);
  const id = String(form.get("id") || "");
  const name = String(form.get("name") || "").trim();
  const capacity = Math.round(Number(form.get("capacity")));
  const zone = String(form.get("zone") || "").trim();
  const shape = String(form.get("shape") || "round");
  const blocked = form.get("active") !== "on";
  if (!name || name.length > 40 || !zone || zone.length > 60 || capacity < 1 || capacity > 30) return false;

  const duplicate = editableTables().find((item) => item.id !== id && item.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"));
  if (duplicate) {
    showToast("Une table porte déjà ce nom.", "warning");
    return false;
  }

  const incompatible = state.reservations.find((reservation) => (
    reservation.tableId === id && (blocked || reservation.size > capacity)
  ));
  if (incompatible) {
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
  elements.tableModal.close();
  commitTables(next);
  showToast(`${name} ajoutée au brouillon.`, "success");
}

function requestDeleteCurrentTable() {
  const id = elements.tableForm.elements.id.value;
  const table = state.tables.find((item) => item.id === id && item.editable);
  if (!table) return;
  const assigned = state.reservations.find((reservation) => reservation.tableId === id);
  if (assigned) {
    showToast(`Retirez d’abord le placement de ${assigned.name}.`, "warning");
    return;
  }
  elements.tableModal.close();
  $("#confirm-title").textContent = `Supprimer ${table.name} ?`;
  $("#confirm-copy").textContent = "La suppression sera définitive après l’enregistrement du modèle.";
  pendingConfirmAction = () => {
    const next = state.tables.filter((item) => item.id !== id);
    commitTables(next);
    showToast(`${table.name} retirée du brouillon.`);
  };
  elements.confirmModal.showModal();
}

function savePlan() {
  if (!state.dirty || pendingOperation) return;
  if (!state.connected) {
    history.baseline = clone(state.tables);
    setDirty(false);
    saveState();
    render();
    showToast(state.mode === "template" ? "Modèle enregistré localement." : "Service enregistré localement.", "success");
    return;
  }
  const requestId = createRequestId(state.mode === "template" ? "template" : "service_layout");
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
  beginOperation(state.mode === "template" ? "template" : "service-layout", requestId);
  postToDashboard(
    state.mode === "template" ? "tok-table-v2:save-template" : "tok-table-v2:save-service-layout",
    { requestId, tables }
  );
}

function switchMode(nextMode) {
  if (nextMode === state.mode) return;
  if (state.dirty) {
    showToast("Enregistrez ou annulez les modifications avant de changer de mode.", "warning");
    return;
  }
  state.mode = nextMode;
  selectedReservationId = null;
  state.tables = clone(nextMode === "template" ? state.serverTemplateTables : state.serverServiceTables);
  resetHistory(state.tables);
  render();
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
  if (!table.editable || pendingOperation || event.button !== 0) return;
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
    moved: false
  };
  node.setPointerCapture(event.pointerId);
  node.classList.add("dragging");
  event.preventDefault();
  event.stopPropagation();
}

function paintDragging(clientX, clientY) {
  if (!dragState) return;
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
  if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 5) dragState.moved = true;
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
  if (current.moved) {
    const next = clone(state.tables);
    const movedTable = next.find((item) => item.id === current.tableId);
    movedTable.x = Math.max(0, Math.min(94, (current.nextLeft / CANVAS_WIDTH) * 100));
    movedTable.y = Math.max(0, Math.min(86, (current.nextTop / CANVAS_HEIGHT) * 100));
    commitTables(next, current.beforeTables);
    return;
  }

  if (state.mode === "template") {
    openTableModal(table);
  } else if (selectedReservationId) {
    assignReservation(selectedReservationId, table.id);
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

function applyIdMap(idMap) {
  if (!idMap || typeof idMap !== "object") return;
  const replace = (tables) => tables.map((table) => ({ ...table, id: typeof idMap[table.id] === "string" ? idMap[table.id] : table.id }));
  state.tables = replace(state.tables);
  state.serverTemplateTables = replace(state.serverTemplateTables);
  state.serverServiceTables = replace(state.serverServiceTables);
}

function hydrateConnectedState(payload) {
  if (!payload || !Array.isArray(payload.reservations)) return;
  const templateTables = sanitizeTables(payload.templateTables || payload.tables || []);
  const serviceTables = sanitizeTables(payload.serviceTables || payload.tables || []);
  const incomingBranchId = String(payload.branchId || "");
  const reservations = sanitizeReservations(payload.reservations, serviceTables, payload.selectedDate || todayIso());
  const branchChanged = state.branchId && state.branchId !== incomingBranchId;

  state.connected = true;
  state.branchId = incomingBranchId;
  state.selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.selectedDate || "")) ? payload.selectedDate : todayIso();
  state.selectedPeriod = payload.selectedPeriod === "midi" ? "midi" : "soir";
  state.reservations = reservations;
  state.serverTemplateTables = clone(templateTables);
  state.serverServiceTables = clone(serviceTables);

  if (!state.dirty || branchChanged) {
    state.tables = clone(state.mode === "template" ? templateTables : serviceTables);
    resetHistory(state.tables);
  }
  if (!state.tables.some((table) => table.zone === state.selectedZone)) {
    state.selectedZone = state.tables[0]?.zone || "Salle principale";
  }
  if (selectedReservationId && !reservations.some((reservation) => reservation.id === selectedReservationId)) {
    selectedReservationId = null;
  }
  render();
}

function handleOperationSuccess(payload) {
  if (pendingOperation && payload?.requestId && payload.requestId !== pendingOperation.requestId) return;
  const kind = payload?.kind || pendingOperation?.kind;
  if (kind === "template") {
    applyIdMap(payload?.idMap);
    state.serverTemplateTables = clone(state.tables);
    history.baseline = clone(state.tables);
    history.past = [];
    history.future = [];
    setDirty(false);
  }
  if (kind === "service-layout") {
    state.serverServiceTables = clone(state.tables);
    history.baseline = clone(state.tables);
    history.past = [];
    history.future = [];
    setDirty(false);
  }
  pendingAssignment = null;
  finishOperation();
  render();
  if (payload?.message) showToast(payload.message, "success");
}

function handleOperationError(payload) {
  if (pendingOperation && payload?.requestId && payload.requestId !== pendingOperation.requestId) return;
  if (pendingAssignment) {
    const reservation = state.reservations.find((item) => item.id === pendingAssignment.reservationId);
    if (reservation) reservation.tableId = pendingAssignment.previousTableId;
  }
  pendingAssignment = null;
  finishOperation();
  document.body.classList.add("sync-error");
  render();
  showToast(payload?.message || "L’opération n’a pas pu être enregistrée.", "warning");
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
  selectedReservationId = null;
  if (state.connected) postToDashboard("tok-table-v2:service-change", { date: state.selectedDate, period: state.selectedPeriod });
  render();
});
elements.modeServiceButton.addEventListener("click", () => switchMode("service"));
elements.modeTemplateButton.addEventListener("click", () => switchMode("template"));
elements.search.addEventListener("input", renderReservations);
elements.filter.addEventListener("change", renderReservations);
elements.autoPlaceButton.addEventListener("click", autoPlace);
$("#add-table-button").addEventListener("click", () => openTableModal());
elements.saveButton.addEventListener("click", savePlan);
elements.cancelChangesButton.addEventListener("click", cancelChanges);
elements.undoButton.addEventListener("click", undo);
elements.redoButton.addEventListener("click", redo);
$("#delete-table-button").addEventListener("click", requestDeleteCurrentTable);
$("#duplicate-table-button").addEventListener("click", duplicateCurrentTable);
$("#cancel-placement-button").addEventListener("click", () => {
  selectedReservationId = null;
  renderFloor();
  renderReservations();
  renderPlacementBanner();
});
$("#unassign-button").addEventListener("click", unassignSelectedReservation);

elements.tableForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  if (saveTableFromForm()) elements.tableModal.close();
});
elements.confirmModal.addEventListener("close", () => {
  if (elements.confirmModal.returnValue === "default" && pendingConfirmAction) pendingConfirmAction();
  pendingConfirmAction = null;
});

elements.zones.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-zone]");
  if (!tab) return;
  state.selectedZone = tab.dataset.zone;
  render();
});

elements.reservationList.addEventListener("click", (event) => {
  const action = event.target.closest('[data-action="select-reservation"]');
  if (action) selectReservation(action.dataset.reservationId);
});
elements.reservationList.addEventListener("dragstart", (event) => {
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
  if (event.target.closest('[data-action="add-table"]')) openTableModal();
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

window.addEventListener("keydown", (event) => {
  if (event.target.closest?.("input, select, textarea")) return;
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

if (window.parent !== window) postToDashboard("tok-table-v2:ready");
resetHistory(state.tables);
render();
