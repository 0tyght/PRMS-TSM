-- FR15: Keep the replacement driver as a first-class assignment.
ALTER TABLE waste_incidents
  ADD COLUMN IF NOT EXISTS replacement_driver_id CHAR(36) NULL
  AFTER replacement_vehicle_id;

CREATE INDEX IF NOT EXISTS idx_waste_incident_replacement_driver
  ON waste_incidents (replacement_driver_id);

SET @has_fk_replacement_driver := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'waste_incidents'
    AND CONSTRAINT_NAME = 'fk_waste_incident_replacement_driver'
);

SET @replacement_driver_fk_sql := IF(
  @has_fk_replacement_driver = 0,
  'ALTER TABLE waste_incidents ADD CONSTRAINT fk_waste_incident_replacement_driver FOREIGN KEY (replacement_driver_id) REFERENCES waste_drivers(id) ON UPDATE CASCADE ON DELETE SET NULL',
  'SELECT 1'
);

PREPARE replacement_driver_fk_statement FROM @replacement_driver_fk_sql;
EXECUTE replacement_driver_fk_statement;
DEALLOCATE PREPARE replacement_driver_fk_statement;
