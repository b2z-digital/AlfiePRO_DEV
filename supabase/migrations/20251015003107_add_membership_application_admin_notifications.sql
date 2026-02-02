/*
  # Add Admin Notifications for New Membership Applications

  1. Function
    - `notify_admins_on_new_application()` - Creates notifications for club admins when a new application is submitted
    - Finds all users with 'admin' or 'super_admin' roles in the club
    - Creates a notification for each admin

  2. Trigger
    - Fires when a new membership_applications record is inserted with status 'pending' and is_draft = false
    - Automatically notifies all club admins
*/

-- Function to notify club admins when a new membership application is submitted
CREATE OR REPLACE FUNCTION notify_admins_on_new_application()
RETURNS TRIGGER AS $$
DECLARE
  admin_record RECORD;
  applicant_name TEXT;
BEGIN
  -- Only process non-draft applications with pending status
  IF NEW.is_draft = false AND NEW.status = 'pending' THEN
    -- Get applicant's full name
    applicant_name := NEW.first_name || ' ' || NEW.last_name;
    
    -- Find all admins and super_admins for this club
    FOR admin_record IN
      SELECT DISTINCT uc.user_id, p.full_name, p.avatar_url
      FROM user_clubs uc
      LEFT JOIN profiles p ON p.id = uc.user_id
      WHERE uc.club_id = NEW.club_id
        AND uc.role IN ('admin', 'super_admin')
    LOOP
      -- Create a notification for each admin
      INSERT INTO notifications (
        user_id,
        club_id,
        type,
        subject,
        body,
        read,
        sender_id,
        sender_name,
        sender_avatar_url,
        recipient_name,
        recipient_avatar_url,
        created_at
      ) VALUES (
        admin_record.user_id,
        NEW.club_id,
        'membership_application',
        'New Membership Application',
        applicant_name || ' has submitted a membership application for ' || COALESCE(NEW.membership_type_name, 'membership') || '.',
        false,
        NEW.user_id,
        applicant_name,
        NEW.avatar_url,
        admin_record.full_name,
        admin_record.avatar_url,
        NOW()
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on membership_applications
DROP TRIGGER IF EXISTS trigger_notify_admins_on_new_application ON membership_applications;

CREATE TRIGGER trigger_notify_admins_on_new_application
  AFTER INSERT ON membership_applications
  FOR EACH ROW
  EXECUTE FUNCTION notify_admins_on_new_application();
