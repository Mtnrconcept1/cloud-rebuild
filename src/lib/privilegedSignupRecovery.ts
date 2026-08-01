import type {
  SignupDocumentType,
  SignupRole,
  SignupSubscriptionBillingPeriod,
} from "@/lib/signup";

const DATABASE_NAME = "tok-privileged-signup-recovery";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export type PrivilegedSignupRecoveryRole = Exclude<SignupRole, "client">;

export type PrivilegedSignupRecoveryForm = {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  businessName: string;
  legalName: string;
  businessRegistrationNumber: string;
  taxId: string;
  restaurantName: string;
  restaurantDescription: string;
  vehicleType: string;
  licensePlate: string;
  iban: string;
};

export type PrivilegedSignupRecoveryDraft = {
  version: 1;
  operationId: string;
  role: PrivilegedSignupRecoveryRole;
  email: string;
  form: PrivilegedSignupRecoveryForm;
  onboardingChoices?: {
    subscriptionPlanId: string;
    subscriptionBillingPeriod: SignupSubscriptionBillingPeriod;
  };
  documents: Partial<Record<SignupDocumentType, File>>;
  legalAcceptance: {
    acceptedAt: string;
    version: string;
  };
  contractSignature?: {
    signerName: string;
    signatureDataUrl: string;
  };
  selectedSubscriptionPlanLabel?: string | null;
  selectedSubscriptionPriceLabel?: string | null;
  commercialReferralToken?: string;
  createdAt: number;
  expiresAt: number;
};

type SavePrivilegedSignupRecoveryDraftInput = Omit<
  PrivilegedSignupRecoveryDraft,
  "version" | "createdAt" | "expiresAt" | "documents"
> & {
  documents: Partial<Record<SignupDocumentType, File | null | undefined>>;
  ttlMs?: number;
};

function getIndexedDb() {
  return typeof indexedDB === "undefined" ? null : indexedDB;
}

function openDatabase(): Promise<IDBDatabase | null> {
  const factory = getIndexedDb();
  if (!factory) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "operationId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
    request.onblocked = () => reject(new Error("indexeddb_open_blocked"));
  });
}

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("indexeddb_transaction_failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("indexeddb_transaction_aborted"));
  });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function cloneDocuments(
  documents: Partial<Record<SignupDocumentType, File | null | undefined>>,
) {
  return Object.fromEntries(
    Object.entries(documents).filter((entry): entry is [SignupDocumentType, File] => {
      return entry[1] instanceof File;
    }),
  ) as Partial<Record<SignupDocumentType, File>>;
}

export async function savePrivilegedSignupRecoveryDraft(
  input: SavePrivilegedSignupRecoveryDraftInput,
) {
  const database = await openDatabase();
  if (!database) return false;

  const now = Date.now();
  const ttlMs = Number.isFinite(input.ttlMs)
    ? Math.max(60_000, Number(input.ttlMs))
    : DEFAULT_TTL_MS;
  const draft: PrivilegedSignupRecoveryDraft = {
    version: 1,
    operationId: input.operationId,
    role: input.role,
    email: normalizeEmail(input.email),
    form: {
      ...input.form,
      email: normalizeEmail(input.form.email || input.email),
    },
    onboardingChoices: input.onboardingChoices,
    documents: cloneDocuments(input.documents),
    legalAcceptance: input.legalAcceptance,
    contractSignature: input.contractSignature,
    selectedSubscriptionPlanLabel: input.selectedSubscriptionPlanLabel ?? null,
    selectedSubscriptionPriceLabel: input.selectedSubscriptionPriceLabel ?? null,
    commercialReferralToken: input.commercialReferralToken,
    createdAt: now,
    expiresAt: now + ttlMs,
  };

  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(draft);
    await waitForTransaction(transaction);
    return true;
  } finally {
    database.close();
  }
}

export async function loadPrivilegedSignupRecoveryDraft(
  operationId: string,
): Promise<PrivilegedSignupRecoveryDraft | null> {
  const database = await openDatabase();
  if (!database) return null;

  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(operationId);
    const draft = await new Promise<PrivilegedSignupRecoveryDraft | null>((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as PrivilegedSignupRecoveryDraft | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("indexeddb_read_failed"));
    });
    await waitForTransaction(transaction);

    if (!draft || draft.version !== 1 || draft.operationId !== operationId) return null;
    if (!Number.isFinite(draft.expiresAt) || draft.expiresAt <= Date.now()) {
      await removePrivilegedSignupRecoveryDraft(operationId);
      return null;
    }
    return draft;
  } finally {
    database.close();
  }
}

export async function removePrivilegedSignupRecoveryDraft(operationId: string) {
  const database = await openDatabase();
  if (!database) return false;

  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(operationId);
    await waitForTransaction(transaction);
    return true;
  } finally {
    database.close();
  }
}
