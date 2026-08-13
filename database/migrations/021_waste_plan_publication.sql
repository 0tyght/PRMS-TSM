USE prms_tsm;

SET NAMES utf8mb4;

ALTER TABLE waste_operation_plans
  ADD COLUMN IF NOT EXISTS publication_status ENUM('DRAFT', 'PUBLISHED', 'WITHDRAWN') NOT NULL DEFAULT 'DRAFT' AFTER status,
  ADD COLUMN IF NOT EXISTS publication_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER publication_status,
  ADD COLUMN IF NOT EXISTS public_note VARCHAR(500) NULL AFTER publication_version,
  ADD COLUMN IF NOT EXISTS published_at DATETIME NULL AFTER public_note,
  ADD COLUMN IF NOT EXISTS published_by CHAR(36) NULL AFTER published_at,
  ADD COLUMN IF NOT EXISTS withdrawn_at DATETIME NULL AFTER published_by,
  ADD COLUMN IF NOT EXISTS withdrawn_by CHAR(36) NULL AFTER withdrawn_at;

SET @add_plan_publisher_fk = IF(
  EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_waste_plan_publisher'),
  'SELECT 1',
  'ALTER TABLE waste_operation_plans ADD CONSTRAINT fk_waste_plan_publisher FOREIGN KEY (published_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL'
);
PREPARE plan_publisher_fk_statement FROM @add_plan_publisher_fk;
EXECUTE plan_publisher_fk_statement;
DEALLOCATE PREPARE plan_publisher_fk_statement;

SET @add_plan_withdrawer_fk = IF(
  EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_waste_plan_withdrawer'),
  'SELECT 1',
  'ALTER TABLE waste_operation_plans ADD CONSTRAINT fk_waste_plan_withdrawer FOREIGN KEY (withdrawn_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL'
);
PREPARE plan_withdrawer_fk_statement FROM @add_plan_withdrawer_fk;
EXECUTE plan_withdrawer_fk_statement;
DEALLOCATE PREPARE plan_withdrawer_fk_statement;

CREATE INDEX IF NOT EXISTS idx_waste_plan_publication
  ON waste_operation_plans (publication_status, scheduled_date, route_id);

ALTER TABLE waste_line_notifications
  MODIFY COLUMN notification_type ENUM(
    'COLLECTION_STATUS', 'CHARGE_NOTICE', 'PAYMENT_REMINDER', 'PLAN_ASSIGNMENT',
    'SCHEDULE_PUBLISHED', 'SCHEDULE_WITHDRAWN'
  ) NOT NULL,
  ADD COLUMN IF NOT EXISTS plan_version INT UNSIGNED NULL AFTER plan_id;

CREATE UNIQUE INDEX IF NOT EXISTS uk_waste_plan_notice
  ON waste_line_notifications (plan_id, plan_version, service_user_id, notification_type);

-- Plans that had already started before this feature existed must remain
-- visible to citizens and valid for the driver workflow.
UPDATE waste_operation_plans
SET publication_status = CASE WHEN status = 'CANCELLED' THEN 'WITHDRAWN' ELSE 'PUBLISHED' END,
    publication_version = CASE WHEN status = 'CANCELLED' THEN 0 ELSE 1 END,
    published_at = CASE WHEN status = 'CANCELLED' THEN NULL ELSE created_at END,
    withdrawn_at = CASE WHEN status = 'CANCELLED' THEN COALESCE(actual_end_at, updated_at) ELSE NULL END
WHERE publication_version = 0 AND status <> 'SCHEDULED';

SELECT 'Migration 021 completed successfully' AS migration_status;
