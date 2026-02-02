/*
  # Add DELETE policies for State and National admins to manage their events

  1. Changes
    - Add DELETE policy for State admins to delete events they created
    - Add DELETE policy for National admins to delete events they created
    
  2. Security
    - State admins can delete events created by their state association
    - National admins can delete events created by their national association
    - This allows associations to fully manage their event lifecycle
    
  3. Important Notes
    - When a public event is deleted, clubs that scored it will still have their local copies
    - Local copies in quick_races are independent and not cascade deleted
    - Clubs will see the event disappear from available events in Race Calendar
*/

-- Allow State admins to delete events created by their state association
CREATE POLICY "State admins can delete their association events"
  ON public_events
  FOR DELETE
  TO authenticated
  USING (
    created_by_type = 'state' 
    AND created_by_id IN (
      SELECT state_association_id 
      FROM user_state_associations 
      WHERE user_id = auth.uid() 
      AND role = 'state_admin'
    )
  );

-- Allow National admins to delete events created by their national association
CREATE POLICY "National admins can delete their association events"
  ON public_events
  FOR DELETE
  TO authenticated
  USING (
    created_by_type = 'national' 
    AND created_by_id IN (
      SELECT national_association_id 
      FROM user_national_associations 
      WHERE user_id = auth.uid() 
      AND role = 'national_admin'
    )
  );
