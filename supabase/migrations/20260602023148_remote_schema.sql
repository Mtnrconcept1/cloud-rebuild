drop trigger if exists "touch_ai_conversations_updated_at" on "public"."ai_conversations";

drop trigger if exists "touch_ai_restaurant_tasks_updated_at" on "public"."ai_restaurant_tasks";

drop trigger if exists "touch_ai_safety_rules_updated_at" on "public"."ai_safety_rules";

drop trigger if exists "touch_ai_support_tickets_updated_at" on "public"."ai_support_tickets";

drop trigger if exists "touch_restaurant_ai_profiles_updated_at" on "public"."restaurant_ai_profiles";

drop trigger if exists "touch_restaurant_ai_subscriptions_updated_at" on "public"."restaurant_ai_subscriptions";

drop policy "admin_catalog_change_history_admin_insert" on "public"."admin_catalog_change_history";

drop policy "admin_catalog_change_history_admin_select" on "public"."admin_catalog_change_history";

drop policy "admin_loyalty_change_history_admin_insert" on "public"."admin_loyalty_change_history";

drop policy "admin_loyalty_change_history_admin_select" on "public"."admin_loyalty_change_history";

drop policy "admin_review_action_history_admin_insert" on "public"."admin_review_action_history";

drop policy "admin_review_action_history_admin_select" on "public"."admin_review_action_history";

drop policy "ai_accounting_insights_admin_all" on "public"."ai_accounting_insights";

drop policy "ai_accounting_insights_admin_restaurant_select" on "public"."ai_accounting_insights";

drop policy "ai_admin_events_admin_all" on "public"."ai_admin_events";

drop policy "ai_admin_events_admin_select" on "public"."ai_admin_events";

drop policy "ai_conversations_insert_related" on "public"."ai_conversations";

drop policy "ai_conversations_select_related" on "public"."ai_conversations";

drop policy "ai_conversations_update_related" on "public"."ai_conversations";

drop policy "ai_generated_assets_insert_related" on "public"."ai_generated_assets";

drop policy "ai_generated_assets_select_related" on "public"."ai_generated_assets";

drop policy "ai_messages_insert_related" on "public"."ai_messages";

drop policy "ai_messages_select_related" on "public"."ai_messages";

drop policy "ai_performance_snapshots_admin_all" on "public"."ai_performance_snapshots";

drop policy "ai_performance_snapshots_admin_restaurant_select" on "public"."ai_performance_snapshots";

drop policy "ai_restaurant_tasks_owner_admin" on "public"."ai_restaurant_tasks";

drop policy "ai_safety_rules_admin_all" on "public"."ai_safety_rules";

drop policy "ai_safety_rules_select_related" on "public"."ai_safety_rules";

drop policy "ai_security_events_admin_all" on "public"."ai_security_events";

drop policy "ai_security_events_admin_select" on "public"."ai_security_events";

drop policy "ai_support_tickets_admin_update" on "public"."ai_support_tickets";

drop policy "ai_support_tickets_insert_related" on "public"."ai_support_tickets";

drop policy "ai_support_tickets_select_related" on "public"."ai_support_tickets";

drop policy "ai_usage_logs_select_related" on "public"."ai_usage_logs";

drop policy "restaurant_ai_profiles_owner_admin" on "public"."restaurant_ai_profiles";

drop policy "restaurant_ai_subscriptions_admin_all" on "public"."restaurant_ai_subscriptions";

drop policy "restaurant_ai_subscriptions_owner_admin_select" on "public"."restaurant_ai_subscriptions";

drop policy "social_posts_insert" on "public"."social_posts";

revoke delete on table "public"."admin_catalog_change_history" from "anon";

revoke insert on table "public"."admin_catalog_change_history" from "anon";

revoke references on table "public"."admin_catalog_change_history" from "anon";

revoke select on table "public"."admin_catalog_change_history" from "anon";

revoke trigger on table "public"."admin_catalog_change_history" from "anon";

revoke truncate on table "public"."admin_catalog_change_history" from "anon";

revoke update on table "public"."admin_catalog_change_history" from "anon";

revoke delete on table "public"."admin_catalog_change_history" from "authenticated";

revoke insert on table "public"."admin_catalog_change_history" from "authenticated";

revoke references on table "public"."admin_catalog_change_history" from "authenticated";

revoke select on table "public"."admin_catalog_change_history" from "authenticated";

revoke trigger on table "public"."admin_catalog_change_history" from "authenticated";

revoke truncate on table "public"."admin_catalog_change_history" from "authenticated";

revoke update on table "public"."admin_catalog_change_history" from "authenticated";

revoke delete on table "public"."admin_catalog_change_history" from "service_role";

revoke insert on table "public"."admin_catalog_change_history" from "service_role";

revoke references on table "public"."admin_catalog_change_history" from "service_role";

revoke select on table "public"."admin_catalog_change_history" from "service_role";

revoke trigger on table "public"."admin_catalog_change_history" from "service_role";

revoke truncate on table "public"."admin_catalog_change_history" from "service_role";

revoke update on table "public"."admin_catalog_change_history" from "service_role";

revoke delete on table "public"."admin_loyalty_change_history" from "anon";

revoke insert on table "public"."admin_loyalty_change_history" from "anon";

revoke references on table "public"."admin_loyalty_change_history" from "anon";

revoke select on table "public"."admin_loyalty_change_history" from "anon";

revoke trigger on table "public"."admin_loyalty_change_history" from "anon";

revoke truncate on table "public"."admin_loyalty_change_history" from "anon";

revoke update on table "public"."admin_loyalty_change_history" from "anon";

revoke delete on table "public"."admin_loyalty_change_history" from "authenticated";

revoke insert on table "public"."admin_loyalty_change_history" from "authenticated";

revoke references on table "public"."admin_loyalty_change_history" from "authenticated";

revoke select on table "public"."admin_loyalty_change_history" from "authenticated";

revoke trigger on table "public"."admin_loyalty_change_history" from "authenticated";

revoke truncate on table "public"."admin_loyalty_change_history" from "authenticated";

revoke update on table "public"."admin_loyalty_change_history" from "authenticated";

revoke delete on table "public"."admin_loyalty_change_history" from "service_role";

revoke insert on table "public"."admin_loyalty_change_history" from "service_role";

revoke references on table "public"."admin_loyalty_change_history" from "service_role";

revoke select on table "public"."admin_loyalty_change_history" from "service_role";

revoke trigger on table "public"."admin_loyalty_change_history" from "service_role";

revoke truncate on table "public"."admin_loyalty_change_history" from "service_role";

revoke update on table "public"."admin_loyalty_change_history" from "service_role";

revoke delete on table "public"."admin_review_action_history" from "anon";

revoke insert on table "public"."admin_review_action_history" from "anon";

revoke references on table "public"."admin_review_action_history" from "anon";

revoke select on table "public"."admin_review_action_history" from "anon";

revoke trigger on table "public"."admin_review_action_history" from "anon";

revoke truncate on table "public"."admin_review_action_history" from "anon";

revoke update on table "public"."admin_review_action_history" from "anon";

revoke delete on table "public"."admin_review_action_history" from "authenticated";

revoke insert on table "public"."admin_review_action_history" from "authenticated";

revoke references on table "public"."admin_review_action_history" from "authenticated";

revoke select on table "public"."admin_review_action_history" from "authenticated";

revoke trigger on table "public"."admin_review_action_history" from "authenticated";

revoke truncate on table "public"."admin_review_action_history" from "authenticated";

revoke update on table "public"."admin_review_action_history" from "authenticated";

revoke delete on table "public"."admin_review_action_history" from "service_role";

revoke insert on table "public"."admin_review_action_history" from "service_role";

revoke references on table "public"."admin_review_action_history" from "service_role";

revoke select on table "public"."admin_review_action_history" from "service_role";

revoke trigger on table "public"."admin_review_action_history" from "service_role";

revoke truncate on table "public"."admin_review_action_history" from "service_role";

revoke update on table "public"."admin_review_action_history" from "service_role";

revoke delete on table "public"."ai_accounting_insights" from "anon";

revoke insert on table "public"."ai_accounting_insights" from "anon";

revoke references on table "public"."ai_accounting_insights" from "anon";

revoke select on table "public"."ai_accounting_insights" from "anon";

revoke trigger on table "public"."ai_accounting_insights" from "anon";

revoke truncate on table "public"."ai_accounting_insights" from "anon";

revoke update on table "public"."ai_accounting_insights" from "anon";

revoke delete on table "public"."ai_accounting_insights" from "authenticated";

revoke insert on table "public"."ai_accounting_insights" from "authenticated";

revoke references on table "public"."ai_accounting_insights" from "authenticated";

revoke select on table "public"."ai_accounting_insights" from "authenticated";

revoke trigger on table "public"."ai_accounting_insights" from "authenticated";

revoke truncate on table "public"."ai_accounting_insights" from "authenticated";

revoke update on table "public"."ai_accounting_insights" from "authenticated";

revoke delete on table "public"."ai_accounting_insights" from "service_role";

revoke insert on table "public"."ai_accounting_insights" from "service_role";

revoke references on table "public"."ai_accounting_insights" from "service_role";

revoke select on table "public"."ai_accounting_insights" from "service_role";

revoke trigger on table "public"."ai_accounting_insights" from "service_role";

revoke truncate on table "public"."ai_accounting_insights" from "service_role";

revoke update on table "public"."ai_accounting_insights" from "service_role";

revoke delete on table "public"."ai_admin_events" from "anon";

revoke insert on table "public"."ai_admin_events" from "anon";

revoke references on table "public"."ai_admin_events" from "anon";

revoke select on table "public"."ai_admin_events" from "anon";

revoke trigger on table "public"."ai_admin_events" from "anon";

revoke truncate on table "public"."ai_admin_events" from "anon";

revoke update on table "public"."ai_admin_events" from "anon";

revoke delete on table "public"."ai_admin_events" from "authenticated";

revoke insert on table "public"."ai_admin_events" from "authenticated";

revoke references on table "public"."ai_admin_events" from "authenticated";

revoke select on table "public"."ai_admin_events" from "authenticated";

revoke trigger on table "public"."ai_admin_events" from "authenticated";

revoke truncate on table "public"."ai_admin_events" from "authenticated";

revoke update on table "public"."ai_admin_events" from "authenticated";

revoke delete on table "public"."ai_admin_events" from "service_role";

revoke insert on table "public"."ai_admin_events" from "service_role";

revoke references on table "public"."ai_admin_events" from "service_role";

revoke select on table "public"."ai_admin_events" from "service_role";

revoke trigger on table "public"."ai_admin_events" from "service_role";

revoke truncate on table "public"."ai_admin_events" from "service_role";

revoke update on table "public"."ai_admin_events" from "service_role";

revoke delete on table "public"."ai_conversations" from "anon";

revoke insert on table "public"."ai_conversations" from "anon";

revoke references on table "public"."ai_conversations" from "anon";

revoke select on table "public"."ai_conversations" from "anon";

revoke trigger on table "public"."ai_conversations" from "anon";

revoke truncate on table "public"."ai_conversations" from "anon";

revoke update on table "public"."ai_conversations" from "anon";

revoke delete on table "public"."ai_conversations" from "authenticated";

revoke insert on table "public"."ai_conversations" from "authenticated";

revoke references on table "public"."ai_conversations" from "authenticated";

revoke select on table "public"."ai_conversations" from "authenticated";

revoke trigger on table "public"."ai_conversations" from "authenticated";

revoke truncate on table "public"."ai_conversations" from "authenticated";

revoke update on table "public"."ai_conversations" from "authenticated";

revoke delete on table "public"."ai_conversations" from "service_role";

revoke insert on table "public"."ai_conversations" from "service_role";

revoke references on table "public"."ai_conversations" from "service_role";

revoke select on table "public"."ai_conversations" from "service_role";

revoke trigger on table "public"."ai_conversations" from "service_role";

revoke truncate on table "public"."ai_conversations" from "service_role";

revoke update on table "public"."ai_conversations" from "service_role";

