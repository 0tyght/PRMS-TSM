USE prms_tsm;

SET NAMES utf8mb4;

-- Stop legacy route-wide completion notices that have not been delivered yet.
UPDATE waste_line_notifications
SET
  delivery_status = 'CANCELLED',
  last_error = 'CANCELLED_ROUTE_WIDE_COMPLETION_NOTICE'
WHERE notification_type = 'COLLECTION_STATUS'
  AND stop_id IS NULL
  AND delivery_status IN ('PENDING', 'FAILED')
  AND (
    message_text LIKE '%ปฏิบัติงานเสร็จสิ้น%'
    OR message_text LIKE '%การเก็บขยะของรอบนี้เสร็จสิ้นแล้ว%'
  );

-- COLLECTION_STATUS is not publication-version deduplication.
-- Per-stop deduplication is controlled by (plan_id, stop_id, notification_type).
UPDATE waste_line_notifications
SET plan_version = NULL
WHERE notification_type = 'COLLECTION_STATUS';

-- Migration 027 is replayed by the launcher. Recreate the triggers here so
-- per-stop notifications do not collide with the older plan-level unique key.
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
      NULL,
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
      NULL,
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

SELECT 'Migration 028 completed successfully' AS migration_status;
