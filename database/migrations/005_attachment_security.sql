USE prms_tsm;
SET NAMES utf8mb4;

DELIMITER $$
DROP PROCEDURE IF EXISTS prms_secure_attachments$$
CREATE PROCEDURE prms_secure_attachments()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'attachments' AND column_name = 'checksum_sha256'
  ) THEN
    ALTER TABLE attachments ADD COLUMN checksum_sha256 CHAR(64) NULL AFTER file_size;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'attachments' AND index_name = 'uk_attachment_entity_checksum'
  ) THEN
    ALTER TABLE attachments
      ADD UNIQUE KEY uk_attachment_entity_checksum (entity_type, entity_id, checksum_sha256);
  END IF;
END$$
CALL prms_secure_attachments()$$
DROP PROCEDURE IF EXISTS prms_secure_attachments$$
DELIMITER ;
