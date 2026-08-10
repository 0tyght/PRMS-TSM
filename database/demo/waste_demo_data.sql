USE prms_tsm;

SET NAMES utf8mb4;
SET @today = CURDATE();
SET @month_start = DATE_FORMAT(CURDATE(), '%Y-%m-01');

-- ชุดข้อมูลสาธิตระบบรถเก็บขยะ
-- ทุกระเบียนใช้รหัส DEMO และ UUID คงที่ เพื่อให้รันซ้ำได้โดยไม่สร้างข้อมูลซ้ำ
-- ไม่มี LINE User ID จริงและไม่มีการส่งข้อความออกไปยัง LINE

INSERT INTO waste_vehicles
  (id, vehicle_code, registration_no, vehicle_type, capacity_kg, status, last_latitude, last_longitude, last_gps_at, note)
VALUES
  ('a2000000-0000-4000-8000-000000000001', 'DEMO-W01', '81-9001 พิษณุโลก', 'รถบรรทุกอัดท้าย 6 ล้อ', 7000, 'IN_SERVICE', 16.7789000, 100.2203000, NOW(), 'ข้อมูลตัวอย่าง: รถประจำเส้นทางตอนเหนือ'),
  ('a2000000-0000-4000-8000-000000000002', 'DEMO-W02', '81-9002 พิษณุโลก', 'รถบรรทุกอัดท้าย 6 ล้อ', 7000, 'AVAILABLE', 16.7688000, 100.2296000, DATE_SUB(NOW(), INTERVAL 2 HOUR), 'ข้อมูลตัวอย่าง: รถสำรองพร้อมใช้งาน'),
  ('a2000000-0000-4000-8000-000000000003', 'DEMO-W03', '81-9003 พิษณุโลก', 'รถบรรทุกเปิดข้าง 4 ล้อ', 3500, 'AVAILABLE', 16.7724000, 100.2147000, DATE_SUB(NOW(), INTERVAL 1 HOUR), 'ข้อมูลตัวอย่าง: รถสำหรับซอยแคบ'),
  ('a2000000-0000-4000-8000-000000000004', 'DEMO-W04', '81-9004 พิษณุโลก', 'รถบรรทุกอัดท้าย 6 ล้อ', 7000, 'MAINTENANCE', 16.7649000, 100.2189000, DATE_SUB(NOW(), INTERVAL 3 HOUR), 'ข้อมูลตัวอย่าง: ตรวจระบบไฮดรอลิก'),
  ('a2000000-0000-4000-8000-000000000005', 'DEMO-W05', '81-9005 พิษณุโลก', 'รถบรรทุกเปิดข้าง 4 ล้อ', 3000, 'OUT_OF_SERVICE', NULL, NULL, NULL, 'ข้อมูลตัวอย่าง: หยุดใช้งานรอจำหน่าย'),
  ('a2000000-0000-4000-8000-000000000006', 'DEMO-W06', '81-9006 พิษณุโลก', 'รถบรรทุกอัดท้าย 6 ล้อ', 7000, 'AVAILABLE', 16.7744000, 100.2254000, DATE_SUB(NOW(), INTERVAL 4 HOUR), 'ข้อมูลตัวอย่าง: รถทดแทนกรณีฉุกเฉิน')
ON DUPLICATE KEY UPDATE
  registration_no = VALUES(registration_no), vehicle_type = VALUES(vehicle_type), capacity_kg = VALUES(capacity_kg),
  status = VALUES(status), last_latitude = VALUES(last_latitude), last_longitude = VALUES(last_longitude),
  last_gps_at = VALUES(last_gps_at), note = VALUES(note);

INSERT INTO waste_drivers (id, full_name, phone, line_user_id, is_active)
VALUES
  ('a3000000-0000-4000-8000-000000000001', '[ตัวอย่าง] สมชาย ใจดี', '0990000001', NULL, 1),
  ('a3000000-0000-4000-8000-000000000002', '[ตัวอย่าง] วิชัย มั่นคง', '0990000002', NULL, 1),
  ('a3000000-0000-4000-8000-000000000003', '[ตัวอย่าง] ประสิทธิ์ ร่วมใจ', '0990000003', NULL, 1),
  ('a3000000-0000-4000-8000-000000000004', '[ตัวอย่าง] อนุชา พร้อมงาน', '0990000004', NULL, 1),
  ('a3000000-0000-4000-8000-000000000005', '[ตัวอย่าง] มานพ ชำนาญ', '0990000005', NULL, 1),
  ('a3000000-0000-4000-8000-000000000006', '[ตัวอย่าง] สุรชัย พักงาน', '0990000006', NULL, 0)
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), phone = VALUES(phone), line_user_id = NULL, is_active = VALUES(is_active);