revoke delete on table "public"."ai_generated_assets" from "anon";

revoke insert on table "public"."ai_generated_assets" from "anon";

revoke references on table "public"."ai_generated_assets" from "anon";

revoke select on table "public"."ai_generated_assets" from "anon";

revoke trigger on table "public"."ai_generated_assets" from "anon";

revoke truncate on table "public"."ai_generated_assets" from "anon";

revoke update on table "public"."ai_generated_assets" from "anon";

revoke delete on table "public"."ai_generated_assets" from "authenticated";

revoke insert on table "public"."ai_generated_assets" from "authenticated";

revoke references on table "public"."ai_generated_assets" from "authenticated";

revoke select on table "public"."ai_generated_assets" from "authenticated";

revoke trigger on table "public"."ai_generated_assets" from "authenticated";

revoke truncate on table "public"."ai_generated_assets" from "authenticated";

revoke update on table "public"."ai_generated_assets" from "authenticated";

revoke delete on table "public"."ai_generated_assets" from "service_role";

revoke insert on table "public"."ai_generated_assets" from "service_role";

revoke references on table "public"."ai_generated_assets" from "service_role";

revoke select on table "public"."ai_generated_assets" from "service_role";

revoke trigger on table "public"."ai_generated_assets" from "service_role";

revoke truncate on table "public"."ai_generated_assets" from "service_role";

revoke update on table "public"."ai_generated_assets" from "service_role";

revoke delete on table "public"."ai_messages" from "anon";

revoke insert on table "public"."ai_messages" from "anon";

revoke references on table "public"."ai_messages" from "anon";

revoke select on table "public"."ai_messages" from "anon";

revoke trigger on table "public"."ai_messages" from "anon";

revoke truncate on table "public"."ai_messages" from "anon";

revoke update on table "public"."ai_messages" from "anon";

revoke delete on table "public"."ai_messages" from "authenticated";

revoke insert on table "public"."ai_messages" from "authenticated";

revoke references on table "public"."ai_messages" from "authenticated";

revoke select on table "public"."ai_messages" from "authenticated";

revoke trigger on table "public"."ai_messages" from "authenticated";

revoke truncate on table "public"."ai_messages" from "authenticated";

revoke update on table "public"."ai_messages" from "authenticated";

revoke delete on table "public"."ai_messages" from "service_role";

revoke insert on table "public"."ai_messages" from "service_role";

revoke references on table "public"."ai_messages" from "service_role";

revoke select on table "public"."ai_messages" from "service_role";

revoke trigger on table "public"."ai_messages" from "service_role";

revoke truncate on table "public"."ai_messages" from "service_role";

revoke update on table "public"."ai_messages" from "service_role";

revoke delete on table "public"."ai_performance_snapshots" from "anon";

revoke insert on table "public"."ai_performance_snapshots" from "anon";

revoke references on table "public"."ai_performance_snapshots" from "anon";

revoke select on table "public"."ai_performance_snapshots" from "anon";

revoke trigger on table "public"."ai_performance_snapshots" from "anon";

revoke truncate on table "public"."ai_performance_snapshots" from "anon";

revoke update on table "public"."ai_performance_snapshots" from "anon";

revoke delete on table "public"."ai_performance_snapshots" from "authenticated";

revoke insert on table "public"."ai_performance_snapshots" from "authenticated";

revoke references on table "public"."ai_performance_snapshots" from "authenticated";

revoke select on table "public"."ai_performance_snapshots" from "authenticated";

revoke trigger on table "public"."ai_performance_snapshots" from "authenticated";

revoke truncate on table "public"."ai_performance_snapshots" from "authenticated";

revoke update on table "public"."ai_performance_snapshots" from "authenticated";

revoke delete on table "public"."ai_performance_snapshots" from "service_role";

revoke insert on table "public"."ai_performance_snapshots" from "service_role";

revoke references on table "public"."ai_performance_snapshots" from "service_role";

revoke select on table "public"."ai_performance_snapshots" from "service_role";

revoke trigger on table "public"."ai_performance_snapshots" from "service_role";

revoke truncate on table "public"."ai_performance_snapshots" from "service_role";

revoke update on table "public"."ai_performance_snapshots" from "service_role";

revoke delete on table "public"."ai_restaurant_tasks" from "anon";

revoke insert on table "public"."ai_restaurant_tasks" from "anon";

revoke references on table "public"."ai_restaurant_tasks" from "anon";

revoke select on table "public"."ai_restaurant_tasks" from "anon";

revoke trigger on table "public"."ai_restaurant_tasks" from "anon";

revoke truncate on table "public"."ai_restaurant_tasks" from "anon";

revoke update on table "public"."ai_restaurant_tasks" from "anon";

revoke delete on table "public"."ai_restaurant_tasks" from "authenticated";

revoke insert on table "public"."ai_restaurant_tasks" from "authenticated";

revoke references on table "public"."ai_restaurant_tasks" from "authenticated";

revoke select on table "public"."ai_restaurant_tasks" from "authenticated";

revoke trigger on table "public"."ai_restaurant_tasks" from "authenticated";

revoke truncate on table "public"."ai_restaurant_tasks" from "authenticated";

revoke update on table "public"."ai_restaurant_tasks" from "authenticated";

revoke delete on table "public"."ai_restaurant_tasks" from "service_role";

revoke insert on table "public"."ai_restaurant_tasks" from "service_role";

revoke references on table "public"."ai_restaurant_tasks" from "service_role";

revoke select on table "public"."ai_restaurant_tasks" from "service_role";

revoke trigger on table "public"."ai_restaurant_tasks" from "service_role";

revoke truncate on table "public"."ai_restaurant_tasks" from "service_role";

revoke update on table "public"."ai_restaurant_tasks" from "service_role";

revoke delete on table "public"."ai_safety_rules" from "anon";

revoke insert on table "public"."ai_safety_rules" from "anon";

revoke references on table "public"."ai_safety_rules" from "anon";

revoke select on table "public"."ai_safety_rules" from "anon";

revoke trigger on table "public"."ai_safety_rules" from "anon";

revoke truncate on table "public"."ai_safety_rules" from "anon";

revoke update on table "public"."ai_safety_rules" from "anon";

revoke delete on table "public"."ai_safety_rules" from "authenticated";

revoke insert on table "public"."ai_safety_rules" from "authenticated";

revoke references on table "public"."ai_safety_rules" from "authenticated";

revoke select on table "public"."ai_safety_rules" from "authenticated";

revoke trigger on table "public"."ai_safety_rules" from "authenticated";

revoke truncate on table "public"."ai_safety_rules" from "authenticated";

revoke update on table "public"."ai_safety_rules" from "authenticated";

revoke delete on table "public"."ai_safety_rules" from "service_role";

revoke insert on table "public"."ai_safety_rules" from "service_role";

revoke references on table "public"."ai_safety_rules" from "service_role";

revoke select on table "public"."ai_safety_rules" from "service_role";

revoke trigger on table "public"."ai_safety_rules" from "service_role";

revoke truncate on table "public"."ai_safety_rules" from "service_role";

revoke update on table "public"."ai_safety_rules" from "service_role";

revoke delete on table "public"."ai_security_events" from "anon";

revoke insert on table "public"."ai_security_events" from "anon";

revoke references on table "public"."ai_security_events" from "anon";

revoke select on table "public"."ai_security_events" from "anon";

revoke trigger on table "public"."ai_security_events" from "anon";

revoke truncate on table "public"."ai_security_events" from "anon";

revoke update on table "public"."ai_security_events" from "anon";

revoke delete on table "public"."ai_security_events" from "authenticated";

revoke insert on table "public"."ai_security_events" from "authenticated";

revoke references on table "public"."ai_security_events" from "authenticated";

revoke select on table "public"."ai_security_events" from "authenticated";

revoke trigger on table "public"."ai_security_events" from "authenticated";

revoke truncate on table "public"."ai_security_events" from "authenticated";

revoke update on table "public"."ai_security_events" from "authenticated";

revoke delete on table "public"."ai_security_events" from "service_role";

revoke insert on table "public"."ai_security_events" from "service_role";

revoke references on table "public"."ai_security_events" from "service_role";

revoke select on table "public"."ai_security_events" from "service_role";

revoke trigger on table "public"."ai_security_events" from "service_role";

revoke truncate on table "public"."ai_security_events" from "service_role";

revoke update on table "public"."ai_security_events" from "service_role";

revoke delete on table "public"."ai_support_tickets" from "anon";

revoke insert on table "public"."ai_support_tickets" from "anon";

revoke references on table "public"."ai_support_tickets" from "anon";

revoke select on table "public"."ai_support_tickets" from "anon";

revoke trigger on table "public"."ai_support_tickets" from "anon";

revoke truncate on table "public"."ai_support_tickets" from "anon";

revoke update on table "public"."ai_support_tickets" from "anon";

revoke delete on table "public"."ai_support_tickets" from "authenticated";

revoke insert on table "public"."ai_support_tickets" from "authenticated";

revoke references on table "public"."ai_support_tickets" from "authenticated";

revoke select on table "public"."ai_support_tickets" from "authenticated";

revoke trigger on table "public"."ai_support_tickets" from "authenticated";

revoke truncate on table "public"."ai_support_tickets" from "authenticated";

revoke update on table "public"."ai_support_tickets" from "authenticated";

revoke delete on table "public"."ai_support_tickets" from "service_role";

revoke insert on table "public"."ai_support_tickets" from "service_role";

revoke references on table "public"."ai_support_tickets" from "service_role";

revoke select on table "public"."ai_support_tickets" from "service_role";

revoke trigger on table "public"."ai_support_tickets" from "service_role";

revoke truncate on table "public"."ai_support_tickets" from "service_role";

revoke update on table "public"."ai_support_tickets" from "service_role";

revoke delete on table "public"."ai_usage_logs" from "anon";

revoke insert on table "public"."ai_usage_logs" from "anon";

revoke references on table "public"."ai_usage_logs" from "anon";

revoke select on table "public"."ai_usage_logs" from "anon";

revoke trigger on table "public"."ai_usage_logs" from "anon";

revoke truncate on table "public"."ai_usage_logs" from "anon";

revoke update on table "public"."ai_usage_logs" from "anon";

revoke delete on table "public"."ai_usage_logs" from "authenticated";

revoke insert on table "public"."ai_usage_logs" from "authenticated";

revoke references on table "public"."ai_usage_logs" from "authenticated";

revoke select on table "public"."ai_usage_logs" from "authenticated";

revoke trigger on table "public"."ai_usage_logs" from "authenticated";

revoke truncate on table "public"."ai_usage_logs" from "authenticated";

revoke update on table "public"."ai_usage_logs" from "authenticated";

revoke delete on table "public"."ai_usage_logs" from "service_role";

revoke insert on table "public"."ai_usage_logs" from "service_role";

revoke references on table "public"."ai_usage_logs" from "service_role";

revoke select on table "public"."ai_usage_logs" from "service_role";

revoke trigger on table "public"."ai_usage_logs" from "service_role";

revoke truncate on table "public"."ai_usage_logs" from "service_role";

revoke update on table "public"."ai_usage_logs" from "service_role";

revoke delete on table "public"."restaurant_ai_profiles" from "anon";

revoke insert on table "public"."restaurant_ai_profiles" from "anon";

revoke references on table "public"."restaurant_ai_profiles" from "anon";

revoke select on table "public"."restaurant_ai_profiles" from "anon";

revoke trigger on table "public"."restaurant_ai_profiles" from "anon";

revoke truncate on table "public"."restaurant_ai_profiles" from "anon";

revoke update on table "public"."restaurant_ai_profiles" from "anon";

revoke delete on table "public"."restaurant_ai_profiles" from "authenticated";

revoke insert on table "public"."restaurant_ai_profiles" from "authenticated";

revoke references on table "public"."restaurant_ai_profiles" from "authenticated";

revoke select on table "public"."restaurant_ai_profiles" from "authenticated";

revoke trigger on table "public"."restaurant_ai_profiles" from "authenticated";

