"use strict";

const STORAGE_KEY = "tok-table-v2";
const BRIDGE_SOURCE = "tok-table-v2";
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.1;
const DEFAULT_RESERVATION_DURATION_MINUTES = 120;

const todayIso = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const initialState = () => ({
  connected: false,
  branchId: null,
  selectedDate: todayIso(),
  selectedPeriod: "soir",
  selectedZone: "Salle principale",
  tables: [
    { id: "t1", name: "T1", capacity: 2, zone: "Salle principale", shape: "round", x: 8, y: 12, blocked: false },
    { id: "t2", name: "T2", capacity: 4, zone: "Salle principale", shape: "square", x: 30, y: 10, blocked: false },
    { id: "t3", name: "T3", capacity: 4, zone: "Salle principale", shape: "square", x: 57, y: 10, blocked: false },
    { id: "t4", name: "T4", capacity: 6, zone: "Salle principale", shape: "rectangle", x: 78, y: 10, blocked: false },
    { id: "t5", name: "T5", capacity: 2, zone: "Salle principale", shape: "round", x: 10, y: 42, blocked: false },
    { id: "t6", name: "T6", capacity: 4, zone: "Salle principale", shape: "round", x: 35, y: 41, blocked: false },
    { id: "t7", name: "T7", capacity: 8, zone: "Salle principale", shape: "rectangle", x: 62, y: 42, blocked: false },
    { id: "t8", name: "T8", capacity: 2, zone: "Salle principale", shape: "square", x: 9, y: 72, blocked: false },
    { id: "t9", name: "T9", capacity: 4, zone: "Salle principale", shape: "square", x: 33, y: 70, blocked: false },
    { id: "t10", name: "T10", capacity: 6, zone: "Salle principale", shape: "rectangle", x: 61, y: 70, blocked: false },
    { id: "t11", name: "T11", capacity: 4, zone: "Terrasse", shape: "square", x: 10, y: 15, blocked: false },
    { id: "t12", name: "T12", capacity: 4, zone: "Terrasse", shape: "square", x: 40, y: 15, blocked: false },
    { id: "t13", name: "T13", capacity: 2, zone: "Terrasse", shape: "round", x: 72, y: 15, blocked: false },
    { id: "t14", name: "T14", capacity: 6, zone: "Terrasse", shape: "rectangle", x: 12, y: 55, blocked: false },
    { id: "t15", name: "T15", capacity: 8, zone: "Salon privé", shape: "rectangle", x: 18, y: 30, blocked: false },
    { id: "t16", name: "T16", capacity: 10, zone: "Salon privé", shape: "rectangle", x: 58, y: 30, blocked: false }
  ],
  reservations: [
    { id: "r1", name: "Famille Martin", size: 4, time: "19:30", date: todayIso(), period: "soir", preferredZone: "Salle principale", note: "Chaise bébé", tableId: null },
    { id: "r2", name: "Sophie Bernard", size: 2, time: "19:45", date: todayIso(), period: "soir", preferredZone: "Terrasse", note: "", tableId: null },
    { id: "r3", name: "Groupe Dubois", size: 7, time: "20:00", date: todayIso(), period: "soir", preferredZone: "", note: "Anniversaire", tableId: null },
    { id: "r4", name: "Marc Rossi", size: 3, time: "20:15", date: todayIso(), period: "soir", preferredZone: "Salle principale", note: "", tableId: null },
    { id: "r5", name: "Claire Lopez", size: 2, time: "20:30", date: todayIso(), period: "soir", preferredZone: "", note: "Allergie aux noix", tableId: null }
  ]
});

let state = loadState();
let dragState = null;
let canvasZoom = 1;
let zoomWasChanged = false;
let floorBaseWidth = 0;
let floorBaseHeight = 560;
const viewportPointers = new Map();
let viewportGesture = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
  date: $("#service-date"),
  period: $("#service-period"),
  summary: $("#service-summary"),
  stats: $("#stats-grid"),
  zones: $("#zone-tabs"),
  floor: $("#floor"),
  floorViewport: $("#floor-viewport"),
  floorStage: $("#floor-stage"),
  floorEmpty: $("#floor-empty"),
  reservationList: $("#reservation-list"),
  search: $("#reservation-search"),
  filter: $("#reservation-filter"),
  tableModal: $("#table-modal"),
  tableForm: $("#table-form"),
  reservationModal: $("#reservation-modal"),
  reservationForm: $("#reservation-form"),
  dataModal: $("#data-modal"),
  toastRegion: $("#toast-region"),
  zoomValue: $("#zoom-value"),
  connectionLabel: $("#connection-label")
};

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || !Array.isArray(parsed.tables) || !Array.isArray(parsed.reservations)) return initialState();
    return sanitizeState({ ...initialState(), ...parsed });
  } catch {
    return initialState();
  }
}

