export type CustomerCrmFavoriteItem = {
  label: string;
  category: string | null;
  quantity: number;
  orders: number;
};

export type CustomerCrmProfile = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  avatarUrl: string | null;
  loyaltyPoints: number;
  totalOrders: number;
  totalReservations: number;
  restaurantsCount: number;
  totalSpent: number;
  avgOrderValue: number;
  firstSeenAt: string | null;
  lastActivityAt: string | null;
  lastOrderAt: string | null;
  lastReservationAt: string | null;
  lastRestaurantName: string | null;
  preferredChannel: "orders" | "reservations" | "mixed" | "unknown";
  preferredService: "lunch" | "dinner" | "off_peak" | "unknown";
  preferredWeekday: number | null;
  favoriteOrderHour: number | null;
  favoriteReservationHour: number | null;
  favoriteItems: CustomerCrmFavoriteItem[];
  favoriteCuisines: string[];
  crmScore: number;
  totalMatchingCount: number;
};

export type CustomerCrmInsights = {
  profileLabel: string;
  habitSummary: string;
  salesAngle: string;
  segments: string[];
  nextBestActions: string[];
};

const WEEKDAY_LABELS = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function readNullableNumber(value: unknown): number | null {
  const parsed = readNumber(value);
  return parsed > 0 || value === 0 || value === "0" ? parsed : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function readFavoriteItems(value: unknown): CustomerCrmFavoriteItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const label = readString(record.label);
      if (!label) return null;

      return {
        label,
        category: readString(record.category),
        quantity: Math.max(0, Math.round(readNumber(record.quantity))),
        orders: Math.max(0, Math.round(readNumber(record.orders))),
      } satisfies CustomerCrmFavoriteItem;
    })
    .filter((entry): entry is CustomerCrmFavoriteItem => Boolean(entry));
}

export function normalizeCustomerCrmProfile(row: Record<string, unknown>): CustomerCrmProfile {
  const fullName = readString(row.full_name) || readString(row.email) || readString(row.user_id) || "Client";

  return {
    userId: readString(row.user_id) || "",
    firstName: readString(row.first_name),
    lastName: readString(row.last_name),
    fullName,
    email: readString(row.email),
    phone: readString(row.phone),
    city: readString(row.city),
    address: readString(row.address),
    avatarUrl: readString(row.avatar_url),
    loyaltyPoints: Math.round(readNumber(row.loyalty_points)),
    totalOrders: Math.round(readNumber(row.total_orders)),
    totalReservations: Math.round(readNumber(row.total_reservations)),
    restaurantsCount: Math.round(readNumber(row.restaurants_count)),
    totalSpent: readNumber(row.total_spent),
    avgOrderValue: readNumber(row.avg_order_value),
    firstSeenAt: readString(row.first_seen_at),
    lastActivityAt: readString(row.last_activity_at),
    lastOrderAt: readString(row.last_order_at),
    lastReservationAt: readString(row.last_reservation_at),
    lastRestaurantName: readString(row.last_restaurant_name),
    preferredChannel: normalizePreferredChannel(row.preferred_channel),
    preferredService: normalizePreferredService(row.preferred_service),
    preferredWeekday: readNullableNumber(row.preferred_weekday),
    favoriteOrderHour: readNullableNumber(row.favorite_order_hour),
    favoriteReservationHour: readNullableNumber(row.favorite_reservation_hour),
    favoriteItems: readFavoriteItems(row.favorite_items),
    favoriteCuisines: readStringArray(row.favorite_cuisines),
    crmScore: Math.max(0, Math.min(100, Math.round(readNumber(row.crm_score)))),
    totalMatchingCount: Math.round(readNumber(row.total_matching_count)),
  };
}

function normalizePreferredChannel(value: unknown): CustomerCrmProfile["preferredChannel"] {
  if (value === "orders" || value === "reservations" || value === "mixed") return value;
  return "unknown";
}

function normalizePreferredService(value: unknown): CustomerCrmProfile["preferredService"] {
  if (value === "lunch" || value === "dinner" || value === "off_peak") return value;
  return "unknown";
}

