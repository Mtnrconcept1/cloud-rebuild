import { createPrivateKey, sign } from "node:crypto";

const API = "https://api.appstoreconnect.apple.com";
const AUDIENCE = "appstoreconnect-v1";
const BUNDLE_ID = process.env.IOS_BUNDLE_ID?.trim() || "ch.thetok.app";
const VERSION_STRING = process.env.APP_STORE_VERSION?.trim() || "1.0";
const LOCALE = process.env.APP_STORE_LOCALE?.trim() || "fr-FR";
const REVIEW_EMAIL = process.env.APP_REVIEW_DEMO_EMAIL?.trim() || "appreview@thetok.ch";
const REVIEW_PASSWORD = requireEnv("APP_REVIEW_DEMO_PASSWORD");

const VERSION_METADATA = {
  promotionalText: "Réservez une table, commandez vos plats, profitez d’offres locales et cumulez des Miamz. TOK simplifie vos sorties et vos repas en Suisse romande.",
  description: `TOK réunit dans une seule application tout ce qu’il faut pour mieux profiter des restaurants autour de vous.\n\nDÉCOUVREZ\nTrouvez des restaurants, explorez leurs cartes, leurs horaires, leurs offres et leurs actualités.\n\nRÉSERVEZ SIMPLEMENT\nChoisissez votre restaurant, votre créneau et votre table. Selon les établissements, profitez aussi de Zéro Attente et des Tables du Chef.\n\nCOMMANDEZ À EMPORTER\nParcourez la carte, composez votre commande et payez avec les moyens disponibles avant de la récupérer au restaurant.\n\nPROFITEZ DES OFFRES LOCALES\nRetrouvez les ventes flash, offres anti-gaspi et autres opportunités proposées par les restaurants partenaires.\n\nCUMULEZ DES MIAMZ\nVotre activité peut vous permettre de cumuler des Miamz et d’accéder aux avantages disponibles dans TOK.\n\nSUIVEZ VOS RESTAURANTS\nLe fil Actualités vous permet de découvrir nouveautés, menus, événements et publications des restaurants.\n\nUN ESPACE POUR LES RESTAURATEURS\nLes professionnels peuvent gérer leur établissement, leurs réservations et commandes, leur carte, leurs performances, leurs campagnes et certains outils d’assistance et de création.\n\nTOK est conçu en Suisse pour rapprocher les restaurants et leurs clients, avec une expérience locale, simple et directe.\n\nCertaines fonctionnalités et offres dépendent du restaurant, de sa zone, de ses horaires et des services activés.`,
  keywords: "restaurant,réservation,commande,emporter,Genève,offres,fidélité,anti-gaspi,table,menu",
  marketingUrl: "https://www.thetok.ch",
  supportUrl: "https://www.thetok.ch/contact",
};

