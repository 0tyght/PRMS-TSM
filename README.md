# Smart Tha Pho

แพลตฟอร์มระบบงานดิจิทัลของเทศบาลท่าโพธ์ ประกอบด้วยระบบทะเบียนและบริหารจัดการสัตว์เลี้ยง ระบบบริหารจัดการรถเก็บขยะ ระบบบริหารจัดการบรรเทาสาธารณภัย และระบบบริหารจัดการการประปา

ดูภาพรวมเว็บทั้ง 4 ระบบที่ [docs/architecture/WEB_APPLICATIONS.md](docs/architecture/WEB_APPLICATIONS.md) และผังโฟลเดอร์สำหรับผู้พัฒนาที่ [docs/architecture/REPOSITORY_STRUCTURE.md](docs/architecture/REPOSITORY_STRUCTURE.md)

เปิด API, Cloudflare Tunnel และอัปเดต LINE Webhook อัตโนมัติด้วย `./start-smart-tha-pho.ps1` ดูรายละเอียดที่ [docs/operations/LINE_OPERATION.md](docs/operations/LINE_OPERATION.md)

ระบบขึ้นทะเบียนและบริหารจัดการข้อมูลสุนัขและแมวสำหรับ **เทศบาลท่าโพธ์**

## ช่องทางใช้งานจริง

- `apps/portal` — หน้าเข้าสู่ระบบกลาง Smart Tha Pho และตัวเลือกระบบ
- `apps/prms-tsm` — ระบบทะเบียนและบริหารจัดการสัตว์เลี้ยง (PRMS-TSM)
- `apps/waste-management` — ระบบบริหารจัดการรถเก็บขยะ
- `apps/disaster-management` — ระบบบริหารจัดการบรรเทาสาธารณภัย
- `apps/waterworks-management` — ระบบบริหารจัดการการประปา
- LINE Official Account — ช่องทางเดียวสำหรับเจ้าของสัตว์เลี้ยงทุกขั้นตอน
- `apps/api` — API, การยืนยันตัวตน และกฎธุรกิจ
- `packages/shared` — แบบข้อมูลและค่ากลางที่ใช้ร่วมกัน
- `database` — Schema, migration และ seed data

เจ้าของสัตว์เลี้ยงไม่ต้องเปิดเว็บไซต์และไม่ใช้ LIFF: เริ่มต้นขึ้นทะเบียน เชื่อมทะเบียนเดิม ติดตามผล ส่งข้อมูลวัคซีน/ทำหมัน แจ้งสถานะสัตว์เลี้ยง แก้ไขข้อมูล โอนเจ้าของ และส่งตำแหน่งบ้าน ทำผ่านบทสนทนาและ Rich Menu ใน LINE OA ทั้งหมด ส่วนเจ้าหน้าที่ตรวจสอบและวางแผนงานผ่าน Admin Web

## เริ่มใช้งานสำหรับพัฒนา

1. คัดลอก `.env.example` เป็น `.env`
2. สร้างฐานข้อมูลครั้งแรกด้วย `database/bootstrap/create_database.sql` และ `database/bootstrap/create_tables.sql`
3. รัน `npm install`
4. รัน `npm run dev`

สร้างบัญชีผู้ดูแลระบบครั้งแรกด้วย `npm run create-admin` ข้อมูลที่แสดงในทุกหน้าจะอ่านจาก API และฐานข้อมูลกลางเท่านั้น

Admin Web: `http://localhost:5173`

API v1: `http://localhost:4100/api/v1/health`

Admin Web: `https://0tyght.github.io/PRMS-TSM/`

ตั้งค่า LINE OA โดยกำหนด `LINE_CHANNEL_SECRET` และ `LINE_CHANNEL_ACCESS_TOKEN` ใน `.env` แล้วกำหนด Webhook URL ของ Messaging API ให้ชี้ที่ `/api/line/webhook` ของ API ที่เข้าถึงจากภายนอกได้ สคริปต์ `start-smart-tha-pho.ps1` ใช้เปิด API ชั่วคราวและตั้ง Webhook เมื่อผู้ดูแลสั่งใช้งาน

เปิด MySQL ใน XAMPP แล้วเปิดช่องทางเข้าถึงชั่วคราวด้วย `./start-smart-tha-pho.ps1` สคริปต์จะ apply migration ที่รันซ้ำได้ก่อนเริ่ม API จากนั้นหน้า GitHub Pages จะอ่านที่อยู่ API จาก `runtime-config.json` และเชื่อมต่อผ่าน Cloudflare Quick Tunnel หาก Tunnel หรือ API ออฟไลน์ ระบบจะแจ้งสถานะการเชื่อมต่อโดยไม่สร้างหรือแสดงข้อมูลจำลอง

ไฟล์รูปและหลักฐานถูกเก็บใน `storage/uploads` ซึ่งไม่ถูก commit ขึ้น Git และดาวน์โหลดผ่าน API ที่ตรวจสิทธิ์พื้นที่พร้อมบันทึก Audit Log เท่านั้น สามารถกำหนดตำแหน่ง private storage ใหม่ด้วย `PRIVATE_STORAGE_DIR`

ข้อมูลระบบจริงต้องผ่าน API และฐานข้อมูลกลางเท่านั้น ห้ามใช้ `localStorage` เป็นแหล่งข้อมูลหลัก

## ลำดับความสำคัญ

1. Admin Web สำหรับงานเจ้าหน้าที่เทศบาล
2. LINE Official Account สำหรับเจ้าของสัตว์เลี้ยงทุกขั้นตอน
