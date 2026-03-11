
-- Add availability and is_standard columns to meal_formulas
ALTER TABLE public.meal_formulas ADD COLUMN IF NOT EXISTS availability jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.meal_formulas ADD COLUMN IF NOT EXISTS is_standard boolean DEFAULT false;

-- Update existing formulas to have a default empty availability if needed
UPDATE public.meal_formulas SET availability = '{"days": [], "startTime": "00:00", "endTime": "23:59"}'::jsonb WHERE availability = '{}'::jsonb;
