/*
  # Fix national_report_members remittance foreign key constraint

  1. Changes
    - Make `remittance_id` column nullable on `national_report_members`
    - Change foreign key from NO ACTION to SET NULL on delete
    - This allows member archival/deletion to proceed without being blocked
      by existing national report references

  2. Reason
    - Member deletion/archival deletes related remittances, which was blocked
      by the strict foreign key on national_report_members
    - National report records should be preserved for historical purposes,
      with a nulled remittance reference indicating the source was removed
*/

ALTER TABLE public.national_report_members
  ALTER COLUMN remittance_id DROP NOT NULL;

ALTER TABLE public.national_report_members
  DROP CONSTRAINT IF EXISTS national_report_members_remittance_id_fkey;

ALTER TABLE public.national_report_members
  ADD CONSTRAINT national_report_members_remittance_id_fkey
  FOREIGN KEY (remittance_id)
  REFERENCES public.membership_remittances(id)
  ON DELETE SET NULL;
