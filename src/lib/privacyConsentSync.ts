import { getSupabase } from "@/integrations/supabase/client";
import {
  clearDisallowedPrivacyStorage,
  createPrivacyConsentRecord,
  dispatchPrivacyConsentChanged,
  markPrivacyConsentSynced,
  readPrivacyConsent,
  writePrivacyConsent,
  type PrivacyConsentAction,
  type PrivacyConsentCategories,
  type PrivacyConsentSource,
  type StoredPrivacyConsent,
} from "@/lib/privacyConsentState";

type ConsentFunctionResponse = {
  recorded?: boolean;
  id?: string;
  occurredAt?: string;
};

async function syncPrivacyConsentRecord(record: StoredPrivacyConsent) {
  try {
    const { data, error } = await getSupabase().functions.invoke<ConsentFunctionResponse>(
      "record-privacy-consent",
      {
        body: {
          recordId: record.recordId,
          anonymousId: record.anonymousId,
          consentVersion: record.version,
          action: record.action,
          categories: record.categories,
          source: record.source,
          locale: typeof navigator === "undefined" ? null : navigator.language,
          clientRecordedAt: record.clientRecordedAt,
        },
      },
    );

    if (error || !data?.recorded || !data.occurredAt) return record;
    return markPrivacyConsentSynced(record.recordId, data.occurredAt) || record;
  } catch {
    return record;
  }
}

export async function persistPrivacyConsent(input: {
  categories: PrivacyConsentCategories;
  action: PrivacyConsentAction;
  source: PrivacyConsentSource;
}) {
  const record = createPrivacyConsentRecord({
    categories: input.categories,
    action: input.action,
    source: input.source,
  });

  writePrivacyConsent(record);
  clearDisallowedPrivacyStorage();
  dispatchPrivacyConsentChanged(record);
  return syncPrivacyConsentRecord(record);
}

export async function retryPendingPrivacyConsentSync() {
  const current = readPrivacyConsent();
  if (!current?.pendingSync) return current;
  return syncPrivacyConsentRecord(current);
}
