USE prms_tsm;
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- Complete the official design use cases:
-- 1) owner records can be enabled/disabled without deleting history
-- 2) moving outside Tha Pho is distinct from transferring ownership

DELIMITER $$
DROP PROCEDURE IF EXISTS prms_complete_pet_registry$$
CREATE PROCEDURE prms_complete_pet_registry()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'owners'
      AND column_name = 'is_active'
  ) THEN
    ALTER TABLE owners
      ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER consent_at,
      ADD INDEX idx_owner_status (is_active, updated_at);
  END IF;
END$$
CALL prms_complete_pet_registry()$$
DROP PROCEDURE IF EXISTS prms_complete_pet_registry$$
DELIMITER ;

ALTER TABLE pets
  MODIFY COLUMN status
  ENUM('ACTIVE','MISSING','TRANSFERRED','MOVED_OUT','DECEASED')
  NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE pet_status_history
  MODIFY COLUMN old_status
  ENUM('ACTIVE','MISSING','TRANSFERRED','MOVED_OUT','DECEASED') NULL,
  MODIFY COLUMN new_status
  ENUM('ACTIVE','MISSING','TRANSFERRED','MOVED_OUT','DECEASED') NOT NULL;

SELECT 'Migration 017 completed successfully' AS migration_status;