export function formatCustomerCrmDate(value: string | null) {
  if (!value) return "Jamais";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";

  return date.toLocaleDateString("fr-CH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatCustomerCrmMoney(value: number) {
  return `${value.toFixed(value >= 100 ? 0 : 2)} CHF`;
}

export function getCustomerInitials(profile: Pick<CustomerCrmProfile, "fullName" | "email">) {
  const source = profile.fullName || profile.email || "Client";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function getPreferredServiceLabel(service: CustomerCrmProfile["preferredService"]) {
  switch (service) {
    case "lunch":
      return "Midi";
    case "dinner":
      return "Soir";
    case "off_peak":
      return "Hors pics";
    default:
      return "A confirmer";
  }
}

export function getPreferredChannelLabel(channel: CustomerCrmProfile["preferredChannel"]) {
  switch (channel) {
    case "orders":
      return "Commande";
    case "reservations":
      return "Reservation";
    case "mixed":
      return "Commande + reservation";
    default:
      return "Historique leger";
  }
}

export function getPreferredWeekdayLabel(weekday: number | null) {
  if (!weekday || weekday < 1 || weekday > 7) return "jour a confirmer";
  return WEEKDAY_LABELS[weekday];
}

export function getPreferredHourLabel(hour: number | null) {
  if (hour === null || hour < 0 || hour > 23) return "heure a confirmer";
  return `${String(hour).padStart(2, "0")}h`;
}

function daysSince(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

export function buildCustomerCrmInsights(profile: CustomerCrmProfile): CustomerCrmInsights {
  const segments: string[] = [];
  const nextBestActions: string[] = [];
  const inactiveDays = daysSince(profile.lastActivityAt);
  const preferredService = getPreferredServiceLabel(profile.preferredService).toLowerCase();
  const weekday = getPreferredWeekdayLabel(profile.preferredWeekday);
  const orderHour = getPreferredHourLabel(profile.favoriteOrderHour);
  const reservationHour = getPreferredHourLabel(profile.favoriteReservationHour);

  if (profile.crmScore >= 75) segments.push("Client prioritaire");
  if (profile.totalSpent >= 300) segments.push("Forte valeur");
  if (profile.preferredChannel === "orders") segments.push("Commande recurrente");
  if (profile.preferredChannel === "reservations") segments.push("Reservation recurrente");
  if (profile.preferredChannel === "mixed") segments.push("Omnicanal");
  if (inactiveDays >= 60 && Number.isFinite(inactiveDays)) segments.push("A reactiver");
  if (profile.loyaltyPoints >= 1000) segments.push("Fidelite elevee");

  if (inactiveDays >= 60 && Number.isFinite(inactiveDays)) {
    nextBestActions.push("Envoyer une offre de retour limitee dans le temps.");
  }
  if (profile.favoriteItems.length > 0) {
    nextBestActions.push(`Mettre en avant ${profile.favoriteItems[0].label} ou une alternative proche.`);
  }
  if (profile.preferredService !== "unknown") {
    nextBestActions.push(`Programmer la relance autour du service ${preferredService}.`);
  }
  if (profile.totalReservations > profile.totalOrders) {
    nextBestActions.push("Proposer un avantage reservation ou une table prioritaire.");
  }
  if (profile.totalOrders > profile.totalReservations) {
    nextBestActions.push("Proposer un menu rapide, un avantage livraison ou un retrait express.");
  }
  if (nextBestActions.length === 0) {
    nextBestActions.push("Collecter quelques interactions supplementaires avant de lancer une relance ciblee.");
  }

  const habitSummary = profile.preferredChannel === "reservations"
    ? `Reserve surtout le ${weekday}, autour de ${reservationHour}.`
    : profile.preferredChannel === "orders"
      ? `Commande surtout le ${weekday}, autour de ${orderHour}.`
      : profile.preferredChannel === "mixed"
        ? `Combine commandes et reservations, surtout le ${weekday}.`
        : "Historique encore leger, profil a enrichir.";

  const salesAngle = profile.favoriteCuisines.length > 0
    ? `Angle commercial: cuisine ${profile.favoriteCuisines.slice(0, 2).join(", ")}.`
    : profile.favoriteItems.length > 0
      ? `Angle commercial: plats similaires a ${profile.favoriteItems[0].label}.`
      : "Angle commercial: tester une offre decouverte courte.";

  return {
    profileLabel: segments[0] || "Client a qualifier",
    habitSummary,
    salesAngle,
    segments,
    nextBestActions: nextBestActions.slice(0, 3),
  };
}

type CustomerCrmExportKind = "text" | "number" | "money" | "date" | "phone";

type CustomerCrmExportColumn = {
  header: string;
  kind: CustomerCrmExportKind;
  getValue: (profile: CustomerCrmProfile, insights: CustomerCrmInsights) => string | number | null;
};

const CUSTOMER_CRM_EXPORT_COLUMNS: CustomerCrmExportColumn[] = [
  { header: "Nom complet", kind: "text", getValue: (profile) => profile.fullName },
  { header: "Prénom", kind: "text", getValue: (profile) => profile.firstName },
  { header: "Nom", kind: "text", getValue: (profile) => profile.lastName },
  { header: "Email", kind: "text", getValue: (profile) => profile.email },
  { header: "Téléphone", kind: "phone", getValue: (profile) => profile.phone },
  { header: "Ville", kind: "text", getValue: (profile) => profile.city },
  { header: "Adresse", kind: "text", getValue: (profile) => profile.address },
  { header: "Restaurant recent", kind: "text", getValue: (profile) => profile.lastRestaurantName },
  { header: "Score CRM", kind: "number", getValue: (profile) => profile.crmScore },
  { header: "Segment principal", kind: "text", getValue: (_profile, insights) => insights.profileLabel },
  { header: "Commandes", kind: "number", getValue: (profile) => profile.totalOrders },
  { header: "Reservations", kind: "number", getValue: (profile) => profile.totalReservations },
  { header: "Restaurants visites", kind: "number", getValue: (profile) => profile.restaurantsCount },
  { header: "Depense totale CHF", kind: "money", getValue: (profile) => profile.totalSpent.toFixed(2) },
  { header: "Panier moyen CHF", kind: "money", getValue: (profile) => profile.avgOrderValue.toFixed(2) },
  { header: "Points Miamz", kind: "number", getValue: (profile) => profile.loyaltyPoints },
  { header: "Canal prefere", kind: "text", getValue: (profile) => getPreferredChannelLabel(profile.preferredChannel) },
  { header: "Service prefere", kind: "text", getValue: (profile) => getPreferredServiceLabel(profile.preferredService) },
  { header: "Jour prefere", kind: "text", getValue: (profile) => getPreferredWeekdayLabel(profile.preferredWeekday) },
  { header: "Heure commande", kind: "text", getValue: (profile) => getPreferredHourLabel(profile.favoriteOrderHour) },
  { header: "Heure reservation", kind: "text", getValue: (profile) => getPreferredHourLabel(profile.favoriteReservationHour) },
  { header: "Cuisines preferees", kind: "text", getValue: (profile) => csvList(profile.favoriteCuisines) },
  {
    header: "Plats favoris",
    kind: "text",
    getValue: (profile) =>
      profile.favoriteItems
        .map((item) => `${item.label}${item.quantity > 0 ? ` x${item.quantity}` : ""}`)
        .join(" | "),
  },
  { header: "Premiere activite", kind: "date", getValue: (profile) => formatCustomerCrmDate(profile.firstSeenAt) },
  { header: "Derniere activite", kind: "date", getValue: (profile) => formatCustomerCrmDate(profile.lastActivityAt) },
  { header: "Derniere commande", kind: "date", getValue: (profile) => formatCustomerCrmDate(profile.lastOrderAt) },
  { header: "Derniere reservation", kind: "date", getValue: (profile) => formatCustomerCrmDate(profile.lastReservationAt) },
  { header: "Actions conseillees", kind: "text", getValue: (_profile, insights) => csvList(insights.nextBestActions) },
];

function csvCell(value: unknown, kind: CustomerCrmExportKind = "text") {
  const rawValue = value === null || value === undefined ? "" : String(value);
  if (kind === "phone" && /^(\+|0)/.test(rawValue) && /^[+\d\s()./-]+$/.test(rawValue)) {
    return `"=""${rawValue.replace(/"/g, '""')}"""`;
  }
  return `"${rawValue.replace(/"/g, '""')}"`;
}

function csvList(values: string[]) {
  return values.filter(Boolean).join(" | ");
}

function getCustomerCrmExportRows(profiles: CustomerCrmProfile[]) {
  return profiles.map((profile) => {
    const insights = buildCustomerCrmInsights(profile);
    return CUSTOMER_CRM_EXPORT_COLUMNS.map((column) => ({
      kind: column.kind,
      value: column.getValue(profile, insights),
    }));
  });
}

export function buildCustomerCrmCsv(profiles: CustomerCrmProfile[]) {
  const headers = CUSTOMER_CRM_EXPORT_COLUMNS.map((column) => csvCell(column.header));
  const rows = getCustomerCrmExportRows(profiles).map((row) =>
    row.map((cell) => csvCell(cell.value, cell.kind)).join(";"),
  );

  return [headers.join(";"), ...rows].join("\r\n");
}

function xmlCell(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function excelCell(value: unknown, kind: CustomerCrmExportKind, styleId?: string) {
  const rawValue = value === null || value === undefined ? "" : String(value);
  if ((kind === "number" || kind === "money") && rawValue.trim() !== "" && Number.isFinite(Number(rawValue))) {
    return `<Cell${styleId ? ` ss:StyleID="${styleId}"` : ""}><Data ss:Type="Number">${Number(rawValue)}</Data></Cell>`;
  }

  return `<Cell${styleId ? ` ss:StyleID="${styleId}"` : ""}><Data ss:Type="String">${xmlCell(rawValue)}</Data></Cell>`;
}

export function buildCustomerCrmXls(profiles: CustomerCrmProfile[]) {
  const columnsCount = CUSTOMER_CRM_EXPORT_COLUMNS.length;
  const rows = getCustomerCrmExportRows(profiles);
  const autoFilterRange = `R1C1:R${Math.max(rows.length + 1, 2)}C${columnsCount}`;
  const headerRow = CUSTOMER_CRM_EXPORT_COLUMNS
    .map((column) => excelCell(column.header, "text", "Header"))
    .join("");
  const dataRows = rows
    .map((row) => `<Row>${row.map((cell) => excelCell(cell.value, cell.kind, cell.kind === "phone" ? "Text" : undefined)).join("")}</Row>`)
    .join("");
  const columns = CUSTOMER_CRM_EXPORT_COLUMNS
    .map((column) => `<Column ss:AutoFitWidth="1" ss:Width="${column.kind === "text" ? 160 : 110}" />`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Top" ss:WrapText="1" />
      <Font ss:FontName="Calibri" ss:Size="11" />
    </Style>
    <Style ss:ID="Header">
      <Alignment ss:Vertical="Center" ss:WrapText="1" />
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" />
      <Interior ss:Color="#FF5A1F" ss:Pattern="Solid" />
    </Style>
    <Style ss:ID="Text">
      <NumberFormat ss:Format="@" />
    </Style>
  </Styles>
  <Worksheet ss:Name="CRM clients">
    <Table ss:ExpandedColumnCount="${columnsCount}" ss:ExpandedRowCount="${rows.length + 1}" x:FullColumns="1" x:FullRows="1">
      ${columns}
      <Row ss:AutoFitHeight="1">${headerRow}</Row>
      ${dataRows}
    </Table>
    <AutoFilter x:Range="${autoFilterRange}" xmlns="urn:schemas-microsoft-com:office:excel" />
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <FreezePanes />
      <FrozenNoSplit />
      <SplitHorizontal>1</SplitHorizontal>
      <TopRowBottomPane>1</TopRowBottomPane>
      <ActivePane>2</ActivePane>
      <ProtectObjects>False</ProtectObjects>
      <ProtectScenarios>False</ProtectScenarios>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;
}