INSERT INTO waste_routes (id, route_code, route_name, description, route_geojson, is_active)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'DEMO-R01', 'ท่าโพธ์ตอนเหนือ หมู่ 1–3', 'ข้อมูลตัวอย่าง: เทศบาล–ชุมชนตอนเหนือ–ถนนเลียบคลอง',
   JSON_OBJECT('type','Feature','properties',JSON_OBJECT('waypoints',JSON_ARRAY(JSON_OBJECT('latitude',16.7861,'longitude',100.2168),JSON_OBJECT('latitude',16.7794,'longitude',100.2214),JSON_OBJECT('latitude',16.7758,'longitude',100.2268)),'distanceMeters',4200,'durationSeconds',1320,'source','ข้อมูลตัวอย่าง'),'geometry',JSON_OBJECT('type','LineString','coordinates',JSON_ARRAY(JSON_ARRAY(100.2168,16.7861),JSON_ARRAY(100.2192,16.7834),JSON_ARRAY(100.2214,16.7794),JSON_ARRAY(100.2242,16.7772),JSON_ARRAY(100.2268,16.7758)))), 1),
  ('a1000000-0000-4000-8000-000000000002', 'DEMO-R02', 'ท่าโพธ์ฝั่งตะวันออก หมู่ 4–6', 'ข้อมูลตัวอย่าง: ถนนสายหลัก–ชุมชนฝั่งตะวันออก–พื้นที่บริการต่อเนื่อง',
   JSON_OBJECT('type','Feature','properties',JSON_OBJECT('waypoints',JSON_ARRAY(JSON_OBJECT('latitude',16.7737,'longitude',100.2257),JSON_OBJECT('latitude',16.7700,'longitude',100.2312),JSON_OBJECT('latitude',16.7664,'longitude',100.2350)),'distanceMeters',3800,'durationSeconds',1140,'source','ข้อมูลตัวอย่าง'),'geometry',JSON_OBJECT('type','LineString','coordinates',JSON_ARRAY(JSON_ARRAY(100.2257,16.7737),JSON_ARRAY(100.2284,16.7720),JSON_ARRAY(100.2312,16.7700),JSON_ARRAY(100.2333,16.7684),JSON_ARRAY(100.2350,16.7664)))), 1),
  ('a1000000-0000-4000-8000-000000000003', 'DEMO-R03', 'ท่าโพธ์ฝั่งตะวันตก หมู่ 7–9', 'ข้อมูลตัวอย่าง: ซอยชุมชน–ตลาด–แนวถนนฝั่งตะวันตก',
   JSON_OBJECT('type','Feature','properties',JSON_OBJECT('waypoints',JSON_ARRAY(JSON_OBJECT('latitude',16.7797,'longitude',100.2210),JSON_OBJECT('latitude',16.7750,'longitude',100.2162),JSON_OBJECT('latitude',16.7697,'longitude',100.2119)),'distanceMeters',3600,'durationSeconds',1200,'source','ข้อมูลตัวอย่าง'),'geometry',JSON_OBJECT('type','LineString','coordinates',JSON_ARRAY(JSON_ARRAY(100.2210,16.7797),JSON_ARRAY(100.2187,16.7774),JSON_ARRAY(100.2162,16.7750),JSON_ARRAY(100.2138,16.7724),JSON_ARRAY(100.2119,16.7697)))), 1),
  ('a1000000-0000-4000-8000-000000000004', 'DEMO-R04', 'ท่าโพธ์ตอนใต้ หมู่ 10–11', 'ข้อมูลตัวอย่าง: โรงเรียน–ชุมชนตอนใต้–จุดกลับรถ',
   JSON_OBJECT('type','Feature','properties',JSON_OBJECT('waypoints',JSON_ARRAY(JSON_OBJECT('latitude',16.7722,'longitude',100.2245),JSON_OBJECT('latitude',16.7660,'longitude',100.2212),JSON_OBJECT('latitude',16.7609,'longitude',100.2178)),'distanceMeters',4500,'durationSeconds',1500,'source','ข้อมูลตัวอย่าง'),'geometry',JSON_OBJECT('type','LineString','coordinates',JSON_ARRAY(JSON_ARRAY(100.2245,16.7722),JSON_ARRAY(100.2230,16.7692),JSON_ARRAY(100.2212,16.7660),JSON_ARRAY(100.2196,16.7633),JSON_ARRAY(100.2178,16.7609)))), 1)
