USE prms_tsm;
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS line_runtime_rich_menus (
  line_user_id VARCHAR(64) NOT NULL,
  rich_menu_id VARCHAR(100) NOT NULL,
  definition_json LONGTEXT NOT NULL,
  history_json LONGTEXT NULL,
  page_offset INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (line_user_id),
  KEY idx_line_runtime_rich_menus_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
