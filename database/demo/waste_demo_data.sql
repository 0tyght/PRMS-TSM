USE prms_tsm;

SET NAMES utf8mb4;
SET @today = CURDATE();
SET @month_start = DATE_FORMAT(CURDATE(), '%Y-%m-01');

-- ชุดข้อมูลสาธิตระบบบริหารจัดการการเก็บขยะ
-- สถานที่รับบริการ TEST-PT เป็นสถานที่สาธารณะที่ตรวจสอบพิกัดได้จาก OpenStreetMap
-- ใช้ทดสอบระบบเท่านั้น ไม่ใช่ทะเบียนผู้ใช้บริการเก็บขยะจริง และไม่มี LINE User ID จริง
-- ต้องเรียกผ่าน scripts/database/seed-waste-demo.ps1 เพื่อคำนวณแนวถนนใหม่ด้วย OSRM หลังนำเข้าข้อมูลนี้

INSERT INTO waste_vehicles
  (id, vehicle_code, registration_no, vehicle_type, capacity_kg, status, last_latitude, last_longitude, last_gps_at, note)
VALUES
  ('a2000000-0000-4000-8000-000000000001', 'DEMO-W01', '81-9001 พิษณุโลก', 'รถบรรทุกอัดท้าย 6 ล้อ', 7000, 'AVAILABLE', 16.7789000, 100.2203000, NOW(), 'ข้อมูลตัวอย่าง: รถประจำเส้นทางตอนเหนือ'),
  ('a2000000-0000-4000-8000-000000000002', 'DEMO-W02', '81-9002 พิษณุโลก', 'รถบรรทุกอัดท้าย 6 ล้อ', 7000, 'AVAILABLE', 16.7688000, 100.2296000, DATE_SUB(NOW(), INTERVAL 2 HOUR), 'ข้อมูลตัวอย่าง: รถสำรองพร้อมใช้งาน'),
  ('a2000000-0000-4000-8000-000000000003', 'DEMO-W03', '81-9003 พิษณุโลก', 'รถบรรทุกเปิดข้าง 4 ล้อ', 3500, 'AVAILABLE', 16.7724000, 100.2147000, DATE_SUB(NOW(), INTERVAL 1 HOUR), 'ข้อมูลตัวอย่าง: รถสำหรับซอยแคบ'),
  ('a2000000-0000-4000-8000-000000000004', 'DEMO-W04', '81-9004 พิษณุโลก', 'รถบรรทุกอัดท้าย 6 ล้อ', 7000, 'MAINTENANCE', 16.7649000, 100.2189000, DATE_SUB(NOW(), INTERVAL 3 HOUR), 'ข้อมูลตัวอย่าง: ตรวจระบบไฮดรอลิก'),
  ('a2000000-0000-4000-8000-000000000005', 'DEMO-W05', '81-9005 พิษณุโลก', 'รถบรรทุกเปิดข้าง 4 ล้อ', 3000, 'OUT_OF_SERVICE', NULL, NULL, NULL, 'ข้อมูลตัวอย่าง: ยกเลิกการใช้งานรอจำหน่าย'),
  ('a2000000-0000-4000-8000-000000000006', 'DEMO-W06', '81-9006 พิษณุโลก', 'รถบรรทุกอัดท้าย 6 ล้อ', 7000, 'AVAILABLE', 16.7744000, 100.2254000, DATE_SUB(NOW(), INTERVAL 4 HOUR), 'ข้อมูลตัวอย่าง: รถทดแทนกรณีฉุกเฉิน')
ON DUPLICATE KEY UPDATE
  registration_no = VALUES(registration_no), vehicle_type = VALUES(vehicle_type), capacity_kg = VALUES(capacity_kg),
  status = VALUES(status), last_latitude = VALUES(last_latitude), last_longitude = VALUES(last_longitude),
  last_gps_at = VALUES(last_gps_at), note = VALUES(note);

