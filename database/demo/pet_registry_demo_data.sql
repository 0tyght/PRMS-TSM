USE prms_tsm;

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET @demo_user_id = (SELECT id FROM users WHERE is_active = 1 ORDER BY role = 'ADMIN' DESC, created_at ASC LIMIT 1);

-- ชุดข้อมูลสาธิตระบบบริหารจัดการทะเบียนสัตว์เลี้ยง
-- UUID และเลขอ้างอิงคงที่ทำให้รันซ้ำได้ โดยไม่สร้างข้อมูลซ้ำ
-- ไม่มี LINE User ID จริง จึงไม่ส่งข้อความออกไปหาประชาชน

INSERT INTO households
  (id, house_no, village_id, address_detail, latitude, longitude, deleted_at)
VALUES
  ('b1000000-0000-4000-8000-000000000001','12/1',(SELECT id FROM villages WHERE village_no=1 LIMIT 1),'ใกล้ศาลาประชาคม หมู่ 1',16.7818000,100.2216000,NULL),
  ('b1000000-0000-4000-8000-000000000002','24',(SELECT id FROM villages WHERE village_no=2 LIMIT 1),'ถนนเลียบคลอง หมู่ 2',16.7789000,100.2241000,NULL),
  ('b1000000-0000-4000-8000-000000000003','37/2',(SELECT id FROM villages WHERE village_no=3 LIMIT 1),'ซอยชุมชน หมู่ 3',16.7757000,100.2264000,NULL),
  ('b1000000-0000-4000-8000-000000000004','8',(SELECT id FROM villages WHERE village_no=4 LIMIT 1),'ต้นซอยเทศบาล 4',16.7730000,100.2287000,NULL),
  ('b1000000-0000-4000-8000-000000000005','19/3',(SELECT id FROM villages WHERE village_no=5 LIMIT 1),'ตรงข้ามร้านค้าชุมชน',16.7700000,100.2311000,NULL),
  ('b1000000-0000-4000-8000-000000000006','51',(SELECT id FROM villages WHERE village_no=6 LIMIT 1),'ปลายซอยชุมชน หมู่ 6',16.7672000,100.2334000,NULL),
  ('b1000000-0000-4000-8000-000000000007','6/1',(SELECT id FROM villages WHERE village_no=7 LIMIT 1),'ใกล้ตลาดชุมชน',16.7791000,100.2175000,NULL),
  ('b1000000-0000-4000-8000-000000000008','28',(SELECT id FROM villages WHERE village_no=8 LIMIT 1),'ใกล้โรงเรียน',16.7745000,100.2148000,NULL)
ON DUPLICATE KEY UPDATE
  house_no=VALUES(house_no), village_id=VALUES(village_id), address_detail=VALUES(address_detail),
  latitude=VALUES(latitude), longitude=VALUES(longitude), deleted_at=NULL;

INSERT INTO owners
  (id, household_id, full_name, national_id_hash, national_id_last4, phone, line_user_id, consent_at, is_active, deleted_at)
VALUES
  ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','[ข้อมูลสาธิต] กิตติ ใจดี',NULL,'1001','0981000001',NULL,NOW(),1,NULL),
  ('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','[ข้อมูลสาธิต] มาลี รักสัตว์',NULL,'1002','0981000002',NULL,NOW(),1,NULL),
  ('b2000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000003','[ข้อมูลสาธิต] สมชาย พร้อมดูแล',NULL,'1003','0981000003',NULL,NOW(),1,NULL),
  ('b2000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000004','[ข้อมูลสาธิต] อรทัย มีเมตตา',NULL,'1004','0981000004',NULL,NOW(),1,NULL),
  ('b2000000-0000-4000-8000-000000000005','b1000000-0000-4000-8000-000000000005','[ข้อมูลสาธิต] วิชัย ท่าโพธิ์',NULL,'1005','0981000005',NULL,NOW(),1,NULL),
  ('b2000000-0000-4000-8000-000000000006','b1000000-0000-4000-8000-000000000006','[ข้อมูลสาธิต] นฤมล อุ่นใจ',NULL,'1006','0981000006',NULL,NOW(),1,NULL),
  ('b2000000-0000-4000-8000-000000000007','b1000000-0000-4000-8000-000000000007','[ข้อมูลสาธิต] ประเสริฐ ร่วมใจ',NULL,'1007','0981000007',NULL,NOW(),1,NULL),
  ('b2000000-0000-4000-8000-000000000008','b1000000-0000-4000-8000-000000000008','[ข้อมูลสาธิต] สายใจ พักการใช้งาน',NULL,'1008','0981000008',NULL,NOW(),0,NULL)
