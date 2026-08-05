USE prms_tsm;

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ซ่อมชื่อหมู่บ้านที่เคยถูกนำเข้าด้วย character set ไม่ถูกต้อง
-- ใช้ village_no เป็นแหล่งอ้างอิงที่แน่นอน จึงรันซ้ำได้โดยไม่กระทบข้อมูลอื่น
UPDATE villages
SET name_th = CONCAT('หมู่ที่ ', village_no)
WHERE village_no BETWEEN 1 AND 11;

SELECT
  village_no,
  name_th,
  HEX(name_th) AS utf8_hex
FROM villages
WHERE village_no BETWEEN 1 AND 11
ORDER BY village_no;