ON DUPLICATE KEY UPDATE route_name = VALUES(route_name), description = VALUES(description), route_geojson = VALUES(route_geojson), is_active = VALUES(is_active);

INSERT INTO waste_service_users
  (id, service_no, full_name, phone, house_no, village_id, address_detail, line_user_id, route_id, latitude, longitude, is_active)
VALUES
  ('a4000000-0000-4000-8000-000000000001','DEMO-S001','[ตัวอย่าง] ครัวเรือน 1','0990000101','12/1',(SELECT id FROM villages WHERE village_no=1 LIMIT 1),'ใกล้ศาลาประชาคม',NULL,'a1000000-0000-4000-8000-000000000001',16.7858000,100.2171000,1),
  ('a4000000-0000-4000-8000-000000000002','DEMO-S002','[ตัวอย่าง] ครัวเรือน 2','0990000102','24',(SELECT id FROM villages WHERE village_no=2 LIMIT 1),'หน้าร้านชุมชน',NULL,'a1000000-0000-4000-8000-000000000001',16.7806000,100.2207000,1),
  ('a4000000-0000-4000-8000-000000000003','DEMO-S003','[ตัวอย่าง] ครัวเรือน 3','0990000103','37/2',(SELECT id FROM villages WHERE village_no=3 LIMIT 1),'ถนนเลียบคลอง',NULL,'a1000000-0000-4000-8000-000000000001',16.7762000,100.2263000,1),
  ('a4000000-0000-4000-8000-000000000004','DEMO-S004','[ตัวอย่าง] ครัวเรือน 4','0990000104','8',(SELECT id FROM villages WHERE village_no=4 LIMIT 1),'ต้นซอยเทศบาล 4',NULL,'a1000000-0000-4000-8000-000000000002',16.7734000,100.2260000,1),
  ('a4000000-0000-4000-8000-000000000005','DEMO-S005','[ตัวอย่าง] ครัวเรือน 5','0990000105','19/3',(SELECT id FROM villages WHERE village_no=5 LIMIT 1),'ตรงข้ามร้านขายของชำ',NULL,'a1000000-0000-4000-8000-000000000002',16.7699000,100.2310000,1),
  ('a4000000-0000-4000-8000-000000000006','DEMO-S006','[ตัวอย่าง] ครัวเรือน 6','0990000106','51',(SELECT id FROM villages WHERE village_no=6 LIMIT 1),'ปลายซอยชุมชน',NULL,'a1000000-0000-4000-8000-000000000002',16.7666000,100.2346000,1),
  ('a4000000-0000-4000-8000-000000000007','DEMO-S007','[ตัวอย่าง] ครัวเรือน 7','0990000107','6/1',(SELECT id FROM villages WHERE village_no=7 LIMIT 1),'ใกล้ตลาดชุมชน',NULL,'a1000000-0000-4000-8000-000000000003',16.7794000,100.2206000,1),
  ('a4000000-0000-4000-8000-000000000008','DEMO-S008','[ตัวอย่าง] ครัวเรือน 8','0990000108','28',(SELECT id FROM villages WHERE village_no=8 LIMIT 1),'ซอยแคบ รถเล็กเข้าถึง',NULL,'a1000000-0000-4000-8000-000000000003',16.7748000,100.2165000,1),
  ('a4000000-0000-4000-8000-000000000009','DEMO-S009','[ตัวอย่าง] ครัวเรือน 9','0990000109','42/4',(SELECT id FROM villages WHERE village_no=9 LIMIT 1),'ใกล้จุดกลับรถ',NULL,'a1000000-0000-4000-8000-000000000003',16.7701000,100.2122000,1),
  ('a4000000-0000-4000-8000-000000000010','DEMO-S010','[ตัวอย่าง] ครัวเรือน 10','0990000110','15',(SELECT id FROM villages WHERE village_no=10 LIMIT 1),'ข้างโรงเรียน',NULL,'a1000000-0000-4000-8000-000000000004',16.7719000,100.2242000,1),
  ('a4000000-0000-4000-8000-000000000011','DEMO-S011','[ตัวอย่าง] ครัวเรือน 11','0990000111','33/1',(SELECT id FROM villages WHERE village_no=11 LIMIT 1),'ชุมชนตอนใต้',NULL,'a1000000-0000-4000-8000-000000000004',16.7659000,100.2210000,1),
  ('a4000000-0000-4000-8000-000000000012','DEMO-S012','[ตัวอย่าง] ร้านค้าชุมชน','0990000112','59',(SELECT id FROM villages WHERE village_no=11 LIMIT 1),'จุดเก็บถังขยะขนาดใหญ่',NULL,'a1000000-0000-4000-8000-000000000004',16.7612000,100.2181000,1),
  ('a4000000-0000-4000-8000-000000000013','DEMO-S013','[ตัวอย่าง] รอกำหนดเส้นทาง','0990000113','71',(SELECT id FROM villages WHERE village_no=5 LIMIT 1),'มีพิกัดแล้ว รอจัดเส้นทาง',NULL,NULL,16.7713000,100.2292000,1),
  ('a4000000-0000-4000-8000-000000000014','DEMO-S014','[ตัวอย่าง] รอระบุตำแหน่ง','0990000114','88',(SELECT id FROM villages WHERE village_no=8 LIMIT 1),'ลงทะเบียนแล้ว รอระบุตำแหน่ง',NULL,NULL,NULL,NULL,1),
  ('a4000000-0000-4000-8000-000000000015','DEMO-S015','[ตัวอย่าง] ยกเลิกบริการ','0990000115','99',(SELECT id FROM villages WHERE village_no=2 LIMIT 1),'ข้อมูลตัวอย่างผู้ใช้ที่ปิดบริการ',NULL,NULL,16.7812000,100.2199000,0)
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), phone=VALUES(phone), house_no=VALUES(house_no), village_id=VALUES(village_id),
  address_detail=VALUES(address_detail), line_user_id=NULL, route_id=VALUES(route_id), latitude=VALUES(latitude), longitude=VALUES(longitude), is_active=VALUES(is_active);