ON DUPLICATE KEY UPDATE
  household_id=VALUES(household_id), full_name=VALUES(full_name), national_id_last4=VALUES(national_id_last4),
  phone=VALUES(phone), line_user_id=NULL, consent_at=VALUES(consent_at), is_active=VALUES(is_active), deleted_at=NULL;

INSERT INTO pets
  (id, owner_id, registration_no, microchip_no, name, species, sex, breed, color, birth_date, status, registered_at, deleted_at)
VALUES
  ('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','TP-DEMO-001','900000000000001','เจ้าตาล','DOG','MALE','ไทยผสม','น้ำตาล',DATE_SUB(CURDATE(),INTERVAL 3 YEAR),'ACTIVE',DATE_SUB(NOW(),INTERVAL 2 YEAR),NULL),
  ('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001','TP-DEMO-002',NULL,'มะลิ','CAT','FEMALE','ไทย','ขาวส้ม',DATE_SUB(CURDATE(),INTERVAL 2 YEAR),'ACTIVE',DATE_SUB(NOW(),INTERVAL 18 MONTH),NULL),
  ('b3000000-0000-4000-8000-000000000003','b2000000-0000-4000-8000-000000000002','TP-DEMO-003','900000000000003','โกโก้','DOG','MALE','ลาบราดอร์ผสม','ดำ',DATE_SUB(CURDATE(),INTERVAL 4 YEAR),'MISSING',DATE_SUB(NOW(),INTERVAL 16 MONTH),NULL),
  ('b3000000-0000-4000-8000-000000000004','b2000000-0000-4000-8000-000000000003','TP-DEMO-004',NULL,'ถุงเงิน','CAT','MALE','ไทย','เทา',DATE_SUB(CURDATE(),INTERVAL 5 YEAR),'MOVED_OUT',DATE_SUB(NOW(),INTERVAL 3 YEAR),NULL),
  ('b3000000-0000-4000-8000-000000000005','b2000000-0000-4000-8000-000000000004','TP-DEMO-005',NULL,'โชคดี','DOG','FEMALE','บางแก้วผสม','ขาวน้ำตาล',DATE_SUB(CURDATE(),INTERVAL 9 YEAR),'DECEASED',DATE_SUB(NOW(),INTERVAL 5 YEAR),NULL),
  ('b3000000-0000-4000-8000-000000000006','b2000000-0000-4000-8000-000000000005','TP-DEMO-006',NULL,'ส้มจี๊ด','CAT','FEMALE','ไทย','ส้ม',DATE_SUB(CURDATE(),INTERVAL 1 YEAR),'ACTIVE',DATE_SUB(NOW(),INTERVAL 10 MONTH),NULL),
  ('b3000000-0000-4000-8000-000000000007','b2000000-0000-4000-8000-000000000006','TP-DEMO-007','900000000000007','ข้าวปั้น','DOG','MALE','ชิสุผสม','ขาวดำ',DATE_SUB(CURDATE(),INTERVAL 2 YEAR),'ACTIVE',DATE_SUB(NOW(),INTERVAL 14 MONTH),NULL),
  ('b3000000-0000-4000-8000-000000000008','b2000000-0000-4000-8000-000000000007','TP-DEMO-008',NULL,'ดำ','DOG','MALE','ไทย','ดำ',DATE_SUB(CURDATE(),INTERVAL 6 YEAR),'ACTIVE',DATE_SUB(NOW(),INTERVAL 4 YEAR),NULL),
  ('b3000000-0000-4000-8000-000000000009','b2000000-0000-4000-8000-000000000002',NULL,NULL,'ไข่มุก','CAT','FEMALE','เปอร์เซียผสม','ขาว',DATE_SUB(CURDATE(),INTERVAL 1 YEAR),'ACTIVE',NULL,NULL),
  ('b3000000-0000-4000-8000-000000000010','b2000000-0000-4000-8000-000000000003',NULL,NULL,'โมจิ','CAT','MALE','ไทย','ขาวเทา',DATE_SUB(CURDATE(),INTERVAL 8 MONTH),'ACTIVE',NULL,NULL),
  ('b3000000-0000-4000-8000-000000000011','b2000000-0000-4000-8000-000000000004',NULL,NULL,'เจ้ามี','DOG','FEMALE','ไทยผสม','น้ำตาลเข้ม',DATE_SUB(CURDATE(),INTERVAL 2 YEAR),'ACTIVE',NULL,NULL),
  ('b3000000-0000-4000-8000-000000000012','b2000000-0000-4000-8000-000000000005',NULL,NULL,'แสนดี','DOG','MALE','ไทย','ขาว',DATE_SUB(CURDATE(),INTERVAL 3 YEAR),'ACTIVE',NULL,NULL)
