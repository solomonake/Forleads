-- ============================================================================
-- Function hardening — our two helper functions are SECURITY DEFINER, so they
-- must NOT be callable by the public anon / authenticated roles via PostgREST
-- RPC (that would bypass RLS). The app calls them only with the service-role
-- key, which retains EXECUTE. Re-grant to `authenticated` if/when Supabase Auth
-- is wired for direct client access.
-- ============================================================================

revoke execute on function current_agent_ids() from public, anon, authenticated;

revoke execute on function fl_upsert_lead_surface(
  uuid, uuid, double precision, double precision, text, text, text, text, text,
  jsonb, timestamptz, timestamptz
) from public, anon, authenticated;
