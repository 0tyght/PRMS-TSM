SET NAMES utf8mb4;

-- LINE Native V8 ใช้ optimistic locking กับคำขอขึ้นทะเบียน
-- และให้ประชาชนยกเลิกคำขอที่ยังไม่ถูกตัดสินได้
DELIMITER $$

DROP PROCEDURE IF EXISTS prms_upgrade_registrations_v8$$

CREATE PROCEDURE prms_upgrade_registrations_v8()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'registrations'
      AND COLUMN_NAME = 'version'
  ) THEN
    ALTER TABLE registrations
      ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1
      AFTER reviewed_by;
  END IF;

  ALTER TABLE registrations
    MODIFY COLUMN status ENUM(
      'DRAFT',
      'SUBMITTED',
      'UNDER_REVIEW',
      'NEED_MORE_INFO',
      'APPROVED',
      'REJECTED',
      'CANCELLED'
    ) NOT NULL DEFAULT 'DRAFT';
END$$

DELIMITER ;

CALL prms_upgrade_registrations_v8();
DROP PROCEDURE IF EXISTS prms_upgrade_registrations_v8;

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'registrations'
  AND COLUMN_NAME IN ('status', 'version')
ORDER BY ORDINAL_POSITION;
