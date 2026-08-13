USE prms_tsm;

SET NAMES utf8mb4;

-- LINE User ID is scoped to a Messaging API Channel. Keep citizen and driver
-- conversations independent even when LINE happens to issue the same value.
ALTER TABLE waste_line_sessions
  ADD COLUMN IF NOT EXISTS channel_type ENUM('CITIZEN', 'DRIVER') NOT NULL DEFAULT 'CITIZEN' AFTER line_user_id;

ALTER TABLE waste_line_sessions
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (channel_type, line_user_id);

-- Route assignment is suggested by geometry but always confirmed by a municipal officer.
ALTER TABLE waste_service_users
  ADD COLUMN IF NOT EXISTS route_assignment_status ENUM('UNASSIGNED', 'SUGGESTED', 'CONFIRMED') NOT NULL DEFAULT 'UNASSIGNED' AFTER route_id,
  ADD COLUMN IF NOT EXISTS route_assignment_distance_m DECIMAL(10,2) NULL AFTER route_assignment_status,
  ADD COLUMN IF NOT EXISTS route_assigned_at DATETIME NULL AFTER route_assignment_distance_m,
  ADD COLUMN IF NOT EXISTS route_assigned_by CHAR(36) NULL AFTER route_assigned_at;

UPDATE waste_service_users
SET route_assignment_status = IF(route_id IS NULL, 'UNASSIGNED', 'CONFIRMED'),
    route_assigned_at = IF(route_id IS NULL, NULL, COALESCE(route_assigned_at, updated_at));

CREATE INDEX IF NOT EXISTS idx_waste_service_assignment
  ON waste_service_users (route_assignment_status, route_id, is_active);

SELECT 'Migration 019 completed successfully' AS migration_status;