INSERT INTO waste_route_stops (id, route_id, service_user_id, sequence_no, stop_name, latitude, longitude, is_active)
SELECT CONCAT('a5000000-0000-4000-8000-', LPAD(SUBSTRING(service_no, 7), 12, '0')),
       route_id, id, ROW_NUMBER() OVER (PARTITION BY route_id ORDER BY service_no),
       CONCAT('บ้าน ', house_no, ' · ', full_name), latitude, longitude, 1
FROM waste_service_users
WHERE service_no BETWEEN 'DEMO-S001' AND 'DEMO-S012'
ON DUPLICATE KEY UPDATE route_id=VALUES(route_id), service_user_id=VALUES(service_user_id), sequence_no=VALUES(sequence_no),
  stop_name=VALUES(stop_name), latitude=VALUES(latitude), longitude=VALUES(longitude), is_active=1;

INSERT INTO waste_operation_plans
  (id, plan_no, scheduled_date, route_id, vehicle_id, driver_id, scheduled_start_at, scheduled_end_at, actual_start_at, actual_end_at, status, note, created_by)
VALUES
  ('a6000000-0000-4000-8000-000000000001','DEMO-TODAY-01',@today,'a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001',TIMESTAMP(@today,'06:00:00'),TIMESTAMP(@today,'10:00:00'),TIMESTAMP(@today,'06:04:00'),NULL,'IN_PROGRESS','ข้อมูลตัวอย่าง: กำลังเก็บขยะและส่งตำแหน่ง GPS',NULL),
  ('a6000000-0000-4000-8000-000000000002','DEMO-TODAY-02',@today,'a1000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000002',TIMESTAMP(@today,'13:00:00'),TIMESTAMP(@today,'16:30:00'),NULL,NULL,'SCHEDULED','ข้อมูลตัวอย่าง: แผนรอเริ่มช่วงบ่าย',NULL),
  ('a6000000-0000-4000-8000-000000000003','DEMO-TODAY-03',@today,'a1000000-0000-4000-8000-000000000003','a2000000-0000-4000-8000-000000000003','a3000000-0000-4000-8000-000000000003',TIMESTAMP(@today,'05:30:00'),TIMESTAMP(@today,'09:00:00'),TIMESTAMP(@today,'05:33:00'),TIMESTAMP(@today,'08:47:00'),'COMPLETED','ข้อมูลตัวอย่าง: ปฏิบัติงานครบทุกจุด',NULL),
  ('a6000000-0000-4000-8000-000000000004','DEMO-TODAY-04',@today,'a1000000-0000-4000-8000-000000000004','a2000000-0000-4000-8000-000000000004','a3000000-0000-4000-8000-000000000004',TIMESTAMP(@today,'07:00:00'),TIMESTAMP(@today,'11:00:00'),TIMESTAMP(@today,'07:05:00'),NULL,'INTERRUPTED','ข้อมูลตัวอย่าง: หยุดชั่วคราวเพื่อตรวจระบบไฮดรอลิก',NULL),
  ('a6000000-0000-4000-8000-000000000005','DEMO-YESTERDAY-01',DATE_SUB(@today,INTERVAL 1 DAY),'a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000006','a3000000-0000-4000-8000-000000000005',TIMESTAMP(DATE_SUB(@today,INTERVAL 1 DAY),'06:00:00'),TIMESTAMP(DATE_SUB(@today,INTERVAL 1 DAY),'10:00:00'),TIMESTAMP(DATE_SUB(@today,INTERVAL 1 DAY),'06:02:00'),TIMESTAMP(DATE_SUB(@today,INTERVAL 1 DAY),'09:41:00'),'COMPLETED','ข้อมูลตัวอย่างสำหรับรายงานย้อนหลัง',NULL),
  ('a6000000-0000-4000-8000-000000000006','DEMO-YESTERDAY-02',DATE_SUB(@today,INTERVAL 1 DAY),'a1000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002','a3000000-0000-4000-8000-000000000002',TIMESTAMP(DATE_SUB(@today,INTERVAL 1 DAY),'13:00:00'),TIMESTAMP(DATE_SUB(@today,INTERVAL 1 DAY),'16:00:00'),NULL,NULL,'CANCELLED','ข้อมูลตัวอย่าง: ยกเลิกเนื่องจากฝนตกหนัก',NULL)
