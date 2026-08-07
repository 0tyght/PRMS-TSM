USE prms_tsm;
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

ALTER TABLE line_runtime_rich_menus
  ADD COLUMN IF NOT EXISTS menu_fingerprint CHAR(64) NULL AFTER rich_menu_id;

CREATE TABLE IF NOT EXISTS line_rich_menu_assets (
  fingerprint CHAR(64) NOT NULL,
  rich_menu_id VARCHAR(100) NOT NULL,
  menu_name VARCHAR(300) NOT NULL,
  is_static TINYINT(1) NOT NULL DEFAULT 0,
  page_json LONGTEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (fingerprint),
  UNIQUE KEY uq_line_rich_menu_assets_id (rich_menu_id),
  KEY idx_line_rich_menu_assets_expires (expires_at),
  KEY idx_line_rich_menu_assets_last_used (last_used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @fingerprint_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'line_runtime_rich_menus'
    AND index_name = 'idx_line_runtime_rich_menus_fingerprint'
);

SET @fingerprint_index_sql = IF(
  @fingerprint_index_exists = 0,
  'ALTER TABLE line_runtime_rich_menus ADD INDEX idx_line_runtime_rich_menus_fingerprint (menu_fingerprint)',
  'SELECT 1'
);

PREPARE fingerprint_index_statement FROM @fingerprint_index_sql;
EXECUTE fingerprint_index_statement;
DEALLOCATE PREPARE fingerprint_index_statement;
