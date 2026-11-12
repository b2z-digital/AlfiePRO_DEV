-- Race Simulator, stage D tidy-up: the world's trigger functions run only as triggers, so nobody needs
-- to be able to call them (the security advisor flags them as callable by anon and authenticated).
REVOKE ALL ON FUNCTION public.sim_skippers_fill() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sim_skippers_rename() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sim_world_entry_name() FROM PUBLIC, anon, authenticated;
