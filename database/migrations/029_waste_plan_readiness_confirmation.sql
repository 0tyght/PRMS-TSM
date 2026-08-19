USE prms_tsm;

SET NAMES utf8mb4;

ALTER TABLE waste_operation_plans
  ADD COLUMN IF NOT EXISTS readiness_confirmed_at DATETIME NULL AFTER public_note,
  ADD COLUMN IF NOT EXISTS readiness_confirmed_by CHAR(36) NULL AFTER readiness_confirmed_at;

SET @add_waste_plan_readiness_confirmer_fk = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'fk_waste_plan_readiness_confirmer'
  ),
  'SELECT 1',
  'ALTER TABLE waste_operation_plans ADD CONSTRAINT fk_waste_plan_readiness_confirmer FOREIGN KEY (readiness_confirmed_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL'
);
PREPARE waste_plan_readiness_confirmer_fk_statement FROM @add_waste_plan_readiness_confirmer_fk;
EXECUTE waste_plan_readiness_confirmer_fk_statement;
DEALLOCATE PREPARE waste_plan_readiness_confirmer_fk_statement;

-- Existing published/withdrawn plans came through the previous combined
-- check-and-publish action, so preserve their historical workflow state.
UPDATE waste_operation_plans
SET readiness_confirmed_at = COALESCE(published_at, created_at),
    readiness_confirmed_by = published_by
WHERE readiness_confirmed_at IS NULL
  AND publication_version > 0
  AND publication_status IN ('PUBLISHED', 'WITHDRAWN');

SELECT 'Migration 029 completed successfully' AS migration_status;
