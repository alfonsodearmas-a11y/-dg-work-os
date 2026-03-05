-- Allow new users to sign up without agency (assigned later by admin)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_agency_check;

-- Relaxed: only enforce agency_admin must have agency
ALTER TABLE users ADD CONSTRAINT users_agency_check
  CHECK (
    role != 'agency_admin' OR agency IS NOT NULL
  );
