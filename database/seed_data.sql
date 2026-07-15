USE prms_tsm;

INSERT INTO villages (village_no, name_th) VALUES
  (1, 'หมู่ที่ 1'), (2, 'หมู่ที่ 2'), (3, 'หมู่ที่ 3'),
  (4, 'หมู่ที่ 4'), (5, 'หมู่ที่ 5'), (6, 'หมู่ที่ 6'),
  (7, 'หมู่ที่ 7'), (8, 'หมู่ที่ 8'), (9, 'หมู่ที่ 9'),
  (10, 'หมู่ที่ 10'), (11, 'หมู่ที่ 11')
ON DUPLICATE KEY UPDATE name_th = VALUES(name_th);

-- สร้างรหัสผ่านผู้ดูแลด้วย bcrypt ก่อนใช้งานจริง แล้วแทนค่า PASSWORD_HASH_HERE
-- INSERT INTO users (id, full_name, email, password_hash, role)
-- VALUES (UUID(), 'ผู้ดูแลระบบ PRMS-TSM', 'admin@example.go.th', 'PASSWORD_HASH_HERE', 'ADMIN');
