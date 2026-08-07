USE prms_tsm;
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS line_conversation_sessions (
  line_user_id VARCHAR(100) NOT NULL,
  flow_type VARCHAR(40) NOT NULL,
  current_step VARCHAR(60) NOT NULL,
  draft_payload JSON NOT NULL,
  selected_pet_id CHAR(36) NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (line_user_id),
  INDEX idx_line_session_expiry (expires_at),
  INDEX idx_line_session_pet (selected_pet_id),
  CONSTRAINT fk_line_session_pet
    FOREIGN KEY (selected_pet_id) REFERENCES pets(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS line_webhook_events (
  webhook_event_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  source_user_id VARCHAR(100) NULL,
  status ENUM('PROCESSING','PROCESSED','FAILED') NOT NULL DEFAULT 'PROCESSING',
  error_message VARCHAR(500) NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  PRIMARY KEY (webhook_event_id),
  INDEX idx_line_webhook_received (received_at),
  INDEX idx_line_webhook_status (status, received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS line_native_attachments (
  id CHAR(36) NOT NULL,
  line_user_id VARCHAR(100) NOT NULL,
  line_message_id VARCHAR(100) NOT NULL,
  entity_type VARCHAR(40) NULL,
  entity_id CHAR(36) NULL,
  file_name VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  expires_at DATETIME NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_line_native_message (line_user_id, line_message_id),
  INDEX idx_line_native_entity (entity_type, entity_id),
  INDEX idx_line_native_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE citizen_submissions
  MODIFY COLUMN subject_type
  ENUM('PET_UPDATE','VACCINATION','STERILIZATION','PET_STATUS','OWNER_TRANSFER')
  NOT NULL;

DELETE FROM line_conversation_sessions WHERE expires_at <= NOW();
DELETE FROM line_webhook_events WHERE received_at < DATE_SUB(NOW(), INTERVAL 30 DAY);

SELECT 'Migration 011 completed successfully' AS migration_status;
