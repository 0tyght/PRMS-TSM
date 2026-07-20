SET @has_mfa_secret = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'mfa_secret_encrypted'
);
SET @sql = IF(@has_mfa_secret = 0,
  'ALTER TABLE users ADD COLUMN mfa_secret_encrypted VARCHAR(255) NULL AFTER locked_until',
  'SELECT 1');
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @has_mfa_enabled = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'mfa_enabled'
);
SET @sql = IF(@has_mfa_enabled = 0,
  'ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER mfa_secret_encrypted',
  'SELECT 1');
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;
