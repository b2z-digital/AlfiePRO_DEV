/*
# Drop club-level email unique index to allow shared email addresses

1. Modified Tables
   - `members`: Remove the unique index on (club_id, email) that prevents
     family members from sharing the same email address within a club.

2. Rationale
   - Family members (e.g. parent/child, spouses) may legitimately share one
     email address. The system already dropped the global email unique
     constraint (migration 20260410043141). This removes the remaining 
     club-level unique index so two members in the same club can share an email.
   - The account-linking system links all members with a matching email to 
     the same auth account, so the account holder can manage both memberships.

3. Important Notes
   - This is a non-destructive change (index removal only, no data loss).
   - Members without email (NULL) are unaffected.
*/

DROP INDEX IF EXISTS members_club_email_unique_idx;
