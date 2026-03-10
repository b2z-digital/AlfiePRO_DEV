/*
  # Fix PostgREST schema cache for committee positions

  Forces PostgREST to reload its schema cache so it recognizes the
  state_association_id and national_association_id columns that were
  added to committee_positions and committee_position_definitions.

  Also adds a comment to force the migration to be applied.
*/

COMMENT ON COLUMN committee_positions.state_association_id IS 'FK to state_associations for association-level committee positions';
COMMENT ON COLUMN committee_positions.national_association_id IS 'FK to national_associations for association-level committee positions';
COMMENT ON COLUMN committee_position_definitions.state_association_id IS 'FK to state_associations for association-level position definitions';
COMMENT ON COLUMN committee_position_definitions.national_association_id IS 'FK to national_associations for association-level position definitions';

NOTIFY pgrst, 'reload schema';