/*
  # Merge cross-club duplicate members - enrich and link

  1. Problem
    - Members who belong to multiple clubs were imported as separate records
    - One record often has enriched data (phone, address, emergency contacts)
      while the other only has basic info (first/last/email)
    - user_id is not linked on the secondary club record

  2. Fix
    - Bidirectionally enrich both records so each club sees complete member data
    - Link user_id from the richer record to the sparser one
    - Create user_clubs entries so linked users can access both clubs
    - Create club_memberships only for members who have profiles (user accounts)

  3. Affected Members
    - Peter Anderson (Kogarah Bay + Koonawarra Bay) - has user_id
    - Robert Gower (Lake Macquarie + Horizons) - no user_id
    - Brian Dill (Illawarra + Koonawarra Bay) - no user_id
    - Ralph Hyman (Illawarra + Koonawarra Bay) - no user_id
*/

DO $$
DECLARE
  v_dup RECORD;
  v_primary RECORD;
  v_secondary RECORD;
  v_has_profile BOOLEAN;
BEGIN
  FOR v_dup IN
    SELECT LOWER(email) as email_lower
    FROM public.members
    WHERE email IS NOT NULL AND email != '' AND membership_status != 'archived'
    GROUP BY LOWER(email)
    HAVING COUNT(DISTINCT club_id) > 1
  LOOP
    SELECT * INTO v_primary
    FROM public.members
    WHERE LOWER(email) = v_dup.email_lower AND membership_status != 'archived'
    ORDER BY
      CASE WHEN user_id IS NOT NULL THEN 0 ELSE 1 END,
      CASE WHEN phone IS NOT NULL AND phone != '' THEN 0 ELSE 1 END,
      created_at ASC
    LIMIT 1;

    FOR v_secondary IN
      SELECT * FROM public.members
      WHERE LOWER(email) = v_dup.email_lower
        AND id != v_primary.id
        AND membership_status != 'archived'
    LOOP
      UPDATE public.members SET
        phone = COALESCE(NULLIF(phone, ''), v_primary.phone),
        street = COALESCE(NULLIF(street, ''), v_primary.street),
        city = COALESCE(NULLIF(city, ''), v_primary.city),
        state = COALESCE(NULLIF(state, ''), v_primary.state),
        postcode = COALESCE(NULLIF(postcode, ''), v_primary.postcode),
        country = COALESCE(country, v_primary.country),
        country_code = COALESCE(country_code, v_primary.country_code),
        category = COALESCE(category, v_primary.category),
        emergency_contact_name = COALESCE(NULLIF(emergency_contact_name, ''), v_primary.emergency_contact_name),
        emergency_contact_phone = COALESCE(NULLIF(emergency_contact_phone, ''), v_primary.emergency_contact_phone),
        emergency_contact_relationship = COALESCE(NULLIF(emergency_contact_relationship, ''), v_primary.emergency_contact_relationship),
        user_id = COALESCE(user_id, v_primary.user_id),
        updated_at = now()
      WHERE id = v_secondary.id;

      UPDATE public.members SET
        phone = COALESCE(NULLIF(phone, ''), v_secondary.phone),
        street = COALESCE(NULLIF(street, ''), v_secondary.street),
        city = COALESCE(NULLIF(city, ''), v_secondary.city),
        state = COALESCE(NULLIF(state, ''), v_secondary.state),
        postcode = COALESCE(NULLIF(postcode, ''), v_secondary.postcode),
        country = COALESCE(country, v_secondary.country),
        country_code = COALESCE(country_code, v_secondary.country_code),
        category = COALESCE(category, v_secondary.category),
        emergency_contact_name = COALESCE(NULLIF(emergency_contact_name, ''), v_secondary.emergency_contact_name),
        emergency_contact_phone = COALESCE(NULLIF(emergency_contact_phone, ''), v_secondary.emergency_contact_phone),
        emergency_contact_relationship = COALESCE(NULLIF(emergency_contact_relationship, ''), v_secondary.emergency_contact_relationship),
        updated_at = now()
      WHERE id = v_primary.id;

      IF v_primary.user_id IS NOT NULL THEN
        INSERT INTO public.user_clubs (user_id, club_id, role)
        SELECT v_primary.user_id, v_secondary.club_id, 'member'
        WHERE NOT EXISTS (
          SELECT 1 FROM public.user_clubs
          WHERE user_id = v_primary.user_id AND club_id = v_secondary.club_id
        );

        SELECT EXISTS (
          SELECT 1 FROM public.profiles WHERE id = v_primary.user_id
        ) INTO v_has_profile;

        IF v_has_profile THEN
          INSERT INTO public.club_memberships (member_id, club_id, relationship_type, status, payment_status, joined_date, expiry_date, pays_association_fees)
          SELECT v_primary.user_id, v_primary.club_id, 'primary', 'active',
            CASE WHEN v_primary.is_financial THEN 'paid' ELSE 'unpaid' END,
            v_primary.date_joined, v_primary.renewal_date, true
          WHERE NOT EXISTS (
            SELECT 1 FROM public.club_memberships
            WHERE member_id = v_primary.user_id AND club_id = v_primary.club_id
          );

          INSERT INTO public.club_memberships (member_id, club_id, relationship_type, status, payment_status, joined_date, expiry_date, pays_association_fees)
          SELECT v_primary.user_id, v_secondary.club_id, 'affiliate', 'active',
            CASE WHEN v_secondary.is_financial THEN 'paid' ELSE 'unpaid' END,
            v_secondary.date_joined, v_secondary.renewal_date, false
          WHERE NOT EXISTS (
            SELECT 1 FROM public.club_memberships
            WHERE member_id = v_primary.user_id AND club_id = v_secondary.club_id
          );
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;