INSERT INTO waste_drivers (id, driver_code, full_name, phone, line_user_id, is_active)
VALUES
  ('a3000000-0000-4000-8000-000000000001', 'DEMO-D01', '[ตัวอย่าง] สมชาย ใจดี', '0990000001', NULL, 1),
  ('a3000000-0000-4000-8000-000000000002', 'DEMO-D02', '[ตัวอย่าง] วิชัย มั่นคง', '0990000002', NULL, 1),
  ('a3000000-0000-4000-8000-000000000003', 'DEMO-D03', '[ตัวอย่าง] ประสิทธิ์ ร่วมใจ', '0990000003', NULL, 1),
  ('a3000000-0000-4000-8000-000000000004', 'DEMO-D04', '[ตัวอย่าง] อนุชา พร้อมงาน', '0990000004', NULL, 1),
  ('a3000000-0000-4000-8000-000000000005', 'DEMO-D05', '[ตัวอย่าง] มานพ ชำนาญ', '0990000005', NULL, 1),
  ('a3000000-0000-4000-8000-000000000006', 'DEMO-D06', '[ตัวอย่าง] สุรชัย พักงาน', '0990000006', NULL, 0)
ON DUPLICATE KEY UPDATE driver_code = VALUES(driver_code), full_name = VALUES(full_name), phone = VALUES(phone), line_user_id = NULL, is_active = VALUES(is_active);

INSERT INTO waste_service_users
  (id, service_no, full_name, phone, house_no, village_id, address_detail, line_user_id, route_id, latitude, longitude, is_active)
