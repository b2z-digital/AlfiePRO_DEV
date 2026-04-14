/*
  # Allow members to insert their own membership payments

  1. Problem
    - The `membership_payments` table only has INSERT policies for club admins
      and super admins
    - Regular members cannot record their own bank transfer payments or free
      membership activations from the "Membership Payment Required" screen
    - This causes an RLS violation error when a member tries to submit payment

  2. Fix
    - Add an INSERT policy that allows authenticated members to insert payment
      records where the `member_id` references their own member record
    - The policy checks that the member's `user_id` matches the current
      authenticated user via `auth.uid()`
*/

CREATE POLICY "Members can insert own payments"
  ON membership_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.id = membership_payments.member_id
        AND m.user_id = auth.uid()
    )
  );
