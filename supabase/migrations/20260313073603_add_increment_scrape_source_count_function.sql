/*
  # Add helper RPC for incrementing scrape source article count
*/
CREATE OR REPLACE FUNCTION increment_scrape_source_count(p_source_id uuid, p_increment integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE news_scrape_sources
  SET article_count = article_count + p_increment,
      updated_at = now()
  WHERE id = p_source_id;
END;
$$;
