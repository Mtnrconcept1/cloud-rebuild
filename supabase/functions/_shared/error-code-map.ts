// GENERATED FILE — do not edit by hand.
// Run `pnpm run generate:error-code-map` after adding or moving an HttpError.
// 545 error codes mapped from supabase/functions/**.

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
  "admin_identity_required": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 118
    }
  ],
  "admin_mfa_aal2_required": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 121
    }
  ],
  "admin_origin_required": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 109
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
      "line": 1099
    }
  ],
  "ai_empty_response": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 403
    },
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 337
    },
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 1244
    }
  ],
  "ai_input_rejected": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 156
    }
  ],
  "ai_invalid_plan": [
    {
      "file": "supabase/functions/_shared/marketing-ai.ts",
      "line": 138
    }
  ],
  "ai_invalid_response": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 413
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
      "line": 1251
    }
  ],
  "ai_provider_billing_unavailable": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 279
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 774
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1097
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
      "line": 275
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 777
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1091
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 396
    }
  ],
  "ai_response_unavailable": [
    {
      "file": "supabase/functions/tok-workforce-assistant/index.ts",
      "line": 91
    }
  ],
  "ai_service_error": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 282
    },
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 1239
    },
    {
      "file": "supabase/functions/restaurant-advisor/index.ts",
      "line": 381
    }
  ],
  "ai_service_unavailable": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 215
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
      "line": 749
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1382
    },
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 198
    },
    {
      "file": "supabase/functions/ai-restaurant-agent/index.ts",
      "line": 193
    }
  ],
  "ai_timeout": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 266
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
      "line": 214
    }
  ],
  "approval_body_required": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 132
    }
  ],
  "approval_expired_or_plan_changed": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 193
    }
  ],
  "approval_payload_too_large": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 130
    },
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 141
    }
  ],
  "approval_validation_failed": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 168
    }
  ],
  "approved_base_sha_missing": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2150
    }
  ],
  "attachment_content_rejected": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 210
    },
    {
      "file": "supabase/functions/ai-restaurant-editor/index.ts",
      "line": 444
    }
  ],
  "attachment_data_required": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 177
    }
  ],
  "attachment_duplicate_id": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 268
    }
  ],
  "attachment_formula_rejected": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 122
    }
  ],
  "attachment_hash_mismatch": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 257
    },
    {
      "file": "supabase/functions/ai-restaurant-editor/index.ts",
      "line": 663
    }
  ],
  "attachment_invalid": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 236
    }
  ],
  "attachment_invalid_contact": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 99
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 102
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 105
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 115
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 120
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 126
    }
  ],
  "attachment_invalid_contacts": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 144
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 155
    }
  ],
  "attachment_invalid_encoding": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 167
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 180
    }
  ],
  "attachment_invalid_metadata": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 225
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 231
    }
  ],
  "attachment_invalid_text": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 72
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 75
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 81
    }
  ],
  "attachment_kind_invalid": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 239
    }
  ],
  "attachment_mime_mismatch": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 199
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 202
    }
  ],
  "attachment_mime_rejected": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 250
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 251
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 340
    }
  ],
  "attachment_pdf_rejected": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 205
    }
  ],
  "attachment_size_mismatch": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 253
    }
  ],
  "attachment_too_large": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 161
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 169
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 242
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 249
    }
  ],
  "attachments_invalid": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 262
    },
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 274
    }
  ],
  "attachments_too_large": [
    {
      "file": "supabase/functions/_shared/advisor-attachments.ts",
      "line": 271
    }
  ],
  "authenticated_daily_arcade_only": [
    {
      "file": "supabase/functions/plinko-play/index.ts",
      "line": 49
    }
  ],
  "autopilot_plan_fields_required": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 967
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
      "line": 163
    },
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 168
    }
  ],
  "branch_lookup_failed": [
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 160
    }
  ],
  "branch_not_found": [
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 162
    }
  ],
  "campaign_not_found": [
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 464
    }
  ],
  "campaign_post_count_mismatch": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 244
    }
  ],
  "campaign_preview_fields_required": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 917
    }
  ],
  "campaign_required": [
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 455
    }
  ],
  "campaign_start_must_be_future": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 243
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
  "campaign_window_too_short": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 247
    }
  ],
  "captcha_invalid": [
    {
      "file": "supabase/functions/contact-support/index.ts",
      "line": 82
    }
  ],
  "captcha_verification_failed": [
    {
      "file": "supabase/functions/contact-support/index.ts",
      "line": 79
    }
  ],
  "channels_required": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 102
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
      "line": 172
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
  "cloudprinter_disabled": [
    {
      "file": "supabase/functions/_shared/print/cloudprinter.ts",
      "line": 71
    }
  ],
  "cloudprinter_not_configured": [
    {
      "file": "supabase/functions/_shared/print/cloudprinter.ts",
      "line": 70
    }
  ],
  "codex_dispatch_not_configured": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1784
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1867
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
  "commission_invalid_server_snapshot": [
    {
      "file": "supabase/functions/stripe-worker/index.ts",
      "line": 479
    }
  ],
  "commission_reservation_no_longer_honored": [
    {
      "file": "supabase/functions/stripe-worker/index.ts",
      "line": 492
    }
  ],
  "commission_reservation_verification_failed": [
    {
      "file": "supabase/functions/stripe-worker/index.ts",
      "line": 488
    }
  ],
  "commission_subscription_not_active": [
    {
      "file": "supabase/functions/stripe-worker/index.ts",
      "line": 501
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
      "line": 366
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
      "line": 209
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
  "delegated_service_required": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 179
    },
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 192
    }
  ],
  "demo_checkout_requires_test_endpoint": [
    {
      "file": "supabase/functions/_shared/stripe-client.ts",
      "line": 142
    }
  ],
  "demo_stripe_not_configured": [
    {
      "file": "supabase/functions/_shared/stripe-client.ts",
      "line": 223
    }
  ],
  "developer_transfer_claim_invalid": [
    {
      "file": "supabase/functions/settle-developer-statement/index.ts",
      "line": 40
    }
  ],
  "developer_transfer_currency_invalid": [
    {
      "file": "supabase/functions/settle-developer-statement/index.ts",
      "line": 171
    }
  ],
  "discovery_filter_invalid": [
    {
      "file": "supabase/functions/_shared/marketing-backlink-discovery.ts",
      "line": 12
    }
  ],
  "discovery_invalid_response": [
    {
      "file": "supabase/functions/_shared/marketing-backlink-discovery.ts",
      "line": 41
    }
  ],
  "discovery_limit_invalid": [
    {
      "file": "supabase/functions/_shared/marketing-backlink-discovery.ts",
      "line": 10
    }
  ],
  "discovery_query_invalid": [
    {
      "file": "supabase/functions/_shared/marketing-backlink-discovery.ts",
      "line": 7
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
      "line": 608
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
      "line": 1364
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
      "line": 1363
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
  "floorplan_idempotency_unavailable": [
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 188
    },
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 216
    },
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 219
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
    },
    {
      "file": "supabase/functions/_shared/auth.ts",
      "line": 489
    },
    {
      "file": "supabase/functions/complete-order-checkout/index.ts",
      "line": 72
    },
    {
      "file": "supabase/functions/complete-restaurant-credit-pack-checkout/index.ts",
      "line": 93
    },
    {
      "file": "supabase/functions/complete-restaurant-credit-pack-checkout/index.ts",
      "line": 95
    },
    {
      "file": "supabase/functions/create-chefs-table-reservation/index.ts",
      "line": 53
    },
    {
      "file": "supabase/functions/create-zero-attente-reservation/index.ts",
      "line": 66
    },
    {
      "file": "supabase/functions/notification-dispatch/index.ts",
      "line": 43
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
  "formats_invalid": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 115
    },
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 122
    }
  ],
  "github_base_revision_invalid": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1650
    }
  ],
  "github_base_revision_not_found": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1672
    }
  ],
  "github_incident_token_not_configured": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1626
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1679
    }
  ],
  "github_main_unavailable": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 63
    }
  ],
  "github_not_configured": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 54
    }
  ],
  "github_pr_number_mismatch": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2282
    }
  ],
  "github_revision_invalid": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 65
    }
  ],
  "github_run_id_invalid": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2125
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2235
    }
  ],
  "google_actions_center_route_not_found": [
    {
      "file": "supabase/functions/google-actions-center/index.ts",
      "line": 1027
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
  "idempotency_conflict": [
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 214
    }
  ],
  "idempotency_key_in_progress": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 421
    },
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 625
    }
  ],
  "idempotency_key_required": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 381
    },
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 603
    }
  ],
  "idempotency_key_reused_with_different_arguments": [
    {
      "file": "supabase/functions/tok-connect-mcp/index.ts",
      "line": 2083
    }
  ],
  "idempotency_key_reused_with_different_body": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 418
    },
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 622
    }
  ],
  "image_analysis_provider_not_configured": [
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 560
    }
  ],
  "image_credit_reservation_mismatch": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1689
    }
  ],
  "image_edit_timeout": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1084
    }
  ],
  "image_edit_transient_failure": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1085
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1089
    }
  ],
  "image_empty_response": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1271
    }
  ],
  "image_generation_required": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1458
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
      "line": 1284
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
      "line": 1257
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1609
    }
  ],
  "image_request_rejected": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 553
    }
  ],
  "image_reservation_required": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 896
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 990
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
      "line": 1279
    }
  ],
  "incident_bound_to_another_github_run": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2133
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2264
    }
  ],
  "incident_context_parameters_missing": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2123
    }
  ],
  "incident_context_token_expired": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2139
    }
  ],
  "incident_context_token_invalid": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2143
    }
  ],
  "incident_context_token_missing": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2136
    }
  ],
  "incident_id_missing": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2234
    }
  ],
  "incident_id_required": [
    {
      "file": "supabase/functions/ai-guardian/index.ts",
      "line": 1068
    },
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 1457
    }
  ],
  "incident_not_approved": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2130
    }
  ],
  "incident_not_eligible": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 179
    }
  ],
  "incident_not_found": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1059
    }
  ],
  "incident_registration_failed": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1079
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
      "line": 1730
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2163
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2335
    }
  ],
  "incident_unavailable": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 175
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
      "line": 136
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
      "line": 77
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
    },
    {
      "file": "supabase/functions/plinko-play/index.ts",
      "line": 45
    }
  ],
  "invalid_approval_payload": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 156
    }
  ],
  "invalid_authentication": [
    {
      "file": "supabase/functions/track-sponsored-event/index.ts",
      "line": 130
    }
  ],
  "invalid_branch_id": [
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 148
    }
  ],
  "invalid_callback_data": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1768
    }
  ],
  "invalid_catalog_filter": [
    {
      "file": "supabase/functions/tok-connect-admin/index.ts",
      "line": 209
    }
  ],
  "invalid_catalog_page": [
    {
      "file": "supabase/functions/tok-connect-admin/index.ts",
      "line": 204
    }
  ],
  "invalid_catalog_search": [
    {
      "file": "supabase/functions/tok-connect-admin/index.ts",
      "line": 211
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
      "line": 136
    },
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 181
    }
  ],
  "invalid_content_review_worker_request": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2434
    }
  ],
  "invalid_external_source": [
    {
      "file": "supabase/functions/_shared/marketing-backlink-page.ts",
      "line": 7
    }
  ],
  "invalid_github_incident_repository": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1619
    }
  ],
  "invalid_github_pr_url": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2280
    }
  ],
  "invalid_image": [
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 1095
    }
  ],
  "invalid_incident_workflow_transition": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2261
    }
  ],
  "invalid_json": [
    {
      "file": "supabase/functions/commercial-demo-ai/index.ts",
      "line": 118
    },
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 153
    },
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 72
    }
  ],
  "invalid_json_body": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 405
    },
    {
      "file": "supabase/functions/track-sponsored-event/index.ts",
      "line": 109
    }
  ],
  "invalid_marketing_consent": [
    {
      "file": "supabase/functions/plinko-play/index.ts",
      "line": 86
    }
  ],
  "invalid_photo_style_weight": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 325
    }
  ],
  "invalid_plinko_email": [
    {
      "file": "supabase/functions/plinko-play/index.ts",
      "line": 85
    }
  ],
  "invalid_plinko_session": [
    {
      "file": "supabase/functions/plinko-play/index.ts",
      "line": 68
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
      "line": 2269
    }
  ],
  "invalid_request": [
    {
      "file": "supabase/functions/ai-client-chat/index.ts",
      "line": 273
    },
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 180
    },
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 1286
    },
    {
      "file": "supabase/functions/floorplan-ai/index.ts",
      "line": 1092
    },
    {
      "file": "supabase/functions/plinko-play/index.ts",
      "line": 10
    },
    {
      "file": "supabase/functions/plinko-play/index.ts",
      "line": 28
    },
    {
      "file": "supabase/functions/restaurant-advisor/index.ts",
      "line": 146
    },
    {
      "file": "supabase/functions/tok-workforce-assistant/index.ts",
      "line": 49
    }
  ],
  "invalid_request_body": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1385
    },
    {
      "file": "supabase/functions/analyze-restaurant-image/index.ts",
      "line": 235
    }
  ],
  "invalid_restaurant_demo_details": [
    {
      "file": "supabase/functions/contact-support/index.ts",
      "line": 116
    }
  ],
  "invalid_test_stripe_key": [
    {
      "file": "supabase/functions/_shared/stripe-client.ts",
      "line": 228
    }
  ],
  "invalid_workflow_url": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2308
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
      "line": 234
    }
  ],
  "item_required": [
    {
      "file": "supabase/functions/customer-memory/index.ts",
      "line": 337
    }
  ],
  "json_body_required": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 51
    }
  ],
  "json_object_required": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 408
    }
  ],
  "label_required": [
    {
      "file": "supabase/functions/customer-memory/index.ts",
      "line": 378
    }
  ],
  "mailing_facets_unavailable": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 204
    }
  ],
  "marketing_reference_ids_required": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 442
    }
  ],
  "marketing_reference_mismatch": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 462
    }
  ],
  "marketing_reference_required": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 468
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1603
    }
  ],
  "match_group_authorization_session_missing": [
    {
      "file": "supabase/functions/authorize-match-group-order/index.ts",
      "line": 59
    }
  ],
  "match_group_checkout_identity_mismatch": [
    {
      "file": "supabase/functions/authorize-match-group-order/index.ts",
      "line": 74
    },
    {
      "file": "supabase/functions/authorize-match-group-order/index.ts",
      "line": 241
    },
    {
      "file": "supabase/functions/authorize-match-group-order/index.ts",
      "line": 328
    }
  ],
  "match_group_connect_routing_not_ready": [
    {
      "file": "supabase/functions/authorize-match-group-order/index.ts",
      "line": 217
    }
  ],
  "match_group_payment_already_captured": [
    {
      "file": "supabase/functions/authorize-match-group-order/index.ts",
      "line": 270
    }
  ],
  "match_group_restaurant_unavailable": [
    {
      "file": "supabase/functions/authorize-match-group-order/index.ts",
      "line": 136
    },
    {
      "file": "supabase/functions/authorize-match-group-order/index.ts",
      "line": 289
    },
    {
      "file": "supabase/functions/authorize-match-group-order/index.ts",
      "line": 333
    },
    {
      "file": "supabase/functions/authorize-match-group-order/index.ts",
      "line": 349
    },
    {
      "file": "supabase/functions/authorize-match-group-order/index.ts",
      "line": 394
    }
  ],
  "mcp_method_not_found": [
    {
      "file": "supabase/functions/tok-connect-full-app-mcp/index.ts",
      "line": 416
    },
    {
      "file": "supabase/functions/tok-connect-mcp/index.ts",
      "line": 3016
    }
  ],
  "mcp_prompt_not_found": [
    {
      "file": "supabase/functions/tok-connect-full-app-mcp/index.ts",
      "line": 414
    },
    {
      "file": "supabase/functions/tok-connect-mcp/index.ts",
      "line": 2989
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
      "line": 2672
    },
    {
      "file": "supabase/functions/tok-connect-mcp/index.ts",
      "line": 2719
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
      "line": 98
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
      "line": 2413
    },
    {
      "file": "supabase/functions/ops-incident-native-scan/index.ts",
      "line": 121
    },
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 294
    },
    {
      "file": "supabase/functions/plinko-play/index.ts",
      "line": 42
    },
    {
      "file": "supabase/functions/restaurant-media-governance/index.ts",
      "line": 107
    },
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 775
    },
    {
      "file": "supabase/functions/tok-connect-webhook-dispatch/index.ts",
      "line": 142
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
  "moderation_service_unavailable": [
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 170
    },
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 188
    },
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 190
    },
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 195
    },
    {
      "file": "supabase/functions/_shared/openai.ts",
      "line": 199
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
      "line": 1681
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
      "line": 468
    },
    {
      "file": "supabase/functions/ai-guardian/index.ts",
      "line": 595
    },
    {
      "file": "supabase/functions/ai-guardian/index.ts",
      "line": 889
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
      "line": 148
    }
  ],
  "outbound_request_timeout": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 424
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
  "paid_reservation_requires_tok_support": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 449
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
      "line": 148
    }
  ],
  "payload_hash_invalid": [
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 268
    }
  ],
  "payload_too_large": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 49
    },
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 60
    }
  ],
  "payment_attempt_cancel_refresh_required": [
    {
      "file": "supabase/functions/cancel-payment-attempt/index.ts",
      "line": 163
    },
    {
      "file": "supabase/functions/cancel-payment-attempt/index.ts",
      "line": 192
    }
  ],
  "payment_attempt_identity_mismatch": [
    {
      "file": "supabase/functions/create-checkout/index.ts",
      "line": 383
    }
  ],
  "payment_attempt_order_expired_recreate": [
    {
      "file": "supabase/functions/create-checkout/index.ts",
      "line": 2099
    }
  ],
  "payment_attempt_reacquire_failed": [
    {
      "file": "supabase/functions/create-checkout/index.ts",
      "line": 2107
    }
  ],
  "payment_attempt_request_mismatch": [
    {
      "file": "supabase/functions/create-checkout/index.ts",
      "line": 402
    }
  ],
  "payment_attempt_session_expired_retry": [
    {
      "file": "supabase/functions/create-checkout/index.ts",
      "line": 2469
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
      "line": 503
    }
  ],
  "photo_style_reference_required": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 511
    }
  ],
  "plinko_unavailable": [
    {
      "file": "supabase/functions/plinko-play/index.ts",
      "line": 95
    },
    {
      "file": "supabase/functions/plinko-play/index.ts",
      "line": 97
    }
  ],
  "premium_required": [
    {
      "file": "supabase/functions/daily-dish-ai/index.ts",
      "line": 484
    }
  ],
  "print_asset_format_unsupported": [
    {
      "file": "supabase/functions/_shared/print/pdf.ts",
      "line": 37
    }
  ],
  "print_asset_https_required": [
    {
      "file": "supabase/functions/_shared/print/pdf.ts",
      "line": 21
    }
  ],
  "print_asset_must_be_persisted": [
    {
      "file": "supabase/functions/_shared/print/pdf.ts",
      "line": 23
    }
  ],
  "print_asset_unavailable": [
    {
      "file": "supabase/functions/_shared/print/pdf.ts",
      "line": 35
    }
  ],
  "print_asset_url_invalid": [
    {
      "file": "supabase/functions/_shared/print/pdf.ts",
      "line": 20
    }
  ],
  "print_background_required": [
    {
      "file": "supabase/functions/_shared/print/pdf.ts",
      "line": 39
    }
  ],
  "print_job_limit_invalid": [
    {
      "file": "supabase/functions/print-orchestrator/index.ts",
      "line": 276
    }
  ],
  "print_job_outcome_not_persisted": [
    {
      "file": "supabase/functions/print-orchestrator/index.ts",
      "line": 308
    }
  ],
  "print_mapping_geometry_mismatch": [
    {
      "file": "supabase/functions/print-admin/index.ts",
      "line": 301
    },
    {
      "file": "supabase/functions/print-catalog/index.ts",
      "line": 258
    }
  ],
  "print_mapping_single_page_required": [
    {
      "file": "supabase/functions/print-admin/index.ts",
      "line": 303
    },
    {
      "file": "supabase/functions/print-catalog/index.ts",
      "line": 260
    }
  ],
  "print_native_artwork_only": [
    {
      "file": "supabase/functions/_shared/print/pdf.ts",
      "line": 30
    },
    {
      "file": "supabase/functions/print-export/index.ts",
      "line": 130
    }
  ],
  "print_order_not_paid": [
    {
      "file": "supabase/functions/print-orchestrator/index.ts",
      "line": 167
    }
  ],
  "print_order_transition_not_persisted": [
    {
      "file": "supabase/functions/print-orchestrator/index.ts",
      "line": 130
    }
  ],
  "print_provider_price_invalid": [
    {
      "file": "supabase/functions/_shared/print/pricing.ts",
      "line": 5
    }
  ],
  "print_quote_currency_unsupported": [
    {
      "file": "supabase/functions/_shared/print/pricing.ts",
      "line": 27
    },
    {
      "file": "supabase/functions/print-orchestrator/index.ts",
      "line": 79
    },
    {
      "file": "supabase/functions/print-quote/index.ts",
      "line": 108
    },
    {
      "file": "supabase/functions/print-quote/index.ts",
      "line": 116
    }
  ],
  "print_sandbox_mode_required": [
    {
      "file": "supabase/functions/print-sandbox-complete/index.ts",
      "line": 65
    }
  ],
  "print_sandbox_order_mismatch": [
    {
      "file": "supabase/functions/print-sandbox-complete/index.ts",
      "line": 133
    }
  ],
  "print_sandbox_order_not_found": [
    {
      "file": "supabase/functions/print-sandbox-complete/index.ts",
      "line": 124
    }
  ],
  "print_sandbox_payment_attempt_mismatch": [
    {
      "file": "supabase/functions/print-sandbox-complete/index.ts",
      "line": 115
    }
  ],
  "print_sandbox_payment_attempt_not_found": [
    {
      "file": "supabase/functions/print-sandbox-complete/index.ts",
      "line": 104
    }
  ],
  "print_sandbox_session_invalid": [
    {
      "file": "supabase/functions/print-sandbox-complete/index.ts",
      "line": 91
    }
  ],
  "print_sandbox_test_session_required": [
    {
      "file": "supabase/functions/print-sandbox-complete/index.ts",
      "line": 70
    }
  ],
  "print_source_changed_regenerate": [
    {
      "file": "supabase/functions/_shared/print/pdf.ts",
      "line": 41
    }
  ],
  "print_submission_lease_or_state_lost": [
    {
      "file": "supabase/functions/print-orchestrator/index.ts",
      "line": 237
    }
  ],
  "print_submission_paused": [
    {
      "file": "supabase/functions/print-orchestrator/index.ts",
      "line": 242
    }
  ],
  "print_submission_reconciliation_required": [
    {
      "file": "supabase/functions/print-orchestrator/index.ts",
      "line": 243
    }
  ],
  "print_visual_review_unavailable": [
    {
      "file": "supabase/functions/_shared/print/artwork-review.ts",
      "line": 22
    },
    {
      "file": "supabase/functions/_shared/print/artwork-review.ts",
      "line": 94
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
      "line": 2286
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
      "line": 991
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
  "repair_attempt_exceeds_limit": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2305
    }
  ],
  "repair_attempt_invalid": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2299
    }
  ],
  "repair_attempt_limit_invalid": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2302
    }
  ],
  "repair_dispatch_failed_no_production_change": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 228
    }
  ],
  "repair_dispatch_not_configured": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 76
    },
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 182
    }
  ],
  "repair_dispatch_unavailable": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 97
    }
  ],
  "request_body_too_large": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 371
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 386
    },
    {
      "file": "supabase/functions/track-sponsored-event/index.ts",
      "line": 94
    },
    {
      "file": "supabase/functions/track-sponsored-event/index.ts",
      "line": 99
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
    },
    {
      "file": "supabase/functions/plinko-play/index.ts",
      "line": 18
    },
    {
      "file": "supabase/functions/tok-workforce-assistant/index.ts",
      "line": 47
    }
  ],
  "reservation_cancellation_reconciliation_required": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 469
    }
  ],
  "reservation_fields_required": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 386
    }
  ],
  "reservation_id_invalid": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 438
    }
  ],
  "reservation_invalid_state": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 697
    }
  ],
  "reservation_lookup_failed": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 445
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
      "line": 575
    },
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 686
    },
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 732
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 446
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
  "restaurant_demo_crm_unavailable": [
    {
      "file": "supabase/functions/contact-support/index.ts",
      "line": 222
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
      "line": 130
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
      "line": 1457
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
      "line": 137
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
      "line": 261
    }
  ],
  "runs_unavailable": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 174
    }
  ],
  "scan_parameters_forbidden": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 300
    }
  ],
  "scheduler_identity_required": [
    {
      "file": "supabase/functions/ops-incident-native-scan/index.ts",
      "line": 125
    }
  ],
  "sentinel_aal2_required": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 94
    }
  ],
  "sentinel_admin_origin_required": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 83
    }
  ],
  "sentinel_admin_session_required": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 86
    }
  ],
  "sentinel_approval_lookup_failed": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 250
    }
  ],
  "sentinel_audit_source_unavailable": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 215
    }
  ],
  "sentinel_console_data_unavailable": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 271
    }
  ],
  "sentinel_containment_not_armed": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 234
    }
  ],
  "sentinel_decision_expired_or_replayed": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 251
    },
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 257
    }
  ],
  "sentinel_explicit_confirmation_required": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 279
    }
  ],
  "sentinel_human_admin_required": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 90
    }
  ],
  "sentinel_incident_persist_failed": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 181
    }
  ],
  "sentinel_invalid_callback": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2076
    },
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 230
    }
  ],
  "sentinel_invalid_telegram_identity": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 242
    }
  ],
  "sentinel_journal_unavailable": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 187
    }
  ],
  "sentinel_operation_temporarily_locked": [
    {
      "file": "supabase/functions/_shared/tok-sentinel-guard.ts",
      "line": 30
    }
  ],
  "sentinel_release_unavailable": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 284
    }
  ],
  "sentinel_scan_invalid_response": [
    {
      "file": "supabase/functions/ops-incident-native-scan/index.ts",
      "line": 107
    }
  ],
  "sentinel_scan_upstream_failed": [
    {
      "file": "supabase/functions/ops-incident-native-scan/index.ts",
      "line": 103
    }
  ],
  "sentinel_security_check_unavailable": [
    {
      "file": "supabase/functions/_shared/tok-sentinel-guard.ts",
      "line": 27
    }
  ],
  "sentinel_service_not_configured": [
    {
      "file": "supabase/functions/ops-incident-native-scan/index.ts",
      "line": 88
    }
  ],
  "sentinel_service_only": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 77
    }
  ],
  "sentinel_telegram_delivery_failed": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 109
    }
  ],
  "sentinel_telegram_message_binding_failed": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 193
    }
  ],
  "sentinel_telegram_not_configured": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 99
    }
  ],
  "sentinel_unsupported_action": [
    {
      "file": "supabase/functions/ops-sentinel-control/index.ts",
      "line": 312
    }
  ],
  "sentinel_upstream_not_configured": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2080
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
  "source_html_unavailable": [
    {
      "file": "supabase/functions/_shared/marketing-backlink-page.ts",
      "line": 16
    }
  ],
  "source_image_edit_required": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1101
    }
  ],
  "source_image_invalid_type": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 872
    }
  ],
  "source_image_timeout": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 879
    }
  ],
  "source_image_too_large": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 880
    }
  ],
  "source_image_unreachable": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 870
    }
  ],
  "source_image_unsafe_url": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 889
    }
  ],
  "source_image_unsupported_type": [
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 873
    }
  ],
  "source_too_large": [
    {
      "file": "supabase/functions/_shared/marketing-backlink-page.ts",
      "line": 26
    }
  ],
  "special_reservation_requires_dedicated_checkout": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 395
    }
  ],
  "sponsored_touch_identity_conflict": [
    {
      "file": "supabase/functions/track-sponsored-event/index.ts",
      "line": 414
    }
  ],
  "stripe_webhook_secret_mode_conflict": [
    {
      "file": "supabase/functions/_shared/stripe-client.ts",
      "line": 79
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
  "system_actor_required": [
    {
      "file": "supabase/functions/capture-due-match-groups/index.ts",
      "line": 34
    },
    {
      "file": "supabase/functions/close-due-match-groups/index.ts",
      "line": 23
    },
    {
      "file": "supabase/functions/reconcile-match-group-authorizations/index.ts",
      "line": 30
    }
  ],
  "technical_evidence_insufficient": [
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 1152
    }
  ],
  "telegram_admin_not_configured": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2443
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2467
    }
  ],
  "telegram_chat_forbidden": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1591
    }
  ],
  "telegram_chat_not_configured": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1001
    }
  ],
  "telegram_instruction_too_short": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1878
    }
  ],
  "telegram_message_id_invalid": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1874
    }
  ],
  "telegram_message_id_missing": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1019
    }
  ],
  "telegram_not_configured": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 902
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2441
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2465
    }
  ],
  "telegram_update_id_invalid": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1870
    }
  ],
  "telegram_user_forbidden": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1598
    }
  ],
  "tok_cart_action_invalid": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 768
    }
  ],
  "tok_cart_availability_unavailable": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 641
    }
  ],
  "tok_cart_cancel_confirmation_required": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 735
    }
  ],
  "tok_cart_cancel_idempotency_invalid": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 738
    }
  ],
  "tok_cart_checkout_url_unavailable": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 901
    }
  ],
  "tok_cart_delivery_unavailable": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 601
    }
  ],
  "tok_cart_free_takeaway_requires_tok": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 842
    }
  ],
  "tok_cart_menu_or_service_unavailable": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 626
    }
  ],
  "tok_cart_payment_attempt_invalid": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 729
    }
  ],
  "tok_cart_pending_order_missing": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 882
    }
  ],
  "tok_cart_price_changed_refresh_quote": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 830
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 879
    }
  ],
  "tok_cart_restaurant_id_invalid": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 694
    }
  ],
  "tok_cart_restaurant_not_open_for_checkout": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 578
    }
  ],
  "tok_cart_restaurant_unavailable": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 576
    }
  ],
  "tok_cart_special_offer_kind_invalid": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 692
    }
  ],
  "tok_cart_special_offer_not_found": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 596
    }
  ],
  "tok_cart_special_offers_unavailable": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 593
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 708
    }
  ],
  "tok_cart_status_unavailable": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 752
    }
  ],
  "tok_cart_table_not_available": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 649
    }
  ],
  "tok_cart_total_out_of_range": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 654
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
      "line": 1006
    }
  ],
  "tok_connect_capability_method_not_allowed": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 310
    }
  ],
  "tok_connect_capability_not_found": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 306
    }
  ],
  "tok_connect_client_inactive": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 261
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
      "line": 212
    }
  ],
  "tok_connect_commercial_rpc_not_allowlisted": [
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 139
    }
  ],
  "tok_connect_commercial_table_not_allowlisted": [
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 179
    }
  ],
  "tok_connect_customer_history_kind_invalid": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 928
    }
  ],
  "tok_connect_customer_history_unavailable": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 941
    }
  ],
  "tok_connect_daily_reservation_limit_exceeded": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 216
    }
  ],
  "tok_connect_data_operation_invalid": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 504
    }
  ],
  "tok_connect_data_operation_not_allowed": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 480
    }
  ],
  "tok_connect_expected_total_invalid": [
    {
      "file": "supabase/functions/create-checkout/index.ts",
      "line": 1720
    }
  ],
  "tok_connect_filter_invalid": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 487
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 126
    }
  ],
  "tok_connect_filter_operator_invalid": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 494
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 132
    }
  ],
  "tok_connect_grant_not_found": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 389
    }
  ],
  "tok_connect_grant_unavailable": [
    {
      "file": "supabase/functions/_shared/tok-connect-oauth.ts",
      "line": 19
    }
  ],
  "tok_connect_human_confirmation_required": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 173
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 86
    },
    {
      "file": "supabase/functions/tok-connect-mcp/index.ts",
      "line": 2770
    }
  ],
  "tok_connect_idempotency_completion_failed": [
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 120
    }
  ],
  "tok_connect_idempotency_key_required": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 179
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 81
    }
  ],
  "tok_connect_idempotency_key_reused_with_different_body": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 193
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 98
    }
  ],
  "tok_connect_idempotency_request_in_progress": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 197
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 100
    }
  ],
  "tok_connect_login_required": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 550
    }
  ],
  "tok_connect_mcp_grant_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 195
    }
  ],
  "tok_connect_mutation_filter_required": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 508
    }
  ],
  "tok_connect_native_access_forbidden": [
    {
      "file": "supabase/functions/_shared/auth.ts",
      "line": 270
    },
    {
      "file": "supabase/functions/track-analytics/index.ts",
      "line": 185
    },
    {
      "file": "supabase/functions/track-sponsored-event/index.ts",
      "line": 132
    }
  ],
  "tok_connect_oauth_client_id_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 75
    }
  ],
  "tok_connect_partner_inactive": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 277
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
      "line": 389
    }
  ],
  "tok_connect_party_size_limit_exceeded": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 199
    }
  ],
  "tok_connect_portal_action_unknown": [
    {
      "file": "supabase/functions/tok-connect-portal/index.ts",
      "line": 986
    }
  ],
  "tok_connect_price_changed_requote_required": [
    {
      "file": "supabase/functions/create-checkout/index.ts",
      "line": 1723
    }
  ],
  "tok_connect_reservation_not_owned": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 692
    }
  ],
  "tok_connect_restaurant_access_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 167
    }
  ],
  "tok_connect_restaurant_check_unavailable": [
    {
      "file": "supabase/functions/_shared/tok-connect-oauth.ts",
      "line": 82
    }
  ],
  "tok_connect_restaurant_grant_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 182
    },
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 194
    }
  ],
  "tok_connect_result_persistence_unavailable": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 217
    }
  ],
  "tok_connect_route_not_found": [
    {
      "file": "supabase/functions/tok-connect-api/index.ts",
      "line": 1079
    }
  ],
  "tok_connect_rpc_not_allowlisted": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 420
    }
  ],
  "tok_connect_selected_restaurant_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 137
    }
  ],
  "tok_connect_table_not_allowlisted": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 478
    }
  ],
  "tok_connect_token_client_mismatch": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 267
    }
  ],
  "tok_connect_token_expired": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 251
    }
  ],
  "tok_connect_token_invalid": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 72
    },
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 248
    },
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 249
    }
  ],
  "tok_connect_token_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 230
    }
  ],
  "tok_connect_token_scope_revoked": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 306
    }
  ],
  "tok_connect_user_client_required": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 433
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 502
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 146
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 180
    }
  ],
  "tok_connect_user_required": [
    {
      "file": "supabase/functions/_shared/tok-connect-auth.ts",
      "line": 134
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 166
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 184
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 570
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 585
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 689
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 926
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 957
    },
    {
      "file": "supabase/functions/tok-connect-commercial-bridge/index.ts",
      "line": 90
    }
  ],
  "tok_connect_values_required": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 525
    },
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 528
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
  "tok_marketing_oauth_restaurateur_required": [
    {
      "file": "supabase/functions/tok-connect-mcp/index.ts",
      "line": 2767
    }
  ],
  "tok_marketing_visual_result_unconfirmed": [
    {
      "file": "supabase/functions/tok-connect-app-bridge/index.ts",
      "line": 384
    }
  ],
  "tok_one_action_invalid": [
    {
      "file": "supabase/functions/manage-tok-one-subscription/index.ts",
      "line": 31
    }
  ],
  "tok_one_plan_price_changed_requote": [
    {
      "file": "supabase/functions/create-checkout/index.ts",
      "line": 1089
    }
  ],
  "tok_one_recurring_price_not_verifiable": [
    {
      "file": "supabase/functions/manage-tok-one-subscription/index.ts",
      "line": 214
    }
  ],
  "tok_order_pending_payment_update_failed": [
    {
      "file": "supabase/functions/validate-order/index.ts",
      "line": 458
    }
  ],
  "tok_pickup_slot_conflict_requote": [
    {
      "file": "supabase/functions/validate-order/index.ts",
      "line": 326
    }
  ],
  "too_many_channels": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 104
    }
  ],
  "unauthorized": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1546
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1565
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 1584
    },
    {
      "file": "supabase/functions/tok-workforce-assistant/index.ts",
      "line": 45
    },
    {
      "file": "supabase/functions/_shared/auth.ts",
      "line": 246
    },
    {
      "file": "supabase/functions/_shared/auth.ts",
      "line": 296
    },
    {
      "file": "supabase/functions/_shared/auth.ts",
      "line": 423
    },
    {
      "file": "supabase/functions/_shared/commercial-demo-ai.ts",
      "line": 97
    },
    {
      "file": "supabase/functions/ai-campaign-studio/index.ts",
      "line": 392
    },
    {
      "file": "supabase/functions/ai-client-chat/index.ts",
      "line": 260
    },
    {
      "file": "supabase/functions/ai-client-support/index.ts",
      "line": 324
    },
    {
      "file": "supabase/functions/ai-image-enhance/index.ts",
      "line": 1381
    }
  ],
  "unexpected_reasoning_effort": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2316
    }
  ],
  "unexpected_repair_model": [
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2313
    }
  ],
  "unsupported_action": [
    {
      "file": "supabase/functions/ai-guardian/index.ts",
      "line": 1096
    },
    {
      "file": "supabase/functions/ai-support-resolution/index.ts",
      "line": 1486
    },
    {
      "file": "supabase/functions/ops-incident-control/index.ts",
      "line": 2486
    },
    {
      "file": "supabase/functions/restaurant-media-governance/index.ts",
      "line": 271
    }
  ],
  "unsupported_channel": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 108
    }
  ],
  "unsupported_grant_type": [
    {
      "file": "supabase/functions/tok-connect-oauth/index.ts",
      "line": 168
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
      "line": 2257
    }
  ],
  "user_authentication_required": [
    {
      "file": "supabase/functions/ops-admin-approval/index.ts",
      "line": 113
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
  "webhook_claim_failed": [
    {
      "file": "supabase/functions/tok-connect-webhook-dispatch/index.ts",
      "line": 113
    }
  ],
  "webhook_completion_unacknowledged": [
    {
      "file": "supabase/functions/tok-connect-webhook-dispatch/index.ts",
      "line": 62
    }
  ],
  "webhook_dispatcher_service_required": [
    {
      "file": "supabase/functions/tok-connect-webhook-dispatch/index.ts",
      "line": 26
    }
  ],
  "webhook_endpoint_read_failed": [
    {
      "file": "supabase/functions/tok-connect-webhook-dispatch/index.ts",
      "line": 40
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
      "line": 230
    }
  ],
  "windsor_unavailable": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 188
    }
  ],
  "windsor_unconfigured": [
    {
      "file": "supabase/functions/ai-marketing-agent/index.ts",
      "line": 182
    }
  ],
  "workforce_access_denied": [
    {
      "file": "supabase/functions/tok-workforce-assistant/index.ts",
      "line": 56
    }
  ],
  "workforce_access_unavailable": [
    {
      "file": "supabase/functions/tok-workforce-assistant/index.ts",
      "line": 55
    }
  ],
  "workforce_context_changed": [
    {
      "file": "supabase/functions/tok-workforce-assistant/index.ts",
      "line": 20
    }
  ],
  "workforce_context_unavailable": [
    {
      "file": "supabase/functions/tok-workforce-assistant/index.ts",
      "line": 17
    },
    {
      "file": "supabase/functions/tok-workforce-assistant/index.ts",
      "line": 28
    },
    {
      "file": "supabase/functions/tok-workforce-assistant/index.ts",
      "line": 63
    }
  ],
  "workforce_period_too_large": [
    {
      "file": "supabase/functions/tok-workforce-assistant/index.ts",
      "line": 19
    },
    {
      "file": "supabase/functions/tok-workforce-assistant/index.ts",
      "line": 25
    },
    {
      "file": "supabase/functions/tok-workforce-assistant/index.ts",
      "line": 34
    },
    {
      "file": "supabase/functions/tok-workforce-assistant/index.ts",
      "line": 76
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
