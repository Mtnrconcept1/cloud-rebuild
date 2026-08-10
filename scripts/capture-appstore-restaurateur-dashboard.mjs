import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import puppeteer from "puppeteer";

const APP_URL = (process.env.APP_URL || "https://www.thetok.ch").replace(/\/$/, "");
const SUPABASE_URL = (process.env.SUPABASE_URL || "https://wwcrtyoueexyxkkikaos.supabase.co").replace(/\/$/, "");
const SUPABASE_PROJECT_REF = "wwcrtyoueexyxkkikaos";
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const OUTPUT_DIR = path.resolve(process.env.RESTAURATEUR_SCREENSHOT_OUTPUT_DIR || "appstore-restaurateur-dashboard-screenshots");
const CONSENT_STORAGE_KEY = "tok_consent_cookies-2026-07-v3";

const DEVICES = [
  { id: "iphone_6_9_1320x2868", width: 440, height: 956, dpr: 3 },
  { id: "iphone_6_5_1284x2778", width: 428, height: 926, dpr: 3 },
  { id: "iphone_6_3_1206x2622", width: 402, height: 874, dpr: 3 },
  { id: "iphone_6_1_1170x2532", width: 390, height: 844, dpr: 3 },
  { id: "iphone_5_5_1242x2208", width: 414, height: 736, dpr: 3 },
  { id: "iphone_4_7_750x1334", width: 375, height: 667, dpr: 2 },
  { id: "ipad_13_2064x2752", width: 1032, height: 1376, dpr: 2 },
  { id: "ipad_12_9_2048x2732", width: 1024, height: 1366, dpr: 2 },
  { id: "ipad_11_1668x2420", width: 834, height: 1210, dpr: 2 },
  { id: "ipad_10_5_1668x2224", width: 834, height: 1112, dpr: 2 },
  { id: "ipad_9_7_1536x2048", width: 768, height: 1024, dpr: 2 },
];

const SCREENS = [
  ["01_vue_ensemble", "Vue d'ensemble", "/dashboard"],
  ["02_mon_restaurant", "Mon restaurant", "/dashboard/restaurant"],
  ["03_assistant_ia", "Assistant IA", "/dashboard/advisor"],
  ["04_menu", "Menu", "/dashboard/menu"],
  ["05_reservations", "Réservations", "/dashboard/reservations"],
  ["06_commandes", "Commandes", "/dashboard/commandes"],
  ["07_performances", "Performances", "/dashboard/performances"],
  ["08_comparaison", "Comparaison", "/dashboard/comparaison"],
  ["09_avis", "Avis clients", "/dashboard/avis"],
  ["10_factures", "Factures", "/dashboard/factures"],
  ["11_factures_entrees", "Factures - entrées", "/dashboard/factures/entrees"],
  ["12_factures_sorties", "Factures - sorties", "/dashboard/factures/sorties"],
  ["13_factures_parametres", "Factures - paramètres", "/dashboard/factures/parametres"],
  ["14_compte_facturation", "Mon compte et facturation", "/dashboard/mon-compte-facturation"],
  ["15_anti_gaspi", "Anti-gaspi", "/dashboard/offres"],
  ["16_ventes_flash", "Ventes flash", "/dashboard/ventes-flash"],
  ["17_formules", "Formules", "/dashboard/formules"],
  ["18_studio_marketing", "Studio Marketing", "/dashboard/photos"],
  ["19_promotions", "Promotions", "/dashboard/promotions"],
  ["20_reseaux_sociaux", "Réseaux sociaux", "/dashboard/reseaux-sociaux"],
  ["21_actualites", "Actualités", "/dashboard/actualites"],
  ["22_campagnes", "Campagnes", "/dashboard/campagnes"],
  ["23_campaign_studio", "Studio de campagne", "/dashboard/campaign-studio"],
  ["24_crm", "CRM", "/dashboard/crm"],
  ["25_notifications", "Notifications", "/dashboard/notifications"],
  ["26_support", "Support", "/dashboard/support"],
  ["27_pilotage_service", "Pilotage de service", "/dashboard/service"],
  ["28_plan_salle", "Plan de salle", "/dashboard/plan-salle"],
  ["29_tok_connect", "TOK Connect", "/dashboard/tok-connect"],
].map(([slug, label, route]) => ({ slug, label, path: route }));