ON DUPLICATE KEY UPDATE scheduled_date=VALUES(scheduled_date), route_id=VALUES(route_id), vehicle_id=VALUES(vehicle_id), driver_id=VALUES(driver_id),
  scheduled_start_at=VALUES(scheduled_start_at), scheduled_end_at=VALUES(scheduled_end_at), actual_start_at=VALUES(actual_start_at), actual_end_at=VALUES(actual_end_at), status=VALUES(status), note=VALUES(note);

DELETE FROM waste_location_logs
WHERE plan_id IN ('a6000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000003','a6000000-0000-4000-8000-000000000004','a6000000-0000-4000-8000-000000000005');

INSERT INTO waste_location_logs (plan_id, latitude, longitude, accuracy_m, speed_kph, recorded_at, source)
VALUES
 ('a6000000-0000-4000-8000-000000000001',16.7858000,100.2171000,8.5,12.0,TIMESTAMP(@today,'06:10:00'),'DEVICE'),
 ('a6000000-0000-4000-8000-000000000001',16.7834000,100.2192000,7.2,18.0,TIMESTAMP(@today,'06:25:00'),'DEVICE'),
 ('a6000000-0000-4000-8000-000000000001',16.7806000,100.2207000,6.8,9.0,TIMESTAMP(@today,'06:42:00'),'LINE'),
 ('a6000000-0000-4000-8000-000000000001',16.7789000,100.2203000,9.1,14.0,TIMESTAMP(@today,'06:55:00'),'DEVICE'),
 ('a6000000-0000-4000-8000-000000000003',16.7794000,100.2206000,8.0,10.0,TIMESTAMP(@today,'05:45:00'),'DEVICE'),
 ('a6000000-0000-4000-8000-000000000003',16.7748000,100.2165000,7.0,16.0,TIMESTAMP(@today,'07:02:00'),'DEVICE'),
 ('a6000000-0000-4000-8000-000000000003',16.7701000,100.2122000,6.5,0.0,TIMESTAMP(@today,'08:42:00'),'LINE'),
 ('a6000000-0000-4000-8000-000000000004',16.7719000,100.2242000,12.0,7.0,TIMESTAMP(@today,'07:18:00'),'LINE'),
 ('a6000000-0000-4000-8000-000000000004',16.7649000,100.2189000,11.0,0.0,TIMESTAMP(@today,'08:02:00'),'LINE'),
 ('a6000000-0000-4000-8000-000000000005',16.7858000,100.2171000,7.0,11.0,TIMESTAMP(DATE_SUB(@today,INTERVAL 1 DAY),'06:15:00'),'DEVICE'),
 ('a6000000-0000-4000-8000-000000000005',16.7762000,100.2263000,8.0,0.0,TIMESTAMP(DATE_SUB(@today,INTERVAL 1 DAY),'09:38:00'),'DEVICE');

