-- Add the commercial role in its own migration.
-- PostgreSQL requires a newly added enum value to be committed before it is
-- safely used in functions, policies, or inserted rows in later migrations.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'commercial';