revoke truncate on table "public"."restaurant_ai_profiles" from "authenticated";

revoke update on table "public"."restaurant_ai_profiles" from "authenticated";

revoke delete on table "public"."restaurant_ai_profiles" from "service_role";

revoke insert on table "public"."restaurant_ai_profiles" from "service_role";

revoke references on table "public"."restaurant_ai_profiles" from "service_role";

revoke select on table "public"."restaurant_ai_profiles" from "service_role";

revoke trigger on table "public"."restaurant_ai_profiles" from "service_role";

revoke truncate on table "public"."restaurant_ai_profiles" from "service_role";

revoke update on table "public"."restaurant_ai_profiles" from "service_role";

revoke delete on table "public"."restaurant_ai_subscriptions" from "anon";

revoke insert on table "public"."restaurant_ai_subscriptions" from "anon";

revoke references on table "public"."restaurant_ai_subscriptions" from "anon";

revoke select on table "public"."restaurant_ai_subscriptions" from "anon";

revoke trigger on table "public"."restaurant_ai_subscriptions" from "anon";

revoke truncate on table "public"."restaurant_ai_subscriptions" from "anon";

revoke update on table "public"."restaurant_ai_subscriptions" from "anon";

revoke delete on table "public"."restaurant_ai_subscriptions" from "authenticated";

revoke insert on table "public"."restaurant_ai_subscriptions" from "authenticated";

revoke references on table "public"."restaurant_ai_subscriptions" from "authenticated";

revoke select on table "public"."restaurant_ai_subscriptions" from "authenticated";

revoke trigger on table "public"."restaurant_ai_subscriptions" from "authenticated";

revoke truncate on table "public"."restaurant_ai_subscriptions" from "authenticated";

revoke update on table "public"."restaurant_ai_subscriptions" from "authenticated";

revoke delete on table "public"."restaurant_ai_subscriptions" from "service_role";

revoke insert on table "public"."restaurant_ai_subscriptions" from "service_role";

revoke references on table "public"."restaurant_ai_subscriptions" from "service_role";

revoke select on table "public"."restaurant_ai_subscriptions" from "service_role";

revoke trigger on table "public"."restaurant_ai_subscriptions" from "service_role";

revoke truncate on table "public"."restaurant_ai_subscriptions" from "service_role";

revoke update on table "public"."restaurant_ai_subscriptions" from "service_role";

alter table "public"."admin_month_locks" drop constraint "admin_month_locks_closed_by_fkey";

alter table "public"."admin_month_locks" drop constraint "admin_month_locks_period_month_is_first_day";

alter table "public"."admin_month_locks" drop constraint "admin_month_locks_reopened_by_fkey";

alter table "public"."admin_month_locks" drop constraint "admin_month_locks_updated_by_fkey";

alter table "public"."admin_review_action_history" drop constraint "admin_review_action_history_review_id_fkey";

alter table "public"."ai_accounting_insights" drop constraint "ai_accounting_insights_period_check";

alter table "public"."ai_accounting_insights" drop constraint "ai_accounting_insights_restaurant_id_fkey";

alter table "public"."ai_accounting_insights" drop constraint "ai_accounting_insights_user_id_fkey";

alter table "public"."ai_admin_events" drop constraint "ai_admin_events_severity_check";

alter table "public"."ai_admin_events" drop constraint "ai_admin_events_status_check";

alter table "public"."ai_admin_events" drop constraint "ai_admin_events_user_id_fkey";

alter table "public"."ai_conversations" drop constraint "ai_conversations_order_id_fkey";

alter table "public"."ai_conversations" drop constraint "ai_conversations_reservation_id_fkey";

alter table "public"."ai_conversations" drop constraint "ai_conversations_restaurant_id_fkey";

alter table "public"."ai_conversations" drop constraint "ai_conversations_scope_check";

alter table "public"."ai_conversations" drop constraint "ai_conversations_status_check";

alter table "public"."ai_conversations" drop constraint "ai_conversations_support_incident_id_fkey";

alter table "public"."ai_conversations" drop constraint "ai_conversations_user_id_fkey";

alter table "public"."ai_generated_assets" drop constraint "ai_generated_assets_restaurant_id_fkey";

alter table "public"."ai_generated_assets" drop constraint "ai_generated_assets_status_check";

alter table "public"."ai_generated_assets" drop constraint "ai_generated_assets_type_check";

alter table "public"."ai_generated_assets" drop constraint "ai_generated_assets_user_id_fkey";

alter table "public"."ai_messages" drop constraint "ai_messages_conversation_id_fkey";

alter table "public"."ai_messages" drop constraint "ai_messages_role_check";

alter table "public"."ai_performance_snapshots" drop constraint "ai_performance_snapshots_health_score_check";

alter table "public"."ai_performance_snapshots" drop constraint "ai_performance_snapshots_restaurant_id_fkey";

alter table "public"."ai_performance_snapshots" drop constraint "ai_performance_snapshots_scope_check";

alter table "public"."ai_restaurant_tasks" drop constraint "ai_restaurant_tasks_conversation_id_fkey";

alter table "public"."ai_restaurant_tasks" drop constraint "ai_restaurant_tasks_restaurant_id_fkey";

alter table "public"."ai_restaurant_tasks" drop constraint "ai_restaurant_tasks_status_check";

alter table "public"."ai_restaurant_tasks" drop constraint "ai_restaurant_tasks_user_id_fkey";

alter table "public"."ai_safety_rules" drop constraint "ai_safety_rules_restaurant_id_fkey";

alter table "public"."ai_safety_rules" drop constraint "ai_safety_rules_scope_check";

alter table "public"."ai_safety_rules" drop constraint "ai_safety_rules_severity_check";

alter table "public"."ai_safety_rules" drop constraint "ai_safety_rules_unique_key";

alter table "public"."ai_security_events" drop constraint "ai_security_events_restaurant_id_fkey";

alter table "public"."ai_security_events" drop constraint "ai_security_events_risk_score_check";

alter table "public"."ai_security_events" drop constraint "ai_security_events_severity_check";

alter table "public"."ai_security_events" drop constraint "ai_security_events_status_check";

alter table "public"."ai_security_events" drop constraint "ai_security_events_user_id_fkey";

alter table "public"."ai_support_tickets" drop constraint "ai_support_tickets_conversation_id_fkey";

alter table "public"."ai_support_tickets" drop constraint "ai_support_tickets_order_id_fkey";

alter table "public"."ai_support_tickets" drop constraint "ai_support_tickets_priority_check";

alter table "public"."ai_support_tickets" drop constraint "ai_support_tickets_reservation_id_fkey";

alter table "public"."ai_support_tickets" drop constraint "ai_support_tickets_restaurant_id_fkey";

alter table "public"."ai_support_tickets" drop constraint "ai_support_tickets_status_check";

alter table "public"."ai_support_tickets" drop constraint "ai_support_tickets_support_incident_id_fkey";

alter table "public"."ai_support_tickets" drop constraint "ai_support_tickets_user_id_fkey";

alter table "public"."ai_usage_logs" drop constraint "ai_usage_logs_conversation_id_fkey";

alter table "public"."ai_usage_logs" drop constraint "ai_usage_logs_restaurant_id_fkey";

alter table "public"."ai_usage_logs" drop constraint "ai_usage_logs_status_check";

alter table "public"."ai_usage_logs" drop constraint "ai_usage_logs_task_id_fkey";

alter table "public"."ai_usage_logs" drop constraint "ai_usage_logs_user_id_fkey";

alter table "public"."restaurant_ai_profiles" drop constraint "restaurant_ai_profiles_created_by_fkey";

alter table "public"."restaurant_ai_profiles" drop constraint "restaurant_ai_profiles_restaurant_id_fkey";

alter table "public"."restaurant_ai_profiles" drop constraint "restaurant_ai_profiles_restaurant_id_key";

alter table "public"."restaurant_ai_subscriptions" drop constraint "restaurant_ai_subscriptions_plan_check";

alter table "public"."restaurant_ai_subscriptions" drop constraint "restaurant_ai_subscriptions_restaurant_id_fkey";

alter table "public"."restaurant_ai_subscriptions" drop constraint "restaurant_ai_subscriptions_restaurant_id_key";

alter table "public"."restaurant_ai_subscriptions" drop constraint "restaurant_ai_subscriptions_status_check";

drop function if exists "public"."admin_archive_catalog_collection"(p_collection_id uuid, p_reason text);

drop function if exists "public"."admin_archive_loyalty_tier"(p_tier_id uuid, p_reason text);

drop function if exists "public"."admin_archive_subscription_plan"(p_plan_id uuid, p_reason text);

drop function if exists "public"."admin_delete_review"(p_review_id uuid, p_reason text);

drop function if exists "public"."admin_get_tok_one_metrics"();

drop function if exists "public"."admin_reorder_catalog_collections"(p_collection_ids uuid[]);

drop function if exists "public"."admin_reply_review"(p_review_id uuid, p_reply_text text);

drop function if exists "public"."admin_save_catalog_collection"(p_collection_id uuid, p_payload jsonb, p_restaurant_ids uuid[], p_reason text);

drop function if exists "public"."admin_save_loyalty_tier"(p_tier_id uuid, p_payload jsonb, p_reason text);

drop function if exists "public"."admin_save_subscription_plan"(p_plan_id uuid, p_payload jsonb, p_benefits jsonb, p_reason text);

drop function if exists "public"."check_restaurant_ai_quota"(p_restaurant_id uuid, p_feature text, p_units integer);

drop function if exists "public"."get_restaurant_ai_usage"(p_restaurant_id uuid, p_since timestamp with time zone);

drop function if exists "public"."touch_ai_updated_at"();

alter table "public"."admin_catalog_change_history" drop constraint "admin_catalog_change_history_pkey";

alter table "public"."admin_loyalty_change_history" drop constraint "admin_loyalty_change_history_pkey";

alter table "public"."admin_review_action_history" drop constraint "admin_review_action_history_pkey";

alter table "public"."ai_accounting_insights" drop constraint "ai_accounting_insights_pkey";

alter table "public"."ai_admin_events" drop constraint "ai_admin_events_pkey";

alter table "public"."ai_conversations" drop constraint "ai_conversations_pkey";

alter table "public"."ai_generated_assets" drop constraint "ai_generated_assets_pkey";

alter table "public"."ai_messages" drop constraint "ai_messages_pkey";

alter table "public"."ai_performance_snapshots" drop constraint "ai_performance_snapshots_pkey";

alter table "public"."ai_restaurant_tasks" drop constraint "ai_restaurant_tasks_pkey";

alter table "public"."ai_safety_rules" drop constraint "ai_safety_rules_pkey";

alter table "public"."ai_security_events" drop constraint "ai_security_events_pkey";

alter table "public"."ai_support_tickets" drop constraint "ai_support_tickets_pkey";

alter table "public"."ai_usage_logs" drop constraint "ai_usage_logs_pkey";

alter table "public"."restaurant_ai_profiles" drop constraint "restaurant_ai_profiles_pkey";

alter table "public"."restaurant_ai_subscriptions" drop constraint "restaurant_ai_subscriptions_pkey";

alter table "public"."admin_month_locks" drop constraint "admin_month_locks_pkey";

drop index if exists "public"."admin_catalog_change_history_pkey";

drop index if exists "public"."admin_loyalty_change_history_entity_created_idx";

drop index if exists "public"."admin_loyalty_change_history_pkey";

drop index if exists "public"."admin_review_action_history_admin_created_idx";

drop index if exists "public"."admin_review_action_history_pkey";

drop index if exists "public"."admin_review_action_history_review_created_idx";

drop index if exists "public"."ai_accounting_insights_period_idx";

drop index if exists "public"."ai_accounting_insights_pkey";

drop index if exists "public"."ai_admin_events_pkey";

drop index if exists "public"."ai_admin_events_severity_created_idx";

drop index if exists "public"."ai_conversations_pkey";

drop index if exists "public"."ai_conversations_restaurant_scope_idx";

drop index if exists "public"."ai_conversations_user_created_idx";