let temporaryUserId = null;
let temporaryRestaurantId = null;
let browser = null;

try {
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const elitePlan = await getElitePlan();
  const credentials = await createTemporaryRestaurateurUser();
  temporaryUserId = credentials.userId;
  await ensureUserRole(credentials.userId, "restaurateur");
  await upsertProfile(credentials.userId);
  const restaurant = await createTemporaryRestaurant(credentials.userId);
  temporaryRestaurantId = restaurant.id;
  const subscription = await createTemporaryEliteSubscription(restaurant.id, elitePlan);
  const session = await signInProduction(credentials.email, credentials.password);
  console.log(`Temporary dashboard restaurant ready: ${restaurant.id}`);
  console.log(`Temporary Elite subscription ready: ${subscription.id}`);

  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"] });
  const bootstrap = await browser.newPage();
  await bootstrap.setViewport({ width: 440, height: 956, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await bootstrap.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await installSessionAndPreferences(bootstrap, session, restaurant.id);
  await gotoReady(bootstrap, `${APP_URL}/dashboard`);
  assertRoute(bootstrap.url(), "/dashboard");
  await bootstrap.close();

  const manifest = {
    generated_at: new Date().toISOString(), source: APP_URL,
    source_mode: "authenticated-live-production-restaurateur-dashboard-capture",
    screenshots_are_mockups: false, screenshots_use_demo_frame: false,
    temporary_account_deleted_after_capture: true, temporary_restaurant_deleted_after_capture: true,
    temporary_subscription_provider: "none", temporary_subscription_plan: "elite",
    page_count: SCREENS.length, device_count: DEVICES.length, screenshot_count: SCREENS.length * DEVICES.length,
    screens: SCREENS, devices: [],
  };

  for (const device of DEVICES) {
    console.log(`Capturing ${device.id}...`);
    const deviceDir = path.join(OUTPUT_DIR, device.id);
    await fs.mkdir(deviceDir, { recursive: true });
    const screenshots = [];
    for (const screen of SCREENS) {
      const output = path.join(deviceDir, `${screen.slug}.jpg`);
      screenshots.push({ slug: screen.slug, label: screen.label, route: screen.path, file: path.relative(OUTPUT_DIR, output), ...await captureRoute(browser, device, screen, `${APP_URL}${screen.path}`, output) });
    }
    manifest.devices.push({ ...device, pixel_width: device.width * device.dpr, pixel_height: device.height * device.dpr, screenshots });
  }

  await fs.writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(OUTPUT_DIR, "README.txt"), [
    "TheTok App Store — REAL restaurateur dashboard screenshots", "", `Source: ${APP_URL}`,
    "Capture method: Chromium/Puppeteer on GitHub Actions connected directly to the deployed production SPA.",
    "Authentication: temporary production restaurateur account.",
    "Restaurant: temporary non-geolocated capture restaurant, deleted at job end.",
    "Entitlements: temporary internal Elite subscription only; no Stripe customer, checkout, payment or invoice is created.",
    "Demo frames: not used.", "Mockups: not used.",
    `Dashboard pages: ${SCREENS.length}`, `Device formats: ${DEVICES.length}`, `Total screenshots: ${SCREENS.length * DEVICES.length}`,
    "", "Redirect-only aliases excluded: recommandations, compta, campagne-overview, plan-salle-v2.",
    "Each folder name contains the exact screenshot pixel dimensions.",
  ].join("\n"), "utf8");
  console.log(`Captured ${SCREENS.length * DEVICES.length} real restaurateur-dashboard screenshots.`);
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (temporaryRestaurantId) await cleanupRestaurant(temporaryRestaurantId).catch((error) => console.warn(`Restaurant cleanup failed: ${safeError(error)}`));
  if (temporaryUserId) await cleanupUser(temporaryUserId).catch((error) => console.warn(`User cleanup failed: ${safeError(error)}`));
}

function requireEnv(name) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; }
function safeError(error) { return error instanceof Error ? error.message : String(error); }
function serviceHeaders(extra = {}) { return { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, ...extra }; }

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const message = body && typeof body === "object" ? body.msg || body.message || body.error_description || body.error || `HTTP ${response.status}` : String(body || `HTTP ${response.status}`);
    throw new Error(message);
  }
  return body;
}
async function restGet(table, params) { return jsonRequest(`${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`, { headers: serviceHeaders() }); }
async function restInsert(table, payload, prefer = "return=representation") {
  return jsonRequest(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers: serviceHeaders({ "Content-Type": "application/json", Prefer: prefer }), body: JSON.stringify(payload) });
}
async function restDelete(table, filter) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method: "DELETE", headers: serviceHeaders({ Prefer: "return=minimal" }) });
  if (!response.ok && response.status !== 404) { const detail = await response.text().catch(() => ""); throw new Error(`${table} cleanup returned HTTP ${response.status}: ${detail.slice(0, 300)}`); }
}

