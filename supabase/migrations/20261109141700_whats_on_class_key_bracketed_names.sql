-- "Dragon Force 65 (DF65)", "International One Metre (IOM)", "Soling One Meter (S1M)" etc. now key on the
-- abbreviation in brackets, so events match the member's boats ("DF65", "IOM", "S1M"). Before, a series
-- named with the long form matched nobody and every What's On email was skipped as empty.
CREATE OR REPLACE FUNCTION public.whats_on_class_key(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE k
           WHEN '' THEN NULL
           WHEN '10rater' THEN '10r' WHEN 'tenrater' THEN '10r' WHEN '10raters' THEN '10r'
           WHEN 'internationalonemetre' THEN 'iom' WHEN 'onemetre' THEN 'iom' WHEN 'iomclass' THEN 'iom'
           WHEN 'laser' THEN 'rclaser' WHEN 'rclasers' THEN 'rclaser'
           WHEN 'mclass' THEN 'marblehead' WHEN 'marbleheads' THEN 'marblehead'
           WHEN 'a' THEN 'aclass' WHEN 'aclassyacht' THEN 'aclass'
           WHEN 'dragonflite65' THEN 'df65' WHEN 'dragonforce65' THEN 'df65' WHEN 'dragonflite95' THEN 'df95'
           ELSE k END
  FROM (SELECT lower(regexp_replace(
                 coalesce(nullif(trim((regexp_match(coalesce(p, ''), '\(([^)]+)\)'))[1]), ''), coalesce(p, '')),
                 '[^A-Za-z0-9]', '', 'g')) AS k) s
$function$;
