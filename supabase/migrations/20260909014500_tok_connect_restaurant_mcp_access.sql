ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS tok_connect_mcp_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.restaurants.tok_connect_mcp_enabled IS
  'Controls whether this restaurant may be exposed through TOK Connect MCP.';
