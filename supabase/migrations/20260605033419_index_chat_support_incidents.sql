CREATE INDEX IF NOT EXISTS support_incidents_chat_source_updated_idx
  ON public.support_incidents ((metadata ->> 'source'), updated_at DESC)
  WHERE metadata ? 'source';

CREATE INDEX IF NOT EXISTS support_incidents_chat_conversation_idx
  ON public.support_incidents ((metadata ->> 'conversation_id'), updated_at DESC)
  WHERE metadata ? 'conversation_id';

CREATE INDEX IF NOT EXISTS ai_conversations_support_incident_created_idx
  ON public.ai_conversations (support_incident_id, created_at DESC)
  WHERE support_incident_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_messages_conversation_created_idx
  ON public.ai_messages (conversation_id, created_at ASC);

NOTIFY pgrst, 'reload schema';
