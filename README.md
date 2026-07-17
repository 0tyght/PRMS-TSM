# PRMS-TSM

ระบบขึ้นทะเบียนและบริหารจัดการข้อมูลสุนัขและแมวสำหรับ **เทศบาลท่าโพธ์**

## ส่วนประกอบ

- `apps/admin-web` — ระบบสำหรับเจ้าหน้าที่เทศบาล
- `apps/citizen-web` — เว็บสำรองสำหรับประชาชน (ช่องทางหลักจะเป็น LINE LIFF)
- `apps/api` — API, การยืนยันตัวตน และกฎธุรกิจ
- `packages/shared` — แบบข้อมูลและค่ากลางที่ใช้ร่วมกัน
- `database` — Schema, migration และ seed data

## เริ่มใช้งานสำหรับพัฒนา

1. คัดลอก `.env.example` เป็น `.env`
2. สร้างฐานข้อมูลด้วย `database/create_database.sql` และ `database/create_tables.sql`
3. รัน `npm install`
4. รัน `npm run dev`

สร้างบัญชีผู้ดูแลระบบครั้งแรกด้วย `npm run create-admin` ข้อมูลที่แสดงในทุกหน้าจะอ่านจาก API และฐานข้อมูลกลางเท่านั้น

Admin Web: `http://localhost:5173`

Citizen Web: `http://localhost:5174`

API: `http://localhost:4100/api/health`

Admin Web: `https://0tyght.github.io/PRMS-TSM/`

Citizen Web / LINE LIFF Endpoint: `https://0tyght.github.io/PRMS-TSM/citizen/`

การเปิด LINE LIFF ต้องกำหนด `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET` และ `LINE_LIFF_ID` ใน `.env` ของ API แล้วตั้ง Endpoint URL ของ LIFF ให้ชี้มายัง Citizen Web ด้านบน ระบบจะส่ง ID Token ไปตรวจสอบกับ LINE Platform ฝั่งเซิร์ฟเวอร์ก่อนอนุญาตให้เข้าถึงข้อมูลเจ้าของ

เปิดช่องทางเข้าถึงชั่วคราวด้วย `powershell -ExecutionPolicy Bypass -File scripts/start-public.ps1` หน้า GitHub Pages จะอ่านที่อยู่ API จาก `runtime-config.json` และเชื่อมต่อผ่าน Cloudflare Quick Tunnel หาก Tunnel หรือ API ออฟไลน์ ระบบจะแจ้งสถานะการเชื่อมต่อโดยไม่สร้างหรือแสดงข้อมูลจำลอง

ข้อมูลระบบจริงต้องผ่าน API และฐานข้อมูลกลางเท่านั้น ห้ามใช้ `localStorage` เป็นแหล่งข้อมูลหลัก

## ลำดับความสำคัญ

1. Admin Web สำหรับงานเจ้าหน้าที่เทศบาล
2. LINE LIFF สำหรับเจ้าของสัตว์และประชาชน
3. Citizen Web เป็นช่องทางสำรองเมื่อไม่สามารถใช้ LINE ได้
