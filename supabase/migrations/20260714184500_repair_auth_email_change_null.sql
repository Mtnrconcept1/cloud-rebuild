-- GoTrue scans auth.users.email_change as a non-null string. Three legacy
-- commercial users had been inserted with NULL, which made the Admin users
-- endpoint fail for every account creation attempt.
--
-- GoTrue expects an empty string for this field when no change is pending.
-- This update is deliberately idempotent and does not alter valid Auth rows.
UPDATE auth.users
SET email_change = ''
WHERE email_change IS NULL;
