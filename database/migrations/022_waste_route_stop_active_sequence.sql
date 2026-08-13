USE prms_tsm;

SET NAMES utf8mb4;

-- สร้าง generated column ที่มีค่าเฉพาะจุดที่ยังเปิดใช้งาน
SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'waste_route_stops'
      AND column_name = 'active_sequence_no'
);

SET @add_column_sql = IF(
    @column_exists = 0,
    'ALTER TABLE waste_route_stops
       ADD COLUMN active_sequence_no SMALLINT UNSIGNED
       AS (CASE WHEN is_active = 1 THEN sequence_no ELSE NULL END) PERSISTENT',
    'SELECT 1'
);

PREPARE add_column_stmt FROM @add_column_sql;
EXECUTE add_column_stmt;
DEALLOCATE PREPARE add_column_stmt;

-- บังคับ sequence ไม่ให้ซ้ำเฉพาะ stop ที่เปิดใช้งาน
SET @new_index_exists = (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'waste_route_stops'
      AND index_name = 'uk_waste_stop_active_sequence'
);

SET @add_index_sql = IF(
    @new_index_exists = 0,
    'ALTER TABLE waste_route_stops
       ADD UNIQUE KEY uk_waste_stop_active_sequence
       (route_id, active_sequence_no)',
    'SELECT 1'
);

PREPARE add_index_stmt FROM @add_index_sql;
EXECUTE add_index_stmt;
DEALLOCATE PREPARE add_index_stmt;

-- เอา unique เดิมที่บังคับรวมข้อมูลประวัติออก
SET @old_index_exists = (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'waste_route_stops'
      AND index_name = 'uk_waste_stop_sequence'
);

SET @drop_index_sql = IF(
    @old_index_exists > 0,
    'ALTER TABLE waste_route_stops
       DROP INDEX uk_waste_stop_sequence',
    'SELECT 1'
);

PREPARE drop_index_stmt FROM @drop_index_sql;
EXECUTE drop_index_stmt;
DEALLOCATE PREPARE drop_index_stmt;

SELECT 'Migration 022 completed successfully' AS migration_status;
