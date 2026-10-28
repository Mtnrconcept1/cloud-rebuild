import type { createAdminClient } from "./auth.ts";
import { asRecord } from "./marketing.ts";
import { metaPublicationUtm, tagTokUrlsInText } from "./marketing-utm.ts";
import {
  MetaPublishError,
  publishMetaContent,
  type MetaChannel,
} from "./meta-publishing.ts";

type AdminClient = ReturnType<typeof createAdminClient>;

type MetaClaimedItem = {
  id: string;
  channel: string;
  content: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  lease_token: string;
};

type MetaIntegrationRow = {
  id: string;
  channel: string;
  status: string;
  capabilities: Record<string, unknown> | null;
  public_configuration: Record<string, unknown> | null;
  secret_ref: string | null;
};

type MetaItemState = {
  provider_external_id: string | null;
  result_summary: Record<string, unknown> | null;
  integration_id: string;
  campaign_id: string | null;
  content: Record<string, unknown>;
  scheduled_at?: string | null;
};

type DailyPublicationAuthorization = {
  account_id: string;
  authorized_at: string;
  series_version: number;
};

type DailyPublicationContext = {
  authorization: DailyPublicationAuthorization | null;
  approvalSource: string;
  campaignId: string | null;
  integrationId: string;
  instagramUserId: string;
};

const META_SECRET_REF = "META_SYSTEM_USER_TOKEN";
const DAILY_APPROVAL_SOURCE = "daily-series-standing-authorization";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function resultStatus(value: unknown, fallback: string) {
  const record = asRecord(value);
  return stringValue(record.status) || fallback;
}

function readDailyPublicationAuthorization(
  content: Record<string, unknown>,
  approvalSource: string,
  channel: MetaChannel,
  instagramUserId: string,
): DailyPublicationAuthorization | null {
  // A daily draft may still be approved manually. The campaign marker also
  // identifies standing approval if its item proof has gone missing.
  if (!Object.prototype.hasOwnProperty.call(content, "daily_publication_authorization")
    && approvalSource !== DAILY_APPROVAL_SOURCE) return null;
  const proof = asRecord(content.daily_publication_authorization);
  if (channel !== "instagram" || typeof proof.account_id !== "string" || !/^\d{5,30}$/.test(proof.account_id)
    || typeof proof.authorized_at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(proof.authorized_at)
    || !Number.isFinite(Date.parse(proof.authorized_at))
    || typeof proof.series_version !== "number" || !Number.isInteger(proof.series_version) || proof.series_version < 1) {
    throw new MetaPublishError("meta_daily_authorization_invalid");
  }
  if (proof.account_id !== instagramUserId) throw new MetaPublishError("meta_daily_account_mismatch");
  return { account_id: proof.account_id, authorized_at: proof.authorized_at, series_version: proof.series_version };
}

function sameDailyAuthorization(left: DailyPublicationAuthorization | null, right: DailyPublicationAuthorization | null) {
  return left === right || Boolean(left && right && left.account_id === right.account_id
    && left.authorized_at === right.authorized_at && left.series_version === right.series_version);
}

async function readApprovedCampaign(client: AdminClient, campaignId: string | null) {
  if (!campaignId) return null;
  const { data, error } = await client.from("marketing_campaigns").select("name, status, approved_at, metadata")
    .eq("id", campaignId).maybeSingle();
  if (error || !data?.approved_at || ["paused", "completed", "cancelled", "failed"].includes(data.status)) {
    throw new MetaPublishError("meta_campaign_not_approved");
  }
  return data;
}

async function completeMetaItem(
  client: AdminClient,
  item: MetaClaimedItem,
  status: string,
  result: Record<string, unknown>,
  error?: string,
) {
  const { data, error: rpcError } = await client.rpc("complete_marketing_item", {
    p_item_id: item.id,
    p_lease_token: item.lease_token,
    p_status: status,
    p_result: result,
    p_error: error || null,
  });
  if (rpcError) throw rpcError;
  return data;
}

async function readItemState(client: AdminClient, item: MetaClaimedItem): Promise<MetaItemState> {
  const { data, error } = await client
    .from("marketing_calendar_items")
    .select("provider_external_id, result_summary, integration_id, campaign_id, content, scheduled_at")
    .eq("id", item.id)
    .eq("lease_token", item.lease_token)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Meta item lease is no longer owned by this worker");
  return data as MetaItemState;
}

async function readIntegration(client: AdminClient, channel: MetaChannel, integrationId: string): Promise<MetaIntegrationRow> {
  const { data, error } = await client
    .from("marketing_integrations")
    .select("id, channel, status, capabilities, public_configuration, secret_ref")
    .eq("channel", channel)
    .eq("id", integrationId)
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new MetaPublishError("meta_integration_not_connected", { blockedConfiguration: true });
  }
  return data as MetaIntegrationRow;
}