ON DUPLICATE KEY UPDATE
  owner_id=VALUES(owner_id), registration_no=VALUES(registration_no), microchip_no=VALUES(microchip_no), name=VALUES(name),
  species=VALUES(species), sex=VALUES(sex), breed=VALUES(breed), color=VALUES(color), birth_date=VALUES(birth_date),
  status=VALUES(status), registered_at=VALUES(registered_at), deleted_at=NULL;

INSERT INTO registrations
  (id, reference_no, owner_id, pet_id, status, review_note, reviewed_by, submitted_at, reviewed_at)
VALUES
  ('b4000000-0000-4000-8000-000000000001','TP-DEMO-REG-001','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','APPROVED','ข้อมูลครบถ้วน',@demo_user_id,DATE_SUB(NOW(),INTERVAL 2 YEAR),DATE_SUB(NOW(),INTERVAL 2 YEAR)),
  ('b4000000-0000-4000-8000-000000000002','TP-DEMO-REG-002','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002','APPROVED','ข้อมูลครบถ้วน',@demo_user_id,DATE_SUB(NOW(),INTERVAL 18 MONTH),DATE_SUB(NOW(),INTERVAL 18 MONTH)),
  ('b4000000-0000-4000-8000-000000000003','TP-DEMO-REG-003','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000003','APPROVED','ข้อมูลครบถ้วน',@demo_user_id,DATE_SUB(NOW(),INTERVAL 16 MONTH),DATE_SUB(NOW(),INTERVAL 16 MONTH)),
  ('b4000000-0000-4000-8000-000000000004','TP-DEMO-REG-004','b2000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000004','APPROVED','ข้อมูลครบถ้วน',@demo_user_id,DATE_SUB(NOW(),INTERVAL 3 YEAR),DATE_SUB(NOW(),INTERVAL 3 YEAR)),
  ('b4000000-0000-4000-8000-000000000005','TP-DEMO-REG-005','b2000000-0000-4000-8000-000000000004','b3000000-0000-4000-8000-000000000005','APPROVED','ข้อมูลครบถ้วน',@demo_user_id,DATE_SUB(NOW(),INTERVAL 5 YEAR),DATE_SUB(NOW(),INTERVAL 5 YEAR)),
  ('b4000000-0000-4000-8000-000000000006','TP-DEMO-REG-006','b2000000-0000-4000-8000-000000000005','b3000000-0000-4000-8000-000000000006','APPROVED','ข้อมูลครบถ้วน',@demo_user_id,DATE_SUB(NOW(),INTERVAL 10 MONTH),DATE_SUB(NOW(),INTERVAL 10 MONTH)),
  ('b4000000-0000-4000-8000-000000000007','TP-DEMO-REG-007','b2000000-0000-4000-8000-000000000006','b3000000-0000-4000-8000-000000000007','APPROVED','ข้อมูลครบถ้วน',@demo_user_id,DATE_SUB(NOW(),INTERVAL 14 MONTH),DATE_SUB(NOW(),INTERVAL 14 MONTH)),
  ('b4000000-0000-4000-8000-000000000008','TP-DEMO-REG-008','b2000000-0000-4000-8000-000000000007','b3000000-0000-4000-8000-000000000008','APPROVED','ข้อมูลครบถ้วน',@demo_user_id,DATE_SUB(NOW(),INTERVAL 4 YEAR),DATE_SUB(NOW(),INTERVAL 4 YEAR)),
  ('b4000000-0000-4000-8000-000000000009','TP-DEMO-REG-009','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000009','SUBMITTED',NULL,NULL,DATE_SUB(NOW(),INTERVAL 5 HOUR),NULL),
  ('b4000000-0000-4000-8000-000000000010','TP-DEMO-REG-010','b2000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000010','NEED_MORE_INFO','กรุณาส่งภาพสัตว์ให้เห็นสีและลักษณะชัดเจน',@demo_user_id,DATE_SUB(NOW(),INTERVAL 3 DAY),DATE_SUB(NOW(),INTERVAL 1 DAY)),
  ('b4000000-0000-4000-8000-000000000011','TP-DEMO-REG-011','b2000000-0000-4000-8000-000000000004','b3000000-0000-4000-8000-000000000011','UNDER_REVIEW',NULL,@demo_user_id,DATE_SUB(NOW(),INTERVAL 1 DAY),NULL),
  ('b4000000-0000-4000-8000-000000000012','TP-DEMO-REG-012','b2000000-0000-4000-8000-000000000005','b3000000-0000-4000-8000-000000000012','REJECTED','ที่อยู่ไม่อยู่ในเขตเทศบาลเมืองท่าโพธิ์',@demo_user_id,DATE_SUB(NOW(),INTERVAL 7 DAY),DATE_SUB(NOW(),INTERVAL 5 DAY))
