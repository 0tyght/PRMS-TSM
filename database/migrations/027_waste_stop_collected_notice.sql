USE prms_tsm;

SET NAMES utf8mb4;

ALTER TABLE waste_line_notifications
  ADD COLUMN IF NOT EXISTS stop_id CHAR(36) NULL AFTER plan_version;

SET @add_stop_notice_fk = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'fk_waste_notification_stop'
  ),
  'SELECT 1',
  'ALTER TABLE waste_line_notifications ADD CONSTRAINT fk_waste_notification_stop FOREIGN KEY (stop_id) REFERENCES waste_route_stops(id) ON UPDATE CASCADE ON DELETE SET NULL'
);
PREPARE stop_notice_fk_statement FROM @add_stop_notice_fk;
EXECUTE stop_notice_fk_statement;
DEALLOCATE PREPARE stop_notice_fk_statement;

CREATE UNIQUE INDEX IF NOT EXISTS uk_waste_stop_collected_notice
  ON waste_line_notifications (plan_id, stop_id, notification_type);

DROP TRIGGER IF EXISTS trg_waste_stop_confirmation_notify_insert;
DROP TRIGGER IF EXISTS trg_waste_stop_confirmation_notify_update;

DELIMITER //

CREATE TRIGGER trg_waste_stop_confirmation_notify_insert
AFTER INSERT ON waste_stop_confirmations
FOR EACH ROW
BEGIN
  IF NEW.status = 'COLLECTED' THEN
    INSERT IGNORE INTO waste_line_notifications
      (
        id,
        line_user_id,
        service_user_id,
        plan_id,
        plan_version,
        stop_id,
        notification_type,
        message_text
      )
    SELECT
      UUID(),
      su.line_user_id,
      su.id,
      NEW.plan_id,
      p.publication_version,
      NEW.stop_id,
      'COLLECTION_STATUS',
      CONCAT(
        'เก็บขยะที่จุดของคุณเรียบร้อยแล้ว',
        '\nสถานที่รับบริการ: บ้านเลขที่ ', su.house_no,
        '\nจุดเก็บขยะ: ', rs.stop_name,
        '\nเลขที่แผน: ', p.plan_no,
        '\nวันที่/เวลา: ', DATE_FORMAT(NEW.confirmed_at, '%d/%m/%Y %H:%i'), ' น.',
        '\nสถานะ: เก็บขยะเรียบร้อยแล้ว'
      )
    FROM waste_route_stops rs
    INNER JOIN waste_service_users su
      ON su.id = rs.service_user_id
    INNER JOIN waste_operation_plans p
      ON p.id = NEW.plan_id
    WHERE rs.id = NEW.stop_id
      AND su.is_active = 1
      AND su.line_user_id IS NOT NULL
      AND su.line_user_id <> ''
      AND p.publication_status = 'PUBLISHED';
  END IF;
END//

CREATE TRIGGER trg_waste_stop_confirmation_notify_update
AFTER UPDATE ON waste_stop_confirmations
FOR EACH ROW
BEGIN
  IF NEW.status = 'COLLECTED' AND OLD.status <> 'COLLECTED' THEN
    INSERT IGNORE INTO waste_line_notifications
      (
        id,
        line_user_id,
        service_user_id,
        plan_id,
        plan_version,
        stop_id,
        notification_type,
        message_text
      )
    SELECT
      UUID(),
      su.line_user_id,
      su.id,
      NEW.plan_id,
      p.publication_version,
      NEW.stop_id,
      'COLLECTION_STATUS',
      CONCAT(
        'เก็บขยะที่จุดของคุณเรียบร้อยแล้ว',
        '\nสถานที่รับบริการ: บ้านเลขที่ ', su.house_no,
        '\nจุดเก็บขยะ: ', rs.stop_name,
        '\nเลขที่แผน: ', p.plan_no,
        '\nวันที่/เวลา: ', DATE_FORMAT(NEW.confirmed_at, '%d/%m/%Y %H:%i'), ' น.',
        '\nสถานะ: เก็บขยะเรียบร้อยแล้ว'
      )
    FROM waste_route_stops rs
    INNER JOIN waste_service_users su
      ON su.id = rs.service_user_id
    INNER JOIN waste_operation_plans p
      ON p.id = NEW.plan_id
    WHERE rs.id = NEW.stop_id
      AND su.is_active = 1
      AND su.line_user_id IS NOT NULL
      AND su.line_user_id <> ''
      AND p.publication_status = 'PUBLISHED';
  END IF;
END//

DELIMITER ;

SELECT 'Migration 027 completed successfully' AS migration_status;