function sanitizeState(candidate) {
  const fallback = initialState();
  const seenTableIds = new Set();
  const seenTableNames = new Set();
  const cleanTables = [];

  candidate.tables.forEach((raw, index) => {
    const id = String(raw?.id || uid("table"));
    let name = String(raw?.name || `T${index + 1}`).trim().slice(0, 20);
    if (!name) name = `T${index + 1}`;
    const nameKey = name.toLocaleLowerCase("fr");
    if (seenTableIds.has(id) || seenTableNames.has(nameKey)) return;
    seenTableIds.add(id);
    seenTableNames.add(nameKey);
    cleanTables.push({
      id,
      name,
      capacity: Math.max(1, Math.min(30, Number(raw?.capacity) || 1)),
      zone: String(raw?.zone || "Salle principale").trim().slice(0, 30) || "Salle principale",
      shape: ["round", "square", "rectangle"].includes(raw?.shape) ? raw.shape : "round",
      x: Math.max(0, Math.min(94, Number(raw?.x) || 0)),
      y: Math.max(0, Math.min(86, Number(raw?.y) || 0)),
      blocked: Boolean(raw?.blocked)
    });
  });

  const tableById = new Map(cleanTables.map((table) => [table.id, table]));
  const cleanReservations = [];
  candidate.reservations.forEach((raw) => {
    const name = String(raw?.name || "").trim().slice(0, 60);
    if (!name) return;
    const size = Math.max(1, Math.min(30, Number(raw?.size) || 1));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw?.date) ? raw.date : fallback.selectedDate;
    const period = raw?.period === "midi" ? "midi" : "soir";
    let tableId = tableById.has(raw?.tableId) ? raw.tableId : null;
    const table = tableById.get(tableId);
    if (!table || table.blocked || table.capacity < size) tableId = null;
    cleanReservations.push({
      id: String(raw?.id || uid("reservation")),
      name,
      size,
      time: /^\d{2}:\d{2}$/.test(raw?.time) ? raw.time : (period === "midi" ? "12:30" : "19:30"),
      date,
      period,
      preferredZone: String(raw?.preferredZone || "").trim().slice(0, 30),
      note: String(raw?.note || "").trim().slice(0, 180),
      tableId
    });
  });

  const availableZones = [...new Set(cleanTables.map((table) => table.zone))];
  return {
    selectedDate: /^\d{4}-\d{2}-\d{2}$/.test(candidate.selectedDate) ? candidate.selectedDate : fallback.selectedDate,
    selectedPeriod: candidate.selectedPeriod === "midi" ? "midi" : "soir",
    selectedZone: availableZones.includes(candidate.selectedZone) ? candidate.selectedZone : (availableZones[0] || "Salle principale"),
    tables: cleanTables,
    reservations: cleanReservations
  };
}

