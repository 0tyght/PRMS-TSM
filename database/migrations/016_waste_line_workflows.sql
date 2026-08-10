USE prms_tsm;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS waste_line_sessions (
    line_user_id VARCHAR(100) NOT NULL,
    actor_type ENUM('CITIZEN', 'DRIVER') NOT NULL,
    flow_type VARCHAR(50) NOT NULL,
    current_step VARCHAR(50) NOT NULL,
    draft_json JSON NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (line_user_id),
    INDEX idx_waste_line_session_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waste_driver_link_codes (
    id CHAR(36) NOT NULL,
    driver_id CHAR(36) NOT NULL,
    code_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_waste_driver_link_code_hash (code_hash),
    CONSTRAINT fk_waste_driver_link_code_driver FOREIGN KEY (driver_id)
        REFERENCES waste_drivers(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_waste_driver_link_code_creator FOREIGN KEY (created_by)
        REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    INDEX idx_waste_driver_link_expiry (driver_id, expires_at, used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waste_line_notifications (
    id CHAR(36) NOT NULL,
    line_user_id VARCHAR(100) NOT NULL,
    service_user_id CHAR(36) NULL,
    driver_id CHAR(36) NULL,
    charge_id CHAR(36) NULL,
    plan_id CHAR(36) NULL,
    notification_type ENUM('COLLECTION_STATUS', 'CHARGE_NOTICE', 'PAYMENT_REMINDER', 'PLAN_ASSIGNMENT') NOT NULL,
    message_text VARCHAR(2000) NOT NULL,
    delivery_status ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME NULL,
    last_error VARCHAR(1000) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_waste_notification_service_user FOREIGN KEY (service_user_id)
        REFERENCES waste_service_users(id) ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_waste_notification_driver FOREIGN KEY (driver_id)
        REFERENCES waste_drivers(id) ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_waste_notification_charge FOREIGN KEY (charge_id)
        REFERENCES waste_service_charges(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_waste_notification_plan FOREIGN KEY (plan_id)
        REFERENCES waste_operation_plans(id) ON UPDATE CASCADE ON DELETE CASCADE,
    INDEX idx_waste_notification_queue (delivery_status, next_attempt_at),
    INDEX idx_waste_notification_line_user (line_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration 016 completed successfully' AS migration_status;
