USE prms_tsm;
SET NAMES utf8mb4;

DELIMITER $$
DROP PROCEDURE IF EXISTS prms_add_user_scope$$
CREATE PROCEDURE prms_add_user_scope()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'scope_village_id') THEN
    ALTER TABLE users ADD COLUMN scope_village_id INT UNSIGNED NULL AFTER role;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'users' AND constraint_name = 'fk_user_scope_village') THEN
    ALTER TABLE users ADD CONSTRAINT fk_user_scope_village FOREIGN KEY (scope_village_id) REFERENCES villages(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END$$
CALL prms_add_user_scope()$$
DROP PROCEDURE IF EXISTS prms_add_user_scope$$
DELIMITER ;