function saveState() {
  if (state.connected) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function postToDashboard(type, payload = {}) {
  if (window.parent === window) return;
  window.parent.postMessage({ source: BRIDGE_SOURCE, type, payload }, window.location.origin);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function serviceReservations() {
  return state.reservations
    .filter((reservation) => reservation.date === state.selectedDate && reservation.period === state.selectedPeriod)
    .sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
}

function zones() {
  const values = [...new Set(state.tables.map((table) => table.zone.trim()).filter(Boolean))];
  return values.length ? values.sort((a, b) => a.localeCompare(b, "fr")) : ["Salle principale"];
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

function tableCanHostReservation(table, reservation, assignments = currentAssignmentMap()) {
  if (!table || !reservation || table.blocked || table.capacity < reservation.size) return false;
  return !(assignments.get(table.id) || []).some((candidate) => reservationsConflict(candidate, reservation));
}

function render() {
  const availableZones = zones();
  if (!availableZones.includes(state.selectedZone)) state.selectedZone = availableZones[0];
  document.body.classList.toggle("connected-mode", Boolean(state.connected));
  elements.connectionLabel.textContent = state.connected ? "Données réelles synchronisées" : "Sauvegarde locale";
  elements.date.value = state.selectedDate;
  elements.period.value = state.selectedPeriod;
  renderSummary();
  renderStats();
  renderZones();
  renderFloor();
  renderReservations();
  refreshZoneFields();
  saveState();
  window.requestAnimationFrame(() => syncCanvasZoom(false));
}

function renderSummary() {
  const date = new Date(`${state.selectedDate}T12:00:00`);
  const formatted = new Intl.DateTimeFormat("fr-CH", { weekday: "long", day: "numeric", month: "long" }).format(date);
  elements.summary.textContent = `Service du ${formatted} · ${state.selectedPeriod === "midi" ? "midi" : "soir"}`;
}

function renderStats() {
  const reservations = serviceReservations();
  const guests = reservations.reduce((sum, item) => sum + Number(item.size), 0);
  const assigned = reservations.filter((item) => item.tableId).length;
  const occupiedTables = new Set(reservations.filter((item) => item.tableId).map((item) => item.tableId)).size;
  const usableTables = state.tables.filter((table) => !table.blocked).length;
  const totalSeats = state.tables.filter((table) => !table.blocked).reduce((sum, table) => sum + Number(table.capacity), 0);
  const seatedGuests = reservations.filter((item) => item.tableId).reduce((sum, item) => sum + Number(item.size), 0);
  const occupancy = totalSeats ? Math.min(100, Math.round((seatedGuests / totalSeats) * 100)) : 0;

  const stats = [
    ["♟", guests, "Convives attendus"],
    ["▦", `${occupiedTables}/${usableTables}`, "Tables occupées"],
    ["✓", `${assigned}/${reservations.length}`, "Réservations placées"],
    ["◔", `${occupancy}%`, "Taux d’occupation"]
  ];

  elements.stats.innerHTML = stats.map(([icon, value, label]) => `
    <article class="stat-card">
      <span class="stat-icon" aria-hidden="true">${icon}</span>
      <div class="stat-copy"><strong>${value}</strong><span>${label}</span></div>
    </article>`).join("");
}

function renderZones() {
  elements.zones.innerHTML = zones().map((zone) => {
    const count = state.tables.filter((table) => table.zone === zone).length;
    return `<button class="zone-tab ${zone === state.selectedZone ? "active" : ""}" data-zone="${escapeHtml(zone)}" role="tab" aria-selected="${zone === state.selectedZone}">${escapeHtml(zone)} · ${count}</button>`;
  }).join("");
}

function renderFloor() {
  $$(".table-node", elements.floor).forEach((node) => node.remove());
  const assignment = currentAssignmentMap();
  const visibleTables = state.tables.filter((table) => table.zone === state.selectedZone);
  elements.floorEmpty.classList.toggle("hidden", visibleTables.length > 0);

  visibleTables.forEach((table) => {
    const reservations = assignment.get(table.id) || [];
    const reservation = reservations[0] || null;
    const guestLabel = reservations.length > 1
      ? `${reservation.name} +${reservations.length - 1}`
      : reservation?.name || "";
    const node = document.createElement("button");
    node.type = "button";
    node.className = `table-node ${table.shape} ${table.blocked ? "blocked" : reservation ? "occupied" : ""}`;
    node.dataset.tableId = table.id;
    const nodeWidth = table.shape === "rectangle" ? 134 : 94;
    node.style.left = `clamp(2px, ${table.x}%, calc(100% - ${nodeWidth}px))`;
    node.style.top = `clamp(2px, ${table.y}%, calc(100% - 94px))`;
    node.setAttribute("aria-label", `${table.name}, ${table.capacity} places${reservation ? `, ${reservations.map((item) => item.name).join(", ")}` : table.blocked ? ", indisponible" : ", libre"}`);
    node.innerHTML = `
      <i class="chair top"></i><i class="chair right"></i><i class="chair bottom"></i><i class="chair left"></i>
      <span class="table-name">${escapeHtml(table.name)}</span>
      <span class="table-capacity">${table.capacity} place${table.capacity > 1 ? "s" : ""}</span>
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
    return `
      <article class="reservation-card">
        <span class="guest-avatar">${escapeHtml(initials)}</span>
        <div class="reservation-main">
          <div class="reservation-name">
            <strong>${escapeHtml(reservation.name)}</strong>
            <span class="status-tag ${table ? "assigned" : "unassigned"}">${table ? "Placée" : "À placer"}</span>
          </div>
          <div class="reservation-meta"><span>${escapeHtml(reservation.time)}</span><span>•</span><span>${reservation.size} convive${reservation.size > 1 ? "s" : ""}</span>${reservation.preferredZone ? `<span>•</span><span>${escapeHtml(reservation.preferredZone)}</span>` : ""}</div>
          ${reservation.note ? `<div class="reservation-note">${escapeHtml(reservation.note)}</div>` : ""}
        </div>
        <button class="assignment-button ${table ? "assigned" : ""}" type="button" data-action="assign" data-reservation-id="${reservation.id}">${table ? escapeHtml(table.name) : "Placer"}</button>
        <button class="edit-reservation" type="button" data-action="edit-reservation" data-reservation-id="${reservation.id}" aria-label="Modifier ${escapeHtml(reservation.name)}"></button>
      </article>`;
  }).join("");
}

function refreshZoneFields() {
  const options = zones();
  $("#zone-list").innerHTML = options.map((zone) => `<option value="${escapeHtml(zone)}"></option>`).join("");
  const select = elements.reservationForm.elements.preferredZone;
  const value = select.value;
  select.innerHTML = `<option value="">Aucune préférence</option>${options.map((zone) => `<option value="${escapeHtml(zone)}">${escapeHtml(zone)}</option>`).join("")}`;
  if ([...select.options].some((option) => option.value === value)) select.value = value;
}

function showToast(message, kind = "") {
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.textContent = message;
  elements.toastRegion.appendChild(toast);
  setTimeout(() => toast.remove(), 3600);
}

function openTableModal(table = null) {
  elements.tableForm.reset();
  const fields = elements.tableForm.elements;
  fields.id.value = table?.id ?? "";
  fields.name.value = table?.name ?? `T${state.tables.length + 1}`;
  fields.capacity.value = table?.capacity ?? 4;
  fields.zone.value = table?.zone ?? state.selectedZone;
  fields.shape.value = table?.shape ?? "round";
  fields.blocked.checked = table?.blocked ?? false;
  $("#table-modal-title").textContent = table ? `Modifier ${table.name}` : "Ajouter une table";
  $("#delete-table-button").classList.toggle("hidden", !table);
  elements.tableModal.showModal();
  setTimeout(() => fields.name.select(), 30);
}

function openReservationModal(reservation = null) {
  elements.reservationForm.reset();
  refreshZoneFields();
  const fields = elements.reservationForm.elements;
  fields.id.value = reservation?.id ?? "";
  fields.name.value = reservation?.name ?? "";
  fields.size.value = reservation?.size ?? 2;
  fields.time.value = reservation?.time ?? (state.selectedPeriod === "midi" ? "12:30" : "19:30");
  fields.preferredZone.value = reservation?.preferredZone ?? "";
  fields.note.value = reservation?.note ?? "";
  $("#reservation-modal-title").textContent = reservation ? `Modifier ${reservation.name}` : "Ajouter une réservation";
  $("#delete-reservation-button").classList.toggle("hidden", !reservation);
  elements.reservationModal.showModal();
  setTimeout(() => fields.name.focus(), 30);
}

function saveTableFromForm() {
  const form = new FormData(elements.tableForm);
  const id = String(form.get("id") || "");
  const table = {
    id: id || uid("table"),
    name: String(form.get("name")).trim(),
    capacity: Number(form.get("capacity")),
    zone: String(form.get("zone")).trim(),
    shape: String(form.get("shape")),
    blocked: form.get("blocked") === "on"
  };
  if (!table.name || !table.zone || table.capacity < 1) return false;

  const duplicate = state.tables.find((item) => item.id !== id && item.name.toLocaleLowerCase("fr") === table.name.toLocaleLowerCase("fr"));
  if (duplicate) {
    showToast("Une table porte déjà ce nom.", "warning");
    return false;
  }

  const existing = state.tables.find((item) => item.id === id);
  if (existing) Object.assign(existing, table);
  else state.tables.push({ ...table, x: 8 + (state.tables.length * 13) % 72, y: 12 + (state.tables.length * 17) % 68 });

  state.reservations.forEach((reservation) => {
    if (reservation.tableId === table.id && (table.blocked || reservation.size > table.capacity)) reservation.tableId = null;
  });
  state.selectedZone = table.zone;
  render();
  showToast(existing ? "Table mise à jour." : "Table ajoutée.", "success");
  return true;
}

function saveReservationFromForm() {
  const form = new FormData(elements.reservationForm);
  const id = String(form.get("id") || "");
  const existing = state.reservations.find((item) => item.id === id);
  const reservation = {
    id: id || uid("reservation"),
    name: String(form.get("name")).trim(),
    size: Number(form.get("size")),
    time: String(form.get("time")),
    preferredZone: String(form.get("preferredZone")),
    note: String(form.get("note")).trim(),
    date: existing?.date ?? state.selectedDate,
    period: existing?.period ?? state.selectedPeriod,
    tableId: existing?.tableId ?? null
  };
  if (!reservation.name || !reservation.time || reservation.size < 1) return false;

  if (reservation.tableId) {
    const currentTable = state.tables.find((table) => table.id === reservation.tableId);
    if (!currentTable || currentTable.blocked || currentTable.capacity < reservation.size) reservation.tableId = null;
  }

  if (existing) Object.assign(existing, reservation);
  else state.reservations.push(reservation);
  render();
  showToast(existing ? "Réservation mise à jour." : "Réservation ajoutée.", "success");
  return true;
}

function deleteTable() {
  const id = elements.tableForm.elements.id.value;
  const table = state.tables.find((item) => item.id === id);
  if (!table || !confirm(`Supprimer définitivement la table ${table.name} ?`)) return;
  state.tables = state.tables.filter((item) => item.id !== id);
  state.reservations.forEach((reservation) => { if (reservation.tableId === id) reservation.tableId = null; });
  elements.tableModal.close();
  render();
  showToast("Table supprimée.");
}

function deleteReservation() {
  const id = elements.reservationForm.elements.id.value;
  const reservation = state.reservations.find((item) => item.id === id);
  if (!reservation || !confirm(`Supprimer la réservation de ${reservation.name} ?`)) return;
  state.reservations = state.reservations.filter((item) => item.id !== id);
  elements.reservationModal.close();
  render();
  showToast("Réservation supprimée.");
}

function assignReservationManually(reservationId) {
  const reservation = state.reservations.find((item) => item.id === reservationId);
  if (!reservation) return;
  const assignments = currentAssignmentMap();
  const available = state.tables
    .filter((table) => table.id === reservation.tableId || tableCanHostReservation(table, reservation, assignments))
    .sort((a, b) => (a.capacity - reservation.size) - (b.capacity - reservation.size) || a.name.localeCompare(b.name, "fr"));

  if (!available.length && !reservation.tableId) {
    showToast(`Aucune table libre ne peut accueillir ${reservation.size} convives.`, "warning");
    return;
  }

  const choices = [`0 — Retirer le placement`, ...available.map((table, index) => `${index + 1} — ${table.name} · ${table.capacity} places · ${table.zone}`)];
  const answer = prompt(`Choisissez une table pour ${reservation.name} :\n\n${choices.join("\n")}`, reservation.tableId ? "0" : "1");
  if (answer === null) return;
  const index = Number.parseInt(answer, 10);
  if (index === 0) reservation.tableId = null;
  else if (available[index - 1]) reservation.tableId = available[index - 1].id;
  else {
    showToast("Choix de table invalide.", "warning");
    return;
  }
  render();
  if (state.connected) {
    postToDashboard("tok-table-v2:assign", {
      reservationId: reservation.id,
      tableId: reservation.tableId
    });
  }
}

// Graphe de flot à coût minimum. L'affectation valorise d'abord le nombre de
// convives placés, puis réduit les places perdues et respecte la zone souhaitée.
function computeOptimalAssignments(reservations, tables) {
  const source = 0;
  const partyOffset = 1;
  const tableOffset = partyOffset + reservations.length;
  const sink = tableOffset + tables.length;
  const graph = Array.from({ length: sink + 1 }, () => []);

  const addEdge = (from, to, capacity, cost, meta = null) => {
    const forward = { to, rev: graph[to].length, capacity, cost, meta, originalCapacity: capacity };
    const reverse = { to: from, rev: graph[from].length, capacity: 0, cost: -cost, meta: null, originalCapacity: 0 };
    graph[from].push(forward);
    graph[to].push(reverse);
  };

  reservations.forEach((reservation, partyIndex) => {
    addEdge(source, partyOffset + partyIndex, 1, 0);
    tables.forEach((table, tableIndex) => {
      if (table.capacity < reservation.size || table.blocked) return;
      const wastedSeats = table.capacity - reservation.size;
      const zonePenalty = reservation.preferredZone && reservation.preferredZone !== table.zone ? 35 : 0;
      const exactZoneBonus = reservation.preferredZone === table.zone ? -8 : 0;
      const score = -reservation.size * 10000 + wastedSeats * 20 + zonePenalty + exactZoneBonus;
      addEdge(partyOffset + partyIndex, tableOffset + tableIndex, 1, score, { partyIndex, tableIndex });
    });
  });
  tables.forEach((_, tableIndex) => addEdge(tableOffset + tableIndex, sink, 1, 0));

  while (true) {
    const distance = Array(graph.length).fill(Infinity);
    const previousNode = Array(graph.length).fill(-1);
    const previousEdge = Array(graph.length).fill(-1);
    const inQueue = Array(graph.length).fill(false);
    const queue = [source];
    distance[source] = 0;
    inQueue[source] = true;

    while (queue.length) {
      const node = queue.shift();
      inQueue[node] = false;
      graph[node].forEach((edge, edgeIndex) => {
        if (edge.capacity <= 0 || distance[edge.to] <= distance[node] + edge.cost) return;
        distance[edge.to] = distance[node] + edge.cost;
        previousNode[edge.to] = node;
        previousEdge[edge.to] = edgeIndex;
        if (!inQueue[edge.to]) {
          queue.push(edge.to);
          inQueue[edge.to] = true;
        }
      });
    }

    if (!Number.isFinite(distance[sink]) || distance[sink] >= 0) break;
    let node = sink;
    while (node !== source) {
      const previous = previousNode[node];
      const edge = graph[previous][previousEdge[node]];
      edge.capacity -= 1;
      graph[node][edge.rev].capacity += 1;
      node = previous;
    }
  }

  const matches = [];
  reservations.forEach((_, partyIndex) => {
    graph[partyOffset + partyIndex].forEach((edge) => {
      if (edge.meta && edge.originalCapacity === 1 && edge.capacity === 0) matches.push(edge.meta);
    });
  });
  return matches;
}

function autoPlace() {
  if (state.connected) {
    postToDashboard("tok-table-v2:auto-place-request", {
      date: state.selectedDate,
      period: state.selectedPeriod
    });
    showToast("Placement automatique en cours…");
    return;
  }
  const reservations = serviceReservations();
  const usableTables = state.tables.filter((table) => !table.blocked);
  if (!reservations.length) {
    showToast("Ajoutez d’abord une réservation à ce service.", "warning");
    return;
  }
  if (!usableTables.length) {
    showToast("Aucune table disponible pour ce service.", "warning");
    return;
  }

  reservations.forEach((reservation) => { reservation.tableId = null; });
  const matches = computeOptimalAssignments(reservations, usableTables);
  matches.forEach(({ partyIndex, tableIndex }) => { reservations[partyIndex].tableId = usableTables[tableIndex].id; });
  render();

  const placedGuests = reservations.filter((r) => r.tableId).reduce((sum, r) => sum + r.size, 0);
  const totalGuests = reservations.reduce((sum, r) => sum + r.size, 0);
  if (matches.length === reservations.length) showToast(`${matches.length} réservations et ${placedGuests} convives placés automatiquement.`, "success");
  else showToast(`${matches.length}/${reservations.length} réservations placées (${placedGuests}/${totalGuests} convives).`, "warning");
}

function startDragging(event, node, table) {
  if (state.connected) return;
  if (event.button !== 0) return;
  const floorRect = elements.floor.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  dragState = {
    table,
    node,
    floorRect,
    offsetX: (event.clientX - nodeRect.left) / canvasZoom,
    offsetY: (event.clientY - nodeRect.top) / canvasZoom,
    moved: false,
    startX: event.clientX,
    startY: event.clientY
  };
  node.setPointerCapture(event.pointerId);
  node.classList.add("dragging");
}

function moveDragging(event) {
  if (!dragState) return;
  const { node, floorRect } = dragState;
  if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 4) dragState.moved = true;
  const logicalWidth = elements.floor.offsetWidth;
  const logicalHeight = elements.floor.offsetHeight;
  const maxLeft = logicalWidth - node.offsetWidth - 2;
  const maxTop = logicalHeight - node.offsetHeight - 2;
  const left = Math.min(maxLeft, Math.max(2, (event.clientX - floorRect.left) / canvasZoom - dragState.offsetX));
  const top = Math.min(maxTop, Math.max(2, (event.clientY - floorRect.top) / canvasZoom - dragState.offsetY));
  node.style.left = `${(left / logicalWidth) * 100}%`;
  node.style.top = `${(top / logicalHeight) * 100}%`;
}

function stopDragging(event) {
  if (!dragState) return;
  const { table, node, floorRect, moved } = dragState;
  node.classList.remove("dragging");
  if (moved) {
    table.x = Math.max(0, Math.min(94, (node.offsetLeft / elements.floor.offsetWidth) * 100));
    table.y = Math.max(0, Math.min(86, (node.offsetTop / elements.floor.offsetHeight) * 100));
    saveState();
  } else {
    openTableModal(table);
  }
  if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
  dragState = null;
}

function clampZoom(value) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value * 100) / 100));
}

function getViewportCenter() {
  const viewport = elements.floorViewport;
  return {
    clientX: viewport.getBoundingClientRect().left + viewport.clientWidth / 2,
    clientY: viewport.getBoundingClientRect().top + viewport.clientHeight / 2
  };
}

function syncCanvasZoom(preserveCenter = true) {
  const viewport = elements.floorViewport;
  const floor = elements.floor;
  const stage = elements.floorStage;
  if (!viewport || !floor || !stage) return;

  const previousZoom = Number(floor.dataset.zoom) || canvasZoom || 1;
  const logicalCenterX = (viewport.scrollLeft + viewport.clientWidth / 2) / previousZoom;
  const logicalCenterY = (viewport.scrollTop + viewport.clientHeight / 2) / previousZoom;
  const nextBaseWidth = Math.max(720, Math.round(viewport.clientWidth));
  const nextBaseHeight = window.matchMedia("(max-width: 720px)").matches ? 500 : 560;

  if (!floorBaseWidth) {
    floorBaseWidth = nextBaseWidth;
    floorBaseHeight = nextBaseHeight;
    if (!zoomWasChanged) canvasZoom = clampZoom(Math.min(1, viewport.clientWidth / floorBaseWidth));
  } else if (floorBaseWidth !== nextBaseWidth || floorBaseHeight !== nextBaseHeight) {
    floorBaseWidth = nextBaseWidth;
    floorBaseHeight = nextBaseHeight;
    if (!zoomWasChanged) canvasZoom = clampZoom(Math.min(1, viewport.clientWidth / floorBaseWidth));
  }

  floor.style.width = `${floorBaseWidth}px`;
  floor.style.height = `${floorBaseHeight}px`;
  floor.style.transform = `scale(${canvasZoom})`;
  floor.dataset.zoom = String(canvasZoom);
  stage.style.width = `${Math.ceil(floorBaseWidth * canvasZoom)}px`;
  stage.style.height = `${Math.ceil(floorBaseHeight * canvasZoom)}px`;
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
  canvasZoom = clampZoom(Math.min(
    1,
    viewport.clientWidth / floorBaseWidth,
    viewport.clientHeight / floorBaseHeight
  ));
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
  return {
    clientX: (pointers[0].clientX + pointers[1].clientX) / 2,
    clientY: (pointers[0].clientY + pointers[1].clientY) / 2
  };
}

function beginViewportGesture(event) {
  if (event.target.closest("button, input, select, .table-node")) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  viewportPointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
  elements.floorViewport.setPointerCapture?.(event.pointerId);

  const pointers = [...viewportPointers.values()];
  if (pointers.length >= 2) {
    viewportGesture = {
      type: "pinch",
      startDistance: pointerDistance(pointers.slice(0, 2)),
      startZoom: canvasZoom
    };
  } else {
    viewportGesture = {
      type: "pan",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: elements.floorViewport.scrollLeft,
      scrollTop: elements.floorViewport.scrollTop
    };
  }
  event.preventDefault();
}

function moveViewportGesture(event) {
  if (!viewportPointers.has(event.pointerId)) return;
  viewportPointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
  const pointers = [...viewportPointers.values()];

  if (pointers.length >= 2) {
    if (viewportGesture?.type !== "pinch") {
      viewportGesture = {
        type: "pinch",
        startDistance: pointerDistance(pointers.slice(0, 2)),
        startZoom: canvasZoom
      };
    }
    const distance = pointerDistance(pointers.slice(0, 2));
    const ratio = viewportGesture.startDistance ? distance / viewportGesture.startDistance : 1;
    updateCanvasZoom(viewportGesture.startZoom * ratio, pointerMidpoint(pointers.slice(0, 2)));
  } else if (viewportGesture?.type === "pan" && viewportGesture.pointerId === event.pointerId) {
    elements.floorViewport.scrollLeft = viewportGesture.scrollLeft - (event.clientX - viewportGesture.startX);
    elements.floorViewport.scrollTop = viewportGesture.scrollTop - (event.clientY - viewportGesture.startY);
  }
  event.preventDefault();
}

function endViewportGesture(event) {
  viewportPointers.delete(event.pointerId);
  if (elements.floorViewport.hasPointerCapture?.(event.pointerId)) {
    elements.floorViewport.releasePointerCapture(event.pointerId);
  }
  const remaining = [...viewportPointers.entries()];
  if (remaining.length === 1) {
    const [pointerId, pointer] = remaining[0];
    viewportGesture = {
      type: "pan",
      pointerId,
      startX: pointer.clientX,
      startY: pointer.clientY,
      scrollLeft: elements.floorViewport.scrollLeft,
      scrollTop: elements.floorViewport.scrollTop
    };
  } else if (remaining.length === 0) {
    viewportGesture = null;
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `tok-table-${state.selectedDate}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Sauvegarde exportée.", "success");
}

async function importData(file) {
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.tables) || !Array.isArray(parsed.reservations)) throw new Error("invalid");
    state = sanitizeState({ ...initialState(), ...parsed });
    elements.dataModal.close();
    render();
    showToast("Sauvegarde restaurée.", "success");
  } catch {
    showToast("Ce fichier de sauvegarde est invalide.", "warning");
  }
}

function hydrateConnectedState(payload) {
  if (!payload || !Array.isArray(payload.tables) || !Array.isArray(payload.reservations)) return;
  const tables = payload.tables.map((table, index) => ({
    id: String(table.id || ""),
    name: String(table.name || `T${index + 1}`).slice(0, 30),
    capacity: Math.max(0, Number(table.capacity) || 0),
    zone: String(table.zone || "Salle principale").slice(0, 60),
    shape: ["round", "square", "rectangle"].includes(table.shape) ? table.shape : "square",
    x: Math.max(0, Math.min(94, Number(table.x) || 0)),
    y: Math.max(0, Math.min(86, Number(table.y) || 0)),
    blocked: Boolean(table.blocked)
  })).filter((table) => table.id);
  const tableIds = new Set(tables.map((table) => table.id));
  const reservations = payload.reservations.map((reservation) => ({
    id: String(reservation.id || ""),
    name: String(reservation.name || "Client sans nom").slice(0, 80),
    size: Math.max(1, Number(reservation.size) || 1),
    time: /^\d{2}:\d{2}/.test(String(reservation.time || "")) ? String(reservation.time).slice(0, 5) : "00:00",
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(reservation.date || "")) ? String(reservation.date) : payload.selectedDate,
    period: reservation.period === "midi" ? "midi" : "soir",
    preferredZone: String(reservation.preferredZone || "").slice(0, 60),
    note: String(reservation.note || "").slice(0, 240),
    durationMinutes: Math.max(30, Number(reservation.durationMinutes) || DEFAULT_RESERVATION_DURATION_MINUTES),
    tableId: tableIds.has(reservation.tableId) ? reservation.tableId : null,
    status: String(reservation.status || "pending")
  })).filter((reservation) => reservation.id);

  state = {
    connected: true,
    branchId: String(payload.branchId || ""),
    selectedDate: /^\d{4}-\d{2}-\d{2}$/.test(String(payload.selectedDate || "")) ? payload.selectedDate : todayIso(),
    selectedPeriod: payload.selectedPeriod === "midi" ? "midi" : "soir",
    selectedZone: tables.some((table) => table.zone === state.selectedZone)
      ? state.selectedZone
      : (tables[0]?.zone || "Salle principale"),
    tables,
    reservations
  };
  render();
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin || event.source !== window.parent) return;
  const message = event.data;
  if (!message || message.source !== "tok-dashboard") return;

  if (message.type === "tok-table-v2:hydrate") hydrateConnectedState(message.payload);
  if (message.type === "tok-table-v2:saving") {
    document.body.classList.add("saving");
    elements.connectionLabel.textContent = "Synchronisation…";
    $("#auto-place-button").disabled = true;
  }
  if (message.type === "tok-table-v2:saved") {
    document.body.classList.remove("saving");
    elements.connectionLabel.textContent = "Données réelles synchronisées";
    $("#auto-place-button").disabled = false;
    if (message.payload?.message) showToast(message.payload.message, "success");
  }
  if (message.type === "tok-table-v2:error") {
    document.body.classList.remove("saving");
    elements.connectionLabel.textContent = "Synchronisation à vérifier";
    $("#auto-place-button").disabled = false;
    showToast(message.payload?.message || "Le placement n’a pas pu être enregistré.", "warning");
  }
});

