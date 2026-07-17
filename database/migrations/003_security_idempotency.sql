USE prms_tsm;
SET NAMES utf8mb4;

DELIMITER $$
DROP PROCEDURE IF EXISTS prms_add_column_if_missing$$
CREATE PROCEDURE prms_add_column_if_missing(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = p_table AND column_name = p_column) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE statement FROM @sql;
    EXECUTE statement;
    DEALLOCATE PREPARE statement;
  END IF;
END$$

CALL prms_add_column_if_missing('users', 'failed_login_attempts', 'TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER `last_login_at`')$$
CALL prms_add_column_if_missing('users', 'locked_until', 'DATETIME NULL AFTER `failed_login_attempts`')$$
DROP PROCEDURE IF EXISTS prms_add_column_if_missing$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key_hash CHAR(64) NOT NULL,
  scope VARCHAR(80) NOT NULL,
  response_status SMALLINT UNSIGNED NULL,
  response_body JSON NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (key_hash, scope),
  INDEX idx_idempotency_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