async function updateIntegrationHealth(
  client: AdminClient,
  integration: MetaIntegrationRow,
  lastError: string | null,
  blockConfiguration = false,
) {
  const patch: Record<string, unknown> = {
    last_checked_at: new Date().toISOString(),
    last_error: lastError,
  };
  if (blockConfiguration) patch.status = "blocked_configuration";
  const { error } = await client.from("marketing_integrations").update(patch).eq("id", integration.id);
  if (error) throw error;
}

async function markExternalPublishStarted(
  client: AdminClient,
  item: MetaClaimedItem,
  channel: MetaChannel,
  previousSummary: Record<string, unknown>,
  daily: DailyPublicationContext,
) {
  // The internal SQL runtime helper is deliberately not exposed to service_role.
  // Recheck the same two gates through server-only reads instead.
  const { data: runtime, error: runtimeError } = await client
    .from("marketing_automations").select("conditions")
    .eq("automation_key", "global_runtime").maybeSingle();
  const { data: flag, error: flagError } = await client
    .from("feature_flags").select("is_active")
    .eq("name", "admin-marketing-operations").maybeSingle();
  if (runtimeError || flagError || asRecord(runtime?.conditions).global_pause !== false || flag?.is_active !== true) {
    throw new MetaPublishError("meta_runtime_disabled", { retryable: true });
  }
  const { data: state, error: stateError } = await client
    .from("marketing_calendar_items")
    .select("approval_status, approved_at, campaign_id, integration_id, content, version")
    .eq("id", item.id).eq("lease_token", item.lease_token)
    .gt("lease_expires_at", new Date().toISOString()).maybeSingle();
  if (stateError || !state || state.approval_status !== "approved" || !state.approved_at
    || !Number.isInteger(state.version) || state.version < 1) {
    throw new MetaPublishError("meta_approval_or_lease_invalid");
  }
  const campaign = await readApprovedCampaign(client, state.campaign_id);
  const approvalSource = stringValue(asRecord(campaign?.metadata).approval_source);
  const currentAuthorization = readDailyPublicationAuthorization(asRecord(state.content), approvalSource, channel, daily.instagramUserId);
  if (!sameDailyAuthorization(currentAuthorization, daily.authorization)
    || ((currentAuthorization || daily.authorization) && (approvalSource !== daily.approvalSource
      || state.campaign_id !== daily.campaignId || state.integration_id !== daily.integrationId))) {
    throw new MetaPublishError("meta_daily_authorization_changed");
  }
  if (currentAuthorization) {
    const { data: currentIntegration, error: integrationError } = await client.from("marketing_integrations")
      .select("channel, status, public_configuration").eq("id", daily.integrationId).maybeSingle();
    if (integrationError) throw new MetaPublishError("meta_daily_authorization_unavailable", { retryable: true });
    // Fail this item without overwriting an administrator's disconnected or
    // disabled integration state through the general configuration-error path.
    if (!currentIntegration || currentIntegration.channel !== channel || currentIntegration.status !== "connected"
      || stringValue(asRecord(currentIntegration.public_configuration).ig_user_id) !== currentAuthorization.account_id) {
      throw new MetaPublishError("meta_daily_account_mismatch");
    }
  }
  const marker = {
    ...previousSummary,
    provider: "meta",
    channel,
    meta_publish_started_at: new Date().toISOString(),
    meta_publish_attempt_id: item.id,
  };
  const { data, error } = await client
    .from("marketing_calendar_items")
    .update({ result_summary: marker })
    .eq("id", item.id)
    .eq("lease_token", item.lease_token)
    .eq("approval_status", "approved")
    .eq("approved_at", state.approved_at)
    .eq("version", state.version)
    .gt("lease_expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error || !data) {
    throw new MetaPublishError("meta_publish_marker_persist_failed", { retryable: true });
  }
  return marker;
}

async function persistProviderResult(
  client: AdminClient,
  item: MetaClaimedItem,
  providerExternalId: string,
  result: Record<string, unknown>,
) {
  const { data, error } = await client
    .from("marketing_calendar_items")
    .update({
      provider_external_id: providerExternalId,
      result_summary: result,
    })
    .eq("id", item.id)
    .eq("lease_token", item.lease_token)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    throw new MetaPublishError("meta_result_persistence_failed", { ambiguous: true });
  }
}

