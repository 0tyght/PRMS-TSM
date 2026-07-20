USE prms_tsm;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id CHAR(36) NULL,
  line_user_id VARCHAR(100) NULL,
  template_code VARCHAR(80) NOT NULL,
  message_text VARCHAR(1000) NOT NULL,
  delivery_status ENUM('PENDING','PROCESSING','SENT','FAILED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  last_http_status SMALLINT UNSIGNED NULL,
  last_error VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_notification_delivery (delivery_status, next_attempt_at),
  INDEX idx_notification_owner (owner_id, created_at),
  CONSTRAINT fk_notification_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
