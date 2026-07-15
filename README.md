# PRMS-TSM

ระบบขึ้นทะเบียนและบริหารจัดการข้อมูลสุนัขและแมวสำหรับ **เทศบาลท่าโพธ์**

## ส่วนประกอบ

- `apps/admin-web` — ระบบสำหรับเจ้าหน้าที่เทศบาล
- `apps/citizen-web` — เว็บสำรองสำหรับประชาชน (ช่องทางหลักจะเป็น LINE LIFF)
- `apps/api` — API, การยืนยันตัวตน และกฎธุรกิจ
- `packages/shared` — แบบข้อมูลและค่ากลางที่ใช้ร่วมกัน
- `database` — Schema, migration และ seed data
- `legacy/prototype` — เว็บต้นแบบเดิม เก็บไว้อ้างอิงเท่านั้น

## เริ่มใช้งานสำหรับพัฒนา

1. คัดลอก `.env.example` เป็น `.env`
2. สร้างฐานข้อมูลด้วย `database/create_database.sql` และ `database/create_tables.sql`
3. รัน `npm install`
4. รัน `npm run dev`

สร้างข้อมูลสาธิตสำหรับหน้าระบบเจ้าหน้าที่ด้วย `npm run seed:demo` คำสั่งนี้จัดการเฉพาะระเบียนรหัสสาธิตและไม่ลบข้อมูลจริง

Admin Web: `http://localhost:5173`

Citizen Web: `http://localhost:5174`

API: `http://localhost:4100/api/health`

เว็บไซต์สาธิต Admin Web: `https://0tyght.github.io/PRMS-TSM/`

ข้อมูลระบบจริงต้องผ่าน API และฐานข้อมูลกลางเท่านั้น ห้ามใช้ `localStorage` เป็นแหล่งข้อมูลหลัก

## ลำดับความสำคัญ

1. Admin Web สำหรับงานเจ้าหน้าที่เทศบาล
2. LINE LIFF สำหรับเจ้าของสัตว์และประชาชน
3. Citizen Web เป็นช่องทางสำรองเมื่อไม่สามารถใช้ LINE ได้