ON DUPLICATE KEY UPDATE
  owner_id=VALUES(owner_id), pet_id=VALUES(pet_id), status=VALUES(status), review_note=VALUES(review_note),
  reviewed_by=VALUES(reviewed_by), submitted_at=VALUES(submitted_at), reviewed_at=VALUES(reviewed_at);

INSERT INTO vaccination_records
  (id, pet_id, vaccine_name, lot_no, vaccinated_at, next_due_at, provider_name, recorded_by)
VALUES
  ('b5000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','วัคซีนป้องกันโรคพิษสุนัขบ้า','DEMO-L001',DATE_SUB(CURDATE(),INTERVAL 2 MONTH),DATE_ADD(CURDATE(),INTERVAL 10 MONTH),'เทศบาลเมืองท่าโพธิ์',@demo_user_id),
  ('b5000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000002','วัคซีนป้องกันโรคพิษสุนัขบ้า','DEMO-L002',DATE_SUB(CURDATE(),INTERVAL 11 MONTH),DATE_ADD(CURDATE(),INTERVAL 12 DAY),'คลินิกสัตวแพทย์ตัวอย่าง',@demo_user_id),
  ('b5000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000003','วัคซีนป้องกันโรคพิษสุนัขบ้า','DEMO-L003',DATE_SUB(CURDATE(),INTERVAL 14 MONTH),DATE_SUB(CURDATE(),INTERVAL 2 MONTH),'เทศบาลเมืองท่าโพธิ์',@demo_user_id),
  ('b5000000-0000-4000-8000-000000000004','b3000000-0000-4000-8000-000000000007','วัคซีนรวมสุนัข','DEMO-L004',DATE_SUB(CURDATE(),INTERVAL 4 MONTH),NULL,'คลินิกสัตวแพทย์ตัวอย่าง',@demo_user_id),
  ('b5000000-0000-4000-8000-000000000005','b3000000-0000-4000-8000-000000000008','วัคซีนป้องกันโรคพิษสุนัขบ้า','DEMO-L005',DATE_SUB(CURDATE(),INTERVAL 15 MONTH),DATE_SUB(CURDATE(),INTERVAL 3 MONTH),'เทศบาลเมืองท่าโพธิ์',@demo_user_id)
ON DUPLICATE KEY UPDATE vaccine_name=VALUES(vaccine_name), lot_no=VALUES(lot_no), vaccinated_at=VALUES(vaccinated_at),
  next_due_at=VALUES(next_due_at), provider_name=VALUES(provider_name), recorded_by=VALUES(recorded_by);