async function getElitePlan() {
  const select = ["id","slug","price_monthly_chf","campaign_credit_chf","ai_tool_credits","ai_photo_credits","monthly_conversation_limit","monthly_text_tool_limit","monthly_image_limit","monthly_premium_image_limit","monthly_voice_minutes_limit","annual_months_charged","acquired_reservation_fee_cents","marketplace_commission_bps","included_establishments","additional_establishment_price_cents","reservation_revenue_cap_bps","developer_order_bps","developer_tok_revenue_bps","pricing_version"].join(",");
  const rows = await restGet("restaurant_subscription_plans", new URLSearchParams({ select, slug: "eq.elite", is_active: "eq.true", limit: "1" }));
  const plan = Array.isArray(rows) ? rows[0] : null;
  if (!plan?.id || plan.slug !== "elite") throw new Error("Active Elite plan is unavailable");
  return plan;
}
async function createTemporaryRestaurateurUser() {
  const email = `appstore.restaurant.capture.${Date.now()}@thetok.ch`;
  const password = `Tok-${crypto.randomBytes(18).toString("base64url")}!9a`;
  const created = await jsonRequest(`${SUPABASE_URL}/auth/v1/admin/users`, { method: "POST", headers: serviceHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: "Restaurant TOK", capture_only: true, legal_terms_accepted: true, privacy_policy_accepted: true }, app_metadata: { capture_only: true } }) });
  const userId = String(created?.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Supabase did not return a valid temporary restaurateur user id");
  return { userId, email, password };
}
async function ensureUserRole(userId, role) {
  const existing = await restGet("user_roles", new URLSearchParams({ select: "role", user_id: `eq.${userId}`, role: `eq.${role}`, limit: "1" }));
  if (Array.isArray(existing) && existing.length > 0) return;
  await restInsert("user_roles", { user_id: userId, role }, "return=minimal");
}
async function upsertProfile(userId) {
  await jsonRequest(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=user_id`, {
    method: "POST",
    headers: serviceHeaders({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ user_id: userId, full_name: "Restaurant TOK", phone: "+41 22 000 00 00", city: "Espace interne", address: "Aperçu App Store" }),
  });
}
async function createTemporaryRestaurant(userId) {
  const rows = await restInsert("restaurants", {
    owner_id: userId, name: "Restaurant TOK", description: "Espace restaurateur TOK", cuisine_type: "Cuisine suisse",
    address: "Aperçu App Store", city: "Espace interne", phone: "+41 22 000 00 00", price_range: 2,
    is_active: true, status: "active", is_demo: false, is_featured: false,
    supports_reservation: true, supports_dinein: true, supports_pickup: true, supports_scheduled: true, supports_scheduled_orders: true,
    delivery_available: false, latitude: null, longitude: null, disabled_dashboard_features: [],
    opening_hours: { monday:{open:"11:30",close:"22:00"},tuesday:{open:"11:30",close:"22:00"},wednesday:{open:"11:30",close:"22:00"},thursday:{open:"11:30",close:"22:00"},friday:{open:"11:30",close:"23:00"},saturday:{open:"11:30",close:"23:00"},sunday:{open:"11:30",close:"22:00"} },
  });
  const restaurant = Array.isArray(rows) ? rows[0] : null;
  if (!restaurant?.id) throw new Error("Unable to create temporary restaurant");
  return restaurant;
}
function pricingSnapshot(plan) {
  const priceMonthlyCents = Math.round(Number(plan.price_monthly_chf) * 100);
  const vatRateBps = 810;
  const billingVatCents = Math.round((priceMonthlyCents * vatRateBps) / (10000 + vatRateBps));
  return { price_monthly_chf_snapshot: priceMonthlyCents/100, billing_amount_chf_snapshot: priceMonthlyCents/100, price_monthly_cents_snapshot: priceMonthlyCents, billing_amount_cents_snapshot: priceMonthlyCents, billing_net_cents_snapshot: priceMonthlyCents-billingVatCents, billing_vat_cents_snapshot: billingVatCents, vat_rate_bps_snapshot: vatRateBps, annual_months_charged_snapshot: Number(plan.annual_months_charged), acquired_reservation_fee_cents_snapshot: Number(plan.acquired_reservation_fee_cents), marketplace_commission_bps_snapshot: Number(plan.marketplace_commission_bps), included_establishments_snapshot: Number(plan.included_establishments), additional_establishment_price_cents_snapshot: plan.additional_establishment_price_cents==null?null:Number(plan.additional_establishment_price_cents), reservation_revenue_cap_bps_snapshot: Number(plan.reservation_revenue_cap_bps), developer_order_bps_snapshot: Number(plan.developer_order_bps), developer_tok_revenue_bps_snapshot: Number(plan.developer_tok_revenue_bps), pricing_version_snapshot: String(plan.pricing_version) };
}
async function createTemporaryEliteSubscription(restaurantId, plan) {
  const now = new Date(); const end = new Date(now.getTime()+30*24*60*60*1000);
  const rows = await restInsert("restaurant_ai_subscriptions", { restaurant_id: restaurantId, plan:"elite", status:"active", restaurant_subscription_plan_id:plan.id, billing_period:"monthly", stripe_mode:"test", stripe_subscription_id:null, stripe_checkout_session_id:null, current_period_start:now.toISOString(), current_period_end:end.toISOString(), started_at:now.toISOString(), monthly_conversation_limit:Number(plan.monthly_conversation_limit||0), monthly_text_tool_limit:Number(plan.monthly_text_tool_limit||0), monthly_image_limit:Number(plan.monthly_image_limit||0), monthly_premium_image_limit:Number(plan.monthly_premium_image_limit||0), monthly_voice_minutes_limit:Number(plan.monthly_voice_minutes_limit||0), monthly_campaign_credit_chf:Number(plan.campaign_credit_chf||0), monthly_ai_tool_credits:Number(plan.ai_tool_credits||0), monthly_photo_retouch_credits:Number(plan.ai_photo_credits||0), metadata:{capture_only:true,source:"appstore-restaurateur-screenshot",payment_provider:"none"}, ...pricingSnapshot(plan) });
  const subscription = Array.isArray(rows)?rows[0]:null; if(!subscription?.id) throw new Error("Unable to create temporary Elite subscription"); return subscription;
}
async function signInProduction(email,password) {
  const session = await jsonRequest(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method:"POST", headers:{apikey:ANON_KEY,"Content-Type":"application/json"}, body:JSON.stringify({email,password}) });
  if(!session?.access_token||!session?.refresh_token||!session?.user?.id) throw new Error("Production restaurateur sign-in did not return a complete session"); return session;
}
async function installSessionAndPreferences(page,session,restaurantId) {
  const authKey=`sb-${SUPABASE_PROJECT_REF}-auth-token`; const consent={version:"cookies-2026-07-v3",preferences:{necessary:true,analytics:false,marketing:false,personalization:false,geolocation:false},recordedAt:new Date().toISOString(),source:"settings"};
  await page.evaluate(({authKey,session,consentKey,consent,restaurantId})=>{localStorage.setItem(authKey,JSON.stringify(session));localStorage.setItem(consentKey,JSON.stringify(consent));localStorage.setItem("miamz-dashboard-restaurant",restaurantId);},{authKey,session,consentKey:CONSENT_STORAGE_KEY,consent,restaurantId});
  await page.reload({waitUntil:"domcontentloaded",timeout:120000}); await page.evaluate(()=>document.fonts?.ready).catch(()=>undefined); await new Promise(r=>setTimeout(r,1200));
}
async function gotoReady(page,url) {
  await page.goto(url,{waitUntil:"domcontentloaded",timeout:120000}); await page.evaluate(()=>document.fonts?.ready).catch(()=>undefined);
  await page.waitForFunction(()=>{const text=document.body?.innerText||"";return !text.includes("Chargement…")&&!text.includes("Chargement...")&&!text.includes("Ouverture de votre espace…");},{timeout:35000}).catch(()=>undefined); await new Promise(r=>setTimeout(r,1250));
}
function normalizePathname(url){try{return new URL(url).pathname.replace(/\/+$/,"")||"/";}catch{return "";}}
function assertRoute(finalUrl,expectedPath){const finalPath=normalizePathname(finalUrl);const expected=expectedPath.replace(/\/+$/,"")||"/";if(finalPath!==expected)throw new Error(`Dashboard route redirected unexpectedly: expected ${expected}, got ${finalPath}`);}
async function captureRoute(currentBrowser,device,screen,url,output){
  const page=await currentBrowser.newPage();const consoleErrors=[];page.on("console",m=>{if(m.type()==="error")consoleErrors.push(m.text().slice(0,500));});page.on("pageerror",e=>consoleErrors.push(safeError(e).slice(0,500)));
  try{await page.setViewport({width:device.width,height:device.height,deviceScaleFactor:device.dpr,isMobile:true,hasTouch:true});await gotoReady(page,url);assertRoute(page.url(),screen.path);const inspection=await page.evaluate(()=>({visibleText:document.body?.innerText||"",consentDialogOpen:Boolean(document.querySelector("#consent-title")),title:document.title||""}));if(inspection.consentDialogOpen)throw new Error("Privacy consent dialog remained open during screenshot capture");if(/Accès refusé|Impossible d'ouvrir|Erreur inattendue|Page introuvable|Aucun restaurant associé/i.test(inspection.visibleText))throw new Error(`Screen failed to render: ${inspection.visibleText.replace(/\s+/g," ").slice(0,600)}`);const buffer=await page.screenshot({type:"jpeg",quality:92,fullPage:false,captureBeyondViewport:false});await fs.writeFile(output,buffer);return{expected_pixel_width:device.width*device.dpr,expected_pixel_height:device.height*device.dpr,final_url:page.url(),document_title:inspection.title,visible_text_excerpt:inspection.visibleText.replace(/\s+/g," ").trim().slice(0,400),console_error_count:consoleErrors.length,console_errors:consoleErrors.slice(0,8)};}finally{await page.close();}
}
async function cleanupRestaurant(restaurantId){
  const restrictTables=["restaurant_onboarding_state_events","restaurant_stripe_adjustments","reservation_fee_adjustments","reservation_fee_charges","reservation_flat_fee_charges","payment_attempts","financial_ledger","commercial_earning_events","promo_codes","orders","reservations","order_groups","order_items","user_analytics","user_subscriptions","chef_table_drops"];
  for(const table of restrictTables)await restDelete(table,`restaurant_id=eq.${restaurantId}`).catch(error=>console.warn(`Best-effort cleanup skipped for ${table}: ${safeError(error)}`));await restDelete("restaurant_ai_subscriptions",`restaurant_id=eq.${restaurantId}`);await restDelete("restaurants",`id=eq.${restaurantId}`);
}
async function cleanupUser(userId){await restDelete("profiles",`user_id=eq.${userId}`).catch(()=>undefined);await restDelete("user_roles",`user_id=eq.${userId}`).catch(()=>undefined);const response=await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`,{method:"DELETE",headers:serviceHeaders()});if(!response.ok&&response.status!==404)throw new Error(`Auth cleanup returned HTTP ${response.status}`);}
