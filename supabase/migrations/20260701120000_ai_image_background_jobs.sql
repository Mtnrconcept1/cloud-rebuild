-- Persist AI image generations so the server can finish work after the client
-- tab or mobile app is backgrounded.

CREATE TABLE IF NOT EXISTS public.ai_image_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tool text NOT NULL DEFAULT 'unknown',
  title text NOT NULL DEFAULT 'Creation IA TOK',
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  generated_asset_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_image_jobs_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT ai_image_jobs_tool_check CHECK (tool IN ('marketing_studio', 'photopro', 'menu_photo', 'advisor_photo', 'unknown'))
);

ALTER TABLE public.ai_image_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS ai_image_jobs_restaurant_created_idx
  ON public.ai_image_jobs(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_image_jobs_user_status_idx
  ON public.ai_image_jobs(user_id, status, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_image_jobs_status_created_idx
  ON public.ai_image_jobs(status, created_at DESC);

DROP TRIGGER IF EXISTS touch_ai_image_jobs_updated_at ON public.ai_image_jobs;
CREATE TRIGGER touch_ai_image_jobs_updated_at
BEFORE UPDATE ON public.ai_image_jobs
FOR EACH ROW
EXECUTE FUNCTION public.touch_ai_updated_at();

DROP POLICY IF EXISTS "ai_image_jobs_select_related" ON public.ai_image_jobs;
CREATE POLICY "ai_image_jobs_select_related"
  ON public.ai_image_jobs
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.auth_owns_restaurant(restaurant_id)
    OR public.has_role(auth.uid(), 'admin')
  );

GRANT SELECT ON public.ai_image_jobs TO authenticated;

NOTIFY pgrst, 'reload schema';