elements.date.addEventListener("change", () => {
  state.selectedDate = elements.date.value;
  if (state.connected) postToDashboard("tok-table-v2:service-change", { date: state.selectedDate, period: state.selectedPeriod });
  render();
});
elements.period.addEventListener("change", () => {
  state.selectedPeriod = elements.period.value;
  if (state.connected) postToDashboard("tok-table-v2:service-change", { date: state.selectedDate, period: state.selectedPeriod });
  render();
});
elements.search.addEventListener("input", renderReservations);
elements.filter.addEventListener("change", renderReservations);
$("#auto-place-button").addEventListener("click", autoPlace);
$("#add-table-button").addEventListener("click", () => openTableModal());
$("#add-reservation-button").addEventListener("click", () => openReservationModal());
$("#data-button").addEventListener("click", () => elements.dataModal.showModal());
$("#delete-table-button").addEventListener("click", deleteTable);
$("#delete-reservation-button").addEventListener("click", deleteReservation);
$("#export-button").addEventListener("click", exportData);
$("#import-input").addEventListener("change", (event) => event.target.files[0] && importData(event.target.files[0]));
$("#reset-button").addEventListener("click", () => {
  if (!confirm("Réinitialiser toutes les tables et réservations ?")) return;
  state = initialState();
  elements.dataModal.close();
  render();
  showToast("Données de démonstration restaurées.");
});

elements.tableForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  if (saveTableFromForm()) elements.tableModal.close();
});

elements.reservationForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  if (saveReservationFromForm()) elements.reservationModal.close();
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
  const reservation = state.reservations.find((item) => item.id === action.dataset.reservationId);
  if (action.dataset.action === "assign") assignReservationManually(action.dataset.reservationId);
  if (action.dataset.action === "edit-reservation" && reservation) openReservationModal(reservation);
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
elements.floor.addEventListener("pointerup", stopDragging);
elements.floor.addEventListener("pointercancel", stopDragging);

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

if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => syncCanvasZoom(true)).observe(elements.floorViewport);
}

if (window.parent === window) {
  state = {
    ...initialState(),
    tables: [],
    reservations: []
  };
  window.setTimeout(() => showToast("Ouvrez Plan de salle 2 depuis le dashboard TOK pour charger les vrais clients."), 250);
} else {
  postToDashboard("tok-table-v2:ready");
}

render();