INSERT INTO sterilization_records
  (id, pet_id, sterilized_at, provider_name, note, recorded_by)
VALUES
  ('b6000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001',DATE_SUB(CURDATE(),INTERVAL 18 MONTH),'เทศบาลเมืองท่าโพธิ์','โครงการทำหมันสัตว์เลี้ยง',@demo_user_id),
  ('b6000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000006',DATE_SUB(CURDATE(),INTERVAL 6 MONTH),'คลินิกสัตวแพทย์ตัวอย่าง','เจ้าของนำสัตว์เข้ารับบริการ',@demo_user_id),
  ('b6000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000008',DATE_SUB(CURDATE(),INTERVAL 3 YEAR),'เทศบาลเมืองท่าโพธิ์','ข้อมูลสาธิต',@demo_user_id)
ON DUPLICATE KEY UPDATE sterilized_at=VALUES(sterilized_at), provider_name=VALUES(provider_name), note=VALUES(note), recorded_by=VALUES(recorded_by);

INSERT INTO pet_status_history
  (id, pet_id, old_status, new_status, effective_at, note, recorded_by)
VALUES
  ('b7000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001',NULL,'ACTIVE',DATE_SUB(NOW(),INTERVAL 2 YEAR),'ขึ้นทะเบียนครั้งแรก',@demo_user_id),
  ('b7000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000003','ACTIVE','MISSING',DATE_SUB(NOW(),INTERVAL 4 DAY),'เจ้าของแจ้งว่าสูญหายบริเวณหมู่ 2',@demo_user_id),
  ('b7000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000004','ACTIVE','MOVED_OUT',DATE_SUB(NOW(),INTERVAL 2 MONTH),'ย้ายออกนอกเขตเทศบาลเมืองท่าโพธิ์',@demo_user_id),
  ('b7000000-0000-4000-8000-000000000004','b3000000-0000-4000-8000-000000000005','ACTIVE','DECEASED',DATE_SUB(NOW(),INTERVAL 3 MONTH),'เสียชีวิตตามธรรมชาติ',@demo_user_id)
ON DUPLICATE KEY UPDATE old_status=VALUES(old_status), new_status=VALUES(new_status), effective_at=VALUES(effective_at), note=VALUES(note), recorded_by=VALUES(recorded_by);

INSERT INTO pet_owner_history
  (id, pet_id, previous_owner_id, new_owner_id, transferred_at, reason, recorded_by)
SELECT CONCAT('b8000000-0000-4000-8000-', LPAD(RIGHT(p.registration_no,3),12,'0')),
       p.id, NULL, p.owner_id, COALESCE(p.registered_at,p.created_at), 'เจ้าของเริ่มต้นในชุดข้อมูลสาธิต', @demo_user_id
FROM pets p
WHERE p.registration_no BETWEEN 'TP-DEMO-001' AND 'TP-DEMO-008'
ON DUPLICATE KEY UPDATE new_owner_id=VALUES(new_owner_id), transferred_at=VALUES(transferred_at), reason=VALUES(reason), recorded_by=VALUES(recorded_by);

INSERT INTO citizen_submissions
  (id, reference_no, owner_id, pet_id, subject_type, current_payload, proposed_payload, status, review_note, reviewed_by, version, submitted_at, reviewed_at)
