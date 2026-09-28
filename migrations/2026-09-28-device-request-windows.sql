-- Separate the two waiting periods in a device-approval request.
--
-- The original design used one `expires_at` for both "how long may this sit
-- unapproved" and "how long after approval may the key be registered". Fifteen
-- minutes covered neither case well: a user who opens a request at the office
-- and can only approve it from the machine at home needs the request to still
-- be there hours later.
--
--   expires_at           — deadline for someone to approve the request
--   approved_expires_at  — deadline to finish registering, set when approved
--
-- Both are 24 hours. The approval window stays a window rather than being
-- open-ended so a granted permission to mint a key does not sit unused
-- indefinitely.

ALTER TABLE device_approval_requests
  ADD COLUMN IF NOT EXISTS approved_expires_at timestamptz;

COMMENT ON COLUMN device_approval_requests.expires_at IS
  'Deadline for the request to be approved. After this it is dead.';

COMMENT ON COLUMN device_approval_requests.approved_expires_at IS
  'Set when the request is approved: deadline to complete registration.';