drop index if exists "public"."ai_generated_assets_pkey";

drop index if exists "public"."ai_generated_assets_restaurant_created_idx";

drop index if exists "public"."ai_messages_conversation_created_idx";

drop index if exists "public"."ai_messages_pkey";

drop index if exists "public"."ai_performance_snapshots_pkey";

drop index if exists "public"."ai_performance_snapshots_scope_date_idx";

drop index if exists "public"."ai_restaurant_tasks_feature_idx";

drop index if exists "public"."ai_restaurant_tasks_pkey";

drop index if exists "public"."ai_restaurant_tasks_restaurant_created_idx";

drop index if exists "public"."ai_safety_rules_active_idx";

drop index if exists "public"."ai_safety_rules_pkey";

drop index if exists "public"."ai_safety_rules_unique_key";

drop index if exists "public"."ai_security_events_pkey";

drop index if exists "public"."ai_security_events_status_created_idx";

drop index if exists "public"."ai_support_tickets_pkey";

drop index if exists "public"."ai_support_tickets_restaurant_status_idx";

drop index if exists "public"."ai_support_tickets_user_created_idx";

drop index if exists "public"."ai_usage_logs_function_created_idx";

drop index if exists "public"."ai_usage_logs_pkey";

drop index if exists "public"."ai_usage_logs_restaurant_created_idx";

drop index if exists "public"."ai_usage_logs_restaurant_feature_created_idx";

drop index if exists "public"."restaurant_ai_profiles_pkey";

drop index if exists "public"."restaurant_ai_profiles_restaurant_id_key";

drop index if exists "public"."restaurant_ai_subscriptions_pkey";

drop index if exists "public"."restaurant_ai_subscriptions_restaurant_id_key";

drop index if exists "public"."admin_month_locks_pkey";

drop table "public"."admin_catalog_change_history";

drop table "public"."admin_loyalty_change_history";

drop table "public"."admin_review_action_history";

drop table "public"."ai_accounting_insights";

drop table "public"."ai_admin_events";

drop table "public"."ai_conversations";

drop table "public"."ai_generated_assets";

drop table "public"."ai_messages";

drop table "public"."ai_performance_snapshots";

drop table "public"."ai_restaurant_tasks";

drop table "public"."ai_safety_rules";

drop table "public"."ai_security_events";

drop table "public"."ai_support_tickets";

drop table "public"."ai_usage_logs";

drop table "public"."restaurant_ai_profiles";

drop table "public"."restaurant_ai_subscriptions";


  create table "public"."admin_marketplace_alert_events" (
    "id" uuid not null default gen_random_uuid(),
    "alert_id" uuid,
    "actor_user_id" uuid,
    "action" text not null,
    "old_status" text,
    "new_status" text,
    "note" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."admin_marketplace_alert_events" enable row level security;


  create table "public"."admin_marketplace_alerts" (
    "id" uuid not null default gen_random_uuid(),
    "alert_key" text not null,
    "severity" text not null default 'medium'::text,
    "status" text not null default 'new'::text,
    "source" text not null,
    "title" text not null,
    "description" text,
    "entity_type" text,
    "entity_id" uuid,
    "action_url" text,
    "recommended_action" text,
    "assigned_to" uuid,
    "note" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "first_seen_at" timestamp with time zone not null default now(),
    "last_seen_at" timestamp with time zone not null default now(),
    "resolved_at" timestamp with time zone,
    "resolved_by" uuid,
    "updated_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."admin_marketplace_alerts" enable row level security;

alter table "public"."admin_month_locks" drop column "closed_at";

alter table "public"."admin_month_locks" drop column "closed_by";

alter table "public"."admin_month_locks" drop column "official_totals";

alter table "public"."admin_month_locks" drop column "updated_by";

alter table "public"."admin_month_locks" add column "id" uuid not null default gen_random_uuid();

alter table "public"."admin_month_locks" add column "locked_at" timestamp with time zone;

alter table "public"."admin_month_locks" add column "locked_by" uuid;

alter table "public"."collections" drop column "archived_at";

alter table "public"."collections" drop column "sort_order";

alter table "public"."loyalty_tiers" drop column "status";

alter table "public"."reviews" add column "archived_at" timestamp with time zone;

alter table "public"."reviews" add column "moderated_at" timestamp with time zone;

alter table "public"."reviews" add column "moderated_by" uuid;

alter table "public"."reviews" add column "moderation_reason" text;

alter table "public"."social_posts" add column "sponsored_amount" numeric(10,2) not null default 0;

alter table "public"."social_posts" add column "sponsored_duration_days" integer;

alter table "public"."social_posts" add column "sponsored_payment_status" text not null default 'none'::text;

alter table "public"."social_posts" add column "sponsored_priority" integer not null default 0;

alter table "public"."social_posts" add column "sponsored_started_at" timestamp with time zone;

alter table "public"."social_posts" add column "sponsored_until" timestamp with time zone;

alter table "public"."social_posts" add column "stripe_checkout_session_id" text;

alter table "public"."social_posts" add column "stripe_payment_intent_id" text;

CREATE UNIQUE INDEX admin_marketplace_alert_events_pkey ON public.admin_marketplace_alert_events USING btree (id);

CREATE UNIQUE INDEX admin_marketplace_alerts_alert_key_key ON public.admin_marketplace_alerts USING btree (alert_key);

CREATE UNIQUE INDEX admin_marketplace_alerts_pkey ON public.admin_marketplace_alerts USING btree (id);

CREATE UNIQUE INDEX admin_month_locks_period_month_key ON public.admin_month_locks USING btree (period_month);

CREATE INDEX social_feed_events_campaign_created_idx ON public.social_feed_events USING btree (campaign_id, created_at DESC) WHERE (campaign_id IS NOT NULL);

CREATE INDEX social_feed_events_post_type_created_idx ON public.social_feed_events USING btree (post_id, event_type, created_at DESC);

CREATE INDEX social_post_metrics_daily_campaign_idx ON public.social_post_metrics_daily USING btree (metric_date DESC, campaign_impressions_count, campaign_clicks_count) WHERE ((campaign_impressions_count > 0) OR (campaign_clicks_count > 0) OR (campaign_cta_clicks_count > 0));

CREATE INDEX social_posts_sponsored_feed_idx ON public.social_posts USING btree (sponsored_payment_status, sponsored_until DESC, sponsored_priority DESC, published_at DESC) WHERE (sponsored_payment_status = 'paid'::text);

CREATE INDEX social_posts_stripe_checkout_session_idx ON public.social_posts USING btree (stripe_checkout_session_id) WHERE (stripe_checkout_session_id IS NOT NULL);

CREATE UNIQUE INDEX admin_month_locks_pkey ON public.admin_month_locks USING btree (id);

alter table "public"."admin_marketplace_alert_events" add constraint "admin_marketplace_alert_events_pkey" PRIMARY KEY using index "admin_marketplace_alert_events_pkey";

alter table "public"."admin_marketplace_alerts" add constraint "admin_marketplace_alerts_pkey" PRIMARY KEY using index "admin_marketplace_alerts_pkey";

alter table "public"."admin_month_locks" add constraint "admin_month_locks_pkey" PRIMARY KEY using index "admin_month_locks_pkey";

alter table "public"."admin_marketplace_alert_events" add constraint "admin_marketplace_alert_events_alert_id_fkey" FOREIGN KEY (alert_id) REFERENCES public.admin_marketplace_alerts(id) ON DELETE CASCADE not valid;

alter table "public"."admin_marketplace_alert_events" validate constraint "admin_marketplace_alert_events_alert_id_fkey";

alter table "public"."admin_marketplace_alerts" add constraint "admin_marketplace_alerts_alert_key_key" UNIQUE using index "admin_marketplace_alerts_alert_key_key";

alter table "public"."admin_marketplace_alerts" add constraint "admin_marketplace_alerts_severity_check" CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'info'::text]))) not valid;

alter table "public"."admin_marketplace_alerts" validate constraint "admin_marketplace_alerts_severity_check";

alter table "public"."admin_marketplace_alerts" add constraint "admin_marketplace_alerts_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'in_progress'::text, 'resolved'::text, 'ignored'::text]))) not valid;

alter table "public"."admin_marketplace_alerts" validate constraint "admin_marketplace_alerts_status_check";

alter table "public"."admin_month_locks" add constraint "admin_month_locks_period_month_key" UNIQUE using index "admin_month_locks_period_month_key";

alter table "public"."social_posts" add constraint "social_posts_sponsored_amount_check" CHECK ((sponsored_amount >= (0)::numeric)) not valid;

alter table "public"."social_posts" validate constraint "social_posts_sponsored_amount_check";

alter table "public"."social_posts" add constraint "social_posts_sponsored_duration_check" CHECK (((sponsored_duration_days IS NULL) OR (sponsored_duration_days = ANY (ARRAY[3, 7, 14])))) not valid;

alter table "public"."social_posts" validate constraint "social_posts_sponsored_duration_check";

alter table "public"."social_posts" add constraint "social_posts_sponsored_payment_status_check" CHECK ((sponsored_payment_status = ANY (ARRAY['none'::text, 'pending'::text, 'paid'::text, 'failed'::text]))) not valid;

alter table "public"."social_posts" validate constraint "social_posts_sponsored_payment_status_check";

alter table "public"."social_posts" add constraint "social_posts_sponsored_priority_check" CHECK (((sponsored_priority >= 0) AND (sponsored_priority <= 100))) not valid;

