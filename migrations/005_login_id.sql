-- Add login IDs separate from contact email addresses.

ALTER TABLE system_users ADD COLUMN IF NOT EXISTS login_id TEXT;
UPDATE system_users
SET login_id = email
WHERE login_id IS NULL OR BTRIM(login_id) = '';
ALTER TABLE system_users ALTER COLUMN login_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS system_users_login_id_key ON system_users(login_id);

UPDATE system_users
SET login_id = 'admin'
WHERE id = 'sys-admin'
  AND login_id = 'admin@example.com'
  AND NOT EXISTS (SELECT 1 FROM system_users WHERE login_id = 'admin');
UPDATE system_users
SET login_id = 'approver'
WHERE id = 'sys-approver'
  AND login_id = 'approver@example.com'
  AND NOT EXISTS (SELECT 1 FROM system_users WHERE login_id = 'approver');

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS login_id TEXT;
UPDATE agencies
SET login_id = email
WHERE login_id IS NULL OR BTRIM(login_id) = '';
ALTER TABLE agencies ALTER COLUMN login_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agencies_login_id_key ON agencies(login_id);

UPDATE agencies
SET login_id = 'agency'
WHERE id = 'ag-1'
  AND login_id = 'alpha@example.com'
  AND NOT EXISTS (SELECT 1 FROM agencies WHERE login_id = 'agency');
