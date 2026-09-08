// GENERATED FILE — do not edit by hand.
// Run `pnpm run generate:error-code-map` after adding or moving an HttpError.
// 341 error codes mapped from supabase/functions/**.

export type ErrorCodeSite = { file: string; line: number };

export const ERROR_CODE_SITES: Record<string, ErrorCodeSite[]> = {
  "action_id_required": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 1469
    },
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 1478
    }
  ],
  "action_invalid": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 129
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1303
    }
  ],
  "admin_ai_owner_not_configured": [
    {
      "file": "supabase/functions/ai-admin-dashboard-chat/index.ts",
      "line": 119
    }
  ],
  "admin_ai_owner_required": [
    {
      "file": "supabase/functions/ai-admin-dashboard-chat/index.ts",
      "line": 120
    },
    {
      "file": "supabase/functions/ai-admin-dashboard-chat/index.ts",
      "line": 128
    }
  ],
  "admin_dashboard_ai_chat_disabled": [
    {
      "file": "supabase/functions/ai-admin-dashboard-chat/index.ts",
      "line": 140
    }
  ],
  "admin_required": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 343
    },
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 530
    },
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 590
    }
  ],
  "agent_run_id_required": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 966
    }
  ],
  "ai_credits_exhausted": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1114
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1447
    }
  ],
  "ai_empty_response": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 352
    },
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 337
    },
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 1221
    }
  ],
  "ai_input_rejected": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 152
    }
  ],
  "ai_invalid_plan": [
    {
      "file": "supabase/functions/_shared/marketing-ai.ts",
      "line": 100
    }
  ],
  "ai_invalid_response": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 362
    },
    {
      "file": "supabase/functions/ai-social-post-copy/index.ts",
      "line": 186
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 302
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 343
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 840
    },
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 1228
    }
  ],
  "ai_provider_billing_unavailable": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 228
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 754
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1112
    }
  ],
  "ai_quota_exceeded": [
    {
      "file": "supabase/functions/ai-accounting-agent/index.ts",
      "line": 349
    },
    {
      "file": "supabase/functions/ai-admin-monitor/index.ts",
      "line": 501
    },
    {
      "file": "supabase/functions/ai-client-support/index.ts",
      "line": 404
    },
    {
      "file": "supabase/functions/ai-restaurant-agent/index.ts",
      "line": 212
    },
    {
      "file": "supabase/functions/restaurant-advisor/index.ts",
      "line": 159
    }
  ],
  "ai_rate_limited": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 224
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 757
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1106
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 396
    }
  ],
  "ai_service_error": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 231
    },
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 1216
    },
    {
      "file": "supabase/functions/restaurant-advisor/index.ts",
      "line": 381
    }
  ],
  "ai_service_unavailable": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 167
    },
    {
      "file": "supabase/functions/ai-accounting-agent/index.ts",
      "line": 337
    },
    {
      "file": "supabase/functions/ai-admin-dashboard-chat/index.ts",
      "line": 461
    },
    {
      "file": "supabase/functions/ai-admin-monitor/index.ts",
      "line": 487
    },
    {
      "file": "supabase/functions/ai-admin-support/index.ts",
      "line": 137
    },
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 507
    },
    {
      "file": "supabase/functions/ai-client-chat/index.ts",
      "line": 262
    },
    {
      "file": "supabase/functions/ai-client-support/index.ts",
      "line": 325
    },
    {
      "file": "supabase/functions/ai-guardian/index.ts",
      "line": 737
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1479
    },
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 150
    },
    {
      "file": "supabase/functions/ai-restaurant-agent/index.ts",
      "line": 193
    }
  ],
  "ai_timeout": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 215
    }
  ],
  "ai_usage_recording_failed": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 875
    }
  ],
  "aligro_prices_unavailable": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 781
    }
  ],
  "allowed_scopes_required": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 535
    }
  ],
  "anonymous_client_identity_unavailable": [
    {
      "file": "supabase/functions/track-sponsored-event/index.ts",
      "line": 212
    }
  ],
  "approved_base_sha_missing": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1833
    }
  ],
  "authorization_code_expired": [
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 152
    }
  ],
  "authorization_code_required": [
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 278
    }
  ],
  "autopilot_plan_fields_required": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 961
    }
  ],
  "availability_lookup_failed": [
    {
      "file": "supabase/functions/google-actions-center-sync/index.ts",
      "line": 168
    }
  ],
  "branch_id_missing": [
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 147
    }
  ],
  "campaign_not_found": [
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 464
    }
  ],
  "campaign_preview_fields_required": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 911
    }
  ],
  "campaign_required": [
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 455
    }
  ],
  "campaign_studio_run_not_found": [
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 437
    },
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 480
    }
  ],
  "captcha_invalid": [
    {
      "file": "supabase/functions/contact-support/index.ts",
      "line": 81
    }
  ],
  "captcha_verification_failed": [
    {
      "file": "supabase/functions/contact-support/index.ts",
      "line": 78
    }
  ],
  "channels_required": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 91
    }
  ],
  "chat_tool_invalid": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 134
    }
  ],
  "client_credentials_required": [
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 286
    }
  ],
  "client_id_and_redirect_uri_required": [
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 226
    }
  ],
  "client_uuid_required": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 591
    },
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 833
    },
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 865
    }
  ],
  "codex_dispatch_not_configured": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1678
    }
  ],
  "commercial_demo_ai_budget_exhausted": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 397
    }
  ],
  "commercial_demo_ai_busy": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 175
    },
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 191
    }
  ],
  "commercial_demo_ai_circuit_open": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 192
    }
  ],
  "commercial_demo_ai_claim_unavailable": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 287
    },
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 199
    }
  ],
  "commercial_demo_ai_cleanup_unavailable": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 500
    },
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 512
    },
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 518
    }
  ],
  "commercial_demo_ai_completion_unavailable": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 328
    },
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 377
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 435
    }
  ],
  "commercial_demo_ai_conversation_not_found": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 238
    }
  ],
  "commercial_demo_ai_daily_budget_exhausted": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 194
    }
  ],
  "commercial_demo_ai_feature_disabled": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 187
    },
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 197
    }
  ],
  "commercial_demo_ai_forbidden": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 103
    },
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 119
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 493
    }
  ],
  "commercial_demo_ai_history_unavailable": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 237
    },
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 252
    },
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 543
    }
  ],
  "commercial_demo_ai_maintenance_forbidden": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 712
    }
  ],
  "commercial_demo_ai_retention_unavailable": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 479
    }
  ],
  "commercial_demo_ai_signing_unavailable": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 455
    },
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 577
    }
  ],
  "commercial_demo_ai_storage_unavailable": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 429
    }
  ],
  "commercial_demo_context_unavailable": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 208
    }
  ],
  "commercial_demo_mapping_check_unavailable": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 140
    }
  ],
  "commercial_demo_mapping_invalid": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 143
    }
  ],
  "commercial_demo_session_check_unavailable": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 113
    }
  ],
  "commercial_demo_session_not_found": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 114
    }
  ],
  "consent_check_unavailable": [
    {
      "file": "supabase/functions/_shared/intelligence.ts",
      "line": 56
    }
  ],
  "content_type_must_be_json": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 332
    }
  ],
  "context_too_large": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 61
    }
  ],
  "conversation_id_required": [
    {
      "file": "supabase/functions/ai-admin-dashboard-chat/index.ts",
      "line": 439
    }
  ],
  "conversation_not_created": [
    {
      "file": "supabase/functions/ai-admin-dashboard-chat/index.ts",
      "line": 511
    },
    {
      "file": "supabase/functions/ai-client-support/index.ts",
      "line": 444
    }
  ],
  "conversation_not_found": [
    {
      "file": "supabase/functions/ai-client-support/index.ts",
      "line": 350
    }
  ],
  "conversion_authentication_required": [
    {
      "file": "supabase/functions/track-sponsored-event/index.ts",
      "line": 207
    }
  ],
  "crm_mfa_factor_reset_failed": [
    {
      "file": "supabase/functions/crm-mfa-recovery/index.ts",
      "line": 293
    }
  ],
  "daily_dish_claim_unavailable": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 972
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1098
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1108
    }
  ],
  "daily_dish_demo_request_already_completed": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 399
    }
  ],
  "daily_dish_demo_request_mismatch": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 400
    }
  ],
  "daily_dish_disabled": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 962
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1064
    }
  ],
  "daily_dish_generation_in_progress": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 395
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 974
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1078
    }
  ],
  "daily_dish_persistence_failed": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 992
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1001
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1127
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1136
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1225
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1242
    }
  ],
  "daily_dish_publication_failed": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1268
    }
  ],
  "daily_dish_revision_limit": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1200
    }
  ],
  "daily_dish_run_not_publishable": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1204
    }
  ],
  "daily_dish_run_unavailable": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 535
    }
  ],
  "daily_dish_settings_unavailable": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 507
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 908
    }
  ],
  "daily_dish_variant_not_found": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1199
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1237
    }
  ],
  "daily_dish_variants_unavailable": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 543
    }
  ],
  "empty_image": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 397
    }
  ],
  "end_user_cancellation_confirmation_required": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 602
    }
  ],
  "end_user_confirmation_required": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 389
    }
  ],
  "explicit_confirmation_required": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 968
    }
  ],
  "feature_disabled": [
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 506
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1462
    },
    {
      "file": "supabase/functions/customer-memory/index.ts",
      "line": 433
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 398
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 445
    }
  ],
  "feature_flag_check_unavailable": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 180
    },
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 505
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1461
    },
    {
      "file": "supabase/functions/customer-memory/index.ts",
      "line": 432
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 443
    }
  ],
  "financial_action_requires_manual_workflow": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 959
    },
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 987
    }
  ],
  "firebase_service_account_invalid_format": [
    {
      "file": "supabase/functions/send-push/index.ts",
      "line": 116
    }
  ],
  "firebase_service_account_invalid_json": [
    {
      "file": "supabase/functions/send-push/index.ts",
      "line": 94
    },
    {
      "file": "supabase/functions/send-push/index.ts",
      "line": 158
    }
  ],
  "firebase_service_account_missing": [
    {
      "file": "supabase/functions/send-push/index.ts",
      "line": 136
    },
    {
      "file": "supabase/functions/send-push/index.ts",
      "line": 165
    }
  ],
  "firecrawl_admin_tools_disabled": [
    {
      "file": "supabase/functions/enrich-restaurants/index.ts",
      "line": 97
    },
    {
      "file": "supabase/functions/scrape-restaurants/index.ts",
      "line": 52
    }
  ],
  "forbidden": [
    {
      "file": "supabase/functions/ai-client-support/index.ts",
      "line": 352
    },
    {
      "file": "supabase/functions/aligro-catalog-sync/index.ts",
      "line": 397
    },
    {
      "file": "supabase/functions/google-actions-center-sync/index.ts",
      "line": 296
    }
  ],
  "forbidden_conversation": [
    {
      "file": "supabase/functions/ai-admin-dashboard-chat/index.ts",
      "line": 448
    },
    {
      "file": "supabase/functions/ai-admin-dashboard-chat/index.ts",
      "line": 479
    }
  ],
  "github_base_revision_invalid": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1601
    }
  ],
  "github_base_revision_not_found": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1623
    }
  ],
  "github_incident_token_not_configured": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1577
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1630
    }
  ],
  "github_pr_number_mismatch": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1958
    }
  ],
  "github_run_id_invalid": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1808
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1911
    }
  ],
  "google_actions_center_route_not_found": [
    {
      "file": "supabase/functions/google-actions-center/index.ts",
      "line": 1016
    }
  ],
  "google_booking_mapping_missing": [
    {
      "file": "supabase/functions/google-actions-center-sync/index.ts",
      "line": 197
    }
  ],
  "google_service_account_invalid_format": [
    {
      "file": "supabase/functions/google-actions-center-sync/index.ts",
      "line": 96
    }
  ],
  "google_service_account_invalid_json": [
    {
      "file": "supabase/functions/google-actions-center-sync/index.ts",
      "line": 89
    }
  ],
  "google_service_account_missing": [
    {
      "file": "supabase/functions/google-actions-center-sync/index.ts",
      "line": 81
    }
  ],
  "google_token_missing": [
    {
      "file": "supabase/functions/google-actions-center-sync/index.ts",
      "line": 152
    }
  ],
  "google_token_request_failed": [
    {
      "file": "supabase/functions/google-actions-center-sync/index.ts",
      "line": 149
    }
  ],
  "grant_id_required": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 933
    }
  ],
  "grant_status_invalid": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 935
    }
  ],
  "idempotency_key_in_progress": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 415
    },
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 619
    }
  ],
  "idempotency_key_required": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 381
    },
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 597
    }
  ],
  "idempotency_key_reused_with_different_arguments": [
    {
      "file": "supabase/functions/tok-connect-mcp/index.ts",
      "line": 1961
    }
  ],
  "idempotency_key_reused_with_different_body": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 412
    },
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 616
    }
  ],
  "image_analysis_provider_not_configured": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 560
    }
  ],
  "image_edit_timeout": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1099
    }
  ],
  "image_edit_transient_failure": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1100
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1104
    }
  ],
  "image_empty_response": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1321
    }
  ],
  "image_generation_required": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1506
    }
  ],
  "image_id_required": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 241
    },
    {
      "file": "supabase/functions/restaurant-media-governance/index.ts",
      "line": 121
    }
  ],
  "image_invalid_magic_bytes": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 498
    }
  ],
  "image_invalid_payload": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 486
    }
  ],
  "image_invalid_size": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 489
    }
  ],
  "image_missing_payload": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1331
    },
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 479
    }
  ],
  "image_not_found": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 253
    }
  ],
  "image_reference_edit_required": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1307
    }
  ],
  "image_request_rejected": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 553
    }
  ],
  "image_restaurant_not_found": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 269
    }
  ],
  "image_too_large_for_analysis": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 398
    }
  ],
  "image_url_unreachable": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1327
    }
  ],
  "incident_bound_to_another_github_run": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1816
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1940
    }
  ],
  "incident_context_parameters_missing": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1806
    }
  ],
  "incident_context_token_expired": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1822
    }
  ],
  "incident_context_token_invalid": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1826
    }
  ],
  "incident_context_token_missing": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1819
    }
  ],
  "incident_id_missing": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1910
    }
  ],
  "incident_id_required": [
    {
      "file": "supabase/functions/ai-guardian/index.ts",
      "line": 1056
    },
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 1457
    }
  ],
  "incident_not_approved": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1813
    }
  ],
  "incident_not_found": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1018
    }
  ],
  "incident_registration_failed": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1038
    }
  ],
  "incident_scan_invalid_response": [
    {
      "file": "supabase/functions/ops-incident-native-scan/index.ts",
      "line": 75
    }
  ],
  "incident_scan_rejected": [
    {
      "file": "supabase/functions/ops-incident-native-scan/index.ts",
      "line": 79
    }
  ],
  "incident_scan_timeout": [
    {
      "file": "supabase/functions/ops-incident-native-scan/index.ts",
      "line": 60
    }
  ],
  "incident_scan_unreachable": [
    {
      "file": "supabase/functions/ops-incident-native-scan/index.ts",
      "line": 62
    }
  ],
  "incident_state_changed": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1750
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1846
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1991
    }
  ],
  "instruction_invalid": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1152
    }
  ],
  "integrations_unavailable": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 109
    }
  ],
  "invalid_action": [
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 220
    },
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 500
    },
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 66
    },
    {
      "file": "supabase/functions/crm-mfa-recovery/index.ts",
      "line": 332
    },
    {
      "file": "supabase/functions/customer-memory/index.ts",
      "line": 126
    },
    {
      "file": "supabase/functions/customer-memory/index.ts",
      "line": 427
    }
  ],
  "invalid_authentication": [
    {
      "file": "supabase/functions/track-sponsored-event/index.ts",
      "line": 129
    }
  ],
  "invalid_authorization_code": [
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 138
    },
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 140
    },
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 149
    }
  ],
  "invalid_callback_data": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1662
    }
  ],
  "invalid_category": [
    {
      "file": "supabase/functions/customer-memory/index.ts",
      "line": 376
    }
  ],
  "invalid_client": [
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 202
    },
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 295
    }
  ],
  "invalid_github_incident_repository": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1570
    }
  ],
  "invalid_github_pr_url": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1956
    }
  ],
  "invalid_image": [
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 1075
    }
  ],
  "invalid_incident_workflow_transition": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1937
    }
  ],
  "invalid_json": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 118
    }
  ],
  "invalid_json_body": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 371
    },
    {
      "file": "supabase/functions/track-sponsored-event/index.ts",
      "line": 108
    }
  ],
  "invalid_recovery_challenge": [
    {
      "file": "supabase/functions/crm-mfa-recovery/index.ts",
      "line": 241
    }
  ],
  "invalid_repair_branch": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1945
    }
  ],
  "invalid_request": [
    {
      "file": "supabase/functions/ai-client-chat/index.ts",
      "line": 273
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1286
    },
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 1072
    },
    {
      "file": "supabase/functions/restaurant-advisor/index.ts",
      "line": 146
    }
  ],
  "invalid_request_body": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 235
    }
  ],
  "is_enabled_invalid": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 901
    }
  ],
  "item_count_invalid": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 164
    }
  ],
  "item_required": [
    {
      "file": "supabase/functions/customer-memory/index.ts",
      "line": 337
    }
  ],
  "json_object_required": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 374
    }
  ],
  "label_required": [
    {
      "file": "supabase/functions/customer-memory/index.ts",
      "line": 378
    }
  ],
  "marketing_reference_ids_required": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 416
    }
  ],
  "marketing_reference_mismatch": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 436
    }
  ],
  "marketing_reference_required": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 442
    }
  ],
  "mcp_method_not_found": [
    {
      "file": "supabase/functions/tok-connect-full-app-mcp/index.ts",
      "line": 416
    },
    {
      "file": "supabase/functions/tok-connect-mcp/index.ts",
      "line": 2835
    }
  ],
  "mcp_prompt_not_found": [
    {
      "file": "supabase/functions/tok-connect-full-app-mcp/index.ts",
      "line": 414
    },
    {
      "file": "supabase/functions/tok-connect-mcp/index.ts",
      "line": 2808
    }
  ],
  "mcp_tool_not_found": [
    {
      "file": "supabase/functions/tok-connect-full-app-mcp/index.ts",
      "line": 346
    },
    {
      "file": "supabase/functions/tok-connect-full-app-mcp/index.ts",
      "line": 375
    },
    {
      "file": "supabase/functions/tok-connect-mcp/index.ts",
      "line": 2536
    },
    {
      "file": "supabase/functions/tok-connect-mcp/index.ts",
      "line": 2580
    }
  ],
  "media_id_required": [
    {
      "file": "supabase/functions/restaurant-media-governance/index.ts",
      "line": 272
    }
  ],
  "media_not_found": [
    {
      "file": "supabase/functions/restaurant-media-governance/index.ts",
      "line": 133
    },
    {
      "file": "supabase/functions/restaurant-media-governance/index.ts",
      "line": 281
    }
  ],
  "media_public_url_missing": [
    {
      "file": "supabase/functions/restaurant-media-governance/index.ts",
      "line": 174
    }
  ],
  "media_storage_invalid": [
    {
      "file": "supabase/functions/restaurant-media-governance/index.ts",
      "line": 139
    }
  ],
  "memory_item_not_found": [
    {
      "file": "supabase/functions/customer-memory/index.ts",
      "line": 356
    }
  ],
  "menu_images_required": [
    {
      "file": "supabase/functions/menu-image-import/index.ts",
      "line": 136
    }
  ],
  "menu_items_not_detected": [
    {
      "file": "supabase/functions/menu-image-import/index.ts",
      "line": 177
    }
  ],
  "message_required": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 250
    }
  ],
  "messages_required": [
    {
      "file": "supabase/functions/ai-admin-dashboard-chat/index.ts",
      "line": 464
    },
    {
      "file": "supabase/functions/ai-client-support/index.ts",
      "line": 329
    }
  ],
  "method_not_allowed": [
    {
      "file": "supabase/functions/aligro-catalog-sync/index.ts",
      "line": 395
    },
    {
      "file": "supabase/functions/contact-support/index.ts",
      "line": 97
    },
    {
      "file": "supabase/functions/crm-mfa-recovery/index.ts",
      "line": 128
    },
    {
      "file": "supabase/functions/google-actions-center-sync/index.ts",
      "line": 298
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2063
    },
    {
      "file": "supabase/functions/ops-incident-native-scan/index.ts",
      "line": 95
    },
    {
      "file": "supabase/functions/restaurant-media-governance/index.ts",
      "line": 107
    },
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 270
    },
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 775
    },
    {
      "file": "supabase/functions/tok-connect-webhook-dispatch/index.ts",
      "line": 225
    }
  ],
  "mfa_factors_lookup_failed": [
    {
      "file": "supabase/functions/crm-mfa-recovery/index.ts",
      "line": 277
    }
  ],
  "missing_required_answers": [
    {
      "file": "supabase/functions/ai-social-post-copy/index.ts",
      "line": 136
    }
  ],
  "oauth_signing_secret_missing": [
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 108
    }
  ],
  "only_image_id_is_accepted": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 238
    }
  ],
  "openai_image_analysis_not_configured": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 563
    }
  ],
  "ops_control_credentials_not_configured": [
    {
      "file": "supabase/functions/ops-incident-native-scan/index.ts",
      "line": 30
    }
  ],
  "ops_github_callback_secret_not_configured": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1632
    }
  ],
  "ops_incident_escalation_timeout": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 683
    }
  ],
  "ops_incident_internal_configuration_missing": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 654
    }
  ],
  "ops_incident_not_found": [
    {
      "file": "supabase/functions/ai-guardian/index.ts",
      "line": 456
    },
    {
      "file": "supabase/functions/ai-guardian/index.ts",
      "line": 583
    },
    {
      "file": "supabase/functions/ai-guardian/index.ts",
      "line": 877
    }
  ],
  "order_not_found": [
    {
      "file": "supabase/functions/ai-client-chat/index.ts",
      "line": 292
    },
    {
      "file": "supabase/functions/ai-client-support/index.ts",
      "line": 373
    }
  ],
  "order_recipient_unavailable": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 1079
    }
  ],
  "origin_not_allowed": [
    {
      "file": "supabase/functions/track-sponsored-event/index.ts",
      "line": 146
    }
  ],
  "outbound_request_timeout": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 390
    }
  ],
  "outbox_claim_failed": [
    {
      "file": "supabase/functions/google-actions-center-sync/index.ts",
      "line": 323
    }
  ],
  "outbox_claim_token_missing": [
    {
      "file": "supabase/functions/google-actions-center-sync/index.ts",
      "line": 259
    }
  ],
  "outbox_recovery_check_failed": [
    {
      "file": "supabase/functions/google-actions-center-sync/index.ts",
      "line": 278
    }
  ],
  "outbox_settle_failed": [
    {
      "file": "supabase/functions/google-actions-center-sync/index.ts",
      "line": 269
    }
  ],
  "partner_id_required": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 531
    },
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 974
    }
  ],
  "partner_inactive": [
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 214
    }
  ],
  "payload_hash_invalid": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 268
    }
  ],
  "personalization_consent_required": [
    {
      "file": "supabase/functions/_shared/intelligence.ts",
      "line": 68
    }
  ],
  "photo_style_reference_mismatch": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 477
    }
  ],
  "photo_style_reference_required": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 485
    }
  ],
  "premium_required": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 484
    }
  ],
  "prompt_required": [
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 510
    },
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 576
    }
  ],
  "provider_auth_error": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 555
    }
  ],
  "provider_billing_unavailable": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 552
    }
  ],
  "provider_rate_limited": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 551
    }
  ],
  "provider_service_error": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 557
    }
  ],
  "provider_timeout": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 562
    }
  ],
  "publication_copy_invalid": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1257
    }
  ],
  "pull_request_metadata_missing": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1962
    }
  ],
  "rate_limiter_unavailable": [
    {
      "file": "supabase/functions/_shared/rate-limit.ts",
      "line": 85
    }
  ],
  "recovery_challenge_close_failed": [
    {
      "file": "supabase/functions/crm-mfa-recovery/index.ts",
      "line": 303
    }
  ],
  "recovery_challenge_create_failed": [
    {
      "file": "supabase/functions/crm-mfa-recovery/index.ts",
      "line": 186
    }
  ],
  "recovery_challenge_verification_failed": [
    {
      "file": "supabase/functions/crm-mfa-recovery/index.ts",
      "line": 256
    }
  ],
  "recovery_email_unavailable": [
    {
      "file": "supabase/functions/crm-mfa-recovery/index.ts",
      "line": 77
    }
  ],
  "redirect_uri_mismatch": [
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 280
    }
  ],
  "redirect_uri_not_allowed": [
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 230
    }
  ],
  "reference_image_data_url_required": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 451
    }
  ],
  "reference_image_invalid": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 449
    }
  ],
  "reference_image_mime_mismatch": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 462
    }
  ],
  "reference_image_required": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 965
    }
  ],
  "reference_image_too_large": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 455
    },
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 459
    }
  ],
  "reference_images_invalid": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 444
    }
  ],
  "reference_images_limit_exceeded": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 445
    }
  ],
  "request_body_too_large": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 337
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 352
    },
    {
      "file": "supabase/functions/track-sponsored-event/index.ts",
      "line": 93
    },
    {
      "file": "supabase/functions/track-sponsored-event/index.ts",
      "line": 98
    }
  ],
  "request_id_payload_mismatch": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 188
    }
  ],
  "request_in_progress": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 189
    }
  ],
  "request_too_large": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 105
    },
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 110
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1282
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1288
    }
  ],
  "reservation_fields_required": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 386
    }
  ],
  "reservation_invalid_state": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 691
    }
  ],
  "reservation_not_found": [
    {
      "file": "supabase/functions/ai-client-chat/index.ts",
      "line": 318
    },
    {
      "file": "supabase/functions/ai-client-support/index.ts",
      "line": 388
    },
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 569
    },
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 680
    },
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 726
    }
  ],
  "reservation_preview_fields_required": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 361
    }
  ],
  "reservation_recipient_unavailable": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 1057
    }
  ],
  "resolution_action_already_executing": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 965
    }
  ],
  "resolution_action_concurrent_update": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 1015
    }
  ],
  "resolution_action_not_found": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 953
    }
  ],
  "resolution_action_not_rejectable": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 1377
    }
  ],
  "resolution_action_rejected": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 962
    }
  ],
  "response_type_code_required": [
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 225
    }
  ],
  "restaurant_context_unavailable": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 586
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 595
    }
  ],
  "restaurant_id_missing": [
    {
      "file": "supabase/functions/google-actions-center-sync/index.ts",
      "line": 214
    }
  ],
  "restaurant_id_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 159
    },
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 532
    },
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 944
    }
  ],
  "restaurant_media_identity_mismatch": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 315
    }
  ],
  "restaurant_not_found": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 466
    },
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 263
    }
  ],
  "restaurant_owner_unavailable": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 1100
    }
  ],
  "restaurant_required": [
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 397
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1505
    },
    {
      "file": "supabase/functions/ai-restaurant-agent/index.ts",
      "line": 203
    },
    {
      "file": "supabase/functions/ai-restaurant-tools/index.ts",
      "line": 149
    },
    {
      "file": "supabase/functions/ai-social-post-copy/index.ts",
      "line": 129
    },
    {
      "file": "supabase/functions/contact-support/index.ts",
      "line": 127
    },
    {
      "file": "supabase/functions/menu-image-import/index.ts",
      "line": 134
    },
    {
      "file": "supabase/functions/restaurant-media-governance/index.ts",
      "line": 120
    }
  ],
  "restaurant_required_for_agent_run_approval": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 680
    }
  ],
  "review_seeding_disabled_in_production": [
    {
      "file": "supabase/functions/enrich-restaurants/index.ts",
      "line": 124
    }
  ],
  "run_required": [
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 418
    },
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 453
    }
  ],
  "run_start_unavailable": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 177
    }
  ],
  "runs_unavailable": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 146
    }
  ],
  "scheduler_identity_required": [
    {
      "file": "supabase/functions/ops-incident-native-scan/index.ts",
      "line": 99
    }
  ],
  "social_media_identity_mismatch": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 284
    }
  ],
  "social_post_identity_mismatch": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 295
    }
  ],
  "source_image_edit_required": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1116
    }
  ],
  "source_image_invalid_type": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 867
    }
  ],
  "source_image_timeout": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 852
    }
  ],
  "source_image_too_large": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 870
    }
  ],
  "source_image_unreachable": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 865
    }
  ],
  "source_image_unsafe_url": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 860
    }
  ],
  "source_image_unsupported_type": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 868
    }
  ],
  "sponsored_touch_identity_conflict": [
    {
      "file": "supabase/functions/track-sponsored-event/index.ts",
      "line": 412
    }
  ],
  "subscription_check_unavailable": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 465
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 477
    }
  ],
  "supabase_url_not_configured": [
    {
      "file": "supabase/functions/ops-incident-native-scan/index.ts",
      "line": 28
    }
  ],
  "supplier_catalog_sync_unavailable": [
    {
      "file": "supabase/functions/aligro-catalog-sync/index.ts",
      "line": 425
    }
  ],
  "supplier_catalog_upsert_failed": [
    {
      "file": "supabase/functions/aligro-catalog-sync/index.ts",
      "line": 353
    }
  ],
  "supplier_prices_unavailable": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 323
    }
  ],
  "support_incident_not_found": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 271
    }
  ],
  "technical_evidence_insufficient": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 1152
    }
  ],
  "telegram_chat_forbidden": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1550
    }
  ],
  "telegram_chat_not_configured": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 960
    }
  ],
  "telegram_message_id_missing": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 978
    }
  ],
  "telegram_not_configured": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 868
    }
  ],
  "telegram_user_forbidden": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1557
    }
  ],
  "tok_connect_agent_run_not_approvable": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 676
    }
  ],
  "tok_connect_agent_run_not_found": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 674
    }
  ],
  "tok_connect_bridge_mode_invalid": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 404
    }
  ],
  "tok_connect_capability_method_not_allowed": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 241
    }
  ],
  "tok_connect_capability_not_found": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 237
    }
  ],
  "tok_connect_client_inactive": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 285
    }
  ],
  "tok_connect_client_not_found": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 166
    },
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 600
    }
  ],
  "tok_connect_commercial_action_invalid": [
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 207
    }
  ],
  "tok_connect_commercial_rpc_not_allowlisted": [
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 138
    }
  ],
  "tok_connect_commercial_table_not_allowlisted": [
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 174
    }
  ],
  "tok_connect_daily_reservation_limit_exceeded": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 244
    }
  ],
  "tok_connect_data_operation_invalid": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 332
    }
  ],
  "tok_connect_data_operation_not_allowed": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 308
    }
  ],
  "tok_connect_filter_invalid": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 315
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 125
    }
  ],
  "tok_connect_filter_operator_invalid": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 322
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 131
    }
  ],
  "tok_connect_grant_not_found": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 389
    }
  ],
  "tok_connect_human_confirmation_required": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 153
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 86
    }
  ],
  "tok_connect_idempotency_key_required": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 159
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 81
    }
  ],
  "tok_connect_idempotency_key_reused_with_different_body": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 173
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 98
    }
  ],
  "tok_connect_idempotency_request_in_progress": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 177
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 100
    }
  ],
  "tok_connect_mcp_grant_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 223
    }
  ],
  "tok_connect_mutation_filter_required": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 336
    }
  ],
  "tok_connect_oauth_client_id_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 92
    }
  ],
  "tok_connect_partner_inactive": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 301
    }
  ],
  "tok_connect_partner_member_required": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 177
    },
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 194
    }
  ],
  "tok_connect_partner_token_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 405
    }
  ],
  "tok_connect_party_size_limit_exceeded": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 227
    }
  ],
  "tok_connect_portal_action_unknown": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 986
    }
  ],
  "tok_connect_reservation_not_owned": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 686
    }
  ],
  "tok_connect_restaurant_access_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 195
    }
  ],
  "tok_connect_restaurant_grant_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 210
    },
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 222
    }
  ],
  "tok_connect_route_not_found": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 1073
    }
  ],
  "tok_connect_rpc_not_allowlisted": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 281
    }
  ],
  "tok_connect_table_not_allowlisted": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 306
    }
  ],
  "tok_connect_token_client_mismatch": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 291
    }
  ],
  "tok_connect_token_expired": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 275
    }
  ],
  "tok_connect_token_invalid": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 88
    },
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 271
    },
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 273
    }
  ],
  "tok_connect_token_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 257
    }
  ],
  "tok_connect_token_scope_revoked": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 307
    }
  ],
  "tok_connect_user_client_required": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 294
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 330
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 145
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 175
    }
  ],
  "tok_connect_user_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 163
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 146
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 164
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 382
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 90
    }
  ],
  "tok_connect_values_required": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 353
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 356
    }
  ],
  "tok_connect_webhook_endpoint_inactive": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 286
    }
  ],
  "tok_connect_webhook_endpoint_not_found": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 217
    },
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 225
    },
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 245
    }
  ],
  "too_many_channels": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 93
    }
  ],
  "unauthorized": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1505
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1524
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1543
    }
  ],
  "unexpected_reasoning_effort": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1972
    }
  ],
  "unexpected_repair_model": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1969
    }
  ],
  "unsupported_action": [
    {
      "file": "supabase/functions/ai-guardian/index.ts",
      "line": 1084
    },
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 1486
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2096
    },
    {
      "file": "supabase/functions/restaurant-media-governance/index.ts",
      "line": 271
    }
  ],
  "unsupported_channel": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 97
    }
  ],
  "unsupported_grant_type": [
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 274
    }
  ],
  "unsupported_image_type": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 402
    }
  ],
  "unsupported_resolution_action": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 973
    }
  ],
  "unsupported_workflow_status": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1933
    }
  ],
  "user_message_required": [
    {
      "file": "supabase/functions/ai-admin-dashboard-chat/index.ts",
      "line": 468
    }
  ],
  "value_required": [
    {
      "file": "supabase/functions/customer-memory/index.ts",
      "line": 382
    }
  ],
  "verified_account_email_required": [
    {
      "file": "supabase/functions/crm-mfa-recovery/index.ts",
      "line": 156
    }
  ],
  "verified_media_source_required": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 320
    }
  ],
  "visual_tool_invalid": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 141
    }
  ],
  "webhook_https_url_required": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 726
    }
  ],
  "webhook_url_required": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 874
    }
  ],
  "window_invalid": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 160
    }
  ]
};

/**
 * Resolves an error code to the source locations that raise it.
 *
 * Returns an empty array for an unknown code rather than guessing, so the
 * analyser never receives a path that does not exist.
 */
export function lookupErrorCodeSites(code: string | null | undefined): ErrorCodeSite[] {
  if (!code) return [];
  const normalized = code.trim().toLowerCase();
  return ERROR_CODE_SITES[normalized] ?? [];
}
