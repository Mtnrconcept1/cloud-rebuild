import { createAdminClient } from "./auth.ts";
import { asRecord } from "./marketing.ts";
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
};

const META_SECRET_REF = "META_SYSTEM_USER_TOKEN";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function resultStatus(value: unknown, fallback: string) {
  const record = asRecord(value);
  return stringValue(record.status) || fallback;
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
    .select("provider_external_id, result_summary")
    .eq("id", item.id)
    .eq("lease_token", item.lease_token)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Meta item lease is no longer owned by this worker");
  return data as MetaItemState;
}

async function readIntegration(client: AdminClient, channel: MetaChannel): Promise<MetaIntegrationRow> {
  const { data, error } = await client
    .from("marketing_integrations")
    .select("id, channel, status, capabilities, public_configuration, secret_ref")
    .eq("channel", channel)
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
) {
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

    integration = await readIntegration(client, channel);
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

    const published = await publishMetaContent({
      channel,
      content: asRecord(item.content),
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
      external_effect_committed: true,
      published_at_provider: new Date().toISOString(),
    };

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
    const retryable = metaError.retryable && item.attempt_count < item.max_attempts;
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
      external_effect_unknown: metaError.ambiguous,
      reconciliation_required: metaError.ambiguous,
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
      ambiguous: metaError.ambiguous,
    };
  }
}