export async function processMetaMarketingItem(client: AdminClient, item: MetaClaimedItem) {
  const channel = item.channel as MetaChannel;
  let integration: MetaIntegrationRow | null = null;
  let previousSummary: Record<string, unknown> = {};

  try {
    const state = await readItemState(client, item);
    previousSummary = asRecord(state.result_summary);
    const existingProviderId = stringValue(state.provider_external_id)
      || stringValue(previousSummary.provider_external_id);

    if (existingProviderId) {
      const result = {
        ...previousSummary,
        provider: "meta",
        channel,
        provider_external_id: existingProviderId,
        external_effect_committed: true,
        recovered_without_republish: true,
      };
      const completed = await completeMetaItem(client, item, "published", result);
      return {
        id: item.id,
        status: resultStatus(completed, "published"),
        providerExternalId: existingProviderId,
        recovered: true,
      };
    }

    if (stringValue(previousSummary.meta_publish_started_at)) {
      const result = {
        ...previousSummary,
        provider: "meta",
        channel,
        reconciliation_required: true,
        external_effect_unknown: true,
      };
      const completed = await completeMetaItem(
        client,
        item,
        "failed",
        result,
        "meta_publish_outcome_requires_reconciliation",
      );
      return {
        id: item.id,
        status: resultStatus(completed, "failed"),
        error: "meta_publish_outcome_requires_reconciliation",
        reconciliationRequired: true,
      };
    }

    integration = await readIntegration(client, channel, state.integration_id);
    const capabilities = asRecord(integration.capabilities);
    if (capabilities.adapter_deployed !== true) {
      throw new MetaPublishError("meta_adapter_not_enabled", { blockedConfiguration: true });
    }
    if (integration.secret_ref !== META_SECRET_REF) {
      throw new MetaPublishError("meta_secret_ref_invalid", { blockedConfiguration: true });
    }

    const publicConfiguration = asRecord(integration.public_configuration);
    const graphVersion = stringValue(publicConfiguration.graph_version)
      || (Deno.env.get("META_GRAPH_VERSION")?.trim() || "");
    const pageId = stringValue(publicConfiguration.page_id);
    const instagramUserId = stringValue(publicConfiguration.ig_user_id);
    const systemUserToken = Deno.env.get(META_SECRET_REF)?.trim() || "";
    const appSecret = Deno.env.get("META_APP_SECRET")?.trim() || "";
    const campaign = await readApprovedCampaign(client, state.campaign_id);
    const approvalSource = stringValue(asRecord(campaign?.metadata).approval_source);
    const authorization = readDailyPublicationAuthorization(asRecord(state.content), approvalSource, channel, instagramUserId);
    if (!sameDailyAuthorization(authorization,
      readDailyPublicationAuthorization(asRecord(item.content), approvalSource, channel, instagramUserId))) {
      throw new MetaPublishError("meta_daily_authorization_changed");
    }
    const daily: DailyPublicationContext = {
      authorization, approvalSource, campaignId: state.campaign_id, integrationId: state.integration_id, instagramUserId,
    };

    // The scheduled month keeps the campaign value stable across retries.
    const scheduledAt = new Date(stringValue(state.scheduled_at) || Date.now());
    const utm = metaPublicationUtm({
      channel,
      campaignName: stringValue(campaign?.name),
      itemId: item.id,
      at: Number.isFinite(scheduledAt.getTime()) ? scheduledAt : new Date(),
    });

    const published = await publishMetaContent({
      channel,
      content: asRecord(item.content),
      tagLinks: utm ? (caption) => tagTokUrlsInText(caption, utm) : null,
      config: {
        graphVersion,
        pageId,
        instagramUserId,
        systemUserToken,
        appSecret,
      },
      beforeExternalPublish: async () => {
        previousSummary = await markExternalPublishStarted(
          client,
          item,
          channel,
          previousSummary,
          daily,
        );
      },
    });

    const result = {
      ...previousSummary,
      provider: "meta",
      channel,
      provider_external_id: published.providerExternalId,
      graph_version: published.graphVersion,
      page_id: published.pageId,
      ...(published.instagramUserId ? { ig_user_id: published.instagramUserId } : {}),
      ...(published.containerId ? { instagram_container_id: published.containerId } : {}),
      used_media: published.usedMedia,
      utm_applied: published.utmApplied === true,
      ...(published.utmApplied && utm?.utm_campaign ? { utm_campaign: utm.utm_campaign } : {}),
      external_effect_committed: true,
      published_at_provider: new Date().toISOString(),
    };

    previousSummary = result;
    await persistProviderResult(client, item, published.providerExternalId, result);
    const completed = await completeMetaItem(client, item, "published", result);
    await updateIntegrationHealth(client, integration, null).catch(() => undefined);

    return {
      id: item.id,
      status: resultStatus(completed, "published"),
      providerExternalId: published.providerExternalId,
      recovered: false,
    };
  } catch (error) {
    const metaError = error instanceof MetaPublishError
      ? error
      : new MetaPublishError("meta_adapter_error", { retryable: true });
    const hasProviderId = Boolean(stringValue(previousSummary.provider_external_id));
    const ambiguous = metaError.ambiguous
      || (!hasProviderId && Boolean(stringValue(previousSummary.meta_publish_started_at)));
    const retryable = !ambiguous && metaError.retryable && item.attempt_count < item.max_attempts;
    const status = metaError.blockedConfiguration
      ? "blocked_configuration"
      : retryable
      ? "retrying"
      : "failed";
    const result = {
      ...previousSummary,
      provider: "meta",
      channel,
      error_code: metaError.code,
      external_effect_unknown: ambiguous,
      reconciliation_required: ambiguous,
    };

    if (integration) {
      await updateIntegrationHealth(
        client,
        integration,
        metaError.code,
        metaError.blockedConfiguration,
      ).catch(() => undefined);
    }

    const completed = await completeMetaItem(client, item, status, result, metaError.code);
    return {
      id: item.id,
      status: resultStatus(completed, status),
      error: metaError.code,
      ambiguous,
    };
  }
}