alter table "public"."social_posts" validate constraint "social_posts_sponsored_priority_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.admin_log_admin_action(p_action text, p_entity_type text, p_entity_id uuid DEFAULT NULL::uuid, p_old_data jsonb DEFAULT '{}'::jsonb, p_new_data jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_log_id uuid;
begin
  if v_user_id is null or not public.has_role(v_user_id, 'admin') then
    raise exception 'Admin role required';
  end if;
  insert into public.audit_log(user_id, action, entity_type, entity_id, old_data, new_data)
  values (v_user_id, p_action, p_entity_type, p_entity_id, coalesce(p_old_data, '{}'::jsonb), coalesce(p_new_data, '{}'::jsonb))
  returning id into v_log_id;
  return v_log_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_accounting_period_control(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_month date := public.accounting_month_start(p_month);
  v_lock public.admin_month_locks%ROWTYPE;
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RAISE EXCEPTION 'Admin access required.';
  END IF;
  SELECT * INTO v_lock FROM public.admin_month_locks WHERE period_month = v_month;
  RETURN jsonb_build_object('period_month', v_month, 'status', COALESCE(v_lock.status, 'open'), 'is_closed', COALESCE(v_lock.status, 'open') = 'closed', 'lock', COALESCE(to_jsonb(v_lock), jsonb_build_object('period_month', v_month, 'status', 'open')), 'stripe_reconciliation', COALESCE((SELECT jsonb_agg(to_jsonb(reconciliation_row)) FROM public.admin_get_accounting_stripe_reconciliation(v_month) reconciliation_row), '[]'::jsonb));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_accounting_stripe_reconciliation(p_month date)
 RETURNS TABLE(item_kind text, expected_count integer, expected_amount numeric, received_count integer, received_amount numeric, refunded_amount numeric, orphan_count integer, mismatch_count integer, details jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_month date := public.accounting_month_start(p_month);
  v_next_month date := (public.accounting_month_start(p_month) + interval '1 month')::date;
BEGIN
  IF NOT public.has_role(v_actor_id, 'admin') THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH stripe_success AS (
    SELECT pt.* FROM public.payment_transactions pt
    WHERE pt.created_at >= v_month::timestamptz
      AND pt.created_at < v_next_month::timestamptz
      AND COALESCE(pt.status, '') IN ('paid', 'succeeded', 'captured')
  ), expected_orders AS (
    SELECT o.id, o.total_amount::numeric AS amount, COALESCE(o.refunded_amount_chf, 0)::numeric AS refunded_amount,
      o.metadata ->> 'stripe_session_id' AS stripe_checkout_session_id,
      COALESCE(o.metadata ->> 'stripe_payment_intent', o.metadata ->> 'stripe_payment_intent_id') AS stripe_payment_intent_id
    FROM public.orders o
    WHERE o.created_at >= v_month::timestamptz
      AND o.created_at < v_next_month::timestamptz
      AND COALESCE(o.payment_status, '') IN ('paid', 'captured')
      AND COALESCE(o.status, '') NOT IN ('cancelled', 'payment_failed', 'refused', 'pending', 'pending_payment')
  ), expected_reservations AS (
    SELECT r.id, r.total_amount::numeric AS amount, COALESCE(r.refunded_amount_chf, 0)::numeric AS refunded_amount,
      r.metadata ->> 'stripe_session_id' AS stripe_checkout_session_id,
      COALESCE(r.metadata ->> 'stripe_payment_intent', r.metadata ->> 'stripe_payment_intent_id') AS stripe_payment_intent_id
    FROM public.reservations r
    WHERE r.created_at >= v_month::timestamptz
      AND r.created_at < v_next_month::timestamptz
      AND COALESCE(r.status, '') NOT IN ('cancelled', 'no_show', 'pending')
      AND r.total_amount > 0
  ), expected_campaigns AS (
    SELECT ac.id, COALESCE(ac.paid_amount, ac.total_budget, 0)::numeric AS amount, 0::numeric AS refunded_amount, ac.stripe_checkout_session_id, ac.stripe_payment_intent_id
    FROM public.ad_campaigns ac
    WHERE ac.created_at >= v_month::timestamptz
      AND ac.created_at < v_next_month::timestamptz
      AND COALESCE(ac.payment_status, '') = 'paid'
  ), order_matches AS (
    SELECT DISTINCT eo.id, ss.id AS transaction_id, ss.amount
    FROM expected_orders eo
    JOIN stripe_success ss ON (ss.order_id = eo.id OR (eo.stripe_checkout_session_id IS NOT NULL AND ss.stripe_checkout_session_id = eo.stripe_checkout_session_id) OR (eo.stripe_payment_intent_id IS NOT NULL AND ss.stripe_payment_intent_id = eo.stripe_payment_intent_id))
  ), reservation_matches AS (
    SELECT DISTINCT er.id, ss.id AS transaction_id, ss.amount
    FROM expected_reservations er
    JOIN stripe_success ss ON ((er.stripe_checkout_session_id IS NOT NULL AND ss.stripe_checkout_session_id = er.stripe_checkout_session_id) OR (er.stripe_payment_intent_id IS NOT NULL AND ss.stripe_payment_intent_id = er.stripe_payment_intent_id))
  ), campaign_matches AS (
    SELECT DISTINCT ec.id, ss.id AS transaction_id, ss.amount
    FROM expected_campaigns ec
    JOIN stripe_success ss ON ((ec.stripe_checkout_session_id IS NOT NULL AND ss.stripe_checkout_session_id = ec.stripe_checkout_session_id) OR (ec.stripe_payment_intent_id IS NOT NULL AND ss.stripe_payment_intent_id = ec.stripe_payment_intent_id))
  ), orphan_transactions AS (
    SELECT ss.* FROM stripe_success ss
    WHERE NOT EXISTS (SELECT 1 FROM order_matches om WHERE om.transaction_id = ss.id)
      AND NOT EXISTS (SELECT 1 FROM reservation_matches rm WHERE rm.transaction_id = ss.id)
      AND NOT EXISTS (SELECT 1 FROM campaign_matches cm WHERE cm.transaction_id = ss.id)
  )
  SELECT computed.item_kind, computed.expected_count::integer, computed.expected_amount, computed.received_count::integer, computed.received_amount, computed.refunded_amount, computed.orphan_count::integer, GREATEST(computed.expected_count - computed.received_count, 0)::integer AS mismatch_count, computed.details
  FROM (
    SELECT 'orders'::text AS item_kind, (SELECT count(*) FROM expected_orders) AS expected_count, COALESCE((SELECT sum(amount) FROM expected_orders), 0) AS expected_amount, (SELECT count(DISTINCT transaction_id) FROM order_matches) AS received_count, COALESCE((SELECT sum(amount) FROM order_matches), 0) AS received_amount, COALESCE((SELECT sum(refunded_amount) FROM expected_orders), 0) AS refunded_amount, 0 AS orphan_count, jsonb_build_object('source', 'orders', 'stripe_checkout_session_id', true) AS details
    UNION ALL SELECT 'reservations'::text, (SELECT count(*) FROM expected_reservations), COALESCE((SELECT sum(amount) FROM expected_reservations), 0), (SELECT count(DISTINCT transaction_id) FROM reservation_matches), COALESCE((SELECT sum(amount) FROM reservation_matches), 0), COALESCE((SELECT sum(refunded_amount) FROM expected_reservations), 0), 0, jsonb_build_object('source', 'reservations', 'stripe_checkout_session_id', true)
    UNION ALL SELECT 'campaigns'::text, (SELECT count(*) FROM expected_campaigns), COALESCE((SELECT sum(amount) FROM expected_campaigns), 0), (SELECT count(DISTINCT transaction_id) FROM campaign_matches), COALESCE((SELECT sum(amount) FROM campaign_matches), 0), 0, 0, jsonb_build_object('source', 'ad_campaigns', 'stripe_checkout_session_id', true)
    UNION ALL SELECT 'orphans'::text, 0, 0, (SELECT count(*) FROM orphan_transactions), COALESCE((SELECT sum(amount) FROM orphan_transactions), 0), 0, (SELECT count(*) FROM orphan_transactions), jsonb_build_object('source', 'payment_transactions', 'orphan_count', (SELECT count(*) FROM orphan_transactions))
  ) AS computed
  ORDER BY computed.item_kind;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_cancellation_fraud_metrics(p_month date)
 RETURNS TABLE(restaurant_id uuid, restaurant_name text, confirmed_count integer, cancelled_by_restaurant_count integer, cancellation_rate numeric, late_cancellations_count integer, top_reason_code text, top_reason_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
BEGIN
  IF NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT r.*, rest.name AS rname
    FROM public.reservations r
    JOIN public.restaurants rest ON rest.id = r.restaurant_id
    WHERE r.date BETWEEN v_start AND v_end
  ),
  agg AS (
    SELECT
      b.restaurant_id,
      MAX(b.rname) AS restaurant_name,
      COUNT(*) FILTER (WHERE b.confirmed_at IS NOT NULL)::integer AS confirmed_count,
      COUNT(*) FILTER (WHERE b.cancelled_by = 'restaurant')::integer AS cancelled_by_restaurant_count,
      COUNT(*) FILTER (
        WHERE b.cancelled_by = 'restaurant'
          AND b.cancelled_at IS NOT NULL
          AND ((b.date::timestamp + b.time::time) AT TIME ZONE 'UTC' - b.cancelled_at) < interval '2 hours'
      )::integer AS late_cancellations_count
    FROM base b
    GROUP BY b.restaurant_id
  ),
  reasons AS (
    SELECT
      b.restaurant_id,
      b.cancellation_reason_code,
      COUNT(*)::integer AS reason_count,
      ROW_NUMBER() OVER (
        PARTITION BY b.restaurant_id
        ORDER BY COUNT(*) DESC
      ) AS rn
    FROM base b
    WHERE b.cancelled_by = 'restaurant'
      AND b.cancellation_reason_code IS NOT NULL
    GROUP BY b.restaurant_id, b.cancellation_reason_code
  )
  SELECT
    a.restaurant_id,
    a.restaurant_name,
    a.confirmed_count,
    a.cancelled_by_restaurant_count,
    CASE WHEN a.confirmed_count > 0
         THEN ROUND((a.cancelled_by_restaurant_count::numeric / a.confirmed_count) * 100, 2)
         ELSE 0
    END AS cancellation_rate,
    a.late_cancellations_count,
    (SELECT r.cancellation_reason_code FROM reasons r WHERE r.restaurant_id = a.restaurant_id AND r.rn = 1) AS top_reason_code,
    (SELECT r.reason_count FROM reasons r WHERE r.restaurant_id = a.restaurant_id AND r.rn = 1) AS top_reason_count
  FROM agg a
  ORDER BY cancellation_rate DESC NULLS LAST, a.cancelled_by_restaurant_count DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_review_status(p_review_id uuid, p_status text, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_old jsonb;
begin
  if v_user_id is null or not public.has_role(v_user_id, 'admin') then
    raise exception 'Admin role required';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Reason required';
  end if;
  select to_jsonb(r) into v_old from public.reviews r where r.id = p_review_id;
  if v_old is null then raise exception 'Review not found'; end if;
  update public.reviews
  set status = p_status,
      moderation_reason = p_reason,
      moderated_by = v_user_id,
      moderated_at = now(),
      archived_at = case when p_status in ('archived','deleted','hidden') then coalesce(archived_at, now()) else archived_at end
  where id = p_review_id;
  perform public.admin_log_admin_action('admin_update_review_status', 'review', p_review_id, v_old, jsonb_build_object('status', p_status, 'reason', p_reason));
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.build_accounting_month_official_totals(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month date := public.accounting_month_start(p_month);
  v_next_month date := (public.accounting_month_start(p_month) + interval '1 month')::date;
  v_totals jsonb;
BEGIN
  SELECT jsonb_build_object(
    'orders', COALESCE((
      SELECT jsonb_build_object('count', count(*), 'gross_amount', COALESCE(sum(o.total_amount), 0), 'refunded_amount', COALESCE(sum(COALESCE(o.refunded_amount_chf, 0)), 0))
      FROM public.orders o
      WHERE o.created_at >= v_month::timestamptz
        AND o.created_at < v_next_month::timestamptz
        AND COALESCE(o.payment_status, '') IN ('paid', 'captured')
        AND COALESCE(o.status, '') NOT IN ('cancelled', 'payment_failed', 'refused', 'pending', 'pending_payment')
    ), '{}'::jsonb),
    'reservations', COALESCE((
      SELECT jsonb_build_object('count', count(*), 'gross_amount', COALESCE(sum(r.total_amount), 0), 'reservation_fees', COALESCE(sum(r.billing_fee_chf), 0), 'refunded_amount', COALESCE(sum(COALESCE(r.refunded_amount_chf, 0)), 0))
      FROM public.reservations r
      WHERE r.created_at >= v_month::timestamptz
        AND r.created_at < v_next_month::timestamptz
        AND COALESCE(r.status, '') NOT IN ('cancelled', 'no_show', 'pending')
    ), '{}'::jsonb),
    'campaigns', COALESCE((
      SELECT jsonb_build_object('count', count(*), 'paid_amount', COALESCE(sum(COALESCE(ac.paid_amount, ac.total_budget, 0)), 0))
      FROM public.ad_campaigns ac
      WHERE ac.created_at >= v_month::timestamptz
        AND ac.created_at < v_next_month::timestamptz
        AND COALESCE(ac.payment_status, '') = 'paid'
    ), '{}'::jsonb),
    'invoices', COALESCE((
      SELECT jsonb_build_object('count', count(*), 'amount_ttc', COALESCE(sum(ri.amount_ttc), 0), 'paid_amount_ttc', COALESCE(sum(ri.amount_ttc) FILTER (WHERE COALESCE(ri.status, '') = 'paid'), 0), 'open_amount_ttc', COALESCE(sum(ri.amount_ttc) FILTER (WHERE COALESCE(ri.status, '') <> 'paid'), 0))
      FROM public.restaurant_invoices ri
      WHERE ri.period_start >= v_month
        AND ri.period_start < v_next_month
    ), '{}'::jsonb),
    'stripe', COALESCE((
      SELECT jsonb_build_object('count', count(*), 'amount', COALESCE(sum(pt.amount), 0), 'succeeded_amount', COALESCE(sum(pt.amount) FILTER (WHERE COALESCE(pt.status, '') IN ('paid', 'succeeded', 'captured')), 0), 'failed_count', count(*) FILTER (WHERE COALESCE(pt.status, '') IN ('failed', 'canceled', 'cancelled')))
      FROM public.payment_transactions pt
      WHERE pt.created_at >= v_month::timestamptz
        AND pt.created_at < v_next_month::timestamptz
    ), '{}'::jsonb)
  ) INTO v_totals;
  RETURN v_totals;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_restaurant_payout_invoice(p_restaurant_id uuid, p_month date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  target_month date;
  period_s date;
  period_e date;
  ext_period record;
  inv_count integer := 0;
  next_num integer;
  rev numeric;
  za_rev numeric;
  tva_rate numeric := 0.077;
BEGIN
  -- Si p_month est null, on prend le mois dernier complet, sinon le mois demandé.
  target_month := COALESCE(p_month::date, (date_trunc('month', now()) - interval '1 month')::date);
  period_s := date_trunc('month', target_month)::date;
  period_e := (period_s + interval '1 month' - interval '1 day')::date;

  -- Vérif si déjà facturé
  IF EXISTS (
    SELECT 1
    FROM restaurant_invoices
    WHERE restaurant_id = p_restaurant_id
      AND period_start = period_s
      AND period_end = period_e
  ) THEN
    RETURN 0;
  END IF;

  -- "encaissement Tok": Les commandes standard.
  -- On recalcule le montant brut en ajoutant les Miamz (points_discount_amount) si présents.
  -- Car Tok encaisse le total, et prend en charge les Miamz. Le restaurant récupère 90% de : (Paiement client + Miamz).
  SELECT COALESCE(SUM(total_amount + COALESCE((metadata->>'points_discount_amount')::numeric, 0)), 0) INTO rev
  FROM orders
  WHERE restaurant_id = p_restaurant_id
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed')
    AND created_at >= period_s::timestamptz
    AND created_at < (period_e + interval '1 day')::timestamptz;

  -- Ventes zero-attente (Réservations, sans miamz car pas dispo dessus pour l'instant)
  SELECT COALESCE(SUM(total_amount), 0) INTO za_rev
  FROM reservations
  WHERE restaurant_id = p_restaurant_id
    AND lower(COALESCE(feature, '')) = 'zero-attente'
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show')
    AND total_amount > 0
    AND date >= period_s
    AND date <= period_e;

  rev := rev + za_rev;

  -- Le restaurant facture Tok pour 90% de ce total brut
  rev := rev * 0.90;

  IF rev > 0 THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS integer)), 0) + 1
    INTO next_num
    FROM restaurant_invoices
    WHERE restaurant_id = p_restaurant_id;

    INSERT INTO restaurant_invoices (
      restaurant_id,
      period_start,
      period_end,
      amount_ht,
      amount_tva,
      amount_ttc,
      status,
      invoice_number,
      due_at
    )
    VALUES (
      p_restaurant_id,
      period_s,
      period_e,
      ROUND(rev / (1 + tva_rate), 2),
      ROUND(rev - rev / (1 + tva_rate), 2),
      ROUND(rev, 2),
      'draft', -- Draft so they can preview it, or 'pending' meaning Tok owes them.
      'FAC-' || TO_CHAR(period_s, 'YYYYMM') || '-' || LPAD(next_num::text, 4, '0'),
      (period_e + interval '30 days')::timestamptz
    );
    inv_count := 1;
  END IF;

  RETURN inv_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_restaurant_payout_invoice(p_restaurant_id uuid, p_month text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv_id uuid;
  next_num integer;
  rev numeric := 0;
  res_rev numeric := 0;
  tva_rate numeric := 0.077;
  unpaid_orders_count integer := 0;
  unpaid_reservations_count integer := 0;
  min_date timestamptz;
  max_date timestamptz;
  inv_period_s date;
  inv_period_e date;
BEGIN
  SELECT
    COUNT(id),
    COALESCE(SUM(total_amount + COALESCE((metadata->>'points_discount_amount')::numeric, 0)), 0),
    MIN(created_at),
    MAX(created_at)
  INTO unpaid_orders_count, rev, min_date, max_date
  FROM public.orders
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed', 'pending')
    AND lower(COALESCE(payment_status, '')) IN ('paid', 'captured');

  SELECT
    COUNT(id),
    COALESCE(SUM(total_amount), 0),
    LEAST(min_date, MIN(created_at)),
    GREATEST(max_date, MAX(created_at))
  INTO unpaid_reservations_count, res_rev, min_date, max_date
  FROM public.reservations
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show', 'pending')
    AND total_amount > 0;

  IF unpaid_orders_count = 0 AND unpaid_reservations_count = 0 THEN
    RETURN 0;
  END IF;

  rev := rev + res_rev;
  rev := rev * 0.90;

  inv_period_s := COALESCE(min_date::date, CURRENT_DATE);
  inv_period_e := COALESCE(max_date::date, CURRENT_DATE);

  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS integer)), 0) + 1
  INTO next_num
  FROM public.restaurant_invoices
  WHERE restaurant_id = p_restaurant_id
    AND COALESCE(invoice_type, 'payout') = 'payout';

  INSERT INTO public.restaurant_invoices (
    restaurant_id,
    period_start,
    period_end,
    amount_ht,
    amount_tva,
    amount_ttc,
    status,
    invoice_number,
    due_at,
    invoice_type
  )
  VALUES (
    p_restaurant_id,
    inv_period_s,
    inv_period_e,
    ROUND(rev / (1 + tva_rate), 2),
    ROUND(rev - rev / (1 + tva_rate), 2),
    ROUND(rev, 2),
    'pending',
    'FAC-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || LPAD(next_num::text, 4, '0'),
    (CURRENT_DATE + interval '30 days')::timestamptz,
    'payout'
  )
  RETURNING id INTO inv_id;

  UPDATE public.orders
  SET restaurant_invoice_id = inv_id
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refused', 'payment_failed', 'pending')
    AND lower(COALESCE(payment_status, '')) IN ('paid', 'captured');

  UPDATE public.reservations
  SET restaurant_invoice_id = inv_id
  WHERE restaurant_id = p_restaurant_id
    AND restaurant_invoice_id IS NULL
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'no_show', 'pending')
    AND total_amount > 0;

  RETURN 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_restaurant_payout_invoice_rpc(p_restaurant_id uuid, p_month text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.generate_restaurant_payout_invoice(p_restaurant_id, p_month::text);
$function$
;

CREATE OR REPLACE FUNCTION public.get_reservation_slot_capacity(p_service_settings jsonb, p_time time without time zone)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_capacity integer := GREATEST(COALESCE((p_service_settings ->> 'max_tables_per_slot')::integer, 10), 1);
  v_window jsonb;
  v_start time;
  v_end time;
BEGIN
  FOR v_window IN
    SELECT value
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(p_service_settings -> 'slot_capacity_windows') = 'array' THEN p_service_settings -> 'slot_capacity_windows'
        ELSE '[]'::jsonb
      END
    )
  LOOP
    BEGIN
      v_start := (v_window ->> 'start_time')::time;
      v_end := (v_window ->> 'end_time')::time;
      IF p_time >= v_start AND p_time <= v_end THEN
        v_capacity := GREATEST(COALESCE((v_window ->> 'max_tables')::integer, v_capacity), 1);
        EXIT;
      END IF;
    EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation THEN
      CONTINUE;
    END;
  END LOOP;

  RETURN v_capacity;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_restaurant_payment_history(p_restaurant_id uuid, p_limit integer DEFAULT 100, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(event_id uuid, event_kind text, direction text, occurred_at timestamp with time zone, amount numeric, currency text, status text, title text, subtitle text, payment_method text, order_id uuid, campaign_id uuid, invoice_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
BEGIN
  IF NOT v_is_service_role AND v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT v_is_service_role
    AND NOT public.has_role(v_actor_id, 'admin')
    AND NOT EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = p_restaurant_id
        AND r.owner_id = v_actor_id
    ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH requested_events AS (
    SELECT
      pt.id AS event_id,
      CASE
        WHEN pt.type = 'refund' THEN 'order_refund'
        ELSE 'order_charge'
      END::text AS event_kind,
      CASE
        WHEN pt.type = 'refund' THEN 'issued'
        ELSE 'received'
      END::text AS direction,
      pt.created_at AS occurred_at,
      pt.amount,
      lower(COALESCE(NULLIF(pt.currency, ''), 'chf')) AS currency,
      pt.status,
      CASE
        WHEN pt.type = 'refund' THEN 'Remboursement client'
        ELSE 'Commande payee'
      END::text AS title,
      CONCAT(
        'Commande ',
        COALESCE(
          NULLIF(o.order_number, ''),
          NULLIF(pt.metadata ->> 'order_reference', ''),
          '#' || left(o.id::text, 8)
        )
      )::text AS subtitle,
      NULLIF(
        trim(
          COALESCE(
            CASE
              WHEN NULLIF(pt.metadata ->> 'card_brand', '') IS NOT NULL
                AND NULLIF(pt.metadata ->> 'card_last4', '') IS NOT NULL
                THEN initcap(pt.metadata ->> 'card_brand') || ' **** ' || (pt.metadata ->> 'card_last4')
              WHEN NULLIF(pt.metadata ->> 'card_brand', '') IS NOT NULL
                THEN initcap(pt.metadata ->> 'card_brand')
              ELSE NULL
            END,
            CASE
              WHEN NULLIF(o.metadata ->> 'card_brand', '') IS NOT NULL
                AND NULLIF(o.metadata ->> 'card_last4', '') IS NOT NULL
                THEN initcap(o.metadata ->> 'card_brand') || ' **** ' || (o.metadata ->> 'card_last4')
              WHEN NULLIF(o.metadata ->> 'card_brand', '') IS NOT NULL
                THEN initcap(o.metadata ->> 'card_brand')
              ELSE NULL
            END,
            NULLIF(pt.metadata ->> 'payment_method', ''),
            NULLIF(o.metadata ->> 'payment_method', '')
          )
        ),
        ''
      ) AS payment_method,
      o.id AS order_id,
      NULL::uuid AS campaign_id,
      NULL::uuid AS invoice_id
    FROM public.payment_transactions pt
    JOIN public.orders o ON o.id = pt.order_id
    WHERE o.restaurant_id = p_restaurant_id
      AND pt.type IN ('charge', 'refund')

    UNION ALL

    SELECT
      c.id AS event_id,
      'campaign_payment'::text AS event_kind,
      'issued'::text AS direction,
      COALESCE(c.paid_at, c.activated_at, c.updated_at, c.created_at) AS occurred_at,
      CASE
        WHEN COALESCE(c.paid_amount, 0) > 0 THEN c.paid_amount
        ELSE COALESCE(c.total_budget, 0)
      END AS amount,
      'chf'::text AS currency,
      CASE
        WHEN c.payment_status = 'paid' THEN 'succeeded'
        ELSE COALESCE(c.payment_status, 'pending')
      END::text AS status,
      'Campagne payee'::text AS title,
      COALESCE(NULLIF(c.title, ''), 'Campagne')::text AS subtitle,
      NULLIF(trim(COALESCE(c.payment_method, '')), '') AS payment_method,
      NULL::uuid AS order_id,
      c.id AS campaign_id,
      NULL::uuid AS invoice_id
    FROM public.ad_campaigns c
    WHERE c.restaurant_id = p_restaurant_id
      AND COALESCE(c.payment_status, 'unpaid') <> 'unpaid'

    UNION ALL

    SELECT
      i.id AS event_id,
      'invoice_payment'::text AS event_kind,
      CASE
        WHEN COALESCE(i.invoice_type, 'payout') = 'reservation_fees' THEN 'issued'
        ELSE 'received'
      END::text AS direction,
      COALESCE(i.paid_at, i.updated_at, i.created_at) AS occurred_at,
      i.amount_ttc AS amount,
      'chf'::text AS currency,
      'succeeded'::text AS status,
      CASE
        WHEN COALESCE(i.invoice_type, 'payout') = 'reservation_fees' THEN 'Facture TOK reglee'
        ELSE 'Facture restaurateur reglee par TOK'
      END::text AS title,
      COALESCE(
        NULLIF(i.invoice_number, ''),
        'Periode ' || to_char(i.period_start, 'MM/YYYY') || ' - ' || to_char(i.period_end, 'MM/YYYY')
      )::text AS subtitle,
      NULL::text AS payment_method,
      NULL::uuid AS order_id,
      NULL::uuid AS campaign_id,
      i.id AS invoice_id
    FROM public.restaurant_invoices i
    WHERE i.restaurant_id = p_restaurant_id
      AND (i.status = 'paid' OR i.paid_at IS NOT NULL)
  )
  SELECT
    requested_events.event_id,
    requested_events.event_kind,
    requested_events.direction,
    requested_events.occurred_at,
    requested_events.amount,
    requested_events.currency,
    requested_events.status,
    requested_events.title,
    requested_events.subtitle,
    requested_events.payment_method,
    requested_events.order_id,
    requested_events.campaign_id,
    requested_events.invoice_id
  FROM requested_events
  WHERE p_before IS NULL OR requested_events.occurred_at < p_before
  ORDER BY requested_events.occurred_at DESC, requested_events.event_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_restaurant_reservation_slot_availability(p_restaurant_id uuid, p_date date)
 RETURNS TABLE(slot_time time without time zone, service text, capacity integer, reserved_tables integer, remaining_tables integer, available boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_opening_hours jsonb;
  v_supports_reservation boolean;
  v_service_key text;
  v_service_settings jsonb;
  v_start time;
  v_last time;
  v_slot time;
  v_step interval;
  v_slot_capacity integer;
  v_reserved integer;
BEGIN
  SELECT opening_hours, COALESCE(supports_reservation, false)
  INTO v_opening_hours, v_supports_reservation
  FROM public.restaurants
  WHERE id = p_restaurant_id
    AND COALESCE(is_active, true) = true;

  IF NOT FOUND OR NOT v_supports_reservation THEN
    RETURN;
  END IF;

  FOREACH v_service_key IN ARRAY ARRAY['lunch', 'dinner']
  LOOP
    v_service_settings := COALESCE(
      v_opening_hours -> 'service_settings' -> v_service_key,
      v_opening_hours -> v_service_key,
      CASE
        WHEN v_service_key = 'lunch' THEN jsonb_build_object(
          'start_time', '12:00',
          'end_time', '14:30',
          'last_reservation_time', '14:00',
          'max_covers', 60,
          'max_tables_per_slot', 8,
          'slot_interval_minutes', 30,
          'slot_capacity_windows', jsonb_build_array(jsonb_build_object('start_time', '12:00', 'end_time', '14:00', 'max_tables', 8)),
          'min_party_size', 1,
          'max_party_size', 8,
          'online_booking_enabled', true,
          'service_closed', false
        )
        ELSE jsonb_build_object(
          'start_time', '19:00',
          'end_time', '22:30',
          'last_reservation_time', '22:00',
          'max_covers', 80,
          'max_tables_per_slot', 10,
          'slot_interval_minutes', 30,
          'slot_capacity_windows', jsonb_build_array(jsonb_build_object('start_time', '19:00', 'end_time', '22:00', 'max_tables', 10)),
          'min_party_size', 1,
          'max_party_size', 10,
          'online_booking_enabled', true,
          'service_closed', false
        )
      END
    );

    IF NOT COALESCE((v_service_settings ->> 'online_booking_enabled')::boolean, true)
      OR COALESCE((v_service_settings ->> 'service_closed')::boolean, false) THEN
      CONTINUE;
    END IF;

    BEGIN
      v_start := COALESCE((v_service_settings ->> 'start_time')::time, '19:00'::time);
      v_last := COALESCE((v_service_settings ->> 'last_reservation_time')::time, v_start);
      v_step := make_interval(mins => GREATEST(COALESCE((v_service_settings ->> 'slot_interval_minutes')::integer, 30), 5));
    EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation THEN
      CONTINUE;
    END;

    v_slot := v_start;
    WHILE v_slot <= v_last LOOP
      v_slot_capacity := public.get_reservation_slot_capacity(v_service_settings, v_slot);

      SELECT count(*)::integer
      INTO v_reserved
      FROM public.reservations r
      WHERE r.restaurant_id = p_restaurant_id
        AND r.date = p_date
        AND r.time = v_slot
        AND r.status NOT IN ('cancelled', 'no_show');

      slot_time := v_slot;
      service := v_service_key;
      capacity := v_slot_capacity;
      reserved_tables := v_reserved;
      remaining_tables := GREATEST(v_slot_capacity - v_reserved, 0);
      available := remaining_tables > 0;
      RETURN NEXT;

      v_slot := (v_slot + v_step)::time;
    END LOOP;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_truthy_text(p_value text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT lower(trim(COALESCE(p_value, ''))) IN ('1', 'true', 'yes', 'oui');
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_verified_review(p_restaurant_id uuid, p_rating integer, p_service_rating integer, p_quality_rating integer, p_speed_rating integer, p_comment text DEFAULT NULL::text, p_tags text[] DEFAULT '{}'::text[], p_reservation_id uuid DEFAULT NULL::uuid, p_order_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_eligible boolean := false;
  v_review_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  IF p_rating NOT BETWEEN 1 AND 10
     OR p_service_rating NOT BETWEEN 1 AND 10
     OR p_quality_rating NOT BETWEEN 1 AND 10
     OR p_speed_rating NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'rating_out_of_range';
  END IF;

  IF p_reservation_id IS NOT NULL THEN
    SELECT TRUE INTO v_eligible
    FROM public.reservations
    WHERE id = p_reservation_id
      AND user_id = v_user
      AND restaurant_id = p_restaurant_id
      AND status = 'arrived';
  END IF;

  IF NOT v_eligible AND p_order_id IS NOT NULL THEN
    SELECT TRUE INTO v_eligible
    FROM public.orders
    WHERE id = p_order_id
      AND user_id = v_user
      AND restaurant_id = p_restaurant_id
      AND lower(COALESCE(status, '')) IN ('delivered', 'completed', 'ready_for_pickup', 'picked_up');
  END IF;

  IF NOT v_eligible THEN
    SELECT TRUE INTO v_eligible
    FROM public.reservations
    WHERE user_id = v_user
      AND restaurant_id = p_restaurant_id
      AND status = 'arrived'
    LIMIT 1;
  END IF;

  IF NOT v_eligible THEN
    SELECT TRUE INTO v_eligible
    FROM public.orders
    WHERE user_id = v_user
      AND restaurant_id = p_restaurant_id
      AND lower(COALESCE(status, '')) IN ('delivered', 'completed', 'ready_for_pickup', 'picked_up')
    LIMIT 1;
  END IF;

  IF NOT v_eligible THEN
    RAISE EXCEPTION 'review_not_eligible';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reviews
    WHERE user_id = v_user AND restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'review_already_submitted';
  END IF;

  INSERT INTO public.reviews (
    restaurant_id, user_id, rating, quality_rating, service_rating, speed_rating,
    comment, tags, order_id, status
  )
  VALUES (
    p_restaurant_id, v_user, p_rating, p_quality_rating, p_service_rating, p_speed_rating,
    NULLIF(trim(COALESCE(p_comment, '')), ''),
    COALESCE(p_tags, '{}'::text[]),
    p_order_id,
    'published'
  )
  RETURNING id INTO v_review_id;

  RETURN v_review_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_social_post_promotion_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.social_post_promotions
  SET
    status = CASE
      WHEN NEW.payment_status = 'paid' AND NEW.status = 'active' THEN 'active'
      WHEN NEW.status = 'paused' THEN 'paused'
      WHEN NEW.status = 'ended' THEN 'ended'
      ELSE 'pending_payment'
    END,
    updated_at = now()
  WHERE campaign_id = NEW.id;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_guard_locked_order_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF public.is_special_paid_order_locked(
    OLD.id,
    OLD.payment_status,
    OLD.metadata
  ) THEN
    RAISE EXCEPTION 'Cette commande speciale payee ne peut plus changer de statut.';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_guard_locked_reservation_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF lower(COALESCE(OLD.status, '')) = 'cancelled' THEN
    RAISE EXCEPTION 'Cette reservation a deja ete annulee et son statut est verrouille.';
  END IF;

  IF public.is_special_paid_reservation_locked(
    OLD.feature,
    OLD.status,
    OLD.total_amount,
    OLD.metadata
  ) THEN
    RAISE EXCEPTION 'Cette reservation payee ne peut plus changer de statut.';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_and_create_reservation(p_restaurant_id uuid, p_date date, p_time time without time zone, p_party_size integer, p_feature text DEFAULT 'classique'::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_opening_hours jsonb;
  v_max_covers integer;
  v_existing integer;
  v_service_settings jsonb;
  v_service_key text;
  v_hour integer;
  v_dup_count integer;
  v_existing_dup_id uuid;
  v_existing_dup_paid boolean;
  v_existing_dup_total numeric;
  v_existing_dup_meta jsonb;
  v_reservation_id uuid;
  v_online_booking_enabled boolean;
  v_service_closed boolean;
  v_min_party_size integer;
  v_max_party_size integer;
  v_last_reservation_time time;
  v_slot_capacity integer;
  v_slot_reserved integer;
  v_is_service_role boolean := auth.role() = 'service_role';
  v_effective_user_id uuid;
  v_metadata_raw jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_metadata jsonb;
  v_checkout_session_id text := NULLIF(trim(COALESCE(v_metadata_raw ->> 'checkout_session_id', '')), '');
  v_payment_method text := NULLIF(trim(COALESCE(v_metadata_raw ->> 'payment_method', '')), '');
  v_total_amount numeric := GREATEST(COALESCE(NULLIF(v_metadata_raw ->> 'total_amount', '')::numeric, 0), 0);
  v_order_reference text := NULLIF(trim(COALESCE(v_metadata_raw ->> 'order_reference', '')), '');
  v_preorder_items jsonb := CASE
    WHEN jsonb_typeof(v_metadata_raw -> 'preorder_items') = 'array' THEN v_metadata_raw -> 'preorder_items'
    WHEN jsonb_typeof(v_metadata_raw -> 'drops') = 'array' THEN v_metadata_raw -> 'drops'
    ELSE '[]'::jsonb
  END;
  v_paid boolean := COALESCE((v_metadata_raw ->> 'paid')::boolean, false);
  v_status text := 'pending';
  v_supports_reservation boolean := false;
  v_supports_dinein boolean := false;
  v_feature_normalized text := lower(COALESCE(p_feature, ''));
  v_ref_prefix text;
BEGIN
  IF v_is_service_role THEN
    IF COALESCE(v_metadata_raw ->> '_internal_user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Internal user id requis.';
    END IF;
    v_effective_user_id := (v_metadata_raw ->> '_internal_user_id')::uuid;
    v_metadata := v_metadata_raw - '_internal_user_id';
  ELSE
    v_effective_user_id := auth.uid();
    IF v_effective_user_id IS NULL THEN
      RAISE EXCEPTION 'Authentication required';
    END IF;
    v_metadata := v_metadata_raw
      - '_internal_user_id'
      - 'paid'
      - 'card_brand'
      - 'card_last4'
      - 'checkout_session_id';
  END IF;

  IF v_order_reference IS NULL OR trim(v_order_reference) = '' THEN
    v_ref_prefix := CASE v_feature_normalized
      WHEN 'zero-attente' THEN 'ZA'
      WHEN 'chefs_table' THEN 'CT'
      WHEN 'promo-formule' THEN 'PF'
      ELSE 'RES'
    END;
    v_order_reference := public.generate_reference_number(v_ref_prefix);
  END IF;

  SELECT opening_hours, COALESCE(supports_reservation, false), COALESCE(supports_dinein, false)
  INTO v_opening_hours, v_supports_reservation, v_supports_dinein
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant introuvable.';
  END IF;

  IF v_feature_normalized = 'zero-attente' THEN
    IF NOT public.is_feature_flag_active('zero-attente') THEN
      RAISE EXCEPTION 'Zero Attente est desactive globalement.';
    END IF;
    IF NOT public.is_feature_flag_active('reservation') OR NOT public.is_feature_flag_active('sur-place') THEN
      RAISE EXCEPTION 'Zero Attente requiert Reservation et Sur place.';
    END IF;
    IF NOT v_supports_reservation OR NOT v_supports_dinein THEN
      RAISE EXCEPTION 'Ce restaurant ne propose pas Zero Attente.';
    END IF;
  ELSE
    IF NOT public.is_feature_flag_active('reservation') THEN
      RAISE EXCEPTION 'Les reservations sont desactivees globalement.';
    END IF;
    IF NOT v_supports_reservation THEN
      RAISE EXCEPTION 'Ce restaurant n''accepte pas les reservations.';
    END IF;
  END IF;

  IF v_feature_normalized = 'zero-attente' THEN
    IF NOT v_is_service_role THEN
      RAISE EXCEPTION 'La reservation Zero Attente doit etre finalisee via le paiement securise.';
    END IF;

    IF NOT v_paid OR v_checkout_session_id IS NULL THEN
      RAISE EXCEPTION 'Paiement verifie requis pour Zero Attente.';
    END IF;

    SELECT id
    INTO v_reservation_id
    FROM public.reservations
    WHERE user_id = v_effective_user_id
      AND restaurant_id = p_restaurant_id
      AND lower(COALESCE(feature, '')) = 'zero-attente'
      AND metadata ->> 'checkout_session_id' = v_checkout_session_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN v_reservation_id;
    END IF;

    v_status := 'confirmed';
  END IF;

  IF v_feature_normalized = 'chefs_table' AND v_is_service_role AND v_paid AND v_checkout_session_id IS NOT NULL THEN
    SELECT id
    INTO v_reservation_id
    FROM public.reservations
    WHERE user_id = v_effective_user_id
      AND restaurant_id = p_restaurant_id
      AND lower(COALESCE(feature, '')) = 'chefs_table'
      AND metadata ->> 'checkout_session_id' = v_checkout_session_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN v_reservation_id;
    END IF;

    v_status := 'confirmed';
  END IF;

  SELECT id,
         COALESCE((metadata ->> 'paid')::boolean, false),
         COALESCE(total_amount, 0),
         COALESCE(metadata, '{}'::jsonb)
  INTO v_existing_dup_id, v_existing_dup_paid, v_existing_dup_total, v_existing_dup_meta
  FROM public.reservations
  WHERE user_id = v_effective_user_id
    AND restaurant_id = p_restaurant_id
    AND date = p_date
    AND time = p_time
    AND status NOT IN ('cancelled', 'no_show')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_feature_normalized = 'chefs_table' AND (
      v_existing_dup_paid
      OR v_existing_dup_total > 0
      OR (
        v_checkout_session_id IS NOT NULL
        AND NULLIF(trim(COALESCE(v_existing_dup_meta ->> 'checkout_session_id', '')), '') = v_checkout_session_id
      )
    ) THEN
      RETURN v_existing_dup_id;
    END IF;

    SELECT count(*) INTO v_dup_count
    FROM public.reservations
    WHERE user_id = v_effective_user_id
      AND restaurant_id = p_restaurant_id
      AND date = p_date
      AND time = p_time
      AND status NOT IN ('cancelled', 'no_show');

    IF v_dup_count > 0 THEN
      RAISE EXCEPTION 'Vous avez deja une reservation a cette date et heure.';
    END IF;
  END IF;

  v_hour := EXTRACT(HOUR FROM p_time);
  IF v_hour < 15 THEN
    v_service_key := 'lunch';
  ELSE
    v_service_key := 'dinner';
  END IF;

  IF v_opening_hours IS NOT NULL THEN
    v_service_settings := COALESCE(
      v_opening_hours -> 'service_settings' -> v_service_key,
      v_opening_hours -> v_service_key,
      '{}'::jsonb
    );
  ELSIF v_feature_normalized = 'chefs_table' THEN
    v_service_settings := CASE
      WHEN v_service_key = 'lunch' THEN jsonb_build_object(
        'start_time', '12:00',
        'end_time', '14:30',
        'last_reservation_time', '14:00',
        'max_covers', 60,
        'max_tables_per_slot', 8,
        'slot_interval_minutes', 30,
        'slot_capacity_windows', jsonb_build_array(jsonb_build_object('start_time', '12:00', 'end_time', '14:00', 'max_tables', 8)),
        'min_party_size', 1,
        'max_party_size', 8,
        'online_booking_enabled', true,
        'service_closed', false
      )
      ELSE jsonb_build_object(
        'start_time', '19:00',
        'end_time', '22:30',
        'last_reservation_time', '22:00',
        'max_covers', 80,
        'max_tables_per_slot', 10,
        'slot_interval_minutes', 30,
        'slot_capacity_windows', jsonb_build_array(jsonb_build_object('start_time', '19:00', 'end_time', '22:00', 'max_tables', 10)),
        'min_party_size', 1,
        'max_party_size', 10,
        'online_booking_enabled', true,
        'service_closed', false
      )
    END;
  ELSIF v_feature_normalized <> 'zero-attente' THEN
    RAISE EXCEPTION 'Les horaires du restaurant ne sont pas configures.';
  END IF;

  IF v_service_settings IS NOT NULL THEN
    v_online_booking_enabled := COALESCE((v_service_settings ->> 'online_booking_enabled')::boolean, true);
    v_service_closed := COALESCE((v_service_settings ->> 'service_closed')::boolean, false);
    v_min_party_size := COALESCE((v_service_settings ->> 'min_party_size')::integer, 1);
    v_max_party_size := COALESCE((v_service_settings ->> 'max_party_size')::integer, 20);
    v_max_covers := COALESCE((v_service_settings ->> 'max_covers')::integer, 50);
    v_last_reservation_time := COALESCE((v_service_settings ->> 'last_reservation_time')::time, p_time);

    IF v_feature_normalized <> 'zero-attente' THEN
      IF NOT v_online_booking_enabled OR v_service_closed THEN
        RAISE EXCEPTION 'Les reservations sont fermees pour ce service.';
      END IF;

      IF p_party_size < v_min_party_size OR p_party_size > v_max_party_size THEN
        RAISE EXCEPTION 'Le nombre de convives doit etre compris entre % et % pour ce service.', v_min_party_size, v_max_party_size;
      END IF;

      IF p_time > v_last_reservation_time THEN
        RAISE EXCEPTION 'La derniere reservation pour ce service est a %.', to_char(v_last_reservation_time, 'HH24:MI');
      END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('reservation-slot:' || p_restaurant_id::text || ':' || p_date::text || ':' || p_time::text));

    v_slot_capacity := public.get_reservation_slot_capacity(v_service_settings, p_time);
    SELECT count(*)::integer INTO v_slot_reserved
    FROM public.reservations
    WHERE restaurant_id = p_restaurant_id
      AND date = p_date
      AND time = p_time
      AND status NOT IN ('cancelled', 'no_show');

    IF v_slot_reserved >= v_slot_capacity THEN
      RAISE EXCEPTION 'Ce creneau est complet. Choisissez une autre heure.';
    END IF;

    SELECT COALESCE(sum(party_size), 0) INTO v_existing
    FROM public.reservations
    WHERE restaurant_id = p_restaurant_id
      AND date = p_date
      AND status NOT IN ('cancelled', 'no_show')
      AND CASE
        WHEN v_service_key = 'lunch' THEN EXTRACT(HOUR FROM time) < 15
        ELSE EXTRACT(HOUR FROM time) >= 15
      END;

    IF v_existing + p_party_size > v_max_covers THEN
      RAISE EXCEPTION 'Capacite depassee pour ce service. Places restantes : %', GREATEST(v_max_covers - v_existing, 0);
    END IF;
  END IF;

  INSERT INTO public.reservations (
    user_id,
    restaurant_id,
    date,
    time,
    party_size,
    status,
    feature,
    preorder_items,
    metadata,
    notes,
    total_amount,
    payment_method,
    order_reference,
    updated_at
  )
  VALUES (
    v_effective_user_id,
    p_restaurant_id,
    p_date,
    p_time,
    p_party_size,
    v_status,
    p_feature,
    v_preorder_items,
    v_metadata,
    p_notes,
    v_total_amount,
    v_payment_method,
    v_order_reference,
    now()
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$function$
;

grant delete on table "public"."admin_marketplace_alert_events" to "anon";

grant insert on table "public"."admin_marketplace_alert_events" to "anon";

grant references on table "public"."admin_marketplace_alert_events" to "anon";

grant select on table "public"."admin_marketplace_alert_events" to "anon";

grant trigger on table "public"."admin_marketplace_alert_events" to "anon";

grant truncate on table "public"."admin_marketplace_alert_events" to "anon";

grant update on table "public"."admin_marketplace_alert_events" to "anon";

grant delete on table "public"."admin_marketplace_alert_events" to "authenticated";

grant insert on table "public"."admin_marketplace_alert_events" to "authenticated";

grant references on table "public"."admin_marketplace_alert_events" to "authenticated";

grant select on table "public"."admin_marketplace_alert_events" to "authenticated";

grant trigger on table "public"."admin_marketplace_alert_events" to "authenticated";

grant truncate on table "public"."admin_marketplace_alert_events" to "authenticated";

grant update on table "public"."admin_marketplace_alert_events" to "authenticated";

grant delete on table "public"."admin_marketplace_alert_events" to "service_role";

grant insert on table "public"."admin_marketplace_alert_events" to "service_role";

grant references on table "public"."admin_marketplace_alert_events" to "service_role";

grant select on table "public"."admin_marketplace_alert_events" to "service_role";

grant trigger on table "public"."admin_marketplace_alert_events" to "service_role";

grant truncate on table "public"."admin_marketplace_alert_events" to "service_role";

grant update on table "public"."admin_marketplace_alert_events" to "service_role";

grant delete on table "public"."admin_marketplace_alerts" to "anon";

grant insert on table "public"."admin_marketplace_alerts" to "anon";

grant references on table "public"."admin_marketplace_alerts" to "anon";

grant select on table "public"."admin_marketplace_alerts" to "anon";

grant trigger on table "public"."admin_marketplace_alerts" to "anon";

grant truncate on table "public"."admin_marketplace_alerts" to "anon";

grant update on table "public"."admin_marketplace_alerts" to "anon";

grant delete on table "public"."admin_marketplace_alerts" to "authenticated";

grant insert on table "public"."admin_marketplace_alerts" to "authenticated";

grant references on table "public"."admin_marketplace_alerts" to "authenticated";

grant select on table "public"."admin_marketplace_alerts" to "authenticated";

grant trigger on table "public"."admin_marketplace_alerts" to "authenticated";

grant truncate on table "public"."admin_marketplace_alerts" to "authenticated";

grant update on table "public"."admin_marketplace_alerts" to "authenticated";

grant delete on table "public"."admin_marketplace_alerts" to "service_role";

grant insert on table "public"."admin_marketplace_alerts" to "service_role";

grant references on table "public"."admin_marketplace_alerts" to "service_role";

grant select on table "public"."admin_marketplace_alerts" to "service_role";

grant trigger on table "public"."admin_marketplace_alerts" to "service_role";

grant truncate on table "public"."admin_marketplace_alerts" to "service_role";

grant update on table "public"."admin_marketplace_alerts" to "service_role";


  create policy "social_posts_insert"
  on "public"."social_posts"
  as permissive
  for insert
  to authenticated
with check (((author_id = ( SELECT auth.uid() AS uid)) AND (public.auth_owns_restaurant(restaurant_id) OR public.auth_is_admin()) AND (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'published'::text])) AND ((sponsored_payment_status = 'none'::text) OR ((sponsored_payment_status = 'pending'::text) AND (sponsored_amount > (0)::numeric) AND (sponsored_duration_days = ANY (ARRAY[3, 7, 14]))))));


drop policy "ai_generated_assets_storage_owner_insert" on "storage"."objects";

drop policy "ai_generated_assets_storage_owner_select" on "storage"."objects";