VALUES
  ('a4000000-0000-4000-8000-000000000001','TEST-PT001','[จุดทดสอบ] NU Plaza','0991000001','จุด 001',(SELECT id FROM villages WHERE village_no=3 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000001',16.7523122,100.1964895,1),
  ('a4000000-0000-4000-8000-000000000002','TEST-PT002','[จุดทดสอบ] KFC NU Plaza','0991000002','จุด 002',(SELECT id FROM villages WHERE village_no=3 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000001',16.7524901,100.1966076,1),
  ('a4000000-0000-4000-8000-000000000003','TEST-PT003','[จุดทดสอบ] Mini Big C','0991000003','จุด 003',(SELECT id FROM villages WHERE village_no=3 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000001',16.7538191,100.1966309,1),
  ('a4000000-0000-4000-8000-000000000004','TEST-PT004','[จุดทดสอบ] วัดยางเอน','0991000004','จุด 004',(SELECT id FROM villages WHERE village_no=6 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000002',16.7664083,100.2053897,1),
  ('a4000000-0000-4000-8000-000000000005','TEST-PT005','[จุดทดสอบ] โรงเรียนวัดยางเอน','0991000005','จุด 005',(SELECT id FROM villages WHERE village_no=6 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000002',16.7677050,100.2060960,1),
  ('a4000000-0000-4000-8000-000000000006','TEST-PT006','[จุดทดสอบ] Palm Place 4','0991000006','จุด 006',(SELECT id FROM villages WHERE village_no=4 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000002',16.7696774,100.1986194,1),
  ('a4000000-0000-4000-8000-000000000007','TEST-PT007','[จุดทดสอบ] 7-Eleven ใกล้มหาวิทยาลัยนเรศวร','0991000007','จุด 007',(SELECT id FROM villages WHERE village_no=3 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000003',16.7527953,100.1958045,1),
  ('a4000000-0000-4000-8000-000000000008','TEST-PT008','[จุดทดสอบ] วัดสะกัดน้ำมัน','0991000008','จุด 008',(SELECT id FROM villages WHERE village_no=3 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000003',16.7580059,100.2090336,1),
  ('a4000000-0000-4000-8000-000000000009','TEST-PT009','[จุดทดสอบ] โรงเรียนชุมชน 1 วัดสะกัดน้ำมัน','0991000009','จุด 009',(SELECT id FROM villages WHERE village_no=3 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000003',16.7589599,100.2103441,1),
  ('a4000000-0000-4000-8000-000000000010','TEST-PT010','[จุดทดสอบ] ศูนย์พัฒนาเด็กเล็กบ้านวังส้มซ่า','0991000010','จุด 010',(SELECT id FROM villages WHERE village_no=4 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000004',16.7600722,100.2115076,1),
  ('a4000000-0000-4000-8000-000000000011','TEST-PT011','[จุดทดสอบ] สถานีบริการน้ำมัน PTT','0991000011','จุด 011',(SELECT id FROM villages WHERE village_no=4 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000004',16.7600451,100.2211993,1),
  ('a4000000-0000-4000-8000-000000000012','TEST-PT012','[จุดทดสอบ] 7-Eleven สาขา PTT','0991000012','จุด 012',(SELECT id FROM villages WHERE village_no=4 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000004',16.7599445,100.2217447,1),
  ('a4000000-0000-4000-8000-000000000013','TEST-PT013','[จุดทดสอบ] สถานีบริการน้ำมัน PT','0991000013','จุด 013',(SELECT id FROM villages WHERE village_no=7 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000005',16.7606521,100.1923585,1),
  ('a4000000-0000-4000-8000-000000000014','TEST-PT014','[จุดทดสอบ] หมู่บ้านบุญธาริก','0991000014','จุด 014',(SELECT id FROM villages WHERE village_no=8 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000005',16.7699367,100.1953093,1),
  ('a4000000-0000-4000-8000-000000000015','TEST-PT015','[จุดทดสอบ] สถานีบริการน้ำมัน Caltex','0991000015','จุด 015',(SELECT id FROM villages WHERE village_no=8 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000005',16.7764094,100.1980368,1),
  ('a4000000-0000-4000-8000-000000000016','TEST-PT016','[จุดทดสอบ] วัดจุฬามณี','0991000016','จุด 016',(SELECT id FROM villages WHERE village_no=9 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000006',16.7878408,100.2163920,1),
  ('a4000000-0000-4000-8000-000000000017','TEST-PT017','[จุดทดสอบ] Lotus''s Go Fresh','0991000017','จุด 017',(SELECT id FROM villages WHERE village_no=9 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000006',16.7891995,100.2205707,1),
  ('a4000000-0000-4000-8000-000000000018','TEST-PT018','[จุดทดสอบ] วัดสว่างอารมณ์','0991000018','จุด 018',(SELECT id FROM villages WHERE village_no=9 LIMIT 1),'สถานที่สาธารณะจาก OpenStreetMap ใช้ทดสอบระบบเท่านั้น',NULL,'b1100000-0000-4000-8000-000000000006',16.7946911,100.2203579,1)
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), phone=VALUES(phone), house_no=VALUES(house_no), village_id=VALUES(village_id),
  address_detail=VALUES(address_detail), line_user_id=NULL, route_id=VALUES(route_id), latitude=VALUES(latitude), longitude=VALUES(longitude), is_active=VALUES(is_active),
  route_assignment_status=IF(VALUES(route_id) IS NULL,'UNASSIGNED','CONFIRMED'),
  route_assignment_distance_m=IF(VALUES(route_id) IS NULL,NULL,route_assignment_distance_m),
  route_assigned_at=IF(VALUES(route_id) IS NULL,NULL,route_assigned_at),
  route_assigned_by=IF(VALUES(route_id) IS NULL,NULL,route_assigned_by);

DELETE FROM waste_service_users WHERE service_no LIKE 'DEMO-S%';

INSERT INTO waste_route_stops (id, route_id, service_user_id, sequence_no, stop_name, latitude, longitude, is_active)
SELECT CONCAT('a5000000-0000-4000-8000-', LPAD(SUBSTRING(service_no, 8), 12, '0')),
       route_id, id, ROW_NUMBER() OVER (PARTITION BY route_id ORDER BY service_no),
       CONCAT('จุดทดสอบ · ', REPLACE(full_name, '[จุดทดสอบ] ', '')), latitude, longitude, 1
FROM waste_service_users
WHERE service_no BETWEEN 'TEST-PT001' AND 'TEST-PT018'
ON DUPLICATE KEY UPDATE route_id=VALUES(route_id), service_user_id=VALUES(service_user_id), sequence_no=VALUES(sequence_no),
  stop_name=VALUES(stop_name), latitude=VALUES(latitude), longitude=VALUES(longitude), is_active=1;

-- ไม่สร้างข้อมูลตัวอย่างแผนปฏิบัติงานเก็บขยะ
-- แผนใหม่ต้องสร้างผ่านระบบด้วยวันที่และเวลาในอนาคต

INSERT INTO waste_fee_rates (id, rate_name, amount, billing_cycle, is_active)
VALUES
 ('a8000000-0000-4000-8000-000000000001','ครัวเรือนทั่วไป (ตัวอย่าง)',40.00,'MONTHLY',1),
 ('a8000000-0000-4000-8000-000000000002','ร้านค้าและกิจการขนาดเล็ก (ตัวอย่าง)',120.00,'MONTHLY',1),
 ('a8000000-0000-4000-8000-000000000003','สถานที่ราชการ (ตัวอย่าง)',360.00,'QUARTERLY',1),
 ('a8000000-0000-4000-8000-000000000004','อัตราเดิมที่ยกเลิก (ตัวอย่าง)',30.00,'MONTHLY',0)
ON DUPLICATE KEY UPDATE rate_name=VALUES(rate_name), amount=VALUES(amount), billing_cycle=VALUES(billing_cycle), is_active=VALUES(is_active);

INSERT INTO waste_service_charges
  (id, service_user_id, fee_rate_id, billing_period, due_date, amount, status, paid_at, notice_requested_at)
VALUES
 ('a9000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001',@month_start,DATE_ADD(@month_start,INTERVAL 20 DAY),40.00,'PENDING',NULL,NULL),
 ('a9000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000002','a8000000-0000-4000-8000-000000000001',@month_start,DATE_SUB(@today,INTERVAL 5 DAY),40.00,'OVERDUE',NULL,DATE_SUB(NOW(),INTERVAL 1 DAY)),
 ('a9000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000003','a8000000-0000-4000-8000-000000000001',@month_start,DATE_ADD(@month_start,INTERVAL 20 DAY),40.00,'PAID',DATE_SUB(NOW(),INTERVAL 2 DAY),NULL),
 ('a9000000-0000-4000-8000-000000000004','a4000000-0000-4000-8000-000000000004','a8000000-0000-4000-8000-000000000001',@month_start,DATE_SUB(@today,INTERVAL 8 DAY),40.00,'OVERDUE',NULL,NULL),
 ('a9000000-0000-4000-8000-000000000005','a4000000-0000-4000-8000-000000000005','a8000000-0000-4000-8000-000000000001',@month_start,DATE_ADD(@month_start,INTERVAL 20 DAY),40.00,'PENDING',NULL,NULL),
 ('a9000000-0000-4000-8000-000000000006','a4000000-0000-4000-8000-000000000006','a8000000-0000-4000-8000-000000000001',@month_start,DATE_ADD(@month_start,INTERVAL 20 DAY),40.00,'VOID',NULL,NULL),
 ('a9000000-0000-4000-8000-000000000007','a4000000-0000-4000-8000-000000000012','a8000000-0000-4000-8000-000000000002',@month_start,DATE_SUB(@today,INTERVAL 3 DAY),120.00,'OVERDUE',NULL,DATE_SUB(NOW(),INTERVAL 2 HOUR)),
 ('a9000000-0000-4000-8000-000000000008','a4000000-0000-4000-8000-000000000007','a8000000-0000-4000-8000-000000000001',DATE_SUB(@month_start,INTERVAL 1 MONTH),DATE_SUB(@month_start,INTERVAL 10 DAY),40.00,'PAID',DATE_SUB(@month_start,INTERVAL 12 DAY),NULL)
ON DUPLICATE KEY UPDATE service_user_id=VALUES(service_user_id), fee_rate_id=VALUES(fee_rate_id), billing_period=VALUES(billing_period), due_date=VALUES(due_date),
  amount=VALUES(amount), status=VALUES(status), paid_at=VALUES(paid_at), notice_requested_at=VALUES(notice_requested_at);

SELECT 'Waste demo data loaded successfully' AS demo_status;
