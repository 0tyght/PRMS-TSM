USE prms_tsm;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS system_line_channels (
    channel_kind ENUM('CITIZEN', 'DRIVER') NOT NULL,
    display_name VARCHAR(120) NULL,
    basic_id VARCHAR(80) NULL,
    channel_id VARCHAR(80) NULL,
    channel_secret_encrypted TEXT NULL,
    access_token_encrypted MEDIUMTEXT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    last_tested_at DATETIME NULL,
    last_test_status VARCHAR(30) NULL,
    last_test_message VARCHAR(500) NULL,
    updated_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_kind),
    CONSTRAINT fk_system_line_channel_updated_by FOREIGN KEY (updated_by)
        REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration 026 completed successfully' AS migration_status;