const REVIEW_NOTES = `TOK is a restaurant discovery, reservation and takeaway-ordering application focused on Switzerland.\n\nMAIN CUSTOMER FLOW\n1. Open the home screen and discover restaurants.\n2. Select a restaurant to view its information, menu and available offers.\n3. Choose either a table reservation or takeaway ordering when available.\n4. Authenticated users can manage their reservations, orders, profile, loyalty benefits and preferences.\n\nRESTAURANT FEATURES\nAuthorized restaurant accounts can access professional management features including restaurant information, menus, reservations, orders, marketing tools and operational dashboards. The supplied review account is an isolated consumer account. Restaurant publication requires a separately approved professional business account; please contact the App Review contact if access to that workspace is required during review.\n\nPAYMENTS\nPayments for restaurant meals, takeaway orders and restaurant services relate to physical goods or services consumed outside the application.\n\nACCOUNT DELETION\nUsers can initiate account deletion directly inside the application from their profile settings.\n\nLOCATION\nLocation permission is used to display nearby restaurants and relevant local results.\n\nCAMERA AND PHOTO LIBRARY\nCamera and photo-library access is requested only when the user chooses to add or upload an image.\n\nNOTIFICATIONS\nPush notifications are optional and may be used for account, reservation, order and product-related information.\n\nSUPPORT\nSupport and contact information are available from the public Contact/Help sections of the application and website.\n\nThe review account supplied in App Store Connect must remain active for the entire review period.\n\nIf additional access or clarification is required during review, please contact the App Review contact listed in App Store Connect.`;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizePrivateKey(value) {
  const normalized = value.includes("\\n") && !value.includes("\n") ? value.replaceAll("\\n", "\n") : value;
  const trimmed = normalized.trim();
  if (!trimmed.includes("-----BEGIN PRIVATE KEY-----") || !trimmed.includes("-----END PRIVATE KEY-----")) {
    throw new Error("APP_STORE_CONNECT_PRIVATE_KEY is not a valid .p8 private key payload.");
  }
  return `${trimmed}\n`;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function createToken() {
  const issuerId = requireEnv("APP_STORE_CONNECT_ISSUER_ID");
  const keyId = requireEnv("APP_STORE_CONNECT_KEY_ID");
  const privateKey = normalizePrivateKey(requireEnv("APP_STORE_CONNECT_PRIVATE_KEY"));
  const issuedAt = Math.floor(Date.now() / 1000) - 5;
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = { iss: issuerId, iat: issuedAt, exp: issuedAt + 5 * 60, aud: AUDIENCE };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: createPrivateKey(privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${signature.toString("base64url")}`;
}

const TOKEN = createToken();

function formatApiErrors(payload, status) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (errors.length === 0) return `HTTP ${status}`;
  return errors.map((error) => {
    const pointer = error?.source?.pointer || error?.source?.parameter || "";
    return [error?.code, error?.title, error?.detail, pointer].filter(Boolean).join(" | ");
  }).join(" || ");
}

async function api(path, { method = "GET", body, optional404 = false, allow409 = false } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let payload = null;
  if (response.status !== 204) {
    try { payload = await response.json(); } catch { /* deterministic error below */ }
  }
  if (optional404 && response.status === 404) return null;
  if (allow409 && response.status === 409) return { conflict: true, payload };
  if (!response.ok) {
    const error = new Error(formatApiErrors(payload, response.status));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function exactlyOne(payload, label) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  if (rows.length !== 1) throw new Error(`${label}: expected exactly one resource, got ${rows.length}.`);
  return rows[0];
}

async function resolveResources() {
  const app = exactlyOne(await api(`/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=2`), "app");
  const version = exactlyOne(await api(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${encodeURIComponent(VERSION_STRING)}&limit=2`), "version");
  const versionLocs = await api(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?filter[locale]=${encodeURIComponent(LOCALE)}&limit=2`);
  const versionLocalization = exactlyOne(versionLocs, "version localization");

  const infos = await api(`/v1/apps/${app.id}/appInfos?include=appInfoLocalizations,ageRatingDeclaration&limit=20&limit[appInfoLocalizations]=50`);
  const appInfo = (infos.data || []).find((row) => row.attributes?.appStoreState === "PREPARE_FOR_SUBMISSION") || infos.data?.[0];
  if (!appInfo) throw new Error("No editable AppInfo exists.");
  const appInfoLocalization = (infos.included || []).find((row) => row.type === "appInfoLocalizations" && row.attributes?.locale === LOCALE);
  const ageRating = (infos.included || []).find((row) => row.type === "ageRatingDeclarations")
    || (await api(`/v1/appInfos/${appInfo.id}/ageRatingDeclaration`))?.data;
  if (!appInfoLocalization) throw new Error(`No AppInfo localization exists for ${LOCALE}.`);
  if (!ageRating) throw new Error("No age rating declaration exists.");

  const builds = await api(`/v1/builds?filter[app]=${app.id}&filter[version]=2&limit=20`);
  const build = (builds.data || []).find((row) => row.attributes?.processingState === "VALID" && row.attributes?.buildAudienceType === "APP_STORE_ELIGIBLE");
  if (!build) throw new Error("No VALID / APP_STORE_ELIGIBLE build 2 is available.");

  return { app, version, versionLocalization, appInfo, appInfoLocalization, ageRating, build };
}

async function updateMetadata(r) {
  await api(`/v1/apps/${r.app.id}`, {
    method: "PATCH",
    body: { data: { type: "apps", id: r.app.id, attributes: { contentRightsDeclaration: "USES_THIRD_PARTY_CONTENT" } } },
  });
  console.log("Content rights declaration updated.");

  await api(`/v1/appStoreVersionLocalizations/${r.versionLocalization.id}`, {
    method: "PATCH",
    body: { data: { type: "appStoreVersionLocalizations", id: r.versionLocalization.id, attributes: VERSION_METADATA } },
  });
  console.log("French version metadata updated.");

  await api(`/v1/appInfoLocalizations/${r.appInfoLocalization.id}`, {
    method: "PATCH",
    body: {
      data: {
        type: "appInfoLocalizations",
        id: r.appInfoLocalization.id,
        attributes: {
          subtitle: "Réservez. Commandez. Profitez.",
          privacyPolicyUrl: "https://www.thetok.ch/politique-confidentialite",
        },
      },
    },
  });
  console.log("Subtitle and privacy policy URL updated.");

  await api(`/v1/appInfos/${r.appInfo.id}`, {
    method: "PATCH",
    body: {
      data: {
        type: "appInfos",
        id: r.appInfo.id,
        relationships: {
          primaryCategory: { data: { type: "appCategories", id: "FOOD_AND_DRINK" } },
          secondaryCategory: { data: { type: "appCategories", id: "LIFESTYLE" } },
        },
      },
    },
  });
  console.log("Primary and secondary App Store categories updated.");

  await api(`/v1/appStoreVersions/${r.version.id}`, {
    method: "PATCH",
    body: {
      data: {
        type: "appStoreVersions",
        id: r.version.id,
        attributes: {
          copyright: "2026 TOK",
          releaseType: "MANUAL",
          usesIdfa: false,
        },
      },
    },
  });
  console.log("Version copyright, release option and IDFA declaration updated.");
}

async function updateAgeRating(r) {
  const attributes = {
    advertising: true,
    alcoholTobaccoOrDrugUseOrReferences: "INFREQUENT",
    contests: "NONE",
    gambling: false,
    gamblingSimulated: "NONE",
    gunsOrOtherWeapons: false,
    healthOrWellnessTopics: false,
    lootBox: false,
    medicalOrTreatmentInformation: "NONE",
    messagingAndChat: true,
    parentalControls: false,
    profanityOrCrudeHumor: "NONE",
    ageAssurance: false,
    sexualContentGraphicAndNudity: "NONE",
    sexualContentOrNudity: "NONE",
    socialMedia: true,
    socialMediaAgeRestricted: false,
    horrorOrFearThemes: "NONE",
    matureOrSuggestiveThemes: "NONE",
    unrestrictedWebAccess: false,
    userGeneratedContent: true,
    violenceCartoonOrFantasy: "NONE",
    violenceRealisticProlongedGraphicOrSadistic: "NONE",
    violenceRealistic: "NONE",
    ageRatingOverride: "NONE",
    ageRatingOverrideV2: "SIXTEEN_PLUS",
    koreaAgeRatingOverride: "NONE",
  };

  await api(`/v1/ageRatingDeclarations/${r.ageRating.id}`, {
    method: "PATCH",
    body: { data: { type: "ageRatingDeclarations", id: r.ageRating.id, attributes } },
  });
  console.log("Age rating questionnaire completed with a 16+ override aligned to TOK's published under-16 policy.");
}

async function attachBuild(r) {
  await api(`/v1/appStoreVersions/${r.version.id}/relationships/build`, {
    method: "PATCH",
    body: { data: { type: "builds", id: r.build.id } },
  });
  console.log(`Build ${r.build.attributes?.version || "2"} attached to App Store version ${VERSION_STRING}.`);
}

async function upsertReviewDetail(r) {
  const current = await api(`/v1/appStoreVersions/${r.version.id}/appStoreReviewDetail`, { optional404: true });
  const attributes = {
    contactFirstName: "Raphaël",
    contactLastName: "Barman",
    contactPhone: "+41764756669",
    contactEmail: "contact@thetok.ch",
    demoAccountRequired: true,
    demoAccountName: REVIEW_EMAIL,
    demoAccountPassword: REVIEW_PASSWORD,
    notes: REVIEW_NOTES,
  };

  if (current?.data?.id) {
    await api(`/v1/appStoreReviewDetails/${current.data.id}`, {
      method: "PATCH",
      body: { data: { type: "appStoreReviewDetails", id: current.data.id, attributes } },
    });
    console.log("App Review contact and demo credentials updated.");
    return;
  }

  await api(`/v1/appStoreReviewDetails`, {
    method: "POST",
    body: {
      data: {
        type: "appStoreReviewDetails",
        attributes,
        relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: r.version.id } } },
      },
    },
  });
  console.log("App Review contact and demo credentials created.");
}

async function ensureSwitzerlandAvailability(r) {
  const existing = await api(`/v1/apps/${r.app.id}/appAvailabilityV2`, { optional404: true });
  if (existing?.data?.id) {
    console.log(`App availability already exists (${existing.data.id}); leaving existing territory configuration unchanged.`);
    return;
  }

  const localId = "${territory-che}";
  try {
    await api(`/v2/appAvailabilities`, {
      method: "POST",
      body: {
        data: {
          type: "appAvailabilities",
          attributes: { availableInNewTerritories: false },
          relationships: {
            app: { data: { type: "apps", id: r.app.id } },
            territoryAvailabilities: { data: [{ type: "territoryAvailabilities", id: localId }] },
          },
        },
        included: [{
          type: "territoryAvailabilities",
          id: localId,
          attributes: { available: true, preOrderEnabled: false },
          relationships: { territory: { data: { type: "territories", id: "CHE" } } },
        }],
      },
    });
    console.log("Initial App Store availability configured for Switzerland only.");
  } catch (error) {
    console.warn(`Availability API warning: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function verifyPriceSchedule(r) {
  const schedule = await api(`/v1/apps/${r.app.id}/appPriceSchedule?include=baseTerritory`, { optional404: true });
  if (!schedule?.data?.id) {
    console.warn("No App Store price schedule is visible through the API; submission will verify whether pricing requires manual completion.");
    return;
  }
  const territory = (schedule.included || []).find((row) => row.type === "territories");
  console.log(`App price schedule exists (base territory ${territory?.id || "unknown"}).`);
}

async function submitForReview(r) {
  const existingPayload = await api(`/v1/apps/${r.app.id}/reviewSubmissions?limit=50`);
  const existing = (existingPayload.data || []).find((row) => ["READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW"].includes(row.attributes?.state));
  if (existing && ["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(existing.attributes?.state)) {
    console.log(`Review submission already ${existing.attributes.state}.`);
    return { submitted: true, submission: existing };
  }

  let submission = existing;
  if (!submission) {
    const created = await api(`/v1/reviewSubmissions`, {
      method: "POST",
      body: {
        data: {
          type: "reviewSubmissions",
          attributes: { platform: "IOS" },
          relationships: { app: { data: { type: "apps", id: r.app.id } } },
        },
      },
    });
    submission = created.data;
    console.log(`Created review submission ${submission.id}.`);
  }

  const items = await api(`/v1/reviewSubmissions/${submission.id}/items?limit=200`);
  const hasVersion = (items.data || []).some((item) => item.relationships?.appStoreVersion?.data?.id === r.version.id);
  if (!hasVersion) {
    await api(`/v1/reviewSubmissionItems`, {
      method: "POST",
      body: {
        data: {
          type: "reviewSubmissionItems",
          relationships: {
            reviewSubmission: { data: { type: "reviewSubmissions", id: submission.id } },
            appStoreVersion: { data: { type: "appStoreVersions", id: r.version.id } },
          },
        },
      },
    });
    console.log("App Store version added to review submission.");
  }

  try {
    const result = await api(`/v1/reviewSubmissions/${submission.id}`, {
      method: "PATCH",
      body: {
        data: {
          type: "reviewSubmissions",
          id: submission.id,
          attributes: { submitted: true },
        },
      },
    });
    console.log(`Review submission accepted by Apple; state: ${result?.data?.attributes?.state || "submitted"}.`);
    return { submitted: true, submission: result?.data || submission };
  } catch (modernError) {
    console.warn(`ReviewSubmission API could not submit: ${modernError instanceof Error ? modernError.message : String(modernError)}`);
    try {
      const legacy = await api(`/v1/appStoreVersionSubmissions`, {
        method: "POST",
        body: {
          data: {
            type: "appStoreVersionSubmissions",
            relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: r.version.id } } },
          },
        },
      });
      console.log(`App Store version submission accepted by Apple's submission endpoint (${legacy?.data?.id || "created"}).`);
      return { submitted: true, submission: legacy?.data || submission };
    } catch (legacyError) {
      const modernMessage = modernError instanceof Error ? modernError.message : String(modernError);
      const legacyMessage = legacyError instanceof Error ? legacyError.message : String(legacyError);
      throw new Error(`APP_REVIEW_SUBMISSION_BLOCKED :: modern=${modernMessage} :: legacy=${legacyMessage}`);
    }
  }
}

async function finalState(r) {
  const version = await api(`/v1/appStoreVersions/${r.version.id}`);
  const submissions = await api(`/v1/apps/${r.app.id}/reviewSubmissions?limit=50`);
  console.log(`FINAL_VERSION_STATE=${version.data?.attributes?.appStoreState || version.data?.attributes?.appVersionState || "unknown"}`);
  for (const submission of submissions.data || []) {
    console.log(`REVIEW_SUBMISSION_STATE=${submission.attributes?.state || "unknown"}`);
  }
}

async function main() {
  console.log(`Finalizing ${BUNDLE_ID} iOS ${VERSION_STRING} (${LOCALE}).`);
  const resources = await resolveResources();
  console.log(`Resolved TheTok app ${resources.app.id}, version ${resources.version.id}, build ${resources.build.id}.`);

  await updateMetadata(resources);
  await updateAgeRating(resources);
  await attachBuild(resources);
  await upsertReviewDetail(resources);
  await ensureSwitzerlandAvailability(resources);
  await verifyPriceSchedule(resources);
  await submitForReview(resources);
  await finalState(resources);

  console.log("APP_STORE_FINALIZATION_COMPLETE");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`App Store finalization failed: ${message}`);
  process.exit(1);
});