VALUES
  ('b9000000-0000-4000-8000-000000000001','TP-DEMO-DATA-001','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','PET_UPDATE',JSON_OBJECT('color','น้ำตาล'),JSON_OBJECT('petName','เจ้าตาล','species','DOG','sex','MALE','breed','ไทยผสม','color','น้ำตาลเข้ม','birthDate',DATE_FORMAT(DATE_SUB(CURDATE(),INTERVAL 3 YEAR),'%Y-%m-%d'),'microchipNo','900000000000001','reason','ปรับปรุงสีและลักษณะให้ชัดเจน'),'SUBMITTED',NULL,NULL,1,DATE_SUB(NOW(),INTERVAL 6 HOUR),NULL),
  ('b9000000-0000-4000-8000-000000000002','TP-DEMO-DATA-002','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002','VACCINATION',JSON_OBJECT('vaccineName','วัคซีนป้องกันโรคพิษสุนัขบ้า'),JSON_OBJECT('vaccineName','วัคซีนป้องกันโรคพิษสุนัขบ้า','vaccinatedAt',DATE_FORMAT(CURDATE(),'%Y-%m-%d'),'nextDueAt',DATE_FORMAT(DATE_ADD(CURDATE(),INTERVAL 1 YEAR),'%Y-%m-%d'),'lotNo','DEMO-NEW','providerName','เทศบาลเมืองท่าโพธิ์'),'UNDER_REVIEW',NULL,@demo_user_id,1,DATE_SUB(NOW(),INTERVAL 1 DAY),NULL),
  ('b9000000-0000-4000-8000-000000000003','TP-DEMO-DATA-003','b2000000-0000-4000-8000-000000000005','b3000000-0000-4000-8000-000000000006','STERILIZATION',NULL,JSON_OBJECT('sterilizedAt',DATE_FORMAT(DATE_SUB(CURDATE(),INTERVAL 7 DAY),'%Y-%m-%d'),'providerName','คลินิกสัตวแพทย์ตัวอย่าง','note','แนบข้อมูลไม่ครบ'),'NEED_MORE_INFO','กรุณาส่งวันที่และภาพหลักฐานการทำหมันให้ชัดเจน',@demo_user_id,2,DATE_SUB(NOW(),INTERVAL 3 DAY),DATE_SUB(NOW(),INTERVAL 1 DAY)),
  ('b9000000-0000-4000-8000-000000000004','TP-DEMO-DATA-004','b2000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000003','PET_STATUS',JSON_OBJECT('status','ACTIVE'),JSON_OBJECT('status','MISSING','effectiveAt',DATE_FORMAT(DATE_SUB(CURDATE(),INTERVAL 4 DAY),'%Y-%m-%d'),'reason','สูญหายบริเวณหมู่ 2'),'APPROVED','ตรวจสอบข้อมูลแล้ว',@demo_user_id,1,DATE_SUB(NOW(),INTERVAL 5 DAY),DATE_SUB(NOW(),INTERVAL 4 DAY)),
  ('b9000000-0000-4000-8000-000000000005','TP-DEMO-DATA-005','b2000000-0000-4000-8000-000000000006','b3000000-0000-4000-8000-000000000007','OWNER_TRANSFER',JSON_OBJECT('ownerId','b2000000-0000-4000-8000-000000000006'),JSON_OBJECT('newOwnerName','ผู้รับโอนตัวอย่าง','newOwnerPhone','0981999999','newHouseNo','99','newVillageId',7,'newVillageNo',7,'newAddressDetail','ข้อมูลสาธิต','newLatitude',16.7791,'newLongitude',100.2175,'transferredAt',DATE_FORMAT(CURDATE(),'%Y-%m-%d'),'reason','ข้อมูลยืนยันผู้รับโอนไม่ครบ'),'REJECTED','ไม่พบหลักฐานยืนยันจากผู้รับโอน',@demo_user_id,1,DATE_SUB(NOW(),INTERVAL 8 DAY),DATE_SUB(NOW(),INTERVAL 6 DAY))
ON DUPLICATE KEY UPDATE
  owner_id=VALUES(owner_id), pet_id=VALUES(pet_id), subject_type=VALUES(subject_type), current_payload=VALUES(current_payload),
  proposed_payload=VALUES(proposed_payload), status=VALUES(status), review_note=VALUES(review_note), reviewed_by=VALUES(reviewed_by),
  version=VALUES(version), submitted_at=VALUES(submitted_at), reviewed_at=VALUES(reviewed_at);

SELECT 'Pet registry demo data loaded successfully' AS status,
       (SELECT COUNT(*) FROM pets WHERE registration_no LIKE 'TP-DEMO-%') AS demo_pets,
       (SELECT COUNT(*) FROM registrations WHERE reference_no LIKE 'TP-DEMO-REG-%') AS demo_registrations,
       (SELECT COUNT(*) FROM citizen_submissions WHERE reference_no LIKE 'TP-DEMO-DATA-%') AS demo_submissions;
