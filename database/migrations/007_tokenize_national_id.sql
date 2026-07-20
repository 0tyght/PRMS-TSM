USE prms_tsm;
SET NAMES utf8mb4;

DELIMITER $$
DROP PROCEDURE IF EXISTS prms_tokenize_national_id$$
CREATE PROCEDURE prms_tokenize_national_id()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'owners' AND column_name = 'national_id_hash') THEN
    ALTER TABLE owners ADD COLUMN national_id_hash CHAR(64) NULL AFTER full_name;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'owners' AND column_name = 'national_id_last4') THEN
    ALTER TABLE owners ADD COLUMN national_id_last4 CHAR(4) NULL AFTER national_id_hash;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'owners' AND column_name = 'national_id') THEN
    UPDATE owners
    SET national_id_hash = SHA2(national_id, 256), national_id_last4 = RIGHT(national_id, 4)
    WHERE national_id REGEXP '^[0-9]{13}$' AND national_id_hash IS NULL;
    IF EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'owners' AND index_name = 'uk_owner_national_id') THEN
      ALTER TABLE owners DROP INDEX uk_owner_national_id;
    END IF;
    ALTER TABLE owners DROP COLUMN national_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'owners' AND index_name = 'uk_owner_national_id_hash') THEN
    ALTER TABLE owners ADD UNIQUE KEY uk_owner_national_id_hash (national_id_hash);
  END IF;
END$$
CALL prms_tokenize_national_id()$$
DROP PROCEDURE IF EXISTS prms_tokenize_national_id$$
DELIMITER ;