INSERT INTO waste_stop_confirmations (id, plan_id, stop_id, status, confirmed_at, latitude, longitude, note)
VALUES
 ('a5100000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','COLLECTED',TIMESTAMP(@today,'06:12:00'),16.7858000,100.2171000,'ข้อมูลตัวอย่าง'),
 ('a5100000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002','COLLECTED',TIMESTAMP(@today,'06:43:00'),16.7806000,100.2207000,'ข้อมูลตัวอย่าง'),
 ('a5100000-0000-4000-8000-000000000003','a6000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000007','COLLECTED',TIMESTAMP(@today,'05:47:00'),16.7794000,100.2206000,'ข้อมูลตัวอย่าง'),
 ('a5100000-0000-4000-8000-000000000004','a6000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000008','COLLECTED',TIMESTAMP(@today,'07:05:00'),16.7748000,100.2165000,'ข้อมูลตัวอย่าง'),
 ('a5100000-0000-4000-8000-000000000005','a6000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000009','COLLECTED',TIMESTAMP(@today,'08:44:00'),16.7701000,100.2122000,'ข้อมูลตัวอย่าง')
ON DUPLICATE KEY UPDATE status=VALUES(status), confirmed_at=VALUES(confirmed_at), latitude=VALUES(latitude), longitude=VALUES(longitude), note=VALUES(note);

INSERT INTO waste_incidents
  (id, plan_id, vehicle_id, replacement_vehicle_id, driver_id, incident_type, status, description, happened_at, resolved_at, resolution_note)
VALUES
 ('a7000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000004','a2000000-0000-4000-8000-000000000004','a2000000-0000-4000-8000-000000000006','a3000000-0000-4000-8000-000000000004','VEHICLE_BREAKDOWN','REPORTED','ข้อมูลตัวอย่าง: ระบบไฮดรอลิกมีแรงดันผิดปกติ รถจอดในจุดปลอดภัยแล้ว',TIMESTAMP(@today,'08:05:00'),NULL,NULL),
 ('a7000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',NULL,'a3000000-0000-4000-8000-000000000001','ACCESS_BLOCKED','ACKNOWLEDGED','ข้อมูลตัวอย่าง: มีรถจอดขวางทางเข้าซอย เจ้าหน้าที่กำลังประสานเจ้าของรถ',TIMESTAMP(@today,'06:48:00'),NULL,'ประสานผู้นำชุมชนแล้ว'),
 ('a7000000-0000-4000-8000-000000000003','a6000000-0000-4000-8000-000000000005','a2000000-0000-4000-8000-000000000006',NULL,'a3000000-0000-4000-8000-000000000005','ROAD_CLOSED','RESOLVED','ข้อมูลตัวอย่าง: ปิดถนนชั่วคราวจากการซ่อมผิวทาง',TIMESTAMP(DATE_SUB(@today,INTERVAL 1 DAY),'07:10:00'),TIMESTAMP(DATE_SUB(@today,INTERVAL 1 DAY),'07:42:00'),'เปลี่ยนไปใช้เส้นทางเลี่ยงและเก็บครบทุกจุด')
ON DUPLICATE KEY UPDATE plan_id=VALUES(plan_id), vehicle_id=VALUES(vehicle_id), replacement_vehicle_id=VALUES(replacement_vehicle_id), driver_id=VALUES(driver_id),
  incident_type=VALUES(incident_type), status=VALUES(status), description=VALUES(description), happened_at=VALUES(happened_at), resolved_at=VALUES(resolved_at), resolution_note=VALUES(resolution_note);

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
