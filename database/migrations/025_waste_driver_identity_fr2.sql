USE prms_tsm;
SET NAMES utf8mb4;

ALTER TABLE waste_drivers
  ADD COLUMN IF NOT EXISTS driver_code VARCHAR(30) NULL AFTER id;

-- ต้องทำให้ nullable ก่อนล้างรหัสเดิม เพื่อไม่ให้ MariaDB แปลง NULL เป็นค่าว่าง
ALTER TABLE waste_drivers
  MODIFY driver_code VARCHAR(30) NULL;

-- ล้างค่าว่างและรหัสทดลองที่สร้างจาก UUID
UPDATE waste_drivers
SET driver_code = NULL
WHERE driver_code = ''
   OR driver_code REGEXP '^DRV-[0-9A-Fa-f]{26}$';

-- รหัสสำหรับข้อมูลสาธิตเท่านั้น
UPDATE waste_drivers SET driver_code = 'DEMO-D01' WHERE id = 'a3000000-0000-4000-8000-000000000001';
UPDATE waste_drivers SET driver_code = 'DEMO-D02' WHERE id = 'a3000000-0000-4000-8000-000000000002';
UPDATE waste_drivers SET driver_code = 'DEMO-D03' WHERE id = 'a3000000-0000-4000-8000-000000000003';
UPDATE waste_drivers SET driver_code = 'DEMO-D04' WHERE id = 'a3000000-0000-4000-8000-000000000004';
UPDATE waste_drivers SET driver_code = 'DEMO-D05' WHERE id = 'a3000000-0000-4000-8000-000000000005';
UPDATE waste_drivers SET driver_code = 'DEMO-D06' WHERE id = 'a3000000-0000-4000-8000-000000000006';

CREATE UNIQUE INDEX IF NOT EXISTS uk_waste_driver_code
  ON waste_drivers(driver_code);

-- FR2 ใช้รหัสพนักงาน + หมายเลขโทรศัพท์ ไม่ใช้รหัสเชื่อม 6 หลัก
DROP TABLE IF EXISTS waste_driver_link_codes;

SELECT 'Migration 025 FR2 driver identity completed successfully' AS migration_status;