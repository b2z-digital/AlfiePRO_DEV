/*
  # Add membership type replacement mapping

  1. Modified Tables
    - `membership_types`
      - `replaces_membership_type_id` (uuid, nullable) - References another membership type that this type replaces
        When a member on the old (inactive) type comes up for renewal, the system will automatically
        assign them to this new replacement type instead.

  2. Notes
    - This enables clubs to transition members from old membership types (e.g. a $0 introductory type)
      to new types (e.g. a $150 Full Member type) at renewal time without manual intervention.
    - The referenced type should typically be inactive (is_active = false).
    - Multiple new types can reference the same old type (e.g. admin decides at renewal).
    - Self-referencing is prevented via CHECK constraint.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'membership_types' AND column_name = 'replaces_membership_type_id'
  ) THEN
    ALTER TABLE membership_types
      ADD COLUMN replaces_membership_type_id uuid REFERENCES membership_types(id) ON DELETE SET NULL;

    ALTER TABLE membership_types
      ADD CONSTRAINT membership_types_no_self_replace
      CHECK (replaces_membership_type_id IS NULL OR replaces_membership_type_id != id);
  END IF;
END $$;